import Link from "next/link";
import {
  Activity,
  ArrowRight,
  BookOpen,
  BrainCircuit,
  CircuitBoard,
  Clock3,
  HeartPulse,
  MapPin,
  Radio,
  Send,
  ShieldCheck,
  Users,
  Watch,
} from "lucide-react";
import { PhotoFrame } from "@/components/PhotoFrame";
import { HeroPreview } from "@/components/home/HeroPreview";
import { EvidenceBadge } from "@/components/EvidenceBadge";
import { headline, formatNum, rhythmModelData, TEAM_NAME, GITHUB_URL } from "@/lib/results";
import { PRESETS } from "@/lib/engine/presets";
import { FORECAST_EVAL } from "@/lib/ai/forecastModel";
import { PROFILES } from "@/lib/config/modules";


const REFERENCES = [
  {
    title: "Wearable data and influenza-like illness surveillance",
    source: "Radin et al., Lancet Digital Health, 2020",
    href: "https://doi.org/10.1016/S2589-7500(19)30222-5",
    note: "About 47,000 Fitbit users across five US states. Wearable resting-HR data improved influenza-like-illness prediction.",
  },
  {
    title: "Wearable sensor data and self-reported symptoms for COVID-19",
    source: "Quer et al., Nature Medicine, 2021",
    href: "https://doi.org/10.1038/s41591-020-1123-x",
    note: "The Scripps DETECT study found that deviation from a person's own resting-HR baseline carries signal.",
  },
  {
    title: "Scripps DETECT study",
    source: "detect.scripps.edu",
    href: "https://detect.scripps.edu",
    note: "Individual resting heart rate is stable; a sustained deviation from your own baseline is the useful signal.",
  },
];

const STEPS = [
  {
    Icon: Watch,
    title: "Wear",
    text: "A low-cost band records resting heart rate and motion. In cities, an existing smartwatch can supply the same daily number.",
  },
  {
    Icon: Activity,
    title: "Learn the baseline",
    text: "The engine compares each person with their own 21-day median, not with a population average. Cheap sensors are enough for trends.",
  },
  {
    Icon: Users,
    title: "Detect and forecast",
    text: "When several neighbours drift together, the zone goes on watch or alert. A trained AI model ranks which zone is likely to tip over in the next 3 days.",
  },
  {
    Icon: Send,
    title: "Send a health worker",
    text: "A ranked visit list, a note in Telugu, Hindi or English, and an assistant you can just ask “who first?”. A screening flag, not a diagnosis.",
  },
];

const PROBLEMS = [
  {
    Icon: Clock3,
    title: "Surveillance starts at the clinic",
    text: "India's outbreak surveillance mostly begins when a sick person reaches a clinic and a report is filed. By then, the cluster has had time to grow.",
  },
  {
    Icon: MapPin,
    title: "No device means no early signal",
    text: "People with no smartwatch and no nearby clinic produce no early physiological signal at all. The gap is widest where outbreaks are hardest to see.",
  },
  {
    Icon: BookOpen,
    title: "Proven, but not in this setting",
    text: "Published research shows wearable resting-HR data can improve illness surveillance, but it was done on affluent smartwatch owners in the USA.",
  },
];

const LIMITS = [
  "Population data in the demo is simulated. Physical hardware: 3 prototype bands.",
  "Resting-HR drift is not disease-specific. The alert means possible febrile-illness cluster, send a health worker to check. It never names a disease.",
  "The rhythm model is trained on ECG-derived intervals from a public database. The band uses an optical/analog pulse sensor. On-band validation is pending.",
  "Lead time vs clinic reporting depends on simulation assumptions, which are listed openly.",
  "Small groups give weak statistics. Alerts need a minimum number of wearers per zone.",
  "Not a medical device. Not clinically validated.",
];

