import type { SimResult, ZoneDay, ZoneLevel } from "./types";

/**
 * Zone escalation forecaster.
 *
 * Question it answers: "Which zone is likely to reach ALERT in the next 3 days?"
 * A small logistic model over zone-level features. Trained offline by
 * scripts/train-forecast.ts on simulated seeds 1-100 and evaluated on held-out
 * seeds 101-200. Weights live in public/model/forecast_model.json.
 *
 * It only looks at data available on that day (no future values, no ground truth).
 */

export const FORECAST_HORIZON = 3;

export const FORECAST_FEATURES = [
  { key: "flagRate", label: "Share of wearers drifting today" },
  { key: "flagRise", label: "Rise in drifting wearers vs 2 days ago" },
  { key: "windowRate", label: "Drifting share over the 3-day window" },
  { key: "excess", label: "Excess over this zone's normal level" },
  { key: "evidence", label: "Strength of cluster evidence" },
  { key: "watch", label: "Zone already on watch" },
  { key: "neighborLevel", label: "Neighbouring zone on watch or alert" },
  { key: "neighborRate", label: "Drifting share in neighbouring zones" },
  { key: "regionWide", label: "Region-wide shift (heat, festival)" },
  // Region-relative context: separates a local cluster from a region-wide
  // shift such as a heatwave, where every zone drifts together.
  { key: "flagRateRel", label: "Drifting share above the region's median today" },
  { key: "windowRateRel", label: "3-day drifting share above the region's median" },
  { key: "regionElevated", label: "Share of all zones elevated today" },
] as const;

export type ForecastFeatureKey = (typeof FORECAST_FEATURES)[number]["key"];

export interface ForecastModel {
  version: string;
  horizonDays: number;
  features: string[];
  mean: number[];
  std: number[];
  weights: number[];
  bias: number;
  threshold: number;
  trainedOn: string;
}

export interface ZoneForecast {
  zoneId: string;
  day: number;
  level: ZoneLevel;
  probability: number;
  risk: "low" | "rising" | "high";
  features: number[];
  contributions: Array<{ key: ForecastFeatureKey; label: string; value: number; weight: number; contribution: number }>;
}

const LEVEL_SCORE: Record<ZoneLevel, number> = { normal: 0, watch: 0.5, alert: 1 };

function sigmoid(x: number): number {
  if (x >= 0) return 1 / (1 + Math.exp(-x));
  const e = Math.exp(x);
  return e / (1 + e);
}

/** Precomputed per-zone lookups so feature extraction stays O(1) per zone-day. */
export interface ForecastIndex {
  zoneDay: Map<string, ZoneDay>; // `${zoneId}:${day}`
  flaggedByZoneDay: Map<string, number>; // drifting wearers that day
  validByZoneDay: Map<string, number>; // wearers with a valid day
  regionByDay: Map<number, { medianFlagRate: number; medianWindowRate: number; elevatedShare: number }>;
}

