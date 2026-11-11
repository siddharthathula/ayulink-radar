import type { Metadata } from "next";
import Link from "next/link";
import { Info, ShieldCheck } from "lucide-react";
import {
  evalData,
  rhythmModelData,
  type GridRow,
  type StressRow,
} from "@/lib/results";
import { NoiseChart } from "@/components/method/NoiseChart";
import calibrationJson from "@/public/data/calibration.json";

interface CalibrationRow {
  mode: string;
  wear: number;
  pValueCalibration: Array<{ nominal: number; observed: number }>;
  perTest: { watchNominal: number; watchObserved: number; alertNominal: number; alertObserved: number };
  perRun: { runs: number; shareWithAnyAlert: number; shareWithAnyWatch: number };
}
const calibration = calibrationJson as unknown as { results: Record<string, CalibrationRow> };

export const metadata: Metadata = {
  title: "Method",
  description:
    "How the AyuLink Radar baseline, cluster test and rhythm model work, what the simulation assumes, full evaluation tables and honest limits.",
};

const SECTIONS = [
  { id: "layers", label: "Detection layers" },
  { id: "evaluation", label: "Evaluation design" },
  { id: "results", label: "Radar results" },
  { id: "stress", label: "Stress tests" },
  { id: "calibration", label: "Calibration" },
  { id: "noise", label: "Noise sweep" },
  { id: "rhythm", label: "Rhythm model" },
  { id: "assumptions", label: "Simulation assumptions" },
  { id: "limits", label: "Limitations" },
  { id: "privacy", label: "Privacy" },
  { id: "references", label: "References" },
];

const MODE_LABELS = { village: "Village", ward: "City (Hyderabad metro)", society: "Society" } as const;

const REFERENCES = [
  {
    text: "Radin JM, Wineinger NE, Topol EJ, Steinhubl SR. Harnessing wearable device data to improve state-level real-time surveillance of influenza-like illness in the USA: a population-based study. Lancet Digital Health, 2020.",
    href: "https://doi.org/10.1016/S2589-7500(19)30222-5",
  },
  {
    text: "Quer G, Radin JM, et al. Wearable sensor data and self-reported symptoms for COVID-19 detection. Nature Medicine, 2021.",
    href: "https://doi.org/10.1038/s41591-020-1123-x",
  },
  {
    text: "Scripps DETECT study. Individual resting heart rate is stable; deviation from your own baseline is the signal.",
    href: "https://detect.scripps.edu",
  },
  {
    text: "National Centre for Disease Control. Integrated Disease Surveillance Programme (IDSP): objectives and decentralised surveillance structure.",
    href: "https://ncdc.mohfw.gov.in/includes/About/CentresAndDivision/IDSP.php",
  },
  {
    text: "Tracking the implementation to identify gaps in the Integrated Disease Surveillance Program in a block of district Jhajjar, Haryana. Under-reporting and timeliness remain known limitations of passive surveillance.",
    href: "https://pmc.ncbi.nlm.nih.gov/articles/PMC4209674/",
  },
  {
    text: "PhysioNet. MIT-BIH Atrial Fibrillation Database v1.0.0 (ODC-BY 1.0), with Moody GB, Mark RG. A new method for detecting atrial fibrillation using R-R intervals. Computers in Cardiology, 1983.",
    href: "https://physionet.org/content/afdb/1.0.0/",
  },
  {
    text: "Prior art: a LoRa-based patient wristband with central monitoring (IEEE ICCPCT 2024). We differ by detecting a community cluster, not monitoring one bedside.",
    href: "https://doi.org/10.1109/iccpct61902.2024.10673267",
  },
  {
    text: "Prior art: Dozee, contactless hospital bedside monitoring in India. We differ by working at community level, not as a bedside monitor.",
    href: "https://www.dozee.health/",
  },
];

function pct(value: number | null): string {
  return value === null ? "—" : `${(value * 100).toFixed(1)}%`;
}

function ci(value: [number, number] | null): string {
  return value === null
    ? "—"
    : `${(value[0] * 100).toFixed(1)}–${(value[1] * 100).toFixed(1)}%`;
}

