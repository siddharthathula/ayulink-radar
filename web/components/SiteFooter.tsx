import Link from "next/link";
import { BrandMark } from "./SiteHeader";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { href: "/demo", label: "Surveillance console" },
      { href: "/ai", label: "The AI inside" },
      { href: "/configure", label: "Configure a band" },
      { href: "/business", label: "Business model" },
      { href: "/field", label: "Health-worker field app" },
      { href: "/impact", label: "Who, where, when" },
      { href: "/rhythm", label: "Rhythm Lab" },
      { href: "/hardware", label: "Hardware" },
    ],
  },
  {
    title: "Evidence",
    links: [
      { href: "/method", label: "Method & evaluation" },
      { href: "/method#limits", label: "Limitations" },
      { href: "/api-docs", label: "API reference" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="no-print mt-auto border-t border-border bg-surface">
      <div className="shell grid gap-10 py-10 md:grid-cols-[1.4fr_1fr_1fr_1.2fr]">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="rounded-[10px] bg-brandbar p-0.5">
              <BrandMark size={28} />
            </span>
            <p className="font-heading text-base font-bold">AyuLink Radar</p>
          </div>
          <p className="mt-3 max-w-sm text-sm text-muted">
            A community early-warning layer for febrile-illness clusters and irregular pulse
            rhythm. Bands work offline; the operator console syncs when the gateway has a link.
          </p>
        </div>
        {COLUMNS.map((column) => (
          <div key={column.title}>
            <p className="eyebrow">{column.title}</p>
            <ul className="mt-3 space-y-2 text-sm">
              {column.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-text-2 no-underline hover:text-brand">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <div className="rounded-xl border border-amber-100 bg-watch-soft p-4 text-sm">
          <p className="font-semibold text-watch">Screening prototype</p>
          <p className="mt-1 text-text-2">
            Not a medical device. Population data in the console is simulated; 3 physical bands
            exist. Flags are screening signals, never a diagnosis.
          </p>
        </div>
      </div>
      <div className="border-t border-border">
        <div className="shell flex flex-col gap-2 py-4 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>Built by Team AyuLink for INNOVEX 2026 · PS 01 AI-Powered Healthcare</p>
          <p>
            Map data ©{" "}
            <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="text-info">
              OpenStreetMap contributors
            </a>{" "}
            · Rhythm training data: PhysioNet AFDB
          </p>
        </div>
      </div>
    </footer>
  );
}
