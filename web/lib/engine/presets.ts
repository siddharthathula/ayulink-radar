import type { Mode, Scenario, SimConfig, Stress, Zone } from "./types";

export interface ModePreset {
  mode: Mode;
  label: string;
  columns: number;
  zones: Zone[];
  peoplePerZone: number;
  bandFraction: number;
  reportingLagDays: number;
  center: [lat: number, lng: number];
  cellDegrees: number;
  fictionalNote: string;
}

const VILLAGE_NAMES = [
  "Nallavagu",
  "Chintapalle",
  "Peddagudem",
  "Rayakunta",
  "Mallaram",
  "Yerracheruvu",
];

// Real towns around Hyderabad, used only to orient the map. All wearers and
// outbreaks in the console are simulated; there is no deployment here.
const CITY_NAMES = [
  "Patancheru",
  "Kukatpally",
  "Medchal",
  "Secunderabad",
  "Gachibowli",
  "Shamshabad",
  "LB Nagar",
  "Uppal",
];

const SOCIETY_NAMES = ["Tower A", "Tower B", "Tower C", "Tower D", "Tower E", "Tower F"];

function buildZones(mode: Mode, names: string[], columns: number): Zone[] {
  const prefix = mode === "village" ? "V" : mode === "ward" ? "W" : "S";
  const zones: Zone[] = names.map((name, index) => ({
    id: `${prefix}${String(index + 1).padStart(2, "0")}`,
    name,
    col: index % columns,
    row: Math.floor(index / columns),
    neighbors: [],
  }));

  for (const zone of zones) {
    zone.neighbors = zones
      .filter((other) => {
        const sameRow = other.row === zone.row && Math.abs(other.col - zone.col) === 1;
        const sameCol = other.col === zone.col && Math.abs(other.row - zone.row) === 1;
        return sameRow || sameCol;
      })
      .map((other) => other.id);
  }
  return zones;
}

export const PRESETS: Record<Mode, ModePreset> = {
  village: {
    mode: "village",
    label: "Village",
    columns: 3,
    zones: buildZones("village", VILLAGE_NAMES, 3),
    peoplePerZone: 34,
    bandFraction: 1,
    reportingLagDays: 3,
    center: [17.31, 78.14],
    cellDegrees: 0.012,
    fictionalNote: "Fictional hamlet names, placed in rural Rangareddy near Hyderabad. No real deployment.",
  },
  ward: {
    mode: "ward",
    label: "City",
    columns: 4,
    zones: buildZones("ward", CITY_NAMES, 4),
    peoplePerZone: 60,
    bandFraction: 0.5,
    reportingLagDays: 2,
    center: [17.42, 78.45],
    cellDegrees: 0.006,
    fictionalNote:
      "Real Hyderabad-area town names for orientation only. Wearers and outbreaks are simulated; no real deployment.",
  },
  society: {
    mode: "society",
    label: "Society",
    columns: 3,
    zones: buildZones("society", SOCIETY_NAMES, 3),
    peoplePerZone: 80,
    bandFraction: 0,
    reportingLagDays: 2,
    center: [17.4239, 78.3426],
    cellDegrees: 0.0015,
    fictionalNote: "Illustrative apartment towers in Hyderabad's Financial District. No real deployment.",
  },
};

export const DEFAULT_CONFIG: SimConfig = {
  mode: "village",
  scenario: "cluster",
  seed: 2026,
  outbreakDay: 34,
  wearRate: 0.8,
  days: 60,
  noiseLevel: 0.2,
  stress: "none",
};

export const MODES: Mode[] = ["village", "ward", "society"];
export const SCENARIOS: Scenario[] = ["calm", "cluster", "spread"];
export const STRESSES: Stress[] = ["none", "heatwave", "noisy", "isolated", "fast"];

export const DEFAULT_DAYS = 60;
export const CLUSTER_FIRST_DAY = 28;

export function presetFor(mode: Mode): ModePreset {
  return PRESETS[mode];
}
