import { mulberry32 } from "@/lib/engine/rng";
import type { Mode, Person, Zone } from "@/lib/engine/types";
import { PRESETS } from "@/lib/engine/presets";

export interface GeoPoint {
  lat: number;
  lng: number;
}

export function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * City mode places each zone on a real town around Hyderabad (approximate town
 * centres, for orientation only). Other modes use a compact grid.
 */
const CITY_CENTERS: Record<string, [number, number]> = {
  W01: [17.5326, 78.2645], // Patancheru
  W02: [17.4849, 78.4138], // Kukatpally
  W03: [17.6297, 78.4814], // Medchal
  W04: [17.4399, 78.4983], // Secunderabad
  W05: [17.4401, 78.3489], // Gachibowli
  W06: [17.2603, 78.3969], // Shamshabad
  W07: [17.3457, 78.5522], // LB Nagar
  W08: [17.4058, 78.5591], // Uppal
};
const CITY_HALF = 0.016;

export function zoneBounds(mode: Mode, zone: Zone): {
  north: number;
  south: number;
  east: number;
  west: number;
} {
  const city = mode === "ward" ? CITY_CENTERS[zone.id] : undefined;
  if (city) {
    return { north: city[0] + CITY_HALF, south: city[0] - CITY_HALF, east: city[1] + CITY_HALF, west: city[1] - CITY_HALF };
  }
  const preset = PRESETS[mode];
  const rows = Math.max(...preset.zones.map((row) => row.row)) + 1;
  const cell = preset.cellDegrees;
  const [centerLat, centerLng] = preset.center;
  const north = centerLat + (rows / 2 - zone.row) * cell;
  const west = centerLng + (zone.col - preset.columns / 2) * cell;
  return { north, south: north - cell, east: west + cell, west };
}

export function zoneCenter(mode: Mode, zone: Zone): GeoPoint {
  const bounds = zoneBounds(mode, zone);
  return {
    lat: (bounds.north + bounds.south) / 2,
    lng: (bounds.east + bounds.west) / 2,
  };
}

/**
 * Random-looking dot position inside a zone. Deterministic per seed and
 * person. Carries no meaning about where anyone lives.
 */
export function dotPosition(
  mode: Mode,
  zone: Zone,
  person: Person,
  seed: number,
): GeoPoint {
  const bounds = zoneBounds(mode, zone);
  const rand = mulberry32(hashString(`${seed}:${person.id}`));
  const margin = 0.18;
  const latSpan = bounds.north - bounds.south;
  const lngSpan = bounds.east - bounds.west;
  return {
    lat: bounds.south + latSpan * (margin + rand() * (1 - 2 * margin)),
    lng: bounds.west + lngSpan * (margin + rand() * (1 - 2 * margin)),
  };
}

export function allBounds(mode: Mode): { north: number; south: number; east: number; west: number } {
  const preset = PRESETS[mode];
  const boxes = preset.zones.map((zone) => zoneBounds(mode, zone));
  return {
    north: Math.max(...boxes.map((box) => box.north)),
    south: Math.min(...boxes.map((box) => box.south)),
    east: Math.max(...boxes.map((box) => box.east)),
    west: Math.min(...boxes.map((box) => box.west)),
  };
}
