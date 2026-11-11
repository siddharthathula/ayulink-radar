/**
 * Calibration check for the cluster test: are the p-values honest, and what is
 * the real false-alert rate once you test every zone every day?
 *
 * Uses CALM runs only (no outbreak), held-out seeds 101-300, all 3 settings,
 * wear 0.8 and 0.6. Region-wide guard OFF, so we see the raw test.
 *
 * Two questions:
 *  1. Per test: P(p <= t) under the null should be <= t. Binomial with a
 *     discrete count is conservative if p0 is right; flags that cluster
 *     inside one person or day can break that.
 *  2. Per run: Bonferroni corrects for zones, not for 32 daily looks with
 *     overlapping windows. We report how often a whole calm 32-day run
 *     raises at least one alert (the number an operator actually feels).
 *
 * Run:    npx tsx scripts/calibrate.ts
 * Writes: public/data/calibration.json
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { DEFAULT_CONFIG, MODES, simulate } from "../lib/engine/index";
import { CLUSTER, detectClusters } from "../lib/engine/cluster";

const SEEDS = Array.from({ length: 200 }, (_, i) => 101 + i);
const WEARS = [0.8, 0.6];
const THRESHOLDS = [0.001, 0.01, 0.05, 0.1];

function r4(x: number): number {
  return Math.round(x * 10000) / 10000;
}

function main() {
  const t0 = Date.now();
  const out: Record<string, unknown> = {};
  for (const wear of WEARS) {
    for (const mode of MODES) {
      let tests = 0;
      const below = THRESHOLDS.map(() => 0);
      let watchTests = 0;
      let alertTests = 0;
      let watchHits = 0;
      let alertHits = 0;
      let runsWithAlert = 0;
      let runsWithWatch = 0;
      let alertZoneDays = 0;
      let zoneDays = 0;
      let zoneCount = 0;
      for (const seed of SEEDS) {
        const r = simulate({ ...DEFAULT_CONFIG, mode, scenario: "calm", seed, wearRate: wear });
        const raw = detectClusters(r.people, r.zones, r.obs, r.drift, { guard: false });
        zoneCount = r.zones.length;
        let anyAlert = false;
        let anyWatch = false;
        for (const row of raw) {
          if (row.day < CLUSTER.firstDay) continue;
          zoneDays++;
          if (row.level === "alert") {
            anyAlert = true;
            alertZoneDays++;
          }
          if (row.level !== "normal") anyWatch = true;
          if (row.n < CLUSTER.minEligible) continue;
          tests++;
          THRESHOLDS.forEach((t, i) => {
            if (row.pValue <= t) below[i]++;
          });
          watchTests++;
          alertTests++;
          if (row.pValue < CLUSTER.watchAlpha / zoneCount) watchHits++;
          if (row.pValue < CLUSTER.alertAlpha / zoneCount) alertHits++;
        }
        if (anyAlert) runsWithAlert++;
        if (anyWatch) runsWithWatch++;
      }
      out[`${mode}@${wear}`] = {
        mode,
        wear,
        zones: zoneCount,
        tests,
        pValueCalibration: THRESHOLDS.map((t, i) => ({ nominal: t, observed: r4(below[i] / Math.max(tests, 1)) })),
        perTest: {
          watchNominal: r4(CLUSTER.watchAlpha / zoneCount),
          watchObserved: r4(watchHits / Math.max(watchTests, 1)),
          alertNominal: r4(CLUSTER.alertAlpha / zoneCount),
          alertObserved: r4(alertHits / Math.max(alertTests, 1)),
        },
        perRun: {
          runs: SEEDS.length,
          shareWithAnyAlert: r4(runsWithAlert / SEEDS.length),
          shareWithAnyWatch: r4(runsWithWatch / SEEDS.length),
        },
        alertsPerZonePer30Days: r4((alertZoneDays / Math.max(zoneDays, 1)) * 30),
      };
      console.log(mode, wear, JSON.stringify(out[`${mode}@${wear}`]));
    }
  }
  const json = {
    generatedAt: new Date().toISOString().slice(0, 10),
    question: "Under no outbreak, how often does the cluster test fire, compared with what it promises?",
    data: "Simulated calm runs, held-out seeds 101-300, region-wide guard OFF (raw test).",
    reading: [
      "pValueCalibration: observed share of tests with p <= t. Honest p-values give observed <= nominal.",
      "perTest: share of zone-days crossing the watch / alert threshold vs the Bonferroni-corrected alpha.",
      "perRun: share of whole 32-day calm runs with at least one alert. Bonferroni covers zones, not days.",
    ],
    results: out,
    runtimeSeconds: Math.round((Date.now() - t0) / 1000),
  };
  writeFileSync(resolve(__dirname, "../public/data/calibration.json"), JSON.stringify(json, null, 2) + "\n");
  console.log(`done in ${json.runtimeSeconds}s`);
}

main();
