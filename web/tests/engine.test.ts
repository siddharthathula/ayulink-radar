import { describe, expect, it } from "vitest";
import { computeDrift } from "../lib/engine/baseline";
import { binomTail, computeP0 } from "../lib/engine/cluster";
import { DEFAULT_CONFIG, MODES } from "../lib/engine/presets";
import { dayQuality, rrWindowQuality } from "../lib/engine/signalQuality";
import { simulate } from "../lib/engine/simulate";
import type { DayObs } from "../lib/engine/types";

function makeObs(
  values: Array<number | null>,
  validOverride?: boolean[],
): DayObs[] {
  return values.map((rhr, day) => ({
    day,
    rhr,
    activity: rhr === null ? null : 1,
    state: "healthy" as const,
    wearMin: rhr === null ? null : 300,
    artefactFrac: rhr === null ? null : 0.05,
    valid: validOverride ? validOverride[day] : rhr !== null,
    tau: null,
  }));
}

function bruteBinomialTail(k: number, n: number, p: number): number {
  let total = 0;
  for (let i = k; i <= n; i++) {
    let choose = 1;
    for (let j = 1; j <= i; j++) choose = (choose * (n - i + j)) / j;
    total += choose * p ** i * (1 - p) ** (n - i);
  }
  return total;
}

describe("engine determinism and cluster statistics", () => {
  it("returns deep-equal results for the same config", () => {
    const config = {
      ...DEFAULT_CONFIG,
      mode: "village" as const,
      scenario: "cluster" as const,
      seed: 2026,
    };
    expect(simulate(config)).toEqual(simulate(config));
  });

  it("computes the binomial tail correctly", () => {
    expect(binomTail(0, 10, 0.1)).toBe(1);
    expect(binomTail(11, 10, 0.1)).toBe(0);
    expect(binomTail(1, 10, 0.1)).toBeCloseTo(1 - 0.9 ** 10, 12);
    expect(binomTail(3, 34, 0.02)).toBeCloseTo(bruteBinomialTail(3, 34, 0.02), 12);
  });

  it("flags a +10 bpm step on the second elevated valid day only", () => {
    const flat = Array.from({ length: 25 }, (_, index) =>
      index % 2 === 0 ? 69.9 : 70.1,
    );
    const values = [...flat, 80, 80, 80, 80];
    const points = computeDrift(makeObs(values));
    expect(points[25].flagged).toBe(false);
    expect(points[26].flagged).toBe(true);
  });

  it("does not flag a flat series with tiny noise", () => {
    const values = Array.from({ length: 60 }, (_, index) =>
      index % 2 === 0 ? 69.9 : 70.1,
    );
    const points = computeDrift(makeObs(values));
    expect(points.some((point) => point.flagged)).toBe(false);
  });

  it("returns a null baseline with fewer than 10 valid history days", () => {
    const values = Array.from({ length: 10 }, () => 70);
    const points = computeDrift(makeObs(values));
    expect(points[9].baseline).toBeNull();
    expect(points[9].z).toBeNull();
  });

  it("runs every mode in a calm season without a clinic detection", () => {
    for (const mode of MODES) {
      const result = simulate({
        ...DEFAULT_CONFIG,
        mode,
        scenario: "calm",
        seed: 2026,
      });
      expect(result.clinicDetectionDay).toBeNull();
      expect(result.outbreakZoneId).toBeNull();
      expect(result.firstAlertDay).toBeNull();
    }
  });

  it("reaches watch or alert in the seeded zone for at least 2 of 3 modes", () => {
    let modesReaching = 0;
    for (const mode of MODES) {
      const result = simulate({
        ...DEFAULT_CONFIG,
        mode,
        scenario: "cluster",
        seed: 2026,
      });
      const reached = result.zoneDays.some(
        (row) =>
          row.zoneId === result.outbreakZoneId &&
          row.day >= result.config.outbreakDay &&
          (row.level === "watch" || row.level === "alert"),
      );
      if (reached) modesReaching += 1;
    }
    expect(modesReaching).toBeGreaterThanOrEqual(2);
  });

  it("applies the signal-quality gates exactly", () => {
    expect(dayQuality(300, 0.1)).toEqual({ valid: true, reason: "ok" });
    expect(dayQuality(null, null)).toEqual({ valid: false, reason: "not-worn" });
    expect(dayQuality(60, 0.1)).toEqual({ valid: false, reason: "short-wear" });
    expect(dayQuality(300, 0.6)).toEqual({ valid: false, reason: "artefact" });

    const clean = new Array<number>(30).fill(800);
    expect(rrWindowQuality(clean)).toEqual({ valid: true, reason: "ok" });
    expect(rrWindowQuality(clean.slice(0, 10))).toEqual({
      valid: false,
      reason: "too-short",
    });
    const withNaN = [...clean];
    withNaN[4] = Number.NaN;
    expect(rrWindowQuality(withNaN)).toEqual({
      valid: false,
      reason: "non-finite",
    });
    const outOfRange = [...clean];
    for (let i = 0; i < 12; i++) outOfRange[i] = 150;
    expect(rrWindowQuality(outOfRange)).toEqual({
      valid: false,
      reason: "out-of-range",
    });
    const exactlyTwentyPercent = [...clean];
    for (let i = 0; i < 6; i++) exactlyTwentyPercent[i] = 150;
    expect(rrWindowQuality(exactlyTwentyPercent)).toEqual({
      valid: true,
      reason: "ok",
    });
  });

  it("never flags a person whose only elevated readings are invalid days", () => {
    const values = [
      ...Array.from({ length: 25 }, () => 70),
      ...Array.from({ length: 6 }, () => 90),
    ];
    const valid = [
      ...Array.from({ length: 25 }, () => true),
      ...Array.from({ length: 6 }, () => false),
    ];
    const points = computeDrift(makeObs(values, valid));
    expect(points.some((point) => point.flagged)).toBe(false);
  });

  it("uses the 3-day unique-person rate for p0, not a daily rate", () => {
    const ids = Array.from({ length: 10 }, (_, index) => `P${index}`);
    const flags: Record<string, boolean[]> = {};
    const valid: Record<string, boolean[]> = {};
    for (const id of ids) {
      flags[id] = new Array<boolean>(60).fill(false);
      valid[id] = new Array<boolean>(60).fill(true);
    }
    for (let day = 0; day < 60; day += 3) flags.P0[day] = true;

    const p0 = computeP0(ids, { flags, valid }, 28);
    expect(p0).toBeCloseTo(0.1, 12);
    const dailyRate = (9 / 25 / 10) * 1;
    expect(Math.abs(p0 - dailyRate)).toBeGreaterThan(0.05);
  });
});