export default function HomePage() {
  const lead = headline?.medianLeadDays ?? null;
  const leadLow = headline?.leadCI?.[0] ?? null;
  const leadHigh = headline?.leadCI?.[1] ?? null;
  const auroc = rhythmModelData.metrics.mean.auroc;

  return (
    <div>
      <section className="relative overflow-hidden bg-brandbar text-white">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.12]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, #ffffff 1px, transparent 0)",
            backgroundSize: "22px 22px",
          }}
        />
        <div className="shell relative grid items-center gap-10 py-14 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-14 lg:py-20 2xl:py-24">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[12px] font-semibold text-onbrand ring-1 ring-white/20">
              <HeartPulse size={13} aria-hidden="true" /> {TEAM_NAME} · INNOVEX 2026 · PS 01 AI-Powered Healthcare
            </p>
            <h1 className="mt-5 text-[38px] leading-[1.05] text-white sm:text-[52px] xl:text-[64px]">
              It knows your normal.
              <br />
              <span className="text-onbrand">And when your street isn&apos;t.</span>
            </h1>
            <p className="mt-5 max-w-[60ch] text-[17px] leading-relaxed text-onbrand">
              A low-cost band — or the smartwatch you already wear — learns each person&apos;s own resting
              heart rate. AI notices quiet shifts, spots when many neighbours shift together, predicts which
              area may flare up next, and tells a health worker, a family or a clinic who to check first.
              Same system in a village with no internet and in a Hyderabad high-rise.
            </p>
            <div className="mt-7 flex flex-col gap-2.5 sm:flex-row">
              <Link href="/demo?tour=1" className="btn h-12 border-white bg-white px-5 text-[15px] font-bold text-[#1b5e3a] hover:bg-[#edf7f1]">
                Run the 30-second demo
                <ArrowRight size={17} aria-hidden="true" />
              </Link>
              <Link href="/configure" className="btn h-12 border-white/30 bg-white/10 px-5 text-[15px] text-white shadow-none hover:bg-white/20 hover:border-white/50">
                Build a band for someone
              </Link>
              <Link href="/ai" className="btn h-12 border-white/30 bg-white/10 px-5 text-[15px] text-white shadow-none hover:bg-white/20 hover:border-white/50">
                <BrainCircuit size={16} aria-hidden="true" /> The AI inside
              </Link>
            </div>
            <dl className="mt-9 grid max-w-xl grid-cols-3 gap-px overflow-hidden rounded-2xl bg-white/15 ring-1 ring-white/15">
              <div className="bg-brandbar/80 p-4">
                <dt className="text-[11.5px] leading-snug text-onbrand">Median lead time</dt>
                <dd className="mono mt-1 text-[26px] font-semibold">{lead === null ? "TBD" : `${formatNum(lead, 0)} d`}</dd>
                <dd className="text-[10.5px] text-onbrand/80">
                  {leadLow !== null && leadHigh !== null
                    ? `simulated · 95% CI ${formatNum(leadLow, 0)}–${formatNum(leadHigh, 0)} d`
                    : "simulation only"}
                </dd>
              </div>
              <div className="bg-brandbar/80 p-4">
                <dt className="text-[11.5px] leading-snug text-onbrand">Rhythm AUROC</dt>
                <dd className="mono mt-1 text-[26px] font-semibold">{auroc.toFixed(3)}</dd>
                <dd className="text-[10.5px] text-onbrand/80">public ECG · per-record CV</dd>
              </div>
              <div className="bg-brandbar/80 p-4">
                <dt className="text-[11.5px] leading-snug text-onbrand">AI warned early</dt>
                <dd className="mono mt-1 text-[26px] font-semibold">
                  {Math.round(FORECAST_EVAL.earlyWarning.warnedShare * 100)}%
                </dd>
                <dd className="text-[10.5px] text-onbrand/80">
                  of outbreak zones · ~{FORECAST_EVAL.earlyWarning.medianDaysEarlier} d before alert · simulated
                </dd>
              </div>
            </dl>
          </div>

          <div className="relative lg:pl-6">
            <HeroPreview />
            <div className="mt-4 flex items-center gap-4 rounded-2xl bg-white/10 p-3 ring-1 ring-white/15">
              <div className="w-[120px] shrink-0 overflow-hidden rounded-xl bg-white sm:w-[150px]">
                <PhotoFrame
                  src="/hardware/band-oled.jpg"
                  alt="AyuLink wristband prototype with OLED showing heart rate, SpO2 and skin temperature"
                  caption="AyuLink wristband, bench prototype"
                  priority
                  hideCaption
                  imgClassName="aspect-square"
                  className="!rounded-xl !border-0"
                />
              </div>
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-[13px] font-bold text-white">
                  <CircuitBoard size={14} aria-hidden="true" /> Our wristband, not a render
                </p>
                <p className="mt-1 text-[12.5px] leading-snug text-onbrand">
                  ESP32 + MAX30102 + MPU6050 + LM35 on an elastic strap, with Li-Po and USB-C charging.
                  It shows heart rate, SpO2 and skin temperature, and talks to our LoRa gateway with no
                  internet.
                </p>
                <p className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-onbrand">
                  <ShieldCheck size={12} aria-hidden="true" /> Screening prototype · not clinically validated
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-surface/40">
        <div className="shell py-12 lg:py-16">
          <p className="mono text-[11px] uppercase tracking-[0.16em] text-brand">
            The gap
          </p>
          <h2 className="mt-2 max-w-2xl text-2xl sm:text-3xl">
            Outbreaks are counted after people get sick enough to be counted.
          </h2>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {PROBLEMS.map(({ Icon, title, text }) => (
              <article key={title} className="card p-4">
                <Icon size={20} className="text-brand" aria-hidden="true" />
                <h3 className="mt-3 text-base">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{text}</p>
              </article>
            ))}
          </div>
          <p className="mt-4 max-w-3xl text-xs leading-relaxed text-muted">
            Positioning: India already has IDSP/IHIP as its official surveillance
            system. {TEAM_NAME} Radar is a complementary physiological
            early-warning layer that could feed it. No government integration,
            approval or partnership is claimed. ABDM interoperability is future
            work only.
          </p>
        </div>
      </section>

      <section className="shell py-12 lg:py-16">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="mono text-[11px] uppercase tracking-[0.16em] text-brand">For everyone, anywhere</p>
            <h2 className="mt-2 max-w-2xl text-2xl sm:text-3xl">One band, built around each person.</h2>
            <p className="mt-2 max-w-2xl text-sm text-muted">
              Modules snap on or off per wearer: GPS only for those who need finding, ECG only for heart
              patients, a phone link for city users. The AI adapts to whatever the band carries.
            </p>
          </div>
          <Link href="/configure" className="btn min-h-10 px-3 text-sm">
            Open the configurator <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>
        <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {PROFILES.map((p) => (
            <Link
              key={p.id}
              href={`/configure?p=${p.id}`}
              className="card group flex flex-col p-4 no-underline transition-colors hover:border-brand/40"
            >
              <h3 className="text-base text-text group-hover:text-brand">{p.name}</h3>
              <p className="mt-1 text-sm text-text-2">{p.who}</p>
              <p className="mt-0.5 text-xs text-muted">{p.where}</p>
              <p className="mono mt-3 text-[11px] text-muted">{p.config.modules.join(" · ")}</p>
            </Link>
          ))}
        </div>
      </section>

      <section id="how" className="shell scroll-mt-20 py-12 lg:py-16">
        <p className="mono text-[11px] uppercase tracking-[0.16em] text-brand">
          How it works
        </p>
        <h2 className="mt-2 max-w-2xl text-2xl sm:text-3xl">
          Four steps. AI at every one. No diagnosis.
        </h2>
        <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(({ Icon, title, text }, index) => (
            <li key={title} className="relative">
              <div className="flex items-center gap-2">
                <span className="mono flex h-7 w-7 items-center justify-center rounded-full border border-brand/40 bg-brand/10 text-[11px] text-brand">
                  {index + 1}
                </span>
                <Icon size={18} className="text-brand" aria-hidden="true" />
              </div>
              <h3 className="mt-2 text-base">{title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted">{text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-y border-border bg-surface/40">
        <div className="shell py-12 lg:py-16">
          <p className="mono text-[11px] uppercase tracking-[0.16em] text-brand">
            One engine, three settings
          </p>
          <h2 className="mt-2 max-w-2xl text-2xl sm:text-3xl">
            The same detector at any density, around Hyderabad.
          </h2>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {(["village", "ward", "society"] as const).map((mode) => {
              const preset = PRESETS[mode];
              const detail =
                mode === "village"
                  ? "Rural Rangareddy hamlets near Hyderabad. Own low-cost band + LoRa gateway. No internet needed."
                  : mode === "ward"
                    ? "8 towns around Hyderabad, from Patancheru to Uppal. AyuLink bands and existing wearables."
                    : "Apartment towers in Hyderabad's Financial District. Reads existing smartwatches; aggregates only.";
              return (
                <article key={mode} className="card p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-base">{preset.label}</h3>
                    <span className="mono text-[10px] text-muted">
                      {preset.zones.length} zones
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted">{detail}</p>
                  <dl className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-2 text-[11px]">
                    <div>
                      <dt className="text-muted">People / zone</dt>
                      <dd className="mono text-text">{preset.peoplePerZone}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">Band share</dt>
                      <dd className="mono text-text">
                        {(preset.bandFraction * 100).toFixed(0)}%
                      </dd>
                    </div>
                  </dl>
                  <Link
                    href={`/demo?tour=1`}
                    className="mt-3 inline-flex items-center gap-1 text-xs text-info underline underline-offset-2 hover:text-text"
                  >
                    Open in demo <ArrowRight size={12} aria-hidden="true" />
                  </Link>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="shell py-12 lg:py-16">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="mono text-[11px] uppercase tracking-[0.16em] text-brand">
              Real hardware
            </p>
            <h2 className="mt-2 text-2xl sm:text-3xl">Real hardware, not a render.</h2>
            <p className="mt-2 max-w-2xl text-sm text-muted">
              ESP32 DevKit V1, MAX30102 optical pulse sensor, MPU6050, SH1106
              OLED and an SX1278 LoRa radio. Bench-tested; on-wrist validation is
              still pending.
            </p>
          </div>
          <Link href="/hardware" className="btn min-h-10 px-3 text-sm">
            Hardware details <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <PhotoFrame
            src="/hardware/band-hero.jpg"
            alt="AyuLink wristband prototype on an elastic strap: ESP32 board, OLED showing heart rate 71 BPM, SpO2 and skin temperature, with Li-Po battery and USB-C charger"
            caption="AyuLink wristband: OLED vitals, Li-Po + USB-C charging. Real photo, bench test."
            imgClassName="aspect-[3/4]"
          />
          <PhotoFrame
            src="/hardware/band-oled.jpg"
            alt="Close-up of the band's OLED: BPM 71, SpO2 reading, skin temperature 28.9 degrees C, signal icons"
            caption="On-band screen: BPM, SpO2, skin temperature. Bench reading, not clinical."
            imgClassName="aspect-[3/4]"
          />
          <PhotoFrame
            src="/hardware/gateway.jpg"
            alt="AyuLink LoRa gateway prototype: ESP32 with an SX1278 LoRa module and OLED on perfboard, status LEDs lit"
            caption="LoRa gateway: ESP32 + SX1278 + OLED. Real photo; GPS digits blurred."
            imgClassName="aspect-[3/4]"
          />
        </div>
      </section>

      <section className="border-y border-border bg-surface/40">
        <div className="shell py-12 lg:py-16">
          <p className="mono text-[11px] uppercase tracking-[0.16em] text-brand">
            Evidence
          </p>
          <h2 className="mt-2 max-w-2xl text-2xl sm:text-3xl">
            What is borrowed, and what is ours.
          </h2>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {REFERENCES.map((reference) => (
              <a
                key={reference.href}
                href={reference.href}
                target="_blank"
                rel="noreferrer"
                className="card group flex flex-col p-4 no-underline transition-colors hover:border-brand/40"
              >
                <EvidenceBadge label="Published research" />
                <h3 className="mt-3 text-base leading-snug text-text group-hover:text-brand">
                  {reference.title}
                </h3>
                <p className="mt-1 text-[11px] text-muted">{reference.source}</p>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-muted">
                  {reference.note}
                </p>
                <span className="mt-3 inline-flex items-center gap-1 text-xs text-info">
                  Open source <ArrowRight size={12} aria-hidden="true" />
                </span>
              </a>
            ))}
          </div>
          <p className="mt-4 text-xs leading-relaxed text-muted">
            Our differentiator is the population layer: individual wearables
            become a community cluster detector, with a per-person baseline and a
            health-worker-first output. The band and an earlier dashboard are
            prior team work; the detection engine, radar, rhythm model and this web
            app are new for INNOVEX 2026.
          </p>
        </div>
      </section>

      <section className="shell py-12 lg:py-16">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div>
            <p className="mono text-[11px] uppercase tracking-[0.16em] text-watch">
              Honest limits
            </p>
            <h2 className="mt-2 text-2xl sm:text-3xl">What this is not.</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              We would rather show the seam than hide it. These limits are part
              of the product, not a footnote.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/demo?tour=1" className="btn btn-primary">
                Run the demo <ArrowRight size={15} aria-hidden="true" />
              </Link>
              <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="btn">
                <Radio size={15} aria-hidden="true" /> Source
              </a>
            </div>
          </div>
          <ul className="card space-y-2.5 p-4 text-sm leading-relaxed text-muted">
            {LIMITS.map((limit) => (
              <li key={limit} className="flex gap-2">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-watch" />
                {limit}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="border-t border-border">
        <div className="shell flex flex-col items-start justify-between gap-3 py-8 sm:flex-row sm:items-center">
          <div>
            <p className="flex items-center gap-2 font-heading text-lg font-semibold">
              <HeartPulse size={18} className="text-brand" aria-hidden="true" />
              Calm until it matters.
            </p>
            <p className="mt-1 text-sm text-muted">
              A quiet screen that only carries colour when a community needs a
              visit.
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/rhythm" className="btn min-h-10 px-3 text-sm">
              Rhythm Lab
            </Link>
            <Link href="/method" className="btn min-h-10 px-3 text-sm">
              Method
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
