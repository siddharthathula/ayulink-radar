/**
 * Train + evaluate the zone escalation forecaster ("will this zone hit ALERT
 * in the next 3 days?").
 *
 * Train seeds: 1-100. Test seeds: 101-200 (never seen in training).
 * Grid: 3 modes x 3 scenarios x 3 wear rates. Outbreak day varies 32-40.
 * Model: L2-regularised logistic regression, standardised features,
 * class-balanced loss, full-batch Adam. Pure TypeScript, no ML library.
 *
 * Run:    npx tsx scripts/train-forecast.ts
 * Writes: public/model/forecast_model.json, public/data/forecast_eval.json
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { DEFAULT_CONFIG, MODES, SCENARIOS, simulate } from "../lib/engine/index";
import type { Mode, Scenario, Stress } from "../lib/engine/index";
import {
  FORECAST_FEATURES,
  FORECAST_HORIZON,
  buildForecastIndex,
  escalationLabel,
  forecastFeatures,
  forecastProbability,
} from "../lib/engine/forecast";
import type { ForecastModel } from "../lib/engine/forecast";
import { CLUSTER } from "../lib/engine/cluster";

const TRAIN_SEEDS = range(1, 100);
const TEST_SEEDS = range(101, 200);
const WEAR_RATES = [0.6, 0.8, 1.0];
const L2 = 1e-3;
const EPOCHS = 600;
const LR = 0.05;

interface Row {
  x: number[];
  y: number;
  mode: Mode;
  scenario: Scenario;
  stress: Stress;
  watch: number;
  evidence: number;
}

/** Lightweight summary: SimResults are dropped right away to keep memory flat. */
interface Run {
  scenario: Scenario;
  rows: Row[];
  firstAlertDay: number | null;
  /** Outbreak-zone feature vectors for days before the first alert, oldest first. */
  preAlert: Array<{ day: number; x: number[] }>;
}

function range(start: number, end: number): number[] {
  const out: number[] = [];
  for (let v = start; v <= end; v++) out.push(v);
  return out;
}

function makeRun(mode: Mode, scenario: Scenario, seed: number, wearRate: number, stress: Stress = "none"): Run {
  const result = simulate({
    ...DEFAULT_CONFIG,
    mode,
    scenario,
    seed,
    wearRate,
    stress,
    outbreakDay: 32 + (seed % 9),
  });
  const index = buildForecastIndex(result);
  const rows: Row[] = [];
  const lastDay = result.config.days - 1 - FORECAST_HORIZON;
  for (let day = CLUSTER.firstDay; day <= lastDay; day++) {
    for (const zone of result.zones) {
      const label = escalationLabel(index, zone.id, day);
      if (label === null) continue;
      const x = forecastFeatures(result, index, zone.id, day);
      rows.push({ x, y: label ? 1 : 0, mode, scenario, stress, watch: x[5], evidence: x[4] });
    }
  }
  const preAlert: Run["preAlert"] = [];
  if (scenario !== "calm" && result.outbreakZoneId && result.firstAlertDay !== null) {
    const from = Math.max(CLUSTER.firstDay, result.config.outbreakDay - 3);
    for (let day = from; day < result.firstAlertDay; day++) {
      preAlert.push({ day, x: forecastFeatures(result, index, result.outbreakZoneId, day) });
    }
  }
  return { scenario, rows, firstAlertDay: result.firstAlertDay, preAlert };
}

function grid(seeds: number[]): Run[] {
  const runs: Run[] = [];
  for (const mode of MODES)
    for (const scenario of SCENARIOS)
      for (const wear of WEAR_RATES) for (const seed of seeds) runs.push(makeRun(mode, scenario, seed, wear));
  return runs;
}

