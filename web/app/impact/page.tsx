import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Building2,
  CalendarDays,
  CloudRain,
  Flame,
  Hospital,
  Landmark,
  MapPin,
  Mountain,
  School,
  Sun,
  Tent,
  TrendingUp,
  Users,
  UserRound,
  Waves,
} from "lucide-react";
import { gridRow } from "@/lib/results";

export const metadata: Metadata = { title: "Impact — who, where, when" };

const USERS = [
  { Icon: UserRound, who: "ASHA / ANM", does: "Gets her own ranked visit list and a note in her language. Records a 30-second visit offline.", gets: "Knows which house to visit first, today." },
  { Icon: Hospital, who: "PHC medical officer", does: "Sees every hamlet on one console. Prints a situation report.", gets: "A cluster flagged days before the clinic queue fills." },
  { Icon: Landmark, who: "District surveillance officer", does: "Watches many PHCs at once on the surveillance grid.", gets: "Where to send rapid-response teams and test kits." },
  { Icon: Building2, who: "Urban ward / society health desk", does: "Reads existing smartwatches. Aggregate view only.", gets: "Early fever clusters in colonies and towers." },
];

const PLACES = [
  { Icon: Mountain, title: "Tribal and forest belts", text: "Scattered hamlets, weak mobile signal, long walks to a PHC. LoRa gateways cover them without internet." },
  { Icon: MapPin, title: "Villages under a PHC", text: "The core pilot: one PHC, its ASHAs, a few hundred bands, one gateway per cluster of hamlets." },
  { Icon: Building2, title: "Cities around Hyderabad", text: "Patancheru, Kukatpally, Medchal, Secunderabad, Gachibowli, Shamshabad, LB Nagar, Uppal: mixed bands and smartwatches, one console for the metro." },
  { Icon: Users, title: "Mass gatherings", text: "Temporary camps for jataras and melas: many people, short time, high transmission risk." },
  { Icon: Tent, title: "Flood and relief camps", text: "Crowded shelters after floods, where fever spreads fast and records are scarce." },
  { Icon: School, title: "Hostels and residential schools", text: "Shared rooms and kitchens. A cluster is visible within days." },
];

const SEASONS = [
  { months: "Jan – Feb", Icon: Users, title: "Gatherings and winter fevers", text: "Large festivals and winter respiratory illness. Short, crowded windows.", tone: "info" },
  { months: "Mar – May", Icon: Sun, title: "Heat season", text: "Heat lifts everyone's heart rate at once. The region-wide guard stops this from looking like a local outbreak.", tone: "watch" },
  { months: "Jun – Sep", Icon: CloudRain, title: "Monsoon", text: "Water-logging, mosquitoes, contaminated water. The main season for febrile clusters.", tone: "alert" },
  { months: "Oct – Nov", Icon: Waves, title: "Post-monsoon peak", text: "Mosquito-borne fevers often keep rising after the rains end.", tone: "alert" },
  { months: "Dec", Icon: Flame, title: "Baseline building", text: "Quieter months let every wearer's personal baseline settle before the next season.", tone: "brand" },
];

const TONE: Record<string, string> = {
  info: "border-blue-100 bg-info-soft text-info",
  watch: "border-amber-100 bg-watch-soft text-watch",
  alert: "border-red-100 bg-alert-soft text-alert",
  brand: "border-green-100 bg-brand-soft text-brand-strong",
};