function lead(row: { medianLeadDays: number | null; leadP25: number | null; leadP75: number | null }): string {
  if (row.medianLeadDays === null) return "—";
  const low = row.leadP25 === null ? "—" : row.leadP25.toFixed(1);
  const high = row.leadP75 === null ? "—" : row.leadP75.toFixed(1);
  return `${row.medianLeadDays.toFixed(1)} [${low}, ${high}]`;
}

function falseAlerts(value: number | null): string {
  return value === null ? "—" : value.toFixed(3);
}

function EvalTable({ mode }: { mode: "village" | "ward" | "society" }) {
  const rows = evalData.grid.filter((row) => row.mode === mode);
  const wearRates = [1, 0.8, 0.6, 0.4];
  return (
    <div className="overflow-x-auto rounded-[14px] border border-border">
      <table className="w-full min-w-[860px] border-collapse text-left text-[12px]">
        <caption className="sr-only">
          {MODE_LABELS[mode]} detection results by wear rate and detector
        </caption>
        <thead className="bg-surface-2 text-[10px] uppercase tracking-wide text-muted">
          <tr>
            <th scope="col" className="px-3 py-2.5 font-medium">Wear</th>
            <th scope="col" className="px-3 py-2.5 font-medium">Detector</th>
            <th scope="col" className="px-3 py-2.5 font-medium">Detection [95% CI]</th>
            <th scope="col" className="px-3 py-2.5 font-medium">Zone-day specificity [95% CI]</th>
            <th scope="col" className="px-3 py-2.5 font-medium">Precision [95% CI]</th>
            <th scope="col" className="px-3 py-2.5 text-right font-medium">False alerts / zone / 30d</th>
            <th scope="col" className="px-3 py-2.5 text-right font-medium">Median lead days [p25, p75]</th>
          </tr>
        </thead>
        <tbody>
          {wearRates.map((wear) =>
            rows
              .filter((row) => row.wearRate === wear)
              .map((row: GridRow, index) => (
                <tr key={`${wear}-${row.detector}`} className={`border-t border-border ${index === 0 ? "border-t-2" : ""}`}>
                  <td className="mono px-3 py-2.5 text-muted">
                    {index === 0 ? `${(wear * 100).toFixed(0)}%` : ""}
                  </td>
                  <td className="px-3 py-2.5 text-text">{row.detectorName}</td>
                  <td className="mono px-3 py-2.5">
                    {pct(row.detectionRate)}{" "}
                    <span className="text-muted">[{ci(row.detectionRateCI)}]</span>
                  </td>
                  <td className="mono px-3 py-2.5">
                    {pct(row.zoneDaySpecificity)}{" "}
                    <span className="text-muted">[{ci(row.specificityCI)}]</span>
                  </td>
                  <td className="mono px-3 py-2.5">
                    {row.precision === null ? "—" : pct(row.precision)}{" "}
                    {row.precisionCI ? <span className="text-muted">[{ci(row.precisionCI)}]</span> : null}
                  </td>
                  <td className="mono px-3 py-2.5 text-right">{falseAlerts(row.falseAlertsPerZonePer30d)}</td>
                  <td className="mono px-3 py-2.5 text-right">{lead(row)}</td>
                </tr>
              )),
          )}
        </tbody>
      </table>
    </div>
  );
}

