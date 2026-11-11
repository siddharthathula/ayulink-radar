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

interface Matrices {
  flags: Record<string, boolean[]>;
  valid: Record<string, boolean[]>;
}

/**
 * Unique people flagged on any day in [day-2, day], and unique people with at
 * least two valid days in the same window.
 */
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
    if (validCount >= 2) n += 1;
    if (flagged) k += 1;
  }
  return { n, k };
}

/**
 * Expected 3-day flag rate from days d-28..d-4.
 *
 * The numerator and denominator use the SAME unique-person 3-day window as
 * the observed k/n. A daily rate here would be a window mismatch.
 */
export function computeP0(
  personIds: string[],
  matrices: Matrices,
  day: number,
): number {
  const rates: number[] = [];
  for (let h = day - CLUSTER.historyStart; h <= day - CLUSTER.historyEnd; h++) {
    if (h < 0) continue;
    const stats = windowStats(personIds, matrices, h);
    if (stats.n > 0) {
      rates.push(Math.min(1, stats.k / stats.n));
    }
  }
  if (rates.length === 0) return CLUSTER.p0Floor;
  const mean = rates.reduce((sum, value) => sum + value, 0) / rates.length;
  return Math.max(CLUSTER.p0Floor, mean);
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

  const zoneCount = zones.length;
  const all: ZoneDay[] = [];

  for (let day = 0; day < dayCount; day++) {
    const today: ZoneDay[] = zones.map((zone) => {
      const ids = peopleByZone.get(zone.id) ?? [];
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
      const { n, k } = windowStats(ids, matrices, day);
      const p0 = computeP0(ids, matrices, day);
      const pValue = binomTail(k, n, p0);
      let level: ZoneLevel = "normal";
      if (n >= CLUSTER.minEligible) {
        if (k >= CLUSTER.alertK && pValue < CLUSTER.alertAlpha / zoneCount) {
          level = "alert";
        } else if (k >= CLUSTER.watchK && pValue < CLUSTER.watchAlpha / zoneCount) {
          level = "watch";
        }
      }
      return {
        zoneId: zone.id,
        day,
        n,
        k,
        p0,
        pValue,
        level,
      };
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
