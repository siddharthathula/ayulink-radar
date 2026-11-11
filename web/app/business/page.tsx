import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Briefcase,
  Building2,
  CheckCircle2,
  HandCoins,
  HardHat,
  HeartHandshake,
  Hospital,
  Landmark,
  Layers,
  Network,
  Plug,
  Radio,
  Rocket,
  ShieldAlert,
  Tent,
  UserRound,
  Watch,
  WifiOff,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Business",
  description:
    "AyuLink as a business: who pays, how it earns, the market, how it grows from one PHC pilot to a nationwide early-warning layer, and the risks we're managing.",
};

const SOURCES = {
  idc: {
    label: "IDC India Wearable Device Tracker, Mar 2026",
    href: "https://www.idc.com/resource-center/press-releases/india-wearables-market-fy2025/",
  },
  unfpa: {
    label: "UNFPA & IIPS, India Ageing Report 2023",
    href: "https://www.downtoearth.org.in/health/india-will-be-greyer-by-2050-women-will-live-longer-than-men-india-ageing-report-2023-91998",
  },
  lasi: {
    label: "IIPS, LASI Wave 1 factsheet: Elderly in India",
    href: "https://www.iipsindia.ac.in/sites/default/files/other_files/LASI_W1_Elderly_India.pdf",
  },
  asha: {
    label: "Government factsheet via NewKerala, Sep 2026",
    href: "https://www.newkerala.com/news/a/over-1040-lakh-ashas-1058-lakh-anganwadi-workers-427.htm",
  },
};

const MARKET = [
  {
    value: "114.2 M",
    label: "wearables shipped in India in 2025",
    note: "28.9 M were smartwatches. Our city mode can read data people already wear.",
    src: SOURCES.idc,
  },
  {
    value: "149 M → 347 M",
    label: "Indians aged 60+, 2022 → 2050",
    note: "The group that most needs someone watching quietly in the background.",
    src: SOURCES.unfpa,
  },
  {
    value: "1 in 11",
    label: "elderly women live alone (9.0%)",
    note: "5.7% of all people 60+. Their kids are often in another city.",
    src: SOURCES.lasi,
  },
  {
    value: "10.4 lakh",
    label: "ASHA workers across India",
    note: "Each one could start the day with a ranked visit list instead of a guess.",
    src: SOURCES.asha,
  },
];

const SEGMENTS = [
  {
    Icon: Landmark,
    who: "Public health (PHC, district, state)",
    pain: "Outbreaks are counted only after people reach a clinic.",
    gets: "Zone alerts, a 3-day AI forecast and visit lists for ASHAs. Works in villages with no internet.",
    pays: "Per-district annual licence + hardware, via pilot then tender. CSR can fund the bands.",
    first: true,
  },
  {
    Icon: HeartHandshake,
    who: "Families with an elder at home",
    pain: "“Is Amma okay?” — and no way to know until something goes wrong.",
    gets: "Fall alert, SOS with location, and a gentle nudge when her own normal shifts.",
    pays: "Band + monthly subscription.",
  },
  {
    Icon: HardHat,
    who: "Employers with outdoor or shift workers",
    pain: "Heat stress and illness spread through sites and hostels unnoticed.",
    gets: "Site-level clusters and heat-strain signals; worker data stays aggregated.",
    pays: "Per-worker per-month, bundled with safety programmes.",
  },
  {
    Icon: Hospital,
    who: "Hospitals and clinics",
    pain: "Patients go home after a heart-related stay and disappear until they're back in emergency.",
    gets: "Rhythm and drift follow-up from home, with a clean list of who to call.",
    pays: "Per-patient remote-monitoring fee.",
  },
  {
    Icon: Building2,
    who: "Campuses, hostels, gated communities",
    pain: "Shared rooms and kitchens: one sick person becomes twenty in a week.",
    gets: "Tower- or block-level early warning using bands or existing smartwatches.",
    pays: "Annual site licence.",
  },
  {
    Icon: Tent,
    who: "Camps and mass events",
    pain: "Relief camps, pilgrimages and marathons: crowds, no network, no history.",
    gets: "Rent-a-kit: bands + gateway + console for the event, live in a day.",
    pays: "Per-event rental.",
  },
];

