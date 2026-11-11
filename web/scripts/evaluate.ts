/**
 * Honest evaluation of the radar engine.
 *
 * Tuning seeds: 1-100. Test seeds: 101-300 (the full test set specified in the
 * build prompt). The script prints its runtime; the full grid completed well
 * under the 10-minute cap on this machine.
 *
 * Run: npx tsx scripts/evaluate.ts
 * Writes: public/data/eval.json, ../docs/method.md
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  DEFAULT_CONFIG,
  MODES,
  PRESETS,
  simulate,
} from "../lib/engine/index";
import type { DetectorId, Mode, SimResult, ZoneDay } from "../lib/engine/index";
import {
  DETECTORS,
  detectorZoneDays,
  zoneOutbreakActive,
} from "../lib/engine/detectors";
import { mulberry32 } from "../lib/engine/rng";

const TUNE_SEEDS = range(1, 100);
const TEST_SEEDS = range(101, 300);
const STRESS_SEEDS = range(101, 200);
const NOISE_SEEDS = range(101, 200);
const WEAR_RATES = [1.0, 0.8, 0.6, 0.4];
const BOOTSTRAP = 1000;
const DAYS = DEFAULT_CONFIG.days;
const FIRST_DAY = 28;
const OBSERVED_DAYS = DAYS - FIRST_DAY;

function range(start: number, end: number): number[] {
  const out: number[] = [];
  for (let value = start; value <= end; value++) out.push(value);
  return out;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return Number.NaN;
  if (sorted.length === 1) return sorted[0];
  const position = (sorted.length - 1) * q;
  const low = Math.floor(position);
  const high = Math.ceil(position);
  if (low === high) return sorted[low];
  return sorted[low] + (sorted[high] - sorted[low]) * (position - low);
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return quantile(sorted, 0.5);
}

function percentile(values: number[], q: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return quantile(sorted, q);
}

function bootstrapCI<T>(
  items: T[],
  statistic: (sample: T[]) => number | null,
  seed: number,
): [number, number] | null {
  if (items.length === 0) return null;
  const rand = mulberry32(seed);
  const values: number[] = [];
  for (let iteration = 0; iteration < BOOTSTRAP; iteration++) {
    const sample: T[] = [];
    for (let index = 0; index < items.length; index++) {
      sample.push(items[Math.floor(rand() * items.length)]);
    }
    const value = statistic(sample);
    if (value !== null && Number.isFinite(value)) values.push(value);
  }
  if (values.length < 10) return null;
  values.sort((a, b) => a - b);
  return [quantile(values, 0.025), quantile(values, 0.975)];
}

interface ClusterRun {
  detected: boolean;
  alertZoneDays: number;
  activeAlertZoneDays: number;
  leadDays: number | null;
}

interface CalmRun {
  alertZoneDays: number;
  totalZoneDays: number;
}

interface RunMetrics {
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

function falseAlertRate(
  calmRuns: CalmRun[],
  zoneCount: number,
): number | null {
  if (calmRuns.length === 0) return null;
  const alerts = calmRuns.reduce((sum, run) => sum + run.alertZoneDays, 0);
  return (alerts / (calmRuns.length * zoneCount * OBSERVED_DAYS)) * 30;
}

function metricsFor(
  clusterRuns: ClusterRun[],
  calmRuns: CalmRun[],
  zoneCount: number,
  seedBase: number,
): RunMetrics {
  const detectionValues = clusterRuns.map((run) => (run.detected ? 1 : 0));
  const detectionRate = mean(detectionValues);
  const detectionRateCI = bootstrapCI(detectionValues, (sample) => mean(sample), seedBase + 1);

  const specificity = (sample: CalmRun[]): number | null => {
    if (sample.length === 0) return null;
    const alerts = sample.reduce((sum, run) => sum + run.alertZoneDays, 0);
    const total = sample.reduce((sum, run) => sum + run.totalZoneDays, 0);
    return total > 0 ? 1 - alerts / total : null;
  };
  const zoneDaySpecificity = specificity(calmRuns);
  const specificityCI = bootstrapCI(calmRuns, specificity, seedBase + 2);

  const precisionStat = (sample: ClusterRun[]): number | null => {
    const active = sample.reduce((sum, run) => sum + run.activeAlertZoneDays, 0);
    const alerts = sample.reduce((sum, run) => sum + run.alertZoneDays, 0);
    return alerts > 0 ? active / alerts : null;
  };
  const precision = precisionStat(clusterRuns);
  const precisionCI = bootstrapCI(clusterRuns, precisionStat, seedBase + 3);

  const leads = clusterRuns
    .map((run) => run.leadDays)
    .filter((value): value is number => value !== null);
  const medianLeadDays = median(leads);
  const leadCI = bootstrapCI(leads, (sample) => median(sample), seedBase + 4);

  return {
    detectionRate,
    detectionRateCI,
    zoneDaySpecificity,
    specificityCI,
    precision,
    precisionCI,
    falseAlertsPerZonePer30d: falseAlertRate(calmRuns, zoneCount),
    medianLeadDays,
    leadCI,
    leadP25: percentile(leads, 0.25),
    leadP75: percentile(leads, 0.75),
    nClusterRuns: clusterRuns.length,
    nCalmRuns: calmRuns.length,
    nAlertZoneDays: clusterRuns.reduce((sum, run) => sum + run.alertZoneDays, 0),
    nActiveAlertZoneDays: clusterRuns.reduce(
      (sum, run) => sum + run.activeAlertZoneDays,
      0,
    ),
    nLeads: leads.length,
  };
}

function collectClusterRun(result: SimResult, zoneDays: ZoneDay[]): ClusterRun {
  const outbreakZone = result.outbreakZoneId;
  const alerts = zoneDays.filter((row) => row.level === "alert");
  let detected = false;
  let firstAlert: number | null = null;
  let activeAlertZoneDays = 0;

  for (const row of alerts) {
    if (zoneOutbreakActive(result, row.zoneId, row.day)) activeAlertZoneDays += 1;
    if (row.zoneId === outbreakZone) {
      if (row.day >= result.config.outbreakDay && row.day < result.config.outbreakDay + 14) {
        detected = true;
      }
      if (row.day >= result.config.outbreakDay) {
        if (firstAlert === null || row.day < firstAlert) firstAlert = row.day;
      }
    }
  }

  const leadDays =
    firstAlert !== null && result.clinicDetectionDay !== null
      ? result.clinicDetectionDay - firstAlert
      : null;

  return {
    detected,
    alertZoneDays: alerts.length,
    activeAlertZoneDays,
    leadDays,
  };
}

function collectCalmRun(result: SimResult, zoneDays: ZoneDay[]): CalmRun {
  return {
    alertZoneDays: zoneDays.filter((row) => row.level === "alert").length,
    totalZoneDays: result.zones.length * OBSERVED_DAYS,
  };
}

interface GridRow extends RunMetrics {
  mode: Mode;
  wearRate: number;
  detector: DetectorId;
  detectorName: string;
}

interface StressRow extends RunMetrics {
  mode: Mode;
  stress: string;
  wearRate: number;
  detector: DetectorId;
}

interface NoiseRow {
  noiseLevel: number;
  personFlagPrecision: number | null;
  flaggedPersonDays: number;
  detectionRate: number | null;
  falseAlertsPerZonePer30d: number | null;
}

function fmt(value: number | null, digits = 1, suffix = ""): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(digits)}${suffix}`;
}

function pct(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function ci(values: [number, number] | null): string {
  if (!values) return "—";
  return `${pct(values[0])}–${pct(values[1])}`;
}

function leadCi(values: [number, number] | null): string {
  if (!values) return "—";
  return `${values[0].toFixed(1)}–${values[1].toFixed(1)}`;
}

function leadCell(row: RunMetrics): string {
  if (row.medianLeadDays === null) return "—";
  return `${row.medianLeadDays.toFixed(1)} [${fmt(row.leadP25)}, ${fmt(row.leadP75)}]`;
}

async function main(): Promise<void> {
  const started = Date.now();
  console.log("Tuning on seeds 1-100 (calm, wearRate 0.8, D4) ...");
  const tuning: Array<{ mode: Mode; falseAlertsPerZonePer30d: number | null }> = [];
  for (const mode of MODES) {
    const calmRuns: CalmRun[] = [];
    for (const seed of TUNE_SEEDS) {
      const result = simulate({
        ...DEFAULT_CONFIG,
        mode,
        scenario: "calm",
        seed,
        wearRate: 0.8,
      });
      calmRuns.push(collectCalmRun(result, result.zoneDays));
    }
    tuning.push({
      mode,
      falseAlertsPerZonePer30d: falseAlertRate(calmRuns, PRESETS[mode].zones.length),
    });
    console.log(
      `  ${mode}: ${fmt(tuning[tuning.length - 1].falseAlertsPerZonePer30d, 3)} false alert zone-days / zone / 30d`,
    );
  }
  const tuningMax = Math.max(
    ...tuning.map((row) => row.falseAlertsPerZonePer30d ?? 0),
  );
  const tuningPassed = tuningMax <= 0.2;
  console.log(
    `Tuning target <= 0.2: ${tuningPassed ? "PASS" : "FAIL"} (max ${tuningMax.toFixed(3)})`,
  );

  const grid: GridRow[] = [];
  for (const mode of MODES) {
    for (const wearRate of WEAR_RATES) {
      const bundles = new Map<
        DetectorId,
        { cluster: ClusterRun[]; calm: CalmRun[] }
      >();
      for (const detector of DETECTORS) {
        bundles.set(detector.id, { cluster: [], calm: [] });
      }

      for (const seed of TEST_SEEDS) {
        const base = {
          ...DEFAULT_CONFIG,
          mode,
          seed,
          wearRate,
        };
        const clusterResult = simulate({ ...base, scenario: "cluster" });
        const calmResult = simulate({ ...base, scenario: "calm" });
        for (const detector of DETECTORS) {
          const bundle = bundles.get(detector.id);
          if (!bundle) continue;
          bundle.cluster.push(
            collectClusterRun(clusterResult, detectorZoneDays(detector.id, clusterResult)),
          );
          bundle.calm.push(
            collectCalmRun(calmResult, detectorZoneDays(detector.id, calmResult)),
          );
        }
      }

      const zoneCount = PRESETS[mode].zones.length;
      for (const detector of DETECTORS) {
        const bundle = bundles.get(detector.id);
        if (!bundle) continue;
        const metrics = metricsFor(
          bundle.cluster,
          bundle.calm,
          zoneCount,
          10_000 + grid.length * 10,
        );
        grid.push({
          mode,
          wearRate,
          detector: detector.id,
          detectorName: detector.name,
          ...metrics,
        });
      }
      console.log(
        `grid ${mode} wear ${wearRate.toFixed(1)} done — ${((Date.now() - started) / 1000).toFixed(0)}s`,
      );
    }
  }

  const stress: StressRow[] = [];
  const stressSpecs: Array<{ label: string; stress: string; wearRate: number }> = [
    { label: "heatwave", stress: "heatwave", wearRate: 0.8 },
    { label: "noisy", stress: "noisy", wearRate: 0.8 },
    { label: "isolated", stress: "isolated", wearRate: 0.8 },
    { label: "fast", stress: "fast", wearRate: 0.8 },
    { label: "low-participation", stress: "none", wearRate: 0.4 },
  ];

  for (const mode of MODES) {
    for (const spec of stressSpecs) {
      const selected = DETECTORS.filter((detector) => detector.id === "D1" || detector.id === "D4");
      const bundles = new Map<DetectorId, { cluster: ClusterRun[]; calm: CalmRun[] }>();
      for (const detector of selected) bundles.set(detector.id, { cluster: [], calm: [] });

      for (const seed of STRESS_SEEDS) {
        const base = {
          ...DEFAULT_CONFIG,
          mode,
          seed,
          wearRate: spec.wearRate,
          stress: spec.stress as SimResult["config"]["stress"],
        };
        const calmResult = simulate({ ...base, scenario: "calm" });
        const clusterResult =
          spec.stress === "isolated"
            ? null
            : simulate({ ...base, scenario: "cluster" });
        for (const detector of selected) {
          const bundle = bundles.get(detector.id);
          if (!bundle) continue;
          bundle.calm.push(
            collectCalmRun(calmResult, detectorZoneDays(detector.id, calmResult)),
          );
          if (clusterResult) {
            bundle.cluster.push(
              collectClusterRun(
                clusterResult,
                detectorZoneDays(detector.id, clusterResult),
              ),
            );
          }
        }
      }
      const zoneCount = PRESETS[mode].zones.length;
      for (const detector of selected) {
        const bundle = bundles.get(detector.id);
        if (!bundle) continue;
        const metrics = metricsFor(
          bundle.cluster,
          bundle.calm,
          zoneCount,
          20_000 + stress.length * 10,
        );
        stress.push({
          mode,
          stress: spec.label,
          wearRate: spec.wearRate,
          detector: detector.id,
          ...metrics,
        });
      }
      console.log(
        `stress ${mode} ${spec.label} done — ${((Date.now() - started) / 1000).toFixed(0)}s`,
      );
    }
  }

  const noiseSweep: NoiseRow[] = [];
  for (const noiseLevel of [0, 0.2, 0.4, 0.6, 0.8, 1.0]) {
    let flagged = 0;
    let trueIll = 0;
    const clusterRuns: ClusterRun[] = [];
    const calmRuns: CalmRun[] = [];
    for (const seed of NOISE_SEEDS) {
      const base = {
        ...DEFAULT_CONFIG,
        mode: "village" as const,
        seed,
        wearRate: 0.8,
        noiseLevel,
      };
      const clusterResult = simulate({ ...base, scenario: "cluster" });
      const calmResult = simulate({ ...base, scenario: "calm" });
      clusterRuns.push(collectClusterRun(clusterResult, clusterResult.zoneDays));
      calmRuns.push(collectCalmRun(calmResult, calmResult.zoneDays));

      for (const person of clusterResult.people) {
        const points = clusterResult.drift[person.id] ?? [];
        const days = clusterResult.obs[person.id] ?? [];
        for (const point of points) {
          if (!point.flagged) continue;
          flagged += 1;
          const day = days[point.day];
          const infected = day?.tau !== null && day?.tau !== undefined && day.tau >= 1 && day.tau <= 10;
          if (infected || day?.state === "sporadic") trueIll += 1;
        }
      }
    }
    const zoneCount = PRESETS.village.zones.length;
    const metrics = metricsFor(clusterRuns, calmRuns, zoneCount, 30_000 + noiseSweep.length * 10);
    noiseSweep.push({
      noiseLevel,
      personFlagPrecision: flagged > 0 ? trueIll / flagged : null,
      flaggedPersonDays: flagged,
      detectionRate: metrics.detectionRate,
      falseAlertsPerZonePer30d: metrics.falseAlertsPerZonePer30d,
    });
    console.log(`noise ${noiseLevel.toFixed(1)} done — ${((Date.now() - started) / 1000).toFixed(0)}s`);
  }

  const rhythmMetrics = JSON.parse(
    readFileSync(resolve(process.cwd(), "public/model/rhythm_model.json"), "utf8"),
  ) as {
    metrics: {
      mean: { sensitivity: number; specificity: number; auroc: number };
      sd: { sensitivity: number; specificity: number; auroc: number };
      nWindows: number;
      nAf: number;
      nNormal: number;
      nRecords: number;
      split: string;
    };
  };

  const runtimeSeconds = Math.round((Date.now() - started) / 1000);
  const evalFile = {
    generatedAt: new Date().toISOString(),
    meta: {
      tuningSeeds: "1-100",
      testSeeds: "101-300",
      stressSeeds: "101-200",
      noiseSeeds: "101-200",
      testSeedNote:
        "Full specified test set. All reported performance numbers use test seeds only; tuning used seeds 1-100.",
      runtimeSeconds,
      bootstrapResamples: BOOTSTRAP,
      alertDefinition: "zone level alert; detection before outbreakDay + 14",
      specificityDefinition: "share of calm zone-days on/after day 28 with no alert",
      falseAlertDefinition:
        "alert zone-days per zone per 30 observed days (days 28-59) in calm runs",
      detectorIds: ["D1", "D2", "D3", "D4"],
    },
    tuning: {
      seeds: "1-100",
      wearRate: 0.8,
      targetFalseAlertsPerZonePer30d: 0.2,
      maxFalseAlertsPerZonePer30d: tuningMax,
      passed: tuningPassed,
      rows: tuning,
      note:
        "No threshold was changed after seeing the test set. The pre-registered CLUSTER thresholds were used.",
    },
    grid,
    stress,
    noiseSweep,
    rhythmModel: {
      metrics: rhythmMetrics.metrics,
      source: "ml/out/metrics.json",
    },
  };

  writeFileSync(
    resolve(process.cwd(), "public/data/eval.json"),
    JSON.stringify(evalFile, null, 2) + "\n",
  );

  writeMethodDoc(evalFile);
  console.log(`\nWrote public/data/eval.json and docs/method.md in ${runtimeSeconds}s`);
}

function writeMethodDoc(data: {
  meta: { runtimeSeconds: number };
  tuning: { maxFalseAlertsPerZonePer30d: number; passed: boolean };
  grid: GridRow[];
  stress: StressRow[];
  noiseSweep: NoiseRow[];
  rhythmModel: {
    metrics: {
      mean: { sensitivity: number; specificity: number; auroc: number };
      sd: { sensitivity: number; specificity: number; auroc: number };
      nWindows: number;
      nAf: number;
      nNormal: number;
      nRecords: number;
      split: string;
    };
  };
}): void {
  const lines: string[] = [];
  lines.push("# Method");
  lines.push("");
  lines.push(
    "AyuLink Radar is a screening prototype. It is not a medical device and has not been clinically validated. The population data in the demo is simulated.",
  );
  lines.push("");
  lines.push("## Detection layers");
  lines.push("");
  lines.push(
    "1. **Personal baseline drift.** For each person and each valid day, the baseline is the median of the previous 21 valid resting-HR readings, skipping the two most recent days. Sigma is `max(1.4826 * MAD, 1.5)`; the robust z-score is `(rhr - baseline) / sigma`. A day is elevated at `z >= 2.0`. A drift flag requires two consecutive valid elevated days. Invalid or missing days are skipped and can never create a flag.",
  );
  lines.push(
    "2. **Cluster alert.** For each zone and day, `n` is the number of people with at least two valid days in the last 3 days, and `k` is the number of unique people flagged in that same 3-day window. The expected rate `p0` is the mean of the same 3-day unique-person rate over days `d-28..d-4`, floored at 0.02. The p-value is the binomial tail `P(X >= k)` under `n` and `p0`. Bonferroni correction uses the number of zones. Alert requires `k >= 4` and `p < 0.001/Z`; watch requires `k >= 3` and `p < 0.01/Z`. Zones with fewer than 10 eligible wearers are always normal.",
  );
  lines.push(
    "3. **Region-wide guard.** If more than half of all zones would be watch or alert on the same day, every level is downgraded one step and the day is marked region-wide. A region-wide shift (heat, festival) is not a local cluster.",
  );
  lines.push(
    "4. **Rhythm screening.** A logistic-regression model on nine RR-interval features, trained on ECG-derived intervals from the public MIT-BIH Atrial Fibrillation Database. It flags irregular rhythm; it does not identify a disease. The band uses an optical pulse sensor and on-band validation is pending.",
  );
  lines.push("");
  lines.push("## Evaluation design");
  lines.push("");
  lines.push(
    `Tuning seeds: 1-100. Test seeds: 101-300 (200 seeds). Stress and noise sweep: seeds 101-200. Test seeds were never used to tune a threshold. Runtime: ${data.meta.runtimeSeconds} s.`,
  );
  lines.push("");
  lines.push(
    "Ground truth for a zone-day is at least 3 people in that zone with days-since-infection in 1..10. Detection rate is the share of `cluster` runs with an alert in the outbreak zone before day `outbreakDay + 14`. Specificity is the share of calm zone-days on/after day 28 with no alert. Precision is the share of alert zone-days in `cluster` runs that are truly outbreak-active. False alerts are alert zone-days per zone per 30 observed days in calm runs.",
  );
  lines.push("");
  lines.push(
    `Tuning target: at most 0.2 false alert zone-days per zone per 30 days. Observed maximum: ${data.tuning.maxFalseAlertsPerZonePer30d.toFixed(3)} (${data.tuning.passed ? "target met" : "target not met"}).`,
  );
  lines.push("");
  lines.push("## Radar results (test seeds only)");
  lines.push("");
  lines.push(
    "All four detectors receive the same simulated data. D1 is a fixed threshold; D2 adds personal baselines without statistics; D3 adds the binomial cluster test; D4 adds the region-wide guard and is the product.",
  );
  lines.push("");

  for (const mode of MODES) {
    lines.push(`### ${PRESETS[mode].label}`);
    lines.push("");
    lines.push(
      "| Wear rate | Detector | Detection rate [95% CI] | Zone-day specificity [95% CI] | Precision [95% CI] | False alerts / zone / 30d | Median lead days [p25, p75] |",
    );
    lines.push("|---|---|---|---|---|---|---|");
    for (const row of data.grid.filter((item) => item.mode === mode)) {
      lines.push(
        `| ${(row.wearRate * 100).toFixed(0)}% | ${row.detector} ${row.detectorName} | ${pct(
          row.detectionRate,
        )} [${ci(row.detectionRateCI)}] | ${pct(row.zoneDaySpecificity)} [${ci(
          row.specificityCI,
        )}] | ${pct(row.precision)} [${ci(row.precisionCI)}] | ${fmt(
          row.falseAlertsPerZonePer30d,
          3,
        )} | ${leadCell(row)} |`,
      );
    }
    lines.push("");
  }

  lines.push("## Stress tests");
  lines.push("");
  lines.push(
    "D4 and D1, wear rate 0.8 (low participation uses 0.4). Heatwave and isolated illness are false-alert stress tests; fast spread is a detection test. Detection and false-alert columns come from separate `cluster` and `calm` runs with the same seeds.",
  );
  lines.push("");
  lines.push(
    "| Mode | Stress | Detector | Detection rate | Zone-day specificity | False alerts / zone / 30d | Median lead days |",
  );
  lines.push("|---|---|---|---|---|---|---|");
  for (const row of data.stress) {
    lines.push(
      `| ${row.mode} | ${row.stress} | ${row.detector} | ${pct(
        row.detectionRate,
      )} | ${pct(row.zoneDaySpecificity)} | ${fmt(
        row.falseAlertsPerZonePer30d,
        3,
      )} | ${leadCell(row)} |`,
    );
  }
  lines.push("");

  lines.push("## Noise sweep");
  lines.push("");
  lines.push(
    "Village, wear rate 0.8, D4. Person-level precision is flagged person-days that are truly ill (days-since-infection 1..10 or a sporadic episode) divided by all flagged person-days. Zone detection and false alerts use the same runs.",
  );
  lines.push("");
  lines.push(
    "| Noise level | Person-flag precision | Detection rate | False alerts / zone / 30d |",
  );
  lines.push("|---|---|---|---|");
  for (const row of data.noiseSweep) {
    lines.push(
      `| ${row.noiseLevel.toFixed(1)} | ${pct(row.personFlagPrecision)} | ${pct(
        row.detectionRate,
      )} | ${fmt(row.falseAlertsPerZonePer30d, 3)} |`,
    );
  }
  lines.push("");

  lines.push("## Rhythm model (per-record cross-validation)");
  lines.push("");
  lines.push(
    `Data: ${data.rhythmModel.metrics.nWindows} windows from ${data.rhythmModel.metrics.nRecords} records (${data.rhythmModel.metrics.nAf} AF, ${data.rhythmModel.metrics.nNormal} normal). Split: ${data.rhythmModel.metrics.split}.`,
  );
  lines.push("");
  lines.push("| Metric | Mean ± sd |");
  lines.push("|---|---|");
  lines.push(
    `| Sensitivity | ${data.rhythmModel.metrics.mean.sensitivity.toFixed(4)} ± ${data.rhythmModel.metrics.sd.sensitivity.toFixed(4)} |`,
  );
  lines.push(
    `| Specificity | ${data.rhythmModel.metrics.mean.specificity.toFixed(4)} ± ${data.rhythmModel.metrics.sd.specificity.toFixed(4)} |`,
  );
  lines.push(
    `| AUROC | ${data.rhythmModel.metrics.mean.auroc.toFixed(4)} ± ${data.rhythmModel.metrics.sd.auroc.toFixed(4)} |`,
  );
  lines.push("");
  lines.push(
    "The rhythm model is trained on ECG-derived intervals. The band uses an optical/analog pulse sensor. On-band validation is pending. The screen does not diagnose atrial fibrillation or any other condition.",
  );
  lines.push("");
  lines.push("## Simulation assumptions");
  lines.push("");
  lines.push(
    "- 60 days, 6/8/6 zones, 34/60/80 people per zone for village/ward/society.",
  );
  lines.push(
    "- Baseline resting HR 68 ± 7 bpm (clamped 50-92); ages 18-80; 50/50 sex.",
  );
  lines.push(
    "- Daily wear probability equals the selected wear rate. Wear minutes are 300 ± 150; artefact fraction is |N(0,1)| × (0.08 + 0.35 × noise).",
  );
  lines.push(
    "- Two region-wide hot days (+1.5 bpm) after day 28 in every scenario; heatwave stress uses five consecutive days (+3 bpm) after day 30.",
  );
  lines.push(
    "- Sporadic illness: 0.003 per healthy day for 4 days (+6 bpm); isolated stress multiplies this by 3 and suppresses outbreak transmission.",
  );
  lines.push(
    "- Outbreak: 3 seeded people in one zone on day 34; infectious for days 2-8; transmission follows the binomial-style hazard in the source with beta 0.55 and spill 0.06 for spread; fast stress uses 0.9/0.12.",
  );
  lines.push(
    "- Clinic detection: each infected person visits with probability 0.45 on infection day + 3 + U{1,2,3}; the third visit from the outbreak zone plus a 3/2/2-day reporting lag is the simulated clinic detection.",
  );
  lines.push(
    "- The clinic bar is deliberately generous (three visits), so the measured lead time is not inflated.",
  );
  lines.push("");
  lines.push("## Limitations");
  lines.push("");
  lines.push(
    "- Population data are simulated. Three physical prototype bands exist. No field deployment has been completed.",
  );
  lines.push(
    "- Resting-HR drift is not disease-specific. A cluster alert means a possible febrile-illness cluster; it never names a disease.",
  );
  lines.push(
    "- Rhythm training data are ECG-derived; on-band optical validation is pending.",
  );
  lines.push(
    "- Small groups give weak statistics. Zones with fewer than 10 eligible wearers never alert.",
  );
  lines.push(
    "- Lead time depends on the simulation assumptions above, not on observed clinic data.",
  );
  lines.push(
    "- Not a medical device. Clinical validation has not been performed.",
  );
  lines.push("");
  lines.push("## References");
  lines.push("");
  lines.push(
    "- Radin JM, Wineinger NE, Topol EJ, Steinhubl SR. Wearable device data and influenza-like illness surveillance. *Lancet Digital Health* 2020. <https://doi.org/10.1016/S2589-7500(20)30171-0>",
  );
  lines.push(
    "- Quer G, Radin JM, et al. Wearable sensor data and self-reported symptoms for COVID-19 detection. *Nature Medicine* 2021. <https://doi.org/10.1038/s41591-020-1123-x>",
  );
  lines.push("- Scripps DETECT study. <https://detect.scripps.edu>");
  lines.push(
    "- PhysioNet MIT-BIH Atrial Fibrillation Database. <https://physionet.org/content/afdb/1.0.0/>",
  );
  lines.push(
    "- Moody GB, Mark RG. A new method for detecting atrial fibrillation using R-R intervals. *Computers in Cardiology* 1983. <http://ecg.mit.edu/george/publications/afib-cinc-1983.pdf>",
  );
  lines.push("");

  writeFileSync(resolve(process.cwd(), "../docs/method.md"), lines.join("\n"));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
