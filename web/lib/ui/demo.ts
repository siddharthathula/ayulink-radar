import { dayQuality } from "@/lib/engine/signalQuality";
import type { SimResult, ZoneDay, ZoneLevel } from "@/lib/engine/types";

export function displayDay(day: number): number {
  return day - 27;
}

export function zoneLevelAt(
  zoneDays: ZoneDay[],
  zoneId: string,
  day: number,
): ZoneLevel {
  return (
    zoneDays.find((row) => row.zoneId === zoneId && row.day === day)?.level ??
    "normal"
  );
}

export function zoneDayAt(
  zoneDays: ZoneDay[],
  zoneId: string,
  day: number,
): ZoneDay | undefined {
  return zoneDays.find((row) => row.zoneId === zoneId && row.day === day);
}

export function alertFeed(
  zoneDays: ZoneDay[],
  day: number,
  zoneFilter: string | null,
): ZoneDay[] {
  return zoneDays
    .filter(
      (row) =>
        row.day >= 28 &&
        row.day <= day &&
        row.level !== "normal" &&
        (zoneFilter === null || row.zoneId === zoneFilter),
    )
    .sort((a, b) => {
      if (a.day !== b.day) return b.day - a.day;
      const rank = { alert: 0, watch: 1, normal: 2 };
      return rank[a.level] - rank[b.level];
    });
}

export function countFlaggedToday(result: SimResult, day: number): number {
  let count = 0;
  for (const person of result.people) {
    const point = result.drift[person.id]?.[day];
    const observation = result.obs[person.id]?.[day];
    if (point?.flagged && observation?.valid) count += 1;
  }
  return count;
}

export function zoneCounts(
  result: SimResult,
  day: number,
): { watch: number; alert: number; normal: number } {
  let watch = 0;
  let alert = 0;
  let normal = 0;
  for (const zone of result.zones) {
    const level = zoneLevelAt(result.zoneDays, zone.id, day);
    if (level === "alert") alert += 1;
    else if (level === "watch") watch += 1;
    else normal += 1;
  }
  return { watch, alert, normal };
}

export function consecutiveFlagged(
  result: SimResult,
  personId: string,
  day: number,
): number {
  let count = 0;
  for (let offset = 0; offset <= day; offset++) {
    if (result.drift[personId]?.[day - offset]?.flagged) count += 1;
    else break;
  }
  return count;
}

export function qualityExclusions(
  result: SimResult,
  zoneId: string,
  day: number,
): { notWorn: number; shortWear: number; artefact: number; total: number } {
  let notWorn = 0;
  let shortWear = 0;
  let artefact = 0;
  for (const person of result.people) {
    if (person.zoneId !== zoneId) continue;
    for (let offset = 0; offset < 3; offset++) {
      const observation = result.obs[person.id]?.[day - offset];
      if (!observation) continue;
      const quality = dayQuality(observation.wearMin, observation.artefactFrac);
      if (quality.reason === "not-worn") notWorn += 1;
      else if (quality.reason === "short-wear") shortWear += 1;
      else if (quality.reason === "artefact") artefact += 1;
    }
  }
  return {
    notWorn,
    shortWear,
    artefact,
    total: notWorn + shortWear + artefact,
  };
}

export interface LeadSnapshot {
  alertDay: number | null;
  clinicDay: number | null;
  leadDays: number | null;
  outbreakZoneId: string | null;
}

export function leadSnapshot(result: SimResult): LeadSnapshot {
  return {
    alertDay: result.firstAlertDay,
    clinicDay: result.clinicDetectionDay,
    leadDays: result.leadDays,
    outbreakZoneId: result.outbreakZoneId,
  };
}

export function runAlertCount(result: SimResult): number {
  return result.zoneDays.filter((row) => row.level === "alert").length;
}

export function zoneName(result: SimResult, zoneId: string | null): string {
  if (!zoneId) return "All zones";
  return result.zones.find((zone) => zone.id === zoneId)?.name ?? zoneId;
}