function train(rows: Row[]): ForecastModel {
  const d = FORECAST_FEATURES.length;
  const mean = new Array(d).fill(0);
  const std = new Array(d).fill(0);
  for (const r of rows) for (let j = 0; j < d; j++) mean[j] += r.x[j];
  for (let j = 0; j < d; j++) mean[j] /= rows.length;
  for (const r of rows) for (let j = 0; j < d; j++) std[j] += (r.x[j] - mean[j]) ** 2;
  for (let j = 0; j < d; j++) std[j] = Math.sqrt(std[j] / rows.length) || 1;

  const n = rows.length;
  const X = new Float64Array(n * d);
  const Y = new Float64Array(n);
  rows.forEach((r, i) => {
    for (let j = 0; j < d; j++) X[i * d + j] = (r.x[j] - mean[j]) / std[j];
    Y[i] = r.y;
  });
  const pos = rows.filter((r) => r.y === 1).length;
  const wPos = n / (2 * Math.max(pos, 1));
  const wNeg = n / (2 * Math.max(n - pos, 1));

  const w = new Float64Array(d);
  let b = 0;
  const m = new Float64Array(d + 1);
  const v = new Float64Array(d + 1);
  const beta1 = 0.9;
  const beta2 = 0.999;
  for (let epoch = 1; epoch <= EPOCHS; epoch++) {
    const g = new Float64Array(d + 1);
    let weightSum = 0;
    for (let i = 0; i < n; i++) {
      let z = b;
      for (let j = 0; j < d; j++) z += w[j] * X[i * d + j];
      const p = 1 / (1 + Math.exp(-z));
      const sw = Y[i] === 1 ? wPos : wNeg;
      const err = sw * (p - Y[i]);
      weightSum += sw;
      for (let j = 0; j < d; j++) g[j] += err * X[i * d + j];
      g[d] += err;
    }
    for (let j = 0; j <= d; j++) {
      g[j] /= weightSum;
      if (j < d) g[j] += L2 * w[j];
      m[j] = beta1 * m[j] + (1 - beta1) * g[j];
      v[j] = beta2 * v[j] + (1 - beta2) * g[j] * g[j];
      const mh = m[j] / (1 - beta1 ** epoch);
      const vh = v[j] / (1 - beta2 ** epoch);
      const step = (LR * mh) / (Math.sqrt(vh) + 1e-8);
      if (j < d) w[j] -= step;
      else b -= step;
    }
  }

  const model: ForecastModel = {
    version: "forecast-v1",
    horizonDays: FORECAST_HORIZON,
    features: FORECAST_FEATURES.map((f) => f.key),
    mean: mean.map(round),
    std: std.map(round),
    weights: Array.from(w).map(round),
    bias: round(b),
    threshold: 0.5,
    trainedOn: "simulated seeds 1-100; 3 modes x 3 scenarios x wear 0.6/0.8/1.0",
  };
  model.threshold = bestF1Threshold(rows.map((r) => forecastProbability(model, r.x)), rows.map((r) => r.y));
  return model;
}

function round(x: number): number {
  return Math.round(x * 1e6) / 1e6;
}

function auroc(scores: number[], labels: number[]): number {
  const idx = scores.map((s, i) => i).sort((a, b) => scores[a] - scores[b]);
  let rank = 0;
  let sumPos = 0;
  let nPos = 0;
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && scores[idx[j + 1]] === scores[idx[i]]) j++;
    const avg = (rank + 1 + rank + 1 + (j - i)) / 2;
    for (let k = i; k <= j; k++) if (labels[idx[k]] === 1) { sumPos += avg; nPos++; }
    rank += j - i + 1;
    i = j + 1;
  }
  const nNeg = labels.length - nPos;
  if (nPos === 0 || nNeg === 0) return Number.NaN;
  return (sumPos - (nPos * (nPos + 1)) / 2) / (nPos * nNeg);
}

function auprc(scores: number[], labels: number[]): number {
  const idx = scores.map((s, i) => i).sort((a, b) => scores[b] - scores[a]);
  const totalPos = labels.filter((l) => l === 1).length;
  let tp = 0;
  let ap = 0;
  idx.forEach((i, rank) => {
    if (labels[i] === 1) {
      tp++;
      ap += tp / (rank + 1);
    }
  });
  return totalPos ? ap / totalPos : Number.NaN;
}

function confusion(scores: number[], labels: number[], t: number) {
  let tp = 0, fp = 0, fn = 0, tn = 0;
  scores.forEach((s, i) => {
    const pred = s >= t;
    if (pred && labels[i] === 1) tp++;
    else if (pred) fp++;
    else if (labels[i] === 1) fn++;
    else tn++;
  });
  const precision = tp + fp ? tp / (tp + fp) : 0;
  const recall = tp + fn ? tp / (tp + fn) : 0;
  return { tp, fp, fn, tn, precision, recall, f1: precision + recall ? (2 * precision * recall) / (precision + recall) : 0 };
}

function bestF1Threshold(scores: number[], labels: number[]): number {
  let best = 0.5;
  let bestF1 = -1;
  for (let t = 0.05; t <= 0.95; t += 0.01) {
    const { f1 } = confusion(scores, labels, t);
    if (f1 > bestF1) { bestF1 = f1; best = t; }
  }
  return Math.round(best * 100) / 100;
}

function r3(x: number): number {
  return Number.isFinite(x) ? Math.round(x * 1000) / 1000 : x;
}

function metrics(model: ForecastModel, rows: Row[]) {
  const labels = rows.map((r) => r.y);
  const scores = rows.map((r) => forecastProbability(model, r.x));
  const c = confusion(scores, labels, model.threshold);
  return {
    rows: rows.length,
    positives: labels.filter((l) => l === 1).length,
    auroc: r3(auroc(scores, labels)),
    auprc: r3(auprc(scores, labels)),
    precision: r3(c.precision),
    recall: r3(c.recall),
    f1: r3(c.f1),
    baselineWatchOnly: (() => {
      const b = confusion(rows.map((r) => r.watch), labels, 0.5);
      return { precision: r3(b.precision), recall: r3(b.recall), f1: r3(b.f1) };
    })(),
    baselineEvidenceAuroc: r3(auroc(rows.map((r) => r.evidence), labels)),
    prevalence: r3(labels.filter((l) => l === 1).length / Math.max(labels.length, 1)),
  };
}

