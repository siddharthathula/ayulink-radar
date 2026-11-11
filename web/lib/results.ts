import evalJson from "@/public/data/eval.json";
import modelJson from "@/public/model/rhythm_model.json";
import type { DetectorId } from "@/lib/engine/detectors";
import type { Mode } from "@/lib/engine/types";

export interface RunMetrics {
  detectionRate: number | null;
  detectionRateCI: [number, number] | null;
  zoneDaySpecificity: number | null;
  specificityCI: [number, number] | null;
  precision: number | null;
  precisionCI: [number, number] | null;
  falseAlertsPerZonePer30d: number | null;
  medianLeadDays: number | null;
  leadCI: [number, number] | null;
  leadP25: number | null;
  leadP75: number | null;
  nClusterRuns: number;
  nCalmRuns: number;
  nAlertZoneDays: number;
  nActiveAlertZoneDays: number;
  nLeads: number;
}

export interface GridRow extends RunMetrics {
  mode: Mode;
  wearRate: number;
  detector: DetectorId;
  detectorName: string;
}

export interface StressRow extends RunMetrics {
  mode: Mode;
  stress: string;
  wearRate: number;
  detector: DetectorId;
}

export interface NoiseRow {
  noiseLevel: number;
  personFlagPrecision: number | null;
  flaggedPersonDays: number;
  detectionRate: number | null;
  falseAlertsPerZonePer30d: number | null;
}

export interface EvalData {
  generatedAt: string;
  meta: {
    tuningSeeds: string;
    testSeeds: string;
    stressSeeds: string;
    noiseSeeds: string;
    testSeedNote: string;
    runtimeSeconds: number;
    bootstrapResamples: number;
    alertDefinition: string;
    specificityDefinition: string;
    falseAlertDefinition: string;
    detectorIds: DetectorId[];
  };
  tuning: {
    seeds: string;
    wearRate: number;
    targetFalseAlertsPerZonePer30d: number;
    maxFalseAlertsPerZonePer30d: number;
    passed: boolean;
    rows: Array<{ mode: Mode; falseAlertsPerZonePer30d: number | null }>;
    note: string;
  };
  grid: GridRow[];
  stress: StressRow[];
  noiseSweep: NoiseRow[];
  rhythmModel: {
    metrics: {
      dataSource: string;
      license: string;
      split: string;
      nWindows: number;
      nAf: number;
      nNormal: number;
      nRecords: number;
      thresholdRule: string;
      folds: Array<{
        fold: number;
        n: number;
        sensitivity: number;
        specificity: number;
        auroc: number;
      }>;
      mean: { sensitivity: number; specificity: number; auroc: number };
      sd: { sensitivity: number; specificity: number; auroc: number };
      outOfFold: {
        sensitivity: number;
        specificity: number;
        auroc: number;
        confusion: { tn: number; fp: number; fn: number; tp: number };
      };
    };
    source: string;
  };
}

export const evalData = evalJson as unknown as EvalData;

export const rhythmModelData = modelJson as unknown as {
  threshold: number;
  metrics: EvalData["rhythmModel"]["metrics"];
};

export function gridRow(
  mode: Mode,
  wearRate: number,
  detector: DetectorId,
): GridRow | undefined {
  return evalData.grid.find(
    (row) =>
      row.mode === mode && row.wearRate === wearRate && row.detector === detector,
  );
}

export function stressRow(
  mode: Mode,
  stress: string,
  detector: DetectorId,
): StressRow | undefined {
  return evalData.stress.find(
    (row) => row.mode === mode && row.stress === stress && row.detector === detector,
  );
}

export function formatPct(value: number | null, digits = 1): string {
  if (value === null || !Number.isFinite(value)) return "TBD";
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatNum(value: number | null, digits = 1): string {
  if (value === null || !Number.isFinite(value)) return "TBD";
  return value.toFixed(digits);
}

export function formatCi(
  ci: [number, number] | null,
  asPercent = true,
  digits = 1,
): string {
  if (!ci) return "TBD";
  if (asPercent) {
    return `${(ci[0] * 100).toFixed(digits)}–${(ci[1] * 100).toFixed(digits)}%`;
  }
  return `${ci[0].toFixed(digits)}–${ci[1].toFixed(digits)}`;
}

/** Headline row used on the landing page: village, 80% wear, full engine. */
export const headline = gridRow("village", 0.8, "D4");

export const LIVE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://ayulink-radar.vercel.app";

export const GITHUB_URL = "https://github.com/siddharthathula/ayulink-radar";
export const TEAM_NAME = "AyuLink";
