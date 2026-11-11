export type Mode = "village" | "ward" | "society";
export type Scenario = "calm" | "cluster" | "spread";
export type HealthState =
  | "healthy"
  | "sporadic"
  | "incubating"
  | "symptomatic"
  | "recovering";

export interface Zone {
  id: string;
  name: string;
  col: number;
  row: number;
  neighbors: string[];
}

export interface Person {
  id: string; // pseudonymous code, e.g. "V-03-017". Never a real name.
  zoneId: string;
  age: number;
  sex: "F" | "M";
  baseRhr: number; // true personal resting HR (hidden from detector)
  source: "ayulink-band" | "smartwatch";
  rhythmSampleId: string | null; // set for a few people aged 55+, else null
}

export interface DayObs {
  day: number;
  rhr: number | null;
  activity: number | null;
  state: HealthState;
  wearMin: number | null; // minutes worn at rest that day (null = not worn)
  artefactFrac: number | null; // 0..1 share of readings spoiled by motion/poor contact
  valid: boolean; // set by signalQuality.dayQuality(); detectors use ONLY valid days
  /** Days since infection, null if never infected. Evaluation ground truth only. */
  tau: number | null;
}

export interface DriftPoint {
  day: number;
  baseline: number | null;
  sigma: number | null;
  z: number | null;
  flagged: boolean;
}

export type ZoneLevel = "normal" | "watch" | "alert";

export interface ZoneDay {
  zoneId: string;
  day: number;
  n: number;
  k: number;
  p0: number;
  pValue: number;
  level: ZoneLevel;
  regionWide?: boolean;
}

export type Stress = "none" | "heatwave" | "noisy" | "isolated" | "fast";

export interface SimConfig {
  mode: Mode;
  scenario: Scenario;
  seed: number;
  outbreakDay: number;
  wearRate: number;
  days: number;
  noiseLevel: number;
  stress: Stress;
}

export interface SimResult {
  config: SimConfig;
  zones: Zone[];
  people: Person[];
  obs: Record<string, DayObs[]>; // personId -> per-day
  drift: Record<string, DriftPoint[]>; // personId -> per-day
  zoneDays: ZoneDay[];
  outbreakZoneId: string | null; // zone where the outbreak was seeded
  firstAlertDay: number | null; // first day the OUTBREAK ZONE reaches 'alert' on/after outbreakDay
  clinicDetectionDay: number | null; // simulated clinic-based detection IN THE SAME ZONE
  leadDays: number | null; // clinicDetectionDay - firstAlertDay (same zone only)
  falseAlertZoneDays: number; // 'alert' zone-days with no outbreak in that zone
}

export type Lang = "en" | "te" | "hi";
export type TriageKind = "drift" | "rhythm" | "cluster";
