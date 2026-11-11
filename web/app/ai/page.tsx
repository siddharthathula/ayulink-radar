import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BrainCircuit,
  Cpu,
  Filter,
  HeartPulse,
  Languages,
  ListOrdered,
  MessageCircle,
  Radar,
  ShieldCheck,
  TrendingUp,
  UserRound,
  WifiOff,
} from "lucide-react";
import { FORECAST_EVAL, FORECAST_MODEL } from "@/lib/ai/forecastModel";
import { rhythmModelData } from "@/lib/results";

export const metadata: Metadata = {
  title: "The AI inside AyuLink",
  description:
    "Eight AI pieces from band to console: personal baselines, cluster detection, a trained 3-day outbreak forecaster, rhythm screening, a grounded operator assistant and multilingual notes — with real test numbers and honest limits.",
};

const ev = FORECAST_EVAL;
const rhythm = rhythmModelData.metrics;

const SYSTEMS = [
  {
    Icon: Filter,
    name: "Signal quality gate",
    kind: "Automated quality control",
    where: "Engine",
    plain:
      "Throws away readings from a loose strap, a dead battery or lots of movement before anything else sees them. Bad data never becomes an alert.",
    proof:
      "Days with <2 h wear or >30% artefact are excluded and counted in the console.",
    href: "/demo",
    cta: "See exclusions in Zones",
  },
  {
    Icon: UserRound,
    name: "Personal baseline",
    kind: "Per-person anomaly detection",
    where: "Engine",
    plain:
      "Learns what's normal for you — your resting heart rate over three weeks — and only flags you when you drift from yourself for two days running.",
    proof:
      "Robust 21-day median with MAD; no population averages, so an athlete and a grandmother are each judged on their own normal.",
    href: "/method",
    cta: "Method",
  },
  {
    Icon: Radar,
    name: "Neighbourhood cluster detection",
    kind: "Population-level anomaly detection",
    where: "Engine",
    plain:
      "One person drifting is noise. Five neighbours drifting together is a signal. A statistics test decides, corrected for watching many zones at once.",
    proof:
      "Binomial test with Bonferroni correction and a heat/festival guard. Zones with <10 good wearers never alert.",
    href: "/demo?tour=1",
    cta: "Watch it in the console",
  },
  {
    Icon: TrendingUp,
    name: "3-day outbreak forecaster",
    kind: "Trained machine-learning model",
    where: "Console + API",
    plain:
      "Predicts which zone is likely to tip into alert in the next three days, and says why, so a health worker goes there first.",
    proof: `AUROC ${ev.test.auroc} on held-out runs. Warned before the alert in ${Math.round(ev.earlyWarning.warnedShare * 100)}% of outbreak zones, median ${ev.earlyWarning.medianDaysEarlier} days early.`,
    href: "/demo",
    cta: "Open the AI forecast tab",
  },
  {
    Icon: HeartPulse,
    name: "Irregular pulse screen",
    kind: "Trained machine-learning model",
    where: "ESP32 C header + server + browser",
    plain:
      "Looks at the timing between heartbeats for an irregular rhythm and flags the person for a check-up. One model in three runtimes — Python, TypeScript and C for the ESP32 — parity-tested. On-wrist validation pending.",
    proof: `AUROC ${rhythm.mean.auroc.toFixed(3)} across 5 record-wise folds of PhysioNet AFDB (${rhythm.nWindows.toLocaleString("en-IN")} windows).`,
    href: "/rhythm",
    cta: "Try the Rhythm Lab",
  },
  {
    Icon: ListOrdered,
    name: "Visit-first ranking",
    kind: "Explainable triage scoring",
    where: "Console + field app",
    plain:
      "Turns all the signals into one ordered list: who to see first, and a reason in plain words for each person.",
    proof:
      "Every rank shows its reasons (drift size, days, zone level, rhythm, age). No black box.",
    href: "/field",
    cta: "See the field app",
  },
  {
    Icon: MessageCircle,
    name: "Ask AyuLink assistant",
    kind: "Grounded conversational AI",
    where: "Console (offline) + optional LLM",
    plain:
      "The operator just asks: “brief me”, “which zone is next?”, “who first?”. It answers from the live console, by text or voice, even with no internet.",
    proof:
      "Rules engine always answers. An optional LLM may rephrase, but any reply with a new number, a disease name or a medicine word is thrown away.",
    href: "/demo",
    cta: "Press A in the console",
  },
  {
    Icon: Languages,
    name: "Health-worker notes",
    kind: "Multilingual generation",
    where: "Console + field app",
    plain:
      "Writes a short note for the ASHA in Telugu, Hindi or English, and can read it aloud.",
    proof:
      "Safe templates first; LLM output is validated and replaced by the template if it breaks a rule.",
    href: "/field",
    cta: "See a note",
  },
];