/** In outbreak runs: how many days before the first ALERT did the forecaster first warn in that zone? */
function earlyWarning(model: ForecastModel, runs: Run[]) {
  const leads: number[] = [];
  let alerted = 0;
  let warnedBefore = 0;
  for (const run of runs) {
    if (run.scenario === "calm" || run.firstAlertDay === null) continue;
    alerted++;
    for (const { day, x } of run.preAlert) {
      if (forecastProbability(model, x) >= model.threshold) {
        leads.push(run.firstAlertDay - day);
        warnedBefore++;
        break;
      }
    }
  }
  leads.sort((a, b) => a - b);
  return {
    outbreakRunsWithAlert: alerted,
    warnedBeforeAlert: warnedBefore,
    warnedShare: r3(warnedBefore / Math.max(alerted, 1)),
    medianDaysEarlier: leads.length ? leads[Math.floor(leads.length / 2)] : null,
  };
}

/** Calm runs: high-risk warnings per zone per 30 days (false warnings). */
function falseWarnings(model: ForecastModel, runs: Run[]) {
  let warnings = 0;
  let zoneDays = 0;
  for (const { scenario, rows } of runs) {
    if (scenario !== "calm") continue;
    zoneDays += rows.length;
    warnings += rows.filter((r) => forecastProbability(model, r.x) >= model.threshold).length;
  }
  return { perZonePer30Days: r3((warnings / Math.max(zoneDays, 1)) * 30), calmZoneDays: zoneDays };
}

function main() {
  const t0 = Date.now();
  console.log("simulating train grid...");
  const trainRuns = grid(TRAIN_SEEDS);
  const trainRows = trainRuns.flatMap((r) => r.rows);
  console.log(`train rows ${trainRows.length} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  const model = train(trainRows);
  console.log("weights", model.weights, "threshold", model.threshold);

  console.log("simulating test grid...");
  const testRuns = grid(TEST_SEEDS);
  const testRows = testRuns.flatMap((r) => r.rows);

  const byMode = Object.fromEntries(MODES.map((mode) => [mode, metrics(model, testRows.filter((r) => r.mode === mode))]));
  const byScenario = Object.fromEntries(
    SCENARIOS.map((s) => [s, metrics(model, testRows.filter((r) => r.scenario === s))]),
  );

  console.log("stress test: heatwave + noisy (never trained on)...");
  const stress: Record<string, ReturnType<typeof metrics> & { falseWarnings: ReturnType<typeof falseWarnings> }> = {};
  for (const s of ["heatwave", "noisy"] as Stress[]) {
    const runs: Run[] = [];
    for (const mode of MODES)
      for (const scenario of ["calm", "cluster"] as Scenario[])
        for (const seed of TEST_SEEDS.slice(0, 50)) runs.push(makeRun(mode, scenario, seed, 0.8, s));
    stress[s] = { ...metrics(model, runs.flatMap((r) => r.rows)), falseWarnings: falseWarnings(model, runs) };
  }

  const featureImportance = FORECAST_FEATURES.map((f, i) => ({
    key: f.key,
    label: f.label,
    weight: r3(model.weights[i]),
  })).sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));

  const evalJson = {
    generatedAt: new Date().toISOString().slice(0, 10),
    question: `Will this zone reach ALERT within the next ${FORECAST_HORIZON} days? (zones already on alert excluded)`,
    data: "Simulated. Train seeds 1-100, held-out test seeds 101-200. 3 modes x 3 scenarios x wear 0.6/0.8/1.0.",
    model: "Logistic regression, 9 features, class-balanced, L2. Pure TypeScript.",
    threshold: model.threshold,
    test: metrics(model, testRows),
    byMode,
    byScenario,
    earlyWarning: earlyWarning(model, testRuns),
    falseWarnings: falseWarnings(model, testRuns),
    stress,
    featureImportance,
    caveats: [
      "Simulated data only. Real-world performance is unknown until a pilot.",
      "The label is the engine's own ALERT, so this forecasts escalation, not disease.",
      "Stress conditions (heatwave, noisy sensors) were never seen in training.",
    ],
    runtimeSeconds: Math.round((Date.now() - t0) / 1000),
  };

  writeFileSync(resolve(__dirname, "../public/model/forecast_model.json"), JSON.stringify(model, null, 2) + "\n");
  writeFileSync(resolve(__dirname, "../public/data/forecast_eval.json"), JSON.stringify(evalJson, null, 2) + "\n");
  console.log(JSON.stringify({ test: evalJson.test, earlyWarning: evalJson.earlyWarning, falseWarnings: evalJson.falseWarnings, stress: Object.fromEntries(Object.entries(stress).map(([k, v]) => [k, { auroc: v.auroc, fw: v.falseWarnings }])) }, null, 2));
  console.log(`done in ${evalJson.runtimeSeconds}s`);
}

main();
