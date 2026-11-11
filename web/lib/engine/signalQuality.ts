export const QUALITY = {
  minWearMin: 120,
  maxArtefactFrac: 0.3,
  rrMin: 300,
  rrMax: 2000,
  rrMaxBadFrac: 0.2,
};

export type DayQualityReason = "ok" | "not-worn" | "short-wear" | "artefact";
export type RrQualityReason = "ok" | "too-short" | "non-finite" | "out-of-range";

export function dayQuality(
  wearMin: number | null,
  artefactFrac: number | null,
): { valid: boolean; reason: DayQualityReason } {
  if (wearMin === null || artefactFrac === null) {
    return { valid: false, reason: "not-worn" };
  }
  if (wearMin < QUALITY.minWearMin) {
    return { valid: false, reason: "short-wear" };
  }
  if (artefactFrac > QUALITY.maxArtefactFrac) {
    return { valid: false, reason: "artefact" };
  }
  return { valid: true, reason: "ok" };
}

export function rrWindowQuality(
  rr: number[],
): { valid: boolean; reason: RrQualityReason } {
  if (rr.length < 30) {
    return { valid: false, reason: "too-short" };
  }
  if (rr.some((value) => !Number.isFinite(value))) {
    return { valid: false, reason: "non-finite" };
  }
  let bad = 0;
  for (const value of rr) {
    if (value < QUALITY.rrMin || value > QUALITY.rrMax) {
      bad += 1;
    }
  }
  if (bad / rr.length > QUALITY.rrMaxBadFrac) {
    return { valid: false, reason: "out-of-range" };
  }
  return { valid: true, reason: "ok" };
}