export function buildForecastIndex(result: SimResult): ForecastIndex {
  const zoneDay = new Map<string, ZoneDay>();
  for (const row of result.zoneDays) zoneDay.set(`${row.zoneId}:${row.day}`, row);
  const flaggedByZoneDay = new Map<string, number>();
  const validByZoneDay = new Map<string, number>();
  for (const person of result.people) {
    const drift = result.drift[person.id] ?? [];
    const obs = result.obs[person.id] ?? [];
    for (let day = 0; day < obs.length; day++) {
      const key = `${person.zoneId}:${day}`;
      if (obs[day]?.valid) validByZoneDay.set(key, (validByZoneDay.get(key) ?? 0) + 1);
      if (drift[day]?.flagged) flaggedByZoneDay.set(key, (flaggedByZoneDay.get(key) ?? 0) + 1);
    }
  }
  const index: ForecastIndex = { zoneDay, flaggedByZoneDay, validByZoneDay, regionByDay: new Map() };
  const days = Math.max(0, ...Object.values(result.obs).map((o) => o.length));
  for (let day = 0; day < days; day++) {
    const flagRates: number[] = [];
    const windowRates: number[] = [];
    let elevated = 0;
    for (const zone of result.zones) {
      flagRates.push(rateAt(index, zone.id, day));
      const row = zoneDay.get(`${zone.id}:${day}`);
      const n = row?.n ?? 0;
      windowRates.push(n > 0 ? (row?.k ?? 0) / n : 0);
      if (excessZ(row) > 2) elevated++;
    }
    index.regionByDay.set(day, {
      medianFlagRate: median(flagRates),
      medianWindowRate: median(windowRates),
      elevatedShare: result.zones.length ? elevated / result.zones.length : 0,
    });
  }
  return index;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Standardised excess of today's 3-day count over the zone's own normal. */
function excessZ(row: ZoneDay | undefined): number {
  const n = row?.n ?? 0;
  const k = row?.k ?? 0;
  const p0 = row?.p0 ?? 0;
  const expected = n * p0;
  const sd = Math.sqrt(Math.max(expected * (1 - p0), 0.25));
  return Math.max(-3, Math.min(8, (k - expected) / sd));
}

function rateAt(index: ForecastIndex, zoneId: string, day: number): number {
  if (day < 0) return 0;
  const valid = index.validByZoneDay.get(`${zoneId}:${day}`) ?? 0;
  const flagged = index.flaggedByZoneDay.get(`${zoneId}:${day}`) ?? 0;
  return valid > 0 ? flagged / valid : 0;
}

/** Feature vector for one zone on one day, in FORECAST_FEATURES order. */
export function forecastFeatures(
  result: SimResult,
  index: ForecastIndex,
  zoneId: string,
  day: number,
): number[] {
  const row = index.zoneDay.get(`${zoneId}:${day}`);
  const zone = result.zones.find((z) => z.id === zoneId);
  const n = row?.n ?? 0;
  const k = row?.k ?? 0;
  const flagRate = rateAt(index, zoneId, day);
  const flagRise = flagRate - rateAt(index, zoneId, day - 2);
  const windowRate = n > 0 ? k / n : 0;
  const excess = excessZ(row);
  const evidence = Math.min(10, -Math.log10(Math.max(row?.pValue ?? 1, 1e-12))) / 10;
  const watch = row?.level === "watch" ? 1 : 0;
  let neighborLevel = 0;
  let neighborRate = 0;
  for (const neighborId of zone?.neighbors ?? []) {
    const nb = index.zoneDay.get(`${neighborId}:${day}`);
    if (nb) neighborLevel = Math.max(neighborLevel, LEVEL_SCORE[nb.level]);
    neighborRate = Math.max(neighborRate, rateAt(index, neighborId, day));
  }
  const regionWide = row?.regionWide ? 1 : 0;
  const region = index.regionByDay.get(day);
  const flagRateRel = flagRate - (region?.medianFlagRate ?? 0);
  const windowRateRel = windowRate - (region?.medianWindowRate ?? 0);
  const regionElevated = region?.elevatedShare ?? 0;
  return [
    flagRate,
    flagRise,
    windowRate,
    excess,
    evidence,
    watch,
    neighborLevel,
    neighborRate,
    regionWide,
    flagRateRel,
    windowRateRel,
    regionElevated,
  ];
}

export function forecastLogit(model: ForecastModel, x: number[]): number {
  let z = model.bias;
  for (let i = 0; i < x.length; i++) {
    const std = model.std[i] || 1;
    z += model.weights[i] * ((x[i] - model.mean[i]) / std);
  }
  return z;
}

export function forecastProbability(model: ForecastModel, x: number[]): number {
  return sigmoid(forecastLogit(model, x));
}

/**
 * Factors that genuinely push risk UP: positive weight and above-average value.
 * (A low value on a negatively weighted feature also raises the score, but
 * "weak evidence" is not a reason to tell anyone a zone is at risk.)
 */
export function riskDrivers(f: ZoneForecast, min = 0.25): ZoneForecast["contributions"] {
  if (f.level === "alert" || f.risk === "low") return [];
  return f.contributions.filter((c) => c.weight > 0 && c.contribution > min);
}

export function riskBand(probability: number, threshold: number): ZoneForecast["risk"] {
  if (probability >= threshold) return "high";
  if (probability >= threshold / 2) return "rising";
  return "low";
}

/** Forecast for every zone on a given day, highest risk first. */
export function zoneForecasts(
  result: SimResult,
  day: number,
  model: ForecastModel,
  index: ForecastIndex = buildForecastIndex(result),
): ZoneForecast[] {
  const out: ZoneForecast[] = [];
  for (const zone of result.zones) {
    const level = index.zoneDay.get(`${zone.id}:${day}`)?.level ?? "normal";
    const x = forecastFeatures(result, index, zone.id, day);
    const probability = level === "alert" ? 1 : forecastProbability(model, x);
    const contributions = FORECAST_FEATURES.map((feature, i) => ({
      key: feature.key,
      label: feature.label,
      value: x[i],
      weight: model.weights[i],
      contribution: model.weights[i] * ((x[i] - model.mean[i]) / (model.std[i] || 1)),
    })).sort((a, b) => b.contribution - a.contribution);
    out.push({
      zoneId: zone.id,
      day,
      level,
      probability,
      risk: level === "alert" ? "high" : riskBand(probability, model.threshold),
      features: x,
      contributions,
    });
  }
  return out.sort((a, b) => b.probability - a.probability);
}

/** Label used for training: not on alert today, alert within the next `horizon` days. */
export function escalationLabel(
  index: ForecastIndex,
  zoneId: string,
  day: number,
  horizon = FORECAST_HORIZON,
): boolean | null {
  const today = index.zoneDay.get(`${zoneId}:${day}`);
  if (!today || today.level === "alert") return null;
  for (let ahead = 1; ahead <= horizon; ahead++) {
    const row = index.zoneDay.get(`${zoneId}:${day + ahead}`);
    if (!row) return null;
    if (row.level === "alert") return true;
  }
  return false;
}
