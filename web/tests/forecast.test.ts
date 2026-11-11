import { describe, expect, it } from "vitest";
import { simulate } from "@/lib/engine/simulate";
import { DEFAULT_CONFIG } from "@/lib/engine/presets";
import {
  FORECAST_FEATURES,
  buildForecastIndex,
  escalationLabel,
  forecastFeatures,
  zoneForecasts,
} from "@/lib/engine/forecast";
import { FORECAST_EVAL, FORECAST_MODEL } from "@/lib/ai/forecastModel";

describe("zone escalation forecaster", () => {
  const cluster = simulate({ ...DEFAULT_CONFIG, scenario: "cluster", seed: 2026 });
  const calm = simulate({ ...DEFAULT_CONFIG, scenario: "calm", seed: 2026 });

  it("model file matches the feature list", () => {
    expect(FORECAST_MODEL.features).toEqual(FORECAST_FEATURES.map((f) => f.key));
    expect(FORECAST_MODEL.weights).toHaveLength(FORECAST_FEATURES.length);
    expect(FORECAST_MODEL.threshold).toBeGreaterThan(0);
  });

  it("features use only past data (no ground truth leak)", () => {
    const index = buildForecastIndex(cluster);
    const zone = cluster.zones[0].id;
    const a = forecastFeatures(cluster, index, zone, 35);
    // Changing future days must not change today's features.
    const mutated = { ...cluster, zoneDays: cluster.zoneDays.filter((r) => r.day <= 35) };
    const b = forecastFeatures(mutated, buildForecastIndex(mutated), zone, 35);
    expect(b).toEqual(a);
  });

  it("ranks the outbreak zone as high risk before its first alert", () => {
    expect(cluster.firstAlertDay).not.toBeNull();
    const index = buildForecastIndex(cluster);
    let warned = false;
    for (let day = cluster.config.outbreakDay; day < (cluster.firstAlertDay ?? 0); day++) {
      const top = zoneForecasts(cluster, day, FORECAST_MODEL, index)[0];
      if (top.zoneId === cluster.outbreakZoneId && top.risk === "high") warned = true;
    }
    expect(warned).toBe(true);
  });

  it("stays quiet in a calm run", () => {
    const index = buildForecastIndex(calm);
    let high = 0;
    for (let day = 28; day < 60; day++) {
      high += zoneForecasts(calm, day, FORECAST_MODEL, index).filter((f) => f.risk === "high").length;
    }
    expect(high).toBeLessThanOrEqual(3);
  });

  it("labels skip zones already on alert", () => {
    const index = buildForecastIndex(cluster);
    const alertRow = cluster.zoneDays.find((r) => r.level === "alert");
    expect(alertRow).toBeDefined();
    expect(escalationLabel(index, alertRow!.zoneId, alertRow!.day)).toBeNull();
  });

  it("published evaluation beats the p-value baseline on held-out seeds", () => {
    expect(FORECAST_EVAL.test.auroc).toBeGreaterThan(FORECAST_EVAL.test.baselineEvidenceAuroc);
    expect(FORECAST_EVAL.test.f1).toBeGreaterThan(FORECAST_EVAL.test.baselineWatchOnly.f1);
  });
});
