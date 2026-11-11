import { describe, expect, it } from "vitest";
import { simulate } from "@/lib/engine/simulate";
import { DEFAULT_CONFIG, MODES } from "@/lib/engine/presets";
import { defaultConsoleDay, displayDay } from "@/lib/ui/demo";
import { buildForecastIndex, forecastFeatures, FORECAST_FEATURES } from "@/lib/engine/forecast";

describe("console opens mid-outbreak", () => {
  for (const mode of MODES) {
    it(`${mode}: default day shows an active cluster alert`, () => {
      const result = simulate({ ...DEFAULT_CONFIG, mode, scenario: "cluster" });
      const day = defaultConsoleDay(result, "cluster");
      expect(displayDay(day)).toBeGreaterThan(1);
      const alerts = result.zoneDays.filter((r) => r.day === day && r.level === "alert");
      expect(alerts.length).toBeGreaterThan(0);
    });
  }

  it("calm season still opens on day 1", () => {
    const result = simulate({ ...DEFAULT_CONFIG, scenario: "calm" });
    expect(defaultConsoleDay(result, "calm")).toBe(28);
  });
});

describe("heat-aware forecaster features", () => {
  it("marks most zones elevated in a heatwave but not in a local cluster", () => {
    const ix = FORECAST_FEATURES.findIndex((f) => f.key === "regionElevated");
    const heat = simulate({ ...DEFAULT_CONFIG, scenario: "calm", stress: "heatwave" });
    const local = simulate({ ...DEFAULT_CONFIG, scenario: "cluster" });
    const peak = (r: ReturnType<typeof simulate>) => {
      const index = buildForecastIndex(r);
      let max = 0;
      for (let day = 28; day < 60; day++) max = Math.max(max, forecastFeatures(r, index, r.zones[0].id, day)[ix]);
      return max;
    };
    expect(peak(heat)).toBeGreaterThan(peak(local));
  });
});
