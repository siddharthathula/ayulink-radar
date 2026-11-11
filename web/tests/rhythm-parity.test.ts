import { describe, expect, it } from "vitest";
import modelJson from "../public/model/rhythm_model.json";
import parity from "../public/model/parity.json";
import samples from "../public/model/samples.json";
import { rhythmProbability } from "../lib/engine/rhythm";
import { rrWindowQuality } from "../lib/engine/signalQuality";
import type { RhythmModel } from "../lib/engine/rhythm";

const model = modelJson as unknown as RhythmModel;

describe("rhythm model parity and sample set", () => {
  it("matches Python probabilities on every parity row", () => {
    expect(parity.length).toBe(20);
    for (const row of parity) {
      const probability = rhythmProbability(row.rr, model);
      expect(Math.abs(probability - row.prob)).toBeLessThan(1e-6);
    }
  });

  it("keeps the sample set balanced and usable", () => {
    expect(samples.length).toBe(40);
    expect(samples.filter((sample) => sample.label === 1).length).toBe(20);
    expect(samples.filter((sample) => sample.label === 0).length).toBe(20);
    for (const sample of samples) {
      expect(sample.rr.length).toBe(30);
      expect(rrWindowQuality(sample.rr).valid).toBe(true);
    }
  });

  it("uses a 30-interval window and a threshold in (0, 1)", () => {
    expect(model.windowBeats).toBe(30);
    expect(model.threshold).toBeGreaterThan(0);
    expect(model.threshold).toBeLessThan(1);
    expect(model.features.length).toBe(9);
    expect(model.mean.length).toBe(9);
    expect(model.scale.length).toBe(9);
    expect(model.coef.length).toBe(9);
  });
});