const FACTS = [
  {
    value: "10.4 lakh",
    label: "ASHA workers in India",
    note: "Government factsheet, Sep 2026. The workforce that would act on every alert already exists.",
    href: "https://www.newkerala.com/news/a/over-1040-lakh-ashas-1058-lakh-anganwadi-workers-427.htm",
  },
  {
    value: "2,33,519",
    label: "dengue cases reported in 2024",
    note: "NCVBDC surveillance count for one disease in one year.",
    href: "https://www.aljazeera.com/news/2026/6/11/why-indias-deadly-dengue-crisis-is-now-no-longer-confined-to-the-monsoons",
  },
  {
    value: "297 vs 2,340",
    label: "dengue deaths in 2024: surveillance vs death certificates",
    note: "Routine surveillance saw a fraction of what medical certification later recorded. The gap is the problem.",
    href: "https://thesouthfirst.com/health/dengue-paradox-registrar-general-records-688-more-deaths-than-health-ministry/",
  },
  {
    value: "1.6 crore+",
    label: "cumulative visitors, Medaram Maha Jatara 2026",
    note: "One four-day tribal festival in Mulugu, Telangana. Mass gatherings need fast fever signals.",
    href: "https://www.deccanchronicle.com/amp/southern-states/telangana/curtains-go-down-at-medaram-with-tribal-deities-retreating-into-forest-1934094",
  },
];

const ROLLOUT = [
  { step: "Pilot", scope: "1 PHC · ~200 bands · 8 weeks", goal: "Wear compliance, battery life, real false-alert rate against the PHC fever register." },
  { step: "Block", scope: "5–10 PHCs", goal: "ASHA workflow at scale, gateway placement, training time." },
  { step: "District", scope: "One district surveillance unit", goal: "Console used by the district team beside its existing reporting." },
  { step: "State", scope: "Seasonal deployment in high-risk blocks", goal: "Bands moved to where the season needs them; data feeds existing systems." },
];

