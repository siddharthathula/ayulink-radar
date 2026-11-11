import type { Person, SimResult, ZoneLevel } from "./types";

export interface QueueRow {
  person: Person;
  zoneName: string;
  zoneLevel: ZoneLevel;
  score: number;
  reasons: string[];
  flagged: boolean;
  z: number | null;
  rhr: number | null;
  baseline: number | null;
  rhythmFlag: boolean;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

export function buildQueue(
  result: SimResult,
  day: number,
  rhythmFlags: Record<string, boolean> = {},
): QueueRow[] {
  const zoneById = new Map(result.zones.map((zone) => [zone.id, zone]));
  const levelByZone = new Map<string, ZoneLevel>();
  for (const row of result.zoneDays) {
    if (row.day === day) levelByZone.set(row.zoneId, row.level);
  }

  const rows: QueueRow[] = [];
  for (const person of result.people) {
    const point = result.drift[person.id]?.[day];
    const obs = result.obs[person.id]?.[day];
    if (!point || !obs) continue;

    const zone = zoneById.get(person.zoneId);
    const zoneLevel = levelByZone.get(person.zoneId) ?? "normal";
    const flagged = point.flagged;
    const z = point.z;
    const rhythmFlag = rhythmFlags[person.id] === true;

    const score =
      40 * (flagged ? 1 : 0) +
      8 * clamp(z ?? 0, 0, 5) +
      15 * (zoneLevel === "alert" ? 1 : 0) +
      7 * (zoneLevel === "watch" ? 1 : 0) +
      20 * (rhythmFlag ? 1 : 0) +
      (person.age >= 60 ? 5 : 0);

    if (score < 20) continue;

    const reasons: string[] = [];
    if (flagged && point.baseline !== null && obs.rhr !== null) {
      const delta = Math.round(obs.rhr - point.baseline);
      let consecutive = 0;
      for (let offset = 0; offset <= day; offset++) {
        if (result.drift[person.id]?.[day - offset]?.flagged) consecutive += 1;
        else break;
      }
      reasons.push(
        `Resting HR ${delta >= 0 ? "+" : ""}${delta} bpm above own baseline for ${consecutive} day${
          consecutive === 1 ? "" : "s"
        }`,
      );
    }
    if (zoneLevel === "alert") reasons.push("Zone on cluster alert");
    if (zoneLevel === "watch") reasons.push("Zone on watch");
    if (rhythmFlag) reasons.push("Irregular pulse rhythm screen");
    if (person.age >= 60) reasons.push("Age 60 or older");

    rows.push({
      person,
      zoneName: zone?.name ?? person.zoneId,
      zoneLevel,
      score,
      reasons,
      flagged,
      z,
      rhr: obs.rhr,
      baseline: point.baseline,
      rhythmFlag,
    });
  }

  rows.sort((a, b) => b.score - a.score || a.person.id.localeCompare(b.person.id));
  return rows;
}