function StressTable({ rows, detector }: { rows: StressRow[]; detector: "D1" | "D4" }) {
  return (
    <div className="overflow-x-auto rounded-[14px] border border-border">
      <table className="w-full min-w-[680px] border-collapse text-left text-[12px]">
        <thead className="bg-surface-2 text-[10px] uppercase tracking-wide text-muted">
          <tr>
            <th scope="col" className="px-3 py-2.5 font-medium">Mode</th>
            <th scope="col" className="px-3 py-2.5 font-medium">Stress</th>
            <th scope="col" className="px-3 py-2.5 font-medium">Detection</th>
            <th scope="col" className="px-3 py-2.5 font-medium">Specificity</th>
            <th scope="col" className="px-3 py-2.5 text-right font-medium">False alerts / zone / 30d</th>
            <th scope="col" className="px-3 py-2.5 text-right font-medium">Median lead days</th>
          </tr>
        </thead>
        <tbody>
          {rows
            .filter((row) => row.detector === detector)
            .map((row) => (
              <tr key={`${row.mode}-${row.stress}`} className="border-t border-border">
                <td className="px-3 py-2.5 capitalize text-text">{row.mode}</td>
                <td className="px-3 py-2.5 text-muted">{row.stress}</td>
                <td className="mono px-3 py-2.5">{pct(row.detectionRate)}</td>
                <td className="mono px-3 py-2.5">{pct(row.zoneDaySpecificity)}</td>
                <td className="mono px-3 py-2.5 text-right">{falseAlerts(row.falseAlertsPerZonePer30d)}</td>
                <td className="mono px-3 py-2.5 text-right">{lead(row)}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

export default function MethodPage() {
  const metrics = rhythmModelData.metrics;
  const threshold = rhythmModelData.threshold;

  return (
    <div className="shell pb-16 pt-6 sm:pt-10">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-10 xl:grid-cols-[minmax(0,1fr)_220px]">
        <article className="min-w-0">
          <p className="mono text-[11px] uppercase tracking-[0.16em] text-brand">
            Method · reproducible
          </p>
          <h1 className="mt-2 text-3xl sm:text-4xl">How the radar decides.</h1>
          <p className="mt-3 max-w-[62ch] text-base leading-relaxed text-muted">
            AyuLink Radar is a screening prototype. It is not a medical device
            and has not been clinically validated. Population data in the demo is
            simulated. Every number on this page comes from{" "}
            <span className="mono text-text">web/public/data/eval.json</span> and{" "}
            <span className="mono text-text">web/public/model/rhythm_model.json</span>,
            both generated by scripts in the repository.
          </p>

          <section id="layers" className="mt-10 scroll-mt-24">
            <h2 className="text-xl">Detection layers</h2>
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <div className="card p-4">
                <h3 className="text-base">A · Personal baseline drift</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">
                  For each person and valid day, the baseline is the median of
                  the previous 21 valid resting-HR readings, skipping the two most
                  recent days. Sigma is{" "}
                  <span className="mono">max(1.4826 × MAD, 1.5)</span> and the
                  robust z-score is <span className="mono">(rhr − baseline) / sigma</span>.
                  A day is elevated at <span className="mono">z ≥ 2.0</span>. A
                  drift flag needs two consecutive valid elevated days. Invalid or
                  missing days are skipped and can never create a flag.
                </p>
              </div>
              <div className="card p-4">
                <h3 className="text-base">B · Community cluster alert</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">
                  For each zone and day, <span className="mono">n</span> is the
                  number of people with at least two valid days in the last three
                  days, and <span className="mono">k</span> is the number of unique
                  flagged people in the same three-day window. The expected rate{" "}
                  <span className="mono">p0</span> is the mean unique-person rate
                  over days <span className="mono">d−28 … d−4</span>, floored at
                  0.02. The p-value is the binomial tail{" "}
                  <span className="mono">P(X ≥ k | n, p0)</span>. Bonferroni
                  correction uses the number of zones. Alert needs{" "}
                  <span className="mono">k ≥ 4</span> and{" "}
                  <span className="mono">p &lt; 0.001/Z</span>; watch needs{" "}
                  <span className="mono">k ≥ 3</span> and{" "}
                  <span className="mono">p &lt; 0.01/Z</span>. Zones with fewer
                  than 10 eligible wearers never alert.
                </p>
              </div>
              <div className="card p-4">
                <h3 className="text-base">C · Region-wide guard</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">
                  If more than half of all zones would be watch or alert on the
                  same day, every level is downgraded one step and the day is
                  marked region-wide. A heatwave or festival is not a local
                  cluster.
                </p>
              </div>
              <div className="card p-4">
                <h3 className="text-base">D · Irregular-rhythm screening</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">
                  A logistic-regression model on nine RR-interval features,
                  trained on ECG-derived intervals from the public MIT-BIH Atrial
                  Fibrillation Database. It flags irregular rhythm; it does not
                  identify a disease. The band uses an optical pulse sensor, and
                  on-band validation is pending.
                </p>
              </div>
            </div>
          </section>

          <section id="evaluation" className="mt-10 scroll-mt-24">
            <h2 className="text-xl">Evaluation design</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Tuning seeds <span className="mono">1–100</span>. Test seeds{" "}
              <span className="mono">101–300</span> (200 seeds). Stress and noise
              sweep seeds <span className="mono">101–200</span>. Test seeds were
              never used to tune a threshold. Runtime:{" "}
              <span className="mono">{evalData.meta.runtimeSeconds} s</span>.
            </p>
            <dl className="mt-4 grid gap-2 sm:grid-cols-2">
              {[
                ["Ground truth", "A zone-day is positive when at least 3 people in that zone have days-since-infection in 1…10."],
                ["Detection rate", "Share of cluster runs with an alert in the outbreak zone before outbreakDay + 14."],
                ["Specificity", "Share of calm zone-days on/after day 28 with no alert."],
                ["Precision", "Share of alert zone-days in cluster runs that are truly outbreak-active."],
                ["False alerts", "Alert zone-days per zone per 30 observed days in calm runs."],
                ["Tuning target", "At most 0.2 false-alert zone-days per zone per 30 days."],
              ].map(([term, description]) => (
                <div key={term} className="rounded-xl border border-border bg-surface p-3">
                  <dt className="text-[11px] uppercase tracking-wide text-muted">{term}</dt>
                  <dd className="mt-1 text-sm leading-relaxed text-text">{description}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Tuning observed a maximum of{" "}
              <span className="mono text-text">
                {evalData.tuning.maxFalseAlertsPerZonePer30d === null
                  ? "TBD"
                  : evalData.tuning.maxFalseAlertsPerZonePer30d.toFixed(4)}
              </span>{" "}
              false-alert zone-days per zone per 30 days. Target met:{" "}
              <span className="text-brand">
                {evalData.tuning.passed ? "yes" : "no"}
              </span>
              . No threshold was changed after seeing test results.
            </p>
          </section>

          <section id="results" className="mt-10 scroll-mt-24">
            <h2 className="text-xl">Radar results · test seeds only</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              All four detectors receive the same simulated data. D1 is a fixed
              threshold; D2 adds personal baselines without statistics; D3 adds
              the binomial cluster test; D4 adds the region-wide guard and is the
              product.
            </p>
            <div className="mt-5 space-y-6">
              {(["village", "ward", "society"] as const).map((mode) => (
                <div key={mode}>
                  <h3 className="mb-2 text-base">{MODE_LABELS[mode]}</h3>
                  <EvalTable mode={mode} />
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-muted">
              Medians are shown as point [p25, p75]. A negative lead means the
              simulated clinic reported first; we publish that as it is. Full
              generated tables are in{" "}
              <a
                href="https://github.com/siddharthathula/ayulink-radar/blob/main/docs/method.md"
                target="_blank"
                rel="noreferrer"
                className="text-info underline underline-offset-2 hover:text-text"
              >
                docs/method.md
              </a>
              .
            </p>
          </section>

          <section id="stress" className="mt-10 scroll-mt-24">
            <h2 className="text-xl">Stress tests</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              D4 at 80% wear, except low participation at 40%. Heatwave and
              isolated illness are false-alert traps; fast spread is a detection
              test. Detection and false-alert columns come from separate cluster
              and calm runs with the same seeds.
            </p>
            <div className="mt-4">
              <StressTable rows={evalData.stress} detector="D4" />
            </div>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Read the failures plainly: heatwave raises false alerts; noisy
              sensors cut detection; at 40% participation the engine misses
              almost everything. Those are limits of the method, not footnotes.
            </p>
            <details className="mt-3 rounded-xl border border-border p-3">
              <summary className="cursor-pointer text-sm font-medium">
                D1 fixed-threshold comparison
              </summary>
              <div className="mt-3">
                <StressTable rows={evalData.stress} detector="D1" />
              </div>
            </details>
          </section>

          <section id="calibration" className="mt-10 scroll-mt-24">
            <h2 className="text-xl">Calibration: does the test keep its promise?</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Calm runs only (no outbreak), held-out seeds 101–300, region-wide guard off, so this is the raw
              test. Honest p-values mean the observed share of tests with p ≤ t stays at or below t.
              Bonferroni divides alpha by the number of zones; it does not correct for testing every day, so
              we also report how often a whole calm 32-day run raises at least one alert.
            </p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[620px] text-left text-[13px]">
                <thead className="text-[11px] uppercase tracking-wide text-muted">
                  <tr>
                    <th className="py-2 pr-3 font-semibold">Setting · wear</th>
                    <th className="py-2 pr-3 font-semibold">P(p ≤ 0.01)</th>
                    <th className="py-2 pr-3 font-semibold">P(p ≤ 0.05)</th>
                    <th className="py-2 pr-3 font-semibold">Alert rate per test (nominal)</th>
                    <th className="py-2 pr-3 font-semibold">Calm runs with ≥1 alert</th>
                    <th className="py-2 font-semibold">… with ≥1 watch</th>
                  </tr>
                </thead>
                <tbody className="mono">
                  {Object.values(calibration.results).map((r) => (
                    <tr key={`${r.mode}-${r.wear}`} className="border-t border-border">
                      <td className="py-2 pr-3 font-sans">
                        {r.mode === "ward" ? "city" : r.mode} · {Math.round(r.wear * 100)}%
                      </td>
                      <td className="py-2 pr-3">{r.pValueCalibration[1].observed}</td>
                      <td className="py-2 pr-3">{r.pValueCalibration[2].observed}</td>
                      <td className="py-2 pr-3">
                        {r.perTest.alertObserved} ({r.perTest.alertNominal})
                      </td>
                      <td className="py-2 pr-3">{(r.perRun.shareWithAnyAlert * 100).toFixed(1)}%</td>
                      <td className="py-2">{(r.perRun.shareWithAnyWatch * 100).toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Reading it: p-values are conservative almost everywhere. One exception: the society setting at
              80% wear fires alerts slightly above its per-test promise, because flags from one person persist
              for days and neighbours are not fully independent. Across a whole calm month, a small share of
              runs still sees one alert and more see a watch — that is the real false-alarm load an operator
              feels. Regenerate with <span className="mono">npx tsx scripts/calibrate.ts</span>.
            </p>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Fixed on 11 Nov 2026: the count of flagged people (k) could include people who were not in the
              denominator (n) because they had fewer than 2 valid days in the window. That made p-values too
              small on about 12% of zone-days. k is now restricted to eligible people; every number on this
              site was regenerated after the fix.
            </p>
          </section>

          <section id="noise" className="mt-10 scroll-mt-24">
            <h2 className="text-xl">Noise sweep</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Village, 80% wear, D4. Person-level precision is flagged
              person-days that are truly ill (days-since-infection 1…10 or a
              sporadic episode) divided by all flagged person-days. Zone detection
              and false alerts use the same runs.
            </p>
            <div className="mt-4">
              <NoiseChart rows={evalData.noiseSweep} />
            </div>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Our finding: as noise rises, both individual precision and zone
              detection fall. We do not claim the community signal holds up
              longer; it does not.
            </p>
          </section>

          <section id="rhythm" className="mt-10 scroll-mt-24">
            <h2 className="text-xl">Rhythm model</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              {metrics.nWindows.toLocaleString()} windows from {metrics.nRecords}{" "}
              records ({metrics.nAf.toLocaleString()} AF,{" "}
              {metrics.nNormal.toLocaleString()} normal). Split by record with
              GroupKFold(5); the final model is fit on all windows. Threshold{" "}
              <span className="mono">{threshold.toFixed(3)}</span>, chosen as the
              smallest out-of-fold threshold with specificity ≥ 0.95.
            </p>
            <dl className="mt-4 grid grid-cols-3 gap-2">
              {[
                ["Sensitivity", metrics.mean.sensitivity, metrics.sd.sensitivity],
                ["Specificity", metrics.mean.specificity, metrics.sd.specificity],
                ["AUROC", metrics.mean.auroc, metrics.sd.auroc],
              ].map(([label, mean, sd]) => (
                <div key={String(label)} className="rounded-xl border border-border bg-surface p-3">
                  <dt className="text-[10px] uppercase tracking-wide text-muted">{label}</dt>
                  <dd className="mono mt-1 text-lg">{(mean as number).toFixed(3)}</dd>
                  <dd className="mono text-[10px] text-muted">± {(sd as number).toFixed(3)}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-[11px] text-muted">
              Out-of-fold at the chosen threshold: sensitivity{" "}
              {(metrics.outOfFold.sensitivity * 100).toFixed(1)}%, specificity{" "}
              {(metrics.outOfFold.specificity * 100).toFixed(1)}%, AUROC{" "}
              {metrics.outOfFold.auroc.toFixed(3)}.
            </p>
            <details className="mt-3 rounded-xl border border-border p-3">
              <summary className="cursor-pointer text-sm font-medium">
                Per-fold metrics
              </summary>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[460px] border-collapse text-left text-[12px]">
                  <thead className="text-[10px] uppercase tracking-wide text-muted">
                    <tr>
                      <th scope="col" className="py-2 pr-3 font-medium">Fold</th>
                      <th scope="col" className="py-2 pr-3 font-medium">Records</th>
                      <th scope="col" className="py-2 pr-3 font-medium">Sensitivity</th>
                      <th scope="col" className="py-2 pr-3 font-medium">Specificity</th>
                      <th scope="col" className="py-2 font-medium">AUROC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.folds.map((fold) => (
                      <tr key={fold.fold} className="border-t border-border">
                        <td className="mono py-2 pr-3">{fold.fold}</td>
                        <td className="mono py-2 pr-3 text-muted">{fold.n.toLocaleString()}</td>
                        <td className="mono py-2 pr-3">{fold.sensitivity.toFixed(3)}</td>
                        <td className="mono py-2 pr-3">{fold.specificity.toFixed(3)}</td>
                        <td className="mono py-2">{fold.auroc.toFixed(3)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </section>

          <section id="assumptions" className="mt-10 scroll-mt-24">
            <h2 className="text-xl">Simulation assumptions</h2>
            <div className="mt-4 overflow-x-auto rounded-[14px] border border-border">
              <table className="w-full min-w-[620px] border-collapse text-left text-sm">
                <thead className="bg-surface-2 text-[10px] uppercase tracking-wide text-muted">
                  <tr>
                    <th scope="col" className="px-3 py-2.5 font-medium">Item</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["Run length and zones", "60 days; 6 / 8 / 6 zones for village / ward / society"],
                    ["People per zone", "34 / 60 / 80"],
                    ["Baseline resting HR", "68 ± 7 bpm, clamped 50–92; ages 18–80; 50/50 sex"],
                    ["Daily wear", "Probability equals the selected wear rate; 300 ± 150 wear minutes"],
                    ["Artefact fraction", "|N(0,1)| × (0.08 + 0.35 × noise)"],
                    ["Regional heat", "Two hot days (+1.5 bpm) after day 28 in every scenario"],
                    ["Heatwave stress", "Five consecutive days (+3 bpm) after day 30"],
                    ["Sporadic illness", "0.003 per healthy day for 4 days (+6 bpm); isolated stress ×3"],
                    ["Outbreak", "3 seeded people in one zone on day 34; infectious days 2–8"],
                    ["Transmission", "beta 0.55 / spill 0.06 for spread; fast stress 0.9 / 0.12"],
                    ["Clinic visits", "Each infected person visits with probability 0.45 on infection day + 3 + U{1,2,3}"],
                    ["Clinic detection", "Third visit from the outbreak zone plus 3 / 2 / 2-day reporting lag"],
                  ].map(([item, value]) => (
                    <tr key={item} className="border-t border-border">
                      <td className="px-3 py-2.5 font-medium text-text">{item}</td>
                      <td className="px-3 py-2.5 text-muted">{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-muted">
              The clinic bar is deliberately generous (three visits), so the
              measured lead time is not inflated. Lead time depends on these
              assumptions, not on observed clinic data.
            </p>
          </section>

          <section id="limits" className="mt-10 scroll-mt-24">
            <h2 className="text-xl">Limitations</h2>
            <ul className="mt-3 card space-y-2 p-4 text-sm leading-relaxed text-muted">
              {[
                "Population data in the demo is simulated. Physical hardware: 3 prototype bands. No field deployment has been completed.",
                "Resting-HR drift is not disease-specific. A cluster alert means a possible febrile-illness cluster; it never names a disease.",
                "The rhythm model is trained on ECG-derived intervals from a public database. The band uses an optical/analog pulse sensor. On-band validation is pending.",
                "Lead time vs clinic reporting depends on the simulation assumptions above, not on observed clinic data.",
                "Small groups give weak statistics. Zones with fewer than 10 eligible wearers never alert.",
                "Not a medical device. Clinical validation has not been performed.",
              ].map((limit) => (
                <li key={limit} className="flex gap-2">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-watch" />
                  {limit}
                </li>
              ))}
            </ul>
          </section>

          <section id="privacy" className="mt-10 scroll-mt-24">
            <h2 className="text-xl">Privacy and safety</h2>
            <div className="mt-3 card p-4">
              <ul className="space-y-2 text-sm leading-relaxed text-muted">
                <li className="flex gap-2">
                  <ShieldCheck size={16} className="mt-0.5 shrink-0 text-brand" aria-hidden="true" />
                  The demo runs entirely in your browser. The simulated population
                  never leaves the device.
                </li>
                <li className="flex gap-2">
                  <ShieldCheck size={16} className="mt-0.5 shrink-0 text-brand" aria-hidden="true" />
                  The optional triage route receives only language, alert kind and
                  the facts needed for the note. No name, device id, address or
                  precise location.
                </li>
                <li className="flex gap-2">
                  <ShieldCheck size={16} className="mt-0.5 shrink-0 text-brand" aria-hidden="true" />
                  Band packets carry a pseudonymous device id and no patient name.
                  The gateway is local; no database or session is used.
                </li>
                <li className="flex gap-2">
                  <ShieldCheck size={16} className="mt-0.5 shrink-0 text-brand" aria-hidden="true" />
                  A flag is worded as a screening signal. It never names a disease
                  or recommends a medicine.
                </li>
              </ul>
            </div>
          </section>

          <section id="references" className="mt-10 scroll-mt-24">
            <h2 className="text-xl">References</h2>
            <ol className="mt-3 space-y-2 text-sm leading-relaxed text-muted">
              {REFERENCES.map((reference, index) => (
                <li key={reference.href} className="flex gap-2">
                  <span className="mono shrink-0 text-[11px] text-muted">{index + 1}.</span>
                  <span>
                    {reference.text}{" "}
                    <a
                      href={reference.href}
                      target="_blank"
                      rel="noreferrer"
                      className="text-info underline underline-offset-2 hover:text-text"
                    >
                      Open
                    </a>
                  </span>
                </li>
              ))}
            </ol>
            <p className="mt-3 flex items-start gap-2 text-[11px] text-muted">
              <Info size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
              Links were checked when this page was built. IDSP/IHIP is India&apos;s
              official surveillance system; AyuLink Radar is complementary and has
              no government integration, approval or partnership.
            </p>
          </section>

          <div className="mt-10 flex flex-wrap gap-4 border-t border-border pt-4 text-sm">
            <Link href="/demo" className="text-info underline underline-offset-2 hover:text-text">
              Open the demo
            </Link>
            <Link href="/rhythm" className="text-info underline underline-offset-2 hover:text-text">
              Rhythm Lab
            </Link>
            <a
              href="https://github.com/siddharthathula/ayulink-radar/blob/main/docs/method.md"
              target="_blank"
              rel="noreferrer"
              className="text-info underline underline-offset-2 hover:text-text"
            >
              Generated method tables
            </a>
          </div>
        </article>

        <aside className="hidden xl:block" aria-label="On this page">
          <nav className="sticky top-20 space-y-1 border-l border-border pl-4 text-[12px]">
            <p className="mb-2 text-[10px] uppercase tracking-wide text-muted">On this page</p>
            {SECTIONS.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="block py-0.5 text-muted no-underline hover:text-text"
              >
                {section.label}
              </a>
            ))}
          </nav>
        </aside>
      </div>
    </div>
  );
}
