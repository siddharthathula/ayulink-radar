import type { DayObs, DriftPoint } from "./types";

export const DRIFT = {
  window: 21,
  skip: 2,
  minValid: 10,
  sigmaFloor: 1.5,
  zThresh: 2.0,
};

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Personal baseline drift for one person.
 *
 * History: valid rhr values from d-23..d-3 (21 days, skipping the two most
 * recent days). Invalid days are treated exactly like missing days and can
 * never create a flag.
 */
export function computeDrift(obs: DayObs[]): DriftPoint[] {
  const points: DriftPoint[] = [];
  let previousValidElevated = false;

  for (const day of obs) {
    if (!day.valid || day.rhr === null) {
      points.push({
        day: day.day,
        baseline: null,
        sigma: null,
        z: null,
        flagged: false,
      });
      continue;
    }

    const history: number[] = [];
    for (let offset = DRIFT.skip + 1; offset <= DRIFT.window + DRIFT.skip; offset++) {
      const index = day.day - offset;
      if (index < 0) continue;
      const past = obs[index];
      if (past && past.valid && past.rhr !== null) {
        history.push(past.rhr);
      }
    }

    if (history.length < DRIFT.minValid) {
      points.push({
        day: day.day,
        baseline: null,
        sigma: null,
        z: null,
        flagged: false,
      });
      previousValidElevated = false;
      continue;
    }

    const baseline = median(history);
    if (baseline === null) {
      points.push({
        day: day.day,
        baseline: null,
        sigma: null,
        z: null,
        flagged: false,
      });
      previousValidElevated = false;
      continue;
    }
    const mad = median(history.map((value) => Math.abs(value - baseline))) ?? 0;
    const sigma = Math.max(1.4826 * mad, DRIFT.sigmaFloor);
    const z = (day.rhr - baseline) / sigma;
    const elevated = z >= DRIFT.zThresh;
    const flagged = elevated && previousValidElevated;

    points.push({ day: day.day, baseline, sigma, z, flagged });
    previousValidElevated = elevated;
  }

  return points;
}
