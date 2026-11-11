import { detectClusters, zoneWindowStats } from "./cluster";
import { CLUSTER_FIRST_DAY } from "./presets";
import type { DayObs, DriftPoint, Person, SimResult, Zone, ZoneDay } from "./types";

export type DetectorId = "D1" | "D2" | "D3" | "D4";

export const DETECTORS: Array<{ id: DetectorId; name: string; description: string }> = [
  {
    id: "D1",
    name: "Fixed threshold",
    description: "Person flagged at rhr >= 90 on two consecutive valid days; zone alert at k >= 4.",
  },
  {
    id: "D2",
    name: "Personal baseline",
    description: "Personal-baseline drift flags; zone alert at k >= 4, no statistics.",
  },
  {
    id: "D3",
    name: "Baseline + binomial",
    description: "Personal-baseline drift plus the 3-day binomial cluster test, without the region-wide guard.",
  },
  {
    id: "D4",
    name: "Full engine",
    description: "D3 plus the region-wide confounder guard. This is the product.",
  },
];

function flagsFromFixedThreshold(people: Person[], obs: Record<string, DayObs[]>): Record<string, boolean[]> {
  const flags: Record<string, boolean[]> = {};
  for (const person of people) {
    const series = obs[person.id] ?? [];
    const out: boolean[] = new Array(series.length).fill(false);
    let previousValidRhr: number | null = null;
    for (const day of series) {
      if (day.valid && day.rhr !== null) {
        out[day.day] = previousValidRhr !== null && previousValidRhr >= 90 && day.rhr >= 90;
        previousValidRhr = day.rhr;
      } else {
        out[day.day] = false;
      }
    }
    flags[person.id] = out;
  }
  return flags;
}

function flagsFromDrift(
  people: Person[],
  drift: Record<string, DriftPoint[]>,
): Record<string, boolean[]> {
  const flags: Record<string, boolean[]> = {};
  for (const person of people) {
    flags[person.id] = (drift[person.id] ?? []).map((point) => point.flagged);
  }
  return flags;
}

function simpleZoneDays(
  people: Person[],
  zones: Zone[],
  obs: Record<string, DayObs[]>,
  flags: Record<string, boolean[]>,
): ZoneDay[] {
  const dayCount = Object.values(obs)[0]?.length ?? 0;
  const peopleByZone = new Map<string, string[]>();
  for (const zone of zones) peopleByZone.set(zone.id, []);
  for (const person of people) peopleByZone.get(person.zoneId)?.push(person.id);

  const valid: Record<string, boolean[]> = {};
  for (const person of people) {
    valid[person.id] = (obs[person.id] ?? []).map((day) => day.valid);
  }

  const rows: ZoneDay[] = [];
  const statsByZone = new Map<string, { n: number[]; k: number[] }>();
  for (const zone of zones) {
    statsByZone.set(
      zone.id,
      zoneWindowStats(peopleByZone.get(zone.id) ?? [], { flags, valid }, dayCount),
    );
  }
  for (let day = 0; day < dayCount; day++) {
    for (const zone of zones) {
      if (day < CLUSTER_FIRST_DAY) {
        rows.push({
          zoneId: zone.id,
          day,
          n: 0,
          k: 0,
          p0: 0,
          pValue: 1,
          level: "normal",
          regionWide: false,
        });
        continue;
      }
      const stats = statsByZone.get(zone.id);
      const n = stats?.n[day] ?? 0;
      const k = stats?.k[day] ?? 0;
      const alert = n >= 10 && k >= 4;
      rows.push({
        zoneId: zone.id,
        day,
        n,
        k,
        p0: 0,
        pValue: 1,
        level: alert ? "alert" : "normal",
        regionWide: false,
      });
    }
  }
  return rows;
}

export function detectorZoneDays(detector: DetectorId, result: SimResult): ZoneDay[] {
  if (detector === "D1") {
    return simpleZoneDays(
      result.people,
      result.zones,
      result.obs,
      flagsFromFixedThreshold(result.people, result.obs),
    );
  }
  if (detector === "D2") {
    return simpleZoneDays(
      result.people,
      result.zones,
      result.obs,
      flagsFromDrift(result.people, result.drift),
    );
  }
  if (detector === "D4") {
    return result.zoneDays;
  }
  return detectClusters(result.people, result.zones, result.obs, result.drift, {
    guard: false,
  });
}

/** Ground truth for a zone-day: at least 3 people with tau in 1..10. */
export function zoneOutbreakActive(result: SimResult, zoneId: string, day: number): boolean {
  let active = 0;
  for (const person of result.people) {
    if (person.zoneId !== zoneId) continue;
    const tau = result.obs[person.id]?.[day]?.tau ?? null;
    if (tau !== null && tau >= 1 && tau <= 10) active += 1;
  }
  return active >= 3;
}
