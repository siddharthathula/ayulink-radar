import type { DayObs, DriftPoint, Person, Zone, ZoneDay, ZoneLevel } from "./types";

export const CLUSTER = {
  alertK: 4,
  watchK: 3,
  alertAlpha: 0.001,
  watchAlpha: 0.01,
  minEligible: 10,
  firstDay: 28,
  windowDays: 3,
  historyStart: 28,
  historyEnd: 4,
  p0Floor: 0.02,
};

// P(X >= k) for X ~ Binomial(n, p)
export function binomTail(k: number, n: number, p: number): number {
  if (k <= 0) return 1;
  if (k > n) return 0;
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  let pmf = Math.pow(1 - p, n);
  let cdf = pmf;
  for (let i = 1; i < k; i++) {
    pmf *= ((n - i + 1) / i) * (p / (1 - p));
    cdf += pmf;
  }
  return Math.max(0, 1 - cdf);
}

export interface Matrices {
  flags: Record<string, boolean[]>;
  valid: Record<string, boolean[]>;
}

function prefix(values: boolean[]): number[] {
  const out = new Array<number>(values.length + 1).fill(0);
  for (let i = 0; i < values.length; i++) out[i + 1] = out[i] + (values[i] ? 1 : 0);
  return out;
}

/**
 * Per-day n and k for one zone using the 3-day unique-person window.
 *
 * n = people with >= 2 valid days in [day-2, day].
 * k = people counted in n who were flagged on any day in [day-2, day].
 *     (k must be a subset of n, or the binomial p-value is too small.)
 *
 * Prefix sums make this O(people * days) per zone, not O(days * people * 3).
 */
export function zoneWindowStats(
  personIds: string[],
  matrices: Matrices,
  days: number,
): { n: number[]; k: number[] } {
  const n = new Array<number>(days).fill(0);
  const k = new Array<number>(days).fill(0);
  for (const id of personIds) {
    const valid = prefix(matrices.valid[id] ?? []);
    const flags = prefix(matrices.flags[id] ?? []);
    for (let day = 0; day < days; day++) {
      const start = Math.max(0, day - 2);
      const validCount = valid[day + 1] - valid[start];
      if (validCount < 2) continue;
      n[day] += 1;
      if (flags[day + 1] - flags[start] > 0) k[day] += 1;
    }
  }
  return { n, k };
}

/**
 * Expected 3-day flag rate from days d-28..d-4, using precomputed n/k for the
 * same 3-day unique-person window. A daily rate here would be a mismatch.
 */
export function p0FromStats(n: number[], k: number[], day: number): number {
  const rates: number[] = [];
  for (let h = day - CLUSTER.historyStart; h <= day - CLUSTER.historyEnd; h++) {
    if (h < 0 || h >= n.length) continue;
    if (n[h] > 0) rates.push(Math.min(1, k[h] / n[h]));
  }
  if (rates.length === 0) return CLUSTER.p0Floor;
  const mean = rates.reduce((sum, value) => sum + value, 0) / rates.length;
  return Math.max(CLUSTER.p0Floor, mean);
}

export function windowStats(
  personIds: string[],
  matrices: Matrices,
  day: number,
): { n: number; k: number } {
  let n = 0;
  let k = 0;
  for (const id of personIds) {
    const flags = matrices.flags[id] ?? [];
    const valid = matrices.valid[id] ?? [];
    let validCount = 0;
    let flagged = false;
    for (let offset = 0; offset < CLUSTER.windowDays; offset++) {
      const index = day - offset;
      if (index < 0) continue;
      if (valid[index]) validCount += 1;
      if (flags[index]) flagged = true;
    }
    if (validCount < 2) continue;
    n += 1;
    if (flagged) k += 1;
  }
  return { n, k };
}

export function computeP0(
  personIds: string[],
  matrices: Matrices,
  day: number,
): number {
  const days = Math.max(
    0,
    ...personIds.flatMap((id) => [
      matrices.flags[id]?.length ?? 0,
      matrices.valid[id]?.length ?? 0,
    ]),
  );
  const { n, k } = zoneWindowStats(personIds, matrices, days);
  return p0FromStats(n, k, day);
}

export interface ClusterOptions {
  guard: boolean;
}

export function detectClusters(
  people: Person[],
  zones: Zone[],
  obs: Record<string, DayObs[]>,
  drift: Record<string, DriftPoint[]>,
  options: ClusterOptions = { guard: true },
): ZoneDay[] {
  const dayCount = Object.values(obs)[0]?.length ?? 0;
  const peopleByZone = new Map<string, string[]>();
  for (const zone of zones) peopleByZone.set(zone.id, []);
  for (const person of people) {
    peopleByZone.get(person.zoneId)?.push(person.id);
  }

  const matrices: Matrices = { flags: {}, valid: {} };
  for (const person of people) {
    matrices.flags[person.id] = (drift[person.id] ?? []).map((point) => point.flagged);
    matrices.valid[person.id] = (obs[person.id] ?? []).map((day) => day.valid);
  }

  const statsByZone = new Map<string, { n: number[]; k: number[] }>();
  for (const zone of zones) {
    statsByZone.set(
      zone.id,
      zoneWindowStats(peopleByZone.get(zone.id) ?? [], matrices, dayCount),
    );
  }

  const zoneCount = zones.length;
  const all: ZoneDay[] = [];

  for (let day = 0; day < dayCount; day++) {
    const today: ZoneDay[] = zones.map((zone) => {
      if (day < CLUSTER.firstDay) {
        return {
          zoneId: zone.id,
          day,
          n: 0,
          k: 0,
          p0: 0,
          pValue: 1,
          level: "normal" as ZoneLevel,
        };
      }
      const stats = statsByZone.get(zone.id);
      const n = stats?.n[day] ?? 0;
      const k = stats?.k[day] ?? 0;
      const p0 = stats ? p0FromStats(stats.n, stats.k, day) : CLUSTER.p0Floor;
      const pValue = binomTail(k, n, p0);
      let level: ZoneLevel = "normal";
      if (n >= CLUSTER.minEligible) {
        if (k >= CLUSTER.alertK && pValue < CLUSTER.alertAlpha / zoneCount) {
          level = "alert";
        } else if (k >= CLUSTER.watchK && pValue < CLUSTER.watchAlpha / zoneCount) {
          level = "watch";
        }
      }
      return { zoneId: zone.id, day, n, k, p0, pValue, level };
    });

    let regionWide = false;
    if (options.guard) {
      const elevated = today.filter((row) => row.level !== "normal").length;
      if (elevated > zoneCount / 2) {
        regionWide = true;
        for (const row of today) {
          if (row.level === "alert") row.level = "watch";
          else if (row.level === "watch") row.level = "normal";
        }
      }
    }
    for (const row of today) {
      row.regionWide = regionWide;
      all.push(row);
    }
  }

  return all;
}

export function levelForZone(
  zoneDays: ZoneDay[],
  zoneId: string,
  day: number,
): ZoneLevel {
  return (
    zoneDays.find((row) => row.zoneId === zoneId && row.day === day)?.level ??
    "normal"
  );
}