const GUARDRAILS = [
  {
    Icon: ShieldCheck,
    title: "Never diagnoses",
    text: "No disease names, no medicines, no doses — in alerts, notes or chat. Every output is a screening flag that sends a human to check.",
  },
  {
    Icon: BrainCircuit,
    title: "Explains itself",
    text: "Forecasts list their top factors. Visit ranks list their reasons. Alerts show k of n and the p-value.",
  },
  {
    Icon: WifiOff,
    title: "Works offline",
    text: "Bands and gateway need no internet. The forecaster and assistant run in the browser. A cloud LLM is optional polish, never required.",
  },
  {
    Icon: Cpu,
    title: "Small, checkable models",
    text: "Logistic models with published weights. Anyone can rerun training and evaluation from the repo.",
  },
];

function Bar({ value, max }: { value: number; max: number }) {
  const width = Math.min(100, (Math.abs(value) / max) * 100);
  return (
    <div
      className="h-2.5 w-full overflow-hidden rounded-full bg-surface-3"
      aria-hidden="true"
    >
      <div
        className="h-full rounded-full"
        style={{
          width: `${width}%`,
          background: value >= 0 ? "var(--brand)" : "var(--watch-fill)",
        }}
      />
    </div>
  );
}

export default function AiPage() {
  const maxWeight = Math.max(
    ...ev.featureImportance.map((f) => Math.abs(f.weight)),
  );
  const precisionIn10 = Math.round(ev.test.precision * 10);

  return (
    <div>
      <section className="bg-brandbar text-white">
        <div className="shell grid items-center gap-10 py-12 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:py-16">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[12px] font-semibold text-onbrand ring-1 ring-white/20">
              <BrainCircuit size={13} aria-hidden="true" /> AI-powered, end to
              end
            </p>
            <h1 className="mt-4 max-w-3xl text-[34px] leading-[1.08] text-white sm:text-[46px]">
              Eight pieces of AI, one job: send help to the right door, early.
            </h1>
            <p className="mt-4 max-w-[62ch] text-[16.5px] leading-relaxed text-onbrand">
              AyuLink isn&apos;t a chatbot bolted onto a dashboard. AI runs at
              every step — from the first reading to the health worker&apos;s
              visit list — and every piece is small enough to explain, test and
              run offline.
            </p>
            <div className="mt-6 flex flex-wrap gap-2.5">
              <Link
                href="/demo?tour=1"
                className="btn h-11 border-white bg-white px-5 font-bold text-[#1b5e3a] hover:bg-[#edf7f1]"
              >
                See it live <ArrowRight size={16} aria-hidden="true" />
              </Link>
              <a
                href="#forecaster"
                className="btn h-11 border-white/30 bg-white/10 px-5 text-white shadow-none hover:bg-white/20"
              >
                Forecaster model card
              </a>
            </div>
          </div>
          <ol className="space-y-2" aria-label="AI pipeline">
            {SYSTEMS.map(({ Icon, name, where }, i) => (
              <li
                key={name}
                className="flex items-center gap-3 rounded-xl bg-white/10 px-3.5 py-2.5 ring-1 ring-white/15"
              >
                <span className="mono w-5 text-[11px] text-onbrand">
                  {i + 1}
                </span>
                <Icon
                  size={16}
                  className="shrink-0 text-white"
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-white">
                  {name}
                </span>
                <span className="hidden shrink-0 text-[11.5px] text-onbrand sm:inline">
                  {where}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="shell py-12">
        <p className="eyebrow text-brand">Band → engine → console</p>
        <h2 className="mt-2 text-2xl sm:text-3xl">Where the AI works</h2>
        <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2 xl:grid-cols-4">
          {SYSTEMS.map(
            ({ Icon, name, kind, where, plain, proof, href, cta }, i) => (
              <article key={name} className="card flex flex-col p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="grid size-9 place-items-center rounded-lg bg-brand-soft text-brand">
                    <Icon size={18} aria-hidden="true" />
                  </span>
                  <span className="mono text-[11px] text-muted">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                </div>
                <h3 className="mt-3 text-[16px]">{name}</h3>
                <p className="text-[11.5px] font-semibold text-[var(--info)]">
                  {kind} · {where}
                </p>
                <p className="mt-2 flex-1 text-[13.5px] leading-relaxed text-text-2">
                  {plain}
                </p>
                <p className="mt-3 rounded-lg bg-surface-2 p-2.5 text-[12px] text-muted">
                  {proof}
                </p>
                <Link
                  href={href}
                  className="mt-3 inline-flex items-center gap-1 text-[12.5px] font-semibold text-brand hover:underline"
                >
                  {cta} <ArrowRight size={13} aria-hidden="true" />
                </Link>
              </article>
            ),
          )}
        </div>
      </section>

      <section
        id="forecaster"
        className="scroll-mt-20 border-y border-border bg-surface/40"
      >
        <div className="shell grid grid-cols-[minmax(0,1fr)] gap-6 py-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <div>
            <p className="eyebrow text-brand">Model card</p>
            <h2 className="mt-2 text-2xl sm:text-3xl">
              3-day outbreak forecaster
            </h2>
            <dl className="mt-4 space-y-3 text-[14px]">
              <div>
                <dt className="font-semibold">Question</dt>
                <dd className="text-text-2">{ev.question}</dd>
              </div>
              <div>
                <dt className="font-semibold">Data</dt>
                <dd className="text-text-2">{ev.data}</dd>
              </div>
              <div>
                <dt className="font-semibold">Model</dt>
                <dd className="text-text-2">
                  {ev.model} Warning line at{" "}
                  {Math.round(FORECAST_MODEL.threshold * 100)}% (picked on
                  training data only).
                </dd>
              </div>
              <div>
                <dt className="font-semibold">In plain words</dt>
                <dd className="text-text-2">
                  About {precisionIn10} in 10 high-risk warnings become an alert
                  within 3 days; the rest cost one extra visit. It catches{" "}
                  {Math.round(ev.test.recall * 100)}% of escalations, and in
                  calm weeks it raises {ev.falseWarnings.perZonePer30Days} false
                  warnings per zone per month.
                </dd>
              </div>
            </dl>

            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[480px] text-left text-[13px]">
                <thead className="text-[11px] uppercase tracking-wide text-muted">
                  <tr>
                    <th className="py-2 pr-3 font-semibold">Held-out test</th>
                    <th className="py-2 pr-3 font-semibold">AI forecaster</th>
                    <th className="py-2 font-semibold">Without AI</th>
                  </tr>
                </thead>
                <tbody className="mono">
                  <tr className="border-t border-border">
                    <td className="py-2 pr-3 font-sans">AUROC</td>
                    <td className="py-2 pr-3 font-semibold text-brand">
                      {ev.test.auroc}
                    </td>
                    <td className="py-2">
                      {ev.test.baselineEvidenceAuroc}{" "}
                      <span className="font-sans text-muted">
                        (p-value alone)
                      </span>
                    </td>
                  </tr>
                  <tr className="border-t border-border">
                    <td className="py-2 pr-3 font-sans">F1</td>
                    <td className="py-2 pr-3 font-semibold text-brand">
                      {ev.test.f1}
                    </td>
                    <td className="py-2">
                      {ev.test.baselineWatchOnly.f1}{" "}
                      <span className="font-sans text-muted">
                        (“on watch” rule)
                      </span>
                    </td>
                  </tr>
                  <tr className="border-t border-border">
                    <td className="py-2 pr-3 font-sans">Recall</td>
                    <td className="py-2 pr-3 font-semibold text-brand">
                      {ev.test.recall}
                    </td>
                    <td className="py-2">{ev.test.baselineWatchOnly.recall}</td>
                  </tr>
                  <tr className="border-t border-border">
                    <td className="py-2 pr-3 font-sans">Warned before alert</td>
                    <td className="py-2 pr-3 font-semibold text-brand">
                      {Math.round(ev.earlyWarning.warnedShare * 100)}%
                    </td>
                    <td className="py-2 font-sans text-muted">—</td>
                  </tr>
                  {(["village", "ward", "society"] as const).map((mode) => (
                    <tr key={mode} className="border-t border-border">
                      <td className="py-2 pr-3 font-sans">
                        AUROC · {mode === "ward" ? "city" : mode}
                      </td>
                      <td className="py-2 pr-3">{ev.byMode[mode]?.auroc}</td>
                      <td className="py-2 font-sans text-muted">—</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-[11.5px] text-muted">
                {ev.test.rows.toLocaleString("en-IN")} zone-days,{" "}
                {ev.test.positives.toLocaleString("en-IN")} escalations.
                Reproduce:{" "}
                <span className="mono">npx tsx scripts/train-forecast.ts</span>
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="card p-4">
              <p className="text-[14px] font-bold">What the model leans on</p>
              <p className="text-[12px] text-muted">
                Standardised weights. Green pushes risk up, amber pulls it down.
              </p>
              <ul className="mt-3 space-y-2.5">
                {ev.featureImportance.map((f) => (
                  <li key={f.key}>
                    <div className="flex items-center justify-between gap-2 text-[12.5px]">
                      <span className="text-text-2">{f.label}</span>
                      <span className="mono text-muted">
                        {f.weight > 0 ? "+" : ""}
                        {f.weight}
                      </span>
                    </div>
                    <Bar value={f.weight} max={maxWeight} />
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[11.5px] text-muted">
                “Region-wide shift” pulls risk down: when everyone moves
                together it&apos;s usually heat or a festival, not an outbreak.
              </p>
            </div>
            <div className="rounded-xl border border-[var(--watch-fill)]/40 bg-[var(--watch-soft)] p-4 text-[13px] text-text-2">
              <p className="font-bold text-text">Honest limits</p>
              <ul className="mt-1.5 space-y-1">
                <li>
                  • Heatwave (never trained on): AUROC{" "}
                  {ev.stress.heatwave?.auroc},{" "}
                  {ev.stress.heatwave?.falseWarnings.perZonePer30Days} false
                  warnings per zone per month. On very hot weeks, trust it less.
                </li>
                <li>
                  • Noisy sensors: AUROC {ev.stress.noisy?.auroc} — holds up.
                </li>
                {ev.caveats.map((c) => (
                  <li key={c}>• {c}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="shell py-12">
        <p className="eyebrow text-brand">Guardrails</p>
        <h2 className="mt-2 text-2xl sm:text-3xl">
          AI that a health worker can trust
        </h2>
        <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {GUARDRAILS.map(({ Icon, title, text }) => (
            <article key={title} className="card p-4">
              <Icon size={20} className="text-brand" aria-hidden="true" />
              <h3 className="mt-3 text-base">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">
                {text}
              </p>
            </article>
          ))}
        </div>
        <div className="mt-8 flex flex-wrap gap-2.5">
          <Link href="/configure" className="btn btn-primary">
            Configure a band <ArrowRight size={15} aria-hidden="true" />
          </Link>
          <Link href="/api-docs#forecast" className="btn">
            Forecast API
          </Link>
          <Link href="/api-docs#assistant" className="btn">
            Assistant API
          </Link>
        </div>
      </section>
    </div>
  );
}
