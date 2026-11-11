export interface RhythmModel {
  features: string[];
  mean: number[];
  scale: number[];
  coef: number[];
  intercept: number;
  threshold: number;
  windowBeats: number;
  metrics?: unknown;
  trainedOn?: string;
  license?: string;
  generatedAt?: string;
}

export const RHYTHM_FEATURES = [
  "mean_rr",
  "sdnn",
  "rmssd",
  "pnn50",
  "cv",
  "nrmssd",
  "sd_ratio",
  "entropy",
  "tpr",
] as const;

export const RHYTHM_WINDOW = 30;

export function extractRhythmFeatures(rr: number[]): number[] {
  if (rr.length !== RHYTHM_WINDOW) {
    throw new Error(`expected ${RHYTHM_WINDOW} RR intervals, got ${rr.length}`);
  }

  const n = rr.length;
  const diff: number[] = [];
  for (let i = 0; i < n - 1; i++) diff.push(rr[i + 1] - rr[i]);

  const meanRr = rr.reduce((sum, value) => sum + value, 0) / n;
  const varRr =
    rr.reduce((sum, value) => sum + (value - meanRr) ** 2, 0) / n;
  const sdnn = Math.sqrt(varRr);
  const rmssd = Math.sqrt(
    diff.reduce((sum, value) => sum + value * value, 0) / diff.length,
  );
  const pnn50 =
    diff.filter((value) => Math.abs(value) > 50).length / diff.length;
  const cv = sdnn / meanRr;
  const nrmssd = rmssd / meanRr;

  const meanDiff = diff.reduce((sum, value) => sum + value, 0) / diff.length;
  const varDiff =
    diff.reduce((sum, value) => sum + (value - meanDiff) ** 2, 0) / diff.length;
  const sd1 = Math.sqrt(0.5) * Math.sqrt(varDiff);
  const sd2 = Math.sqrt(Math.max(2 * sdnn * sdnn - sd1 * sd1, 1e-9));
  const sdRatio = sd1 / sd2;

  const counts = new Array<number>(16).fill(0);
  for (const value of diff) {
    const z = Math.min(0.5, Math.max(-0.5, value / meanRr));
    let index = Math.floor((z + 0.5) * 16);
    if (index === 16) index = 15;
    counts[index] += 1;
  }
  const total = counts.reduce((sum, value) => sum + value, 0);
  let entropy = 0;
  for (const count of counts) {
    if (count > 0) {
      const p = count / total;
      entropy -= p * Math.log(p);
    }
  }

  let turning = 0;
  for (let i = 1; i < n - 1; i++) {
    if ((rr[i] - rr[i - 1]) * (rr[i + 1] - rr[i]) < 0) turning += 1;
  }
  const tpr = turning / (n - 2);

  return [meanRr, sdnn, rmssd, pnn50, cv, nrmssd, sdRatio, entropy, tpr];
}

export function rhythmProbability(rr: number[], model: RhythmModel): number {
  const features = extractRhythmFeatures(rr);
  let score = model.intercept;
  for (let i = 0; i < features.length; i++) {
    score += model.coef[i] * ((features[i] - model.mean[i]) / model.scale[i]);
  }
  return 1 / (1 + Math.exp(-score));
}

export function rhythmFlag(rr: number[], model: RhythmModel): boolean {
  return rhythmProbability(rr, model) >= model.threshold;
}

export interface FeatureContribution {
  feature: string;
  value: number;
  standardized: number;
  contribution: number;
}

export function topContributions(
  rr: number[],
  model: RhythmModel,
  count = 4,
): FeatureContribution[] {
  const values = extractRhythmFeatures(rr);
  const rows: FeatureContribution[] = values.map((value, index) => {
    const standardized = (value - model.mean[index]) / model.scale[index];
    return {
      feature: model.features[index] ?? RHYTHM_FEATURES[index],
      value,
      standardized,
      contribution: model.coef[index] * standardized,
    };
  });
  return rows
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
    .slice(0, count);
}