export default function ImpactPage() {
  const village = gridRow("village", 0.8, "D4");
  const village60 = gridRow("village", 0.6, "D4");
  const village40 = gridRow("village", 0.4, "D4");
  const pct = (value: number | null | undefined) => (value === null || value === undefined ? "TBD" : `${Math.round(value * 1000) / 10}%`);

  return (
    <div>
      <section className="border-b border-border bg-surface">
        <div className="shell py-12 lg:py-16">
          <p className="eyebrow text-brand">Impact</p>
          <h1 className="mt-2 max-w-4xl text-3xl sm:text-5xl">Who uses it, where, and when.</h1>
          <p className="mt-4 max-w-3xl text-[16px] text-text-2">
            AyuLink Radar is built for the places where an outbreak is noticed last: hamlets far from a
            clinic, crowded camps, colonies where nobody reports a fever until it is serious. The bands
            work without internet; only the console does.
          </p>
          <dl className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {FACTS.map((fact) => (
              <div key={fact.label} className="card p-4">
                <dt className="mono text-2xl font-semibold text-brand-strong">{fact.value}</dt>
                <dd className="mt-1 text-[13.5px] font-semibold">{fact.label}</dd>
                <dd className="mt-1 text-[12.5px] text-muted">
                  {fact.note}{" "}
                  <a href={fact.href} target="_blank" rel="noreferrer" className="text-info underline underline-offset-2">
                    Source
                  </a>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="shell py-12">
        <h2 className="text-2xl sm:text-3xl">Who uses it</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {USERS.map(({ Icon, who, does, gets }) => (
            <article key={who} className="card p-5">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft text-brand">
                <Icon size={19} aria-hidden="true" />
              </span>
              <h3 className="mt-3 text-lg">{who}</h3>
              <p className="mt-1 text-[13.5px] text-text-2">{does}</p>
              <p className="mt-3 rounded-lg bg-surface-2 p-2.5 text-[13px] font-medium">{gets}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-border bg-surface">
        <div className="shell py-12">
          <h2 className="text-2xl sm:text-3xl">Where it fits</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {PLACES.map(({ Icon, title, text }) => (
              <article key={title} className="flex gap-4 rounded-2xl border border-border bg-bg p-5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-vitals-soft text-vitals">
                  <Icon size={19} aria-hidden="true" />
                </span>
                <div>
                  <h3 className="text-[16px]">{title}</h3>
                  <p className="mt-1 text-[13.5px] text-text-2">{text}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="shell py-12">
        <div className="flex items-center gap-2">
          <CalendarDays size={22} className="text-brand" aria-hidden="true" />
          <h2 className="text-2xl sm:text-3xl">When it matters most</h2>
        </div>
        <p className="mt-2 max-w-3xl text-[14.5px] text-muted">
          A typical year in Telangana and much of India. Seasons shift by region, and fevers are no longer
          confined to the monsoon; the console runs all year so baselines are ready when a season starts.
        </p>
        <ol className="mt-6 grid gap-3 md:grid-cols-5">
          {SEASONS.map(({ months, Icon, title, text, tone }) => (
            <li key={months} className={`rounded-2xl border p-4 ${TONE[tone]}`}>
              <p className="mono text-[12px] font-semibold uppercase tracking-wide">{months}</p>
              <p className="mt-2 flex items-center gap-2 text-[15px] font-bold">
                <Icon size={16} aria-hidden="true" /> {title}
              </p>
              <p className="mt-1 text-[13px] text-text-2">{text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-y border-border bg-surface">
        <div className="shell grid gap-8 py-12 lg:grid-cols-2">
          <div>
            <div className="flex items-center gap-2">
              <TrendingUp size={22} className="text-brand" aria-hidden="true" />
              <h2 className="text-2xl sm:text-3xl">How it scales across India</h2>
            </div>
            <ol className="mt-6 space-y-3">
              {ROLLOUT.map((row, index) => (
                <li key={row.step} className="flex gap-4 rounded-2xl border border-border bg-bg p-4">
                  <span className="mono flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand text-[14px] font-bold text-[var(--brand-ink)]">
                    {index + 1}
                  </span>
                  <div>
                    <p className="text-[15px] font-bold">
                      {row.step} <span className="font-normal text-muted">· {row.scope}</span>
                    </p>
                    <p className="mt-0.5 text-[13.5px] text-text-2">{row.goal}</p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-4 text-[13px] text-muted">
              The engine is stateless and runs in a browser or a serverless function, so adding a district
              adds bands and gateways, not servers. Pilot plan is proposed, not started; no partner yet.
            </p>
          </div>
          <div>
            <h3 className="text-xl">What it needs to work: band wear</h3>
            <p className="mt-2 text-[14px] text-text-2">
              The honest limit from our own simulated evaluation (village setting, full engine, test seeds):
            </p>
            <div className="mt-4 grid grid-cols-3 gap-3">
              {[
                { wear: "80% wear daily", value: pct(village?.detectionRate), tone: "chip-brand" },
                { wear: "60% wear daily", value: pct(village60?.detectionRate), tone: "chip-watch" },
                { wear: "40% wear daily", value: pct(village40?.detectionRate), tone: "chip-alert" },
              ].map((row) => (
                <div key={row.wear} className="card p-4 text-center">
                  <p className="mono text-2xl font-semibold">{row.value}</p>
                  <p className="mt-1 text-[12px] text-muted">clusters detected</p>
                  <span className={`chip mt-2 ${row.tone}`}>{row.wear}</span>
                </div>
              ))}
            </div>
            <p className="mt-4 text-[13.5px] text-text-2">
              The community signal needs about 80% daily wear; at 60% only about half of clusters are caught. So the pilot measures wear first, and
              ASHA home visits double as a nudge to wear and charge the band. These are simulation results,
              not field results.
            </p>
            <Link href="/method" className="mt-4 inline-flex items-center gap-1.5 text-[14px] font-semibold text-brand">
              Full evaluation and limits <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      <section className="shell py-12">
        <div className="card-raised flex flex-col items-start justify-between gap-4 p-6 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-xl">See it work in 30 seconds</h2>
            <p className="mt-1 text-[14px] text-muted">A simulated village, a seeded fever cluster, and the alert that comes before the clinic.</p>
          </div>
          <Link href="/demo?tour=1" className="btn btn-primary h-11 px-5">
            Run the guided demo <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </section>
    </div>
  );
}