const REVENUE = [
  {
    Icon: Layers,
    title: "Software subscription",
    text: "Console, AI forecast, assistant and visit lists — priced per wearer or per site. The recurring core.",
  },
  {
    Icon: Watch,
    title: "Hardware at thin margin",
    text: "Bands and gateways sold near cost. Modular, so nobody pays for sensors they don't need.",
  },
  {
    Icon: Plug,
    title: "Bring-your-own-wearable",
    text: "Read existing smartwatches and phones in cities. No hardware sale — pure software.",
  },
  {
    Icon: Network,
    title: "API licences",
    text: "Wearable brands and insurers plug the cluster and forecast API into their own apps.",
  },
];

const MOAT = [
  {
    Icon: Network,
    title: "Population layer, not just a gadget",
    text: "Every watch tells you about one person. AyuLink tells a district which neighbourhood is turning, 2 days before it alerts (simulated).",
  },
  {
    Icon: WifiOff,
    title: "Works where others can't",
    text: "LoRa bands need no phone and no internet. The same software runs in a metro on smartwatches.",
  },
  {
    Icon: Layers,
    title: "Modular per person",
    text: "One platform, configured per wearer: GPS only for those who need it, ECG only for heart patients.",
  },
  {
    Icon: CheckCircle2,
    title: "Explainable and safe",
    text: "Every alert shows why. No diagnosis, no medicine advice — easier to trust and to approve.",
  },
];

const COMPETITION = [
  {
    who: "Consumer smartwatches",
    does: "Personal readings for the owner.",
    gap: "No community view, need a phone and internet, priced for cities.",
  },
  {
    who: "Hospital remote-monitoring systems",
    does: "Watch patients in or near a hospital.",
    gap: "Tied to a facility; not built for whole villages or wards.",
  },
  {
    who: "Official disease surveillance (IDSP/IHIP)",
    does: "Counts reported cases.",
    gap: "Starts at the clinic. We'd sit upstream and feed it — no integration is claimed today.",
  },
];

const ROADMAP = [
  {
    phase: "Now",
    title: "Working prototype",
    text: "Band, gateway, engine, AI forecast, assistant, console, field app. All evaluated on simulated data.",
  },
  {
    phase: "Next 3 months",
    title: "One PHC pilot near Hyderabad",
    text: "~50 bands, one gateway, one ASHA team. Measure wear, battery, false alarms and real lead time. Partner not yet secured.",
  },
  {
    phase: "6–12 months",
    title: "CSR villages + families",
    text: "CSR-funded hamlets; elder-care subscriptions through families in Hyderabad.",
  },
  {
    phase: "Year 2",
    title: "Employers, hospitals, API",
    text: "Heat-stress programmes, cardiac follow-up, and API access for wearable brands.",
  },
  {
    phase: "Year 3+",
    title: "District to state",
    text: "Licence across districts once pilot numbers hold up.",
  },
];

const RISKS = [
  {
    risk: "Medical-device rules",
    plan: "Stay a screening and wellness tool — no diagnosis — while preparing for CDSCO requirements before any clinical claim.",
  },
  {
    risk: "People stop wearing the band",
    plan: "Comfortable strap, long battery, and the detector already tolerates 60% wear. We measure it in the pilot.",
  },
  {
    risk: "Privacy",
    plan: "Codes not names, GPS off by default, aggregates by default. Designed with India's DPDP Act, 2023 in mind.",
  },
  {
    risk: "False alarms in heat waves",
    plan: "Region-wide guard today; heat-aware forecasting is the next model update. We publish the weak spot.",
  },
  {
    risk: "Real-world performance differs from simulation",
    plan: "That's what the pilot is for. Every number on this site is labelled simulated until then.",
  },
];

function SourceLink({ src }: { src: { label: string; href: string } }) {
  return (
    <a
      href={src.href}
      target="_blank"
      rel="noreferrer"
      className="text-[11px] text-info underline underline-offset-2"
    >
      {src.label}
    </a>
  );
}

