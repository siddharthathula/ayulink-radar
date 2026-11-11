/**
 * Operator-console helpers. Pure functions over a SimResult.
 *
 * Everything here is DERIVED from the engine output for display. Nothing here
 * changes a flag, a p-value or an alert. Gateway telemetry is a display-only
 * simulation of store-and-forward behaviour and is labelled as simulated in the UI.
 */
import { mulberry32 } from "@/lib/engine/rng";
import type { SimResult, ZoneDay, ZoneLevel } from "@/lib/engine/types";
import { hashString } from "./geo";

export const FIRST_DAY = 28;
export const LAST_DAY = 59;

export interface DayPoint {
  day: number;
  flagged: number;
  worn: number;
  watchZones: number;
  alertZones: number;
}

/** Per-day counts across the run window (optionally for one zone). */
export function dailySeries(result: SimResult, zoneId: string | null = null): DayPoint[] {
  const people = zoneId ? result.people.filter((p) => p.zoneId === zoneId) : result.people;
  const byDay = new Map<number, ZoneDay[]>();
  for (const row of result.zoneDays) {
    if (zoneId && row.zoneId !== zoneId) continue;
    const list = byDay.get(row.day) ?? [];
    list.push(row);
    byDay.set(row.day, list);
  }
  const out: DayPoint[] = [];
  for (let day = FIRST_DAY; day <= LAST_DAY; day++) {
    let flagged = 0;
    let worn = 0;
    for (const person of people) {
      const obs = result.obs[person.id]?.[day];
      if (obs?.valid) worn += 1;
      if (obs?.valid && result.drift[person.id]?.[day]?.flagged) flagged += 1;
    }
    const rows = byDay.get(day) ?? [];
    out.push({
      day,
      flagged,
      worn,
      watchZones: rows.filter((r) => r.level === "watch").length,
      alertZones: rows.filter((r) => r.level === "alert").length,
    });
  }
  return out;
}

export interface GridCell {
  zoneId: string;
  day: number;
  level: ZoneLevel;
  k: number;
  n: number;
  pValue: number;
  regionWide: boolean;
}

/** Zone × day matrix for the surveillance grid. */
export function surveillanceGrid(result: SimResult): Map<string, GridCell[]> {
  const index = new Map<string, ZoneDay>();
  for (const row of result.zoneDays) index.set(`${row.zoneId}:${row.day}`, row);
  const grid = new Map<string, GridCell[]>();
  for (const zone of result.zones) {
    const cells: GridCell[] = [];
    for (let day = FIRST_DAY; day <= LAST_DAY; day++) {
      const row = index.get(`${zone.id}:${day}`);
      cells.push({
        zoneId: zone.id,
        day,
        level: row?.level ?? "normal",
        k: row?.k ?? 0,
        n: row?.n ?? 0,
        pValue: row?.pValue ?? 1,
        regionWide: row?.regionWide === true,
      });
    }
    grid.set(zone.id, cells);
  }
  return grid;
}

export type UplinkState = "online" | "buffering" | "flushed";

export interface GatewayRow {
  gatewayId: string;
  zoneId: string;
  zoneName: string;
  bandsActive: number;
  bandsTotal: number;
  packetsToday: number;
  rejected: number;
  uplink: UplinkState;
  buffered: number;
  lastSyncMin: number;
  rssi: number;
  battery: number;
}

/**
 * Display-only gateway telemetry. One gateway per zone. In each run one gateway
 * loses its uplink for two days and buffers packets locally (store-and-forward),
 * then flushes. The engine still receives every packet — exactly what a
 * store-and-forward gateway guarantees — so no detection result changes.
 */
export function gatewayTelemetry(result: SimResult, day: number): GatewayRow[] {
  const seed = result.config.seed;
  const rand = mulberry32(hashString(`gw:${seed}:${result.config.mode}`));
  const outageZone = result.zones[Math.floor(rand() * result.zones.length)]?.id;
  const outageStart = 36 + Math.floor(rand() * 12);

  return result.zones.map((zone, index) => {
    const people = result.people.filter((p) => p.zoneId === zone.id);
    let active = 0;
    let rejected = 0;
    for (const person of people) {
      const obs = result.obs[person.id]?.[day];
      if (!obs || obs.wearMin === null) continue;
      active += 1;
      if (!obs.valid) rejected += 1;
    }
    const r = mulberry32(hashString(`gw:${seed}:${zone.id}:${day}`));
    const packetsPerBand = 24; // one packet per hour per band
    const packetsToday = active * packetsPerBand;

    let uplink: UplinkState = "online";
    let buffered = 0;
    let lastSyncMin = 2 + Math.floor(r() * 12);
    if (zone.id === outageZone && day >= outageStart && day < outageStart + 2) {
      uplink = "buffering";
      const hoursDown = (day - outageStart) * 24 + 6 + Math.floor(r() * 10);
      buffered = Math.round(active * hoursDown);
      lastSyncMin = hoursDown * 60;
    } else if (zone.id === outageZone && day === outageStart + 2) {
      uplink = "flushed";
    }

    return {
      gatewayId: `GW-${String(index + 1).padStart(2, "0")}`,
      zoneId: zone.id,
      zoneName: zone.name,
      bandsActive: active,
      bandsTotal: people.length,
      packetsToday,
      rejected,
      uplink,
      buffered,
      lastSyncMin,
      rssi: -(78 + Math.round(r() * 30)),
      battery: Math.round(58 + r() * 38),
    };
  });
}

export type CaseStatus = "pending" | "visited" | "referred" | "dismissed";

export const CASE_LABEL: Record<CaseStatus, string> = {
  pending: "To visit",
  visited: "Visited",
  referred: "Referred to PHC",
  dismissed: "No action",
};

export const FIELD_WORKERS = ["ASHA-01", "ASHA-02", "ASHA-03", "ANM-01"];

/** Deterministic default assignment: zones spread across field workers. */
export function defaultWorker(zoneIndex: number): string {
  return FIELD_WORKERS[zoneIndex % 3];
}

export function formatAgo(minutes: number): string {
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}

export function csvEscape(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows: Array<Array<string | number>>): string {
  return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
}

export function downloadText(filename: string, text: string, mime = "text/csv") {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
