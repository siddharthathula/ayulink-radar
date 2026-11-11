import modelJson from "@/public/model/forecast_model.json";
import evalJson from "@/public/data/forecast_eval.json";
import type { ForecastModel } from "@/lib/engine/forecast";

export const FORECAST_MODEL = modelJson as ForecastModel;

export interface ForecastEval {
  generatedAt: string;
  question: string;
  data: string;
  model: string;
  threshold: number;
  test: {
    rows: number;
    positives: number;
    auroc: number;
    auprc: number;
    precision: number;
    recall: number;
    f1: number;
    baselineWatchOnly: { precision: number; recall: number; f1: number };
    baselineEvidenceAuroc: number;
    prevalence: number;
  };
  byMode: Record<string, { auroc: number; precision: number; recall: number }>;
  earlyWarning: {
    outbreakRunsWithAlert: number;
    warnedBeforeAlert: number;
    warnedShare: number;
    medianDaysEarlier: number | null;
  };
  falseWarnings: { perZonePer30Days: number; calmZoneDays: number };
  stress: Record<string, { auroc: number; falseWarnings: { perZonePer30Days: number } }>;
  featureImportance: Array<{ key: string; label: string; weight: number }>;
  caveats: string[];
}

export const FORECAST_EVAL = evalJson as unknown as ForecastEval;