export default function BusinessPage() {
  return (
    <div>
      <section className="bg-brandbar text-white">
        <div className="shell grid items-center gap-10 py-12 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:py-16">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[12px] font-semibold text-onbrand ring-1 ring-white/20">
              <Briefcase size={13} aria-hidden="true" /> The business
            </p>
            <h1 className="mt-4 max-w-3xl text-[34px] leading-[1.08] text-white sm:text-[46px]">
              Not another smartwatch. An early-warning service anyone can plug
              into.
            </h1>
            <p className="mt-4 max-w-[62ch] text-[16.5px] leading-relaxed text-onbrand">
              Watches tell one person about themselves. We tell a health worker,
              a family, a factory or a district who needs attention next — and
              we do it on cheap bands that work without internet, or on the
              watches people already own.
            </p>
            <div className="mt-6 flex flex-wrap gap-2.5">
              <Link
                href="/demo?tour=1"
                className="btn h-11 border-white bg-white px-5 font-bold text-[#1b5e3a] hover:bg-[#edf7f1]"
              >
                See the product <ArrowRight size={16} aria-hidden="true" />
              </Link>
              <Link
                href="/configure"
                className="btn h-11 border-white/30 bg-white/10 px-5 text-white shadow-none hover:bg-white/20"
              >
                Configure a band
              </Link>
            </div>
          </div>
          <div className="rounded-2xl bg-white/10 p-5 ring-1 ring-white/15">
            <p className="text-[13px] font-semibold text-onbrand">
              One platform, three ways in
            </p>
            <ul className="mt-3 space-y-3">
              {[
                {
                  Icon: Radio,
                  t: "Our bands + LoRa",
                  d: "Villages, camps, worksites. No phone, no internet.",
                },
                {
                  Icon: Watch,
                  t: "Watches people already own",
                  d: "Cities and campuses. Software only.",
                },
                {
                  Icon: Plug,
                  t: "API",
                  d: "Brands, insurers and hospitals add the radar to their apps.",
                },
              ].map(({ Icon, t, d }) => (
                <li key={t} className="flex gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/15">
                    <Icon size={17} className="text-white" aria-hidden="true" />
                  </span>
                  <span>
                    <span className="block text-[14.5px] font-semibold text-white">
                      {t}
                    </span>
                    <span className="block text-[13px] text-onbrand">{d}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-4 border-t border-white/15 pt-3 text-[12.5px] text-onbrand">
              Same engine, same AI, same console behind all three.
            </p>
          </div>
        </div>
      </section>

      <section className="shell py-12">
        <p className="eyebrow text-brand">The market</p>
        <h2 className="mt-2 text-2xl sm:text-3xl">
          Big, growing and badly served
        </h2>
        <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {MARKET.map((m) => (
            <article key={m.label} className="card flex flex-col p-4">
              <p className="mono text-[28px] font-semibold text-brand">
                {m.value}
              </p>
              <p className="text-[13.5px] font-semibold">{m.label}</p>
              <p className="mt-1.5 flex-1 text-[13px] text-muted">{m.note}</p>
              <p className="mt-3">
                <SourceLink src={m.src} />
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-border bg-surface/40">
        <div className="shell py-12">
          <p className="eyebrow text-brand">Who it&apos;s for</p>
          <h2 className="mt-2 text-2xl sm:text-3xl">
            Same platform, six kinds of customer
          </h2>
          <p className="mt-2 max-w-3xl text-sm text-muted">
            One engine, configured differently. Public health is where we start
            — it&apos;s where the need is sharpest and where an outbreak warning
            matters most.
          </p>
          <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2 xl:grid-cols-3">
            {SEGMENTS.map(({ Icon, who, pain, gets, pays, first }) => (
              <article
                key={who}
                className={`card flex flex-col p-4 ${first ? "ring-2 ring-brand" : ""}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="grid size-9 place-items-center rounded-lg bg-brand-soft text-brand">
                    <Icon size={18} aria-hidden="true" />
                  </span>
                  {first ? (
                    <span className="chip chip-brand">First customer</span>
                  ) : null}
                </div>
                <h3 className="mt-3 text-[16px]">{who}</h3>
                <p className="mt-1.5 text-[13px] italic text-text-2">{pain}</p>
                <p className="mt-2 flex-1 text-[13px] text-text-2">{gets}</p>
                <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-surface-2 p-2.5 text-[12.5px] text-text-2">
                  <HandCoins
                    size={14}
                    className="mt-0.5 shrink-0 text-brand"
                    aria-hidden="true"
                  />
                  {pays}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="shell grid grid-cols-[minmax(0,1fr)] gap-8 py-12 lg:grid-cols-2">
        <div>
          <p className="eyebrow text-brand">How it earns</p>
          <h2 className="mt-2 text-2xl sm:text-3xl">
            Recurring software, not one-off gadgets
          </h2>
          <ul className="mt-5 space-y-3">
            {REVENUE.map(({ Icon, title, text }) => (
              <li key={title} className="flex gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
                  <Icon size={17} aria-hidden="true" />
                </span>
                <span>
                  <span className="block text-[14.5px] font-semibold">
                    {title}
                  </span>
                  <span className="block text-[13.5px] text-muted">{text}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-5 rounded-xl border border-border bg-surface-2 p-3.5 text-[13px] text-text-2">
            <b>Pricing:</b> set after the pilot. We&apos;d rather publish real
            costs — band build, battery life, gateway coverage, support time per
            site — than guess a number for a slide.
          </p>
        </div>
        <div>
          <p className="eyebrow text-brand">Why we win</p>
          <h2 className="mt-2 text-2xl sm:text-3xl">
            What&apos;s hard to copy
          </h2>
          <div className="mt-5 grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
            {MOAT.map(({ Icon, title, text }) => (
              <article key={title} className="card p-4">
                <Icon size={19} className="text-brand" aria-hidden="true" />
                <h3 className="mt-2 text-[15px]">{title}</h3>
                <p className="mt-1 text-[13px] text-muted">{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-surface/40">
        <div className="shell py-12">
          <p className="eyebrow text-brand">Alternatives</p>
          <h2 className="mt-2 text-2xl sm:text-3xl">
            What people use today, and the gap
          </h2>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-[13.5px]">
              <thead className="text-[11px] uppercase tracking-wide text-muted">
                <tr>
                  <th className="py-2 pr-4 font-semibold">Option</th>
                  <th className="py-2 pr-4 font-semibold">What it does</th>
                  <th className="py-2 font-semibold">What it misses</th>
                </tr>
              </thead>
              <tbody>
                {COMPETITION.map((c) => (
                  <tr key={c.who} className="border-t border-border">
                    <td className="py-2.5 pr-4 font-semibold">{c.who}</td>
                    <td className="py-2.5 pr-4 text-text-2">{c.does}</td>
                    <td className="py-2.5 text-text-2">{c.gap}</td>
                  </tr>
                ))}
                <tr className="border-t border-border bg-brand-soft">
                  <td className="py-2.5 pr-4 font-bold text-brand-strong">
                    AyuLink
                  </td>
                  <td className="py-2.5 pr-4 text-text-2">
                    Personal baseline + neighbourhood alert + 3-day AI forecast
                    + visit list.
                  </td>
                  <td className="py-2.5 text-text-2">
                    Not yet proven on real patients — the pilot fixes that.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="shell py-12">
        <p className="eyebrow text-brand">Go to market</p>
        <h2 className="mt-2 text-2xl sm:text-3xl">From one PHC to a state</h2>
        <ol className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-5">
          {ROADMAP.map((r, i) => (
            <li key={r.phase} className="card relative p-4">
              <span className="mono text-[11px] text-muted">
                {String(i + 1).padStart(2, "0")} · {r.phase}
              </span>
              <h3 className="mt-1.5 flex items-center gap-1.5 text-[15px]">
                {i === 0 ? (
                  <CheckCircle2
                    size={15}
                    className="text-brand"
                    aria-hidden="true"
                  />
                ) : (
                  <Rocket size={15} className="text-muted" aria-hidden="true" />
                )}
                {r.title}
              </h3>
              <p className="mt-1.5 text-[13px] text-muted">{r.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-t border-border bg-surface/40">
        <div className="shell grid grid-cols-[minmax(0,1fr)] gap-8 py-12 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <div>
            <p className="eyebrow text-watch">Risks</p>
            <h2 className="mt-2 text-2xl sm:text-3xl">
              What could go wrong, and our plan
            </h2>
            <ul className="mt-5 space-y-2.5">
              {RISKS.map((r) => (
                <li key={r.risk} className="card flex gap-3 p-3.5">
                  <ShieldAlert
                    size={17}
                    className="mt-0.5 shrink-0 text-[var(--watch)]"
                    aria-hidden="true"
                  />
                  <span>
                    <span className="block text-[14px] font-semibold">
                      {r.risk}
                    </span>
                    <span className="block text-[13px] text-muted">
                      {r.plan}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="card self-start p-5">
            <p className="flex items-center gap-2 text-[15px] font-bold">
              <UserRound size={17} className="text-brand" aria-hidden="true" />{" "}
              What we need next
            </p>
            <ul className="mt-3 space-y-2 text-[13.5px] text-text-2">
              <li>
                • A PHC or NGO willing to host a 50-band pilot near Hyderabad.
              </li>
              <li>
                • A clinician to co-design the visit protocol and review alerts.
              </li>
              <li>• Funding for the first batch of bands and gateways.</li>
            </ul>
            <p className="mt-4 text-[12px] text-muted">
              No pilot, partner, customer or government approval exists yet.
              Everything above is the plan.
            </p>
            <Link href="/impact" className="btn btn-primary mt-4">
              Who, where, when <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
