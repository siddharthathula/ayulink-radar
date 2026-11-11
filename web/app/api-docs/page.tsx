import type { Metadata } from "next";
import { Braces, Server, ShieldCheck } from "lucide-react";
import { DESCRIPTIONS } from "@/lib/api/docs";
import { CopyBlock } from "@/components/CopyBlock";
import { LIVE_URL } from "@/lib/results";

export const metadata: Metadata = { title: "API" };

const ORDER = ["engine", "rhythm", "triage", "ingest"] as const;

export default function ApiDocsPage() {
  return (
    <div className="shell py-10">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-[calc(var(--header-h)+24px)] lg:self-start">
          <p className="eyebrow text-brand">Backend</p>
          <h1 className="mt-2 text-3xl">API reference</h1>
          <p className="mt-3 text-sm text-muted">
            Four stateless endpoints. Same engine code as the browser. No database, no login, nothing
            stored.
          </p>
          <nav className="mt-6 space-y-1" aria-label="Endpoints">
            {ORDER.map((id) => (
              <a key={id} href={`#${id}`} className="flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium text-text-2 no-underline hover:bg-surface-2">
                <span className="mono">{DESCRIPTIONS[id].path}</span>
                <span className="chip chip-brand">POST</span>
              </a>
            ))}
          </nav>
          <div className="mt-6 space-y-3 rounded-xl border border-border bg-surface p-4 text-[13px] text-text-2">
            <p className="flex items-start gap-2"><Server size={15} className="mt-0.5 shrink-0 text-brand" aria-hidden="true" />Runs as serverless functions next to the web app.</p>
            <p className="flex items-start gap-2"><ShieldCheck size={15} className="mt-0.5 shrink-0 text-brand" aria-hidden="true" />Bodies capped at 10 KB. Strict input checks. Errors are plain 400s.</p>
            <p className="flex items-start gap-2"><Braces size={15} className="mt-0.5 shrink-0 text-brand" aria-hidden="true" />GET on any endpoint returns its description and an example body.</p>
          </div>
        </aside>

        <div className="space-y-8">
          <section className="card-raised overflow-hidden">
            <div className="bg-brandbar px-6 py-5 text-white">
              <p className="text-sm font-semibold text-onbrand">Where the API sits</p>
              <div className="mono mt-3 flex flex-wrap items-center gap-2 text-[12.5px]">
                {["Band (offline)", "LoRa", "Gateway buffer", "/api/ingest", "/api/rhythm", "Engine", "Console · Field app"].map((step, index, all) => (
                  <span key={step} className="flex items-center gap-2">
                    <span className="rounded-md bg-white/10 px-2 py-1 ring-1 ring-white/20">{step}</span>
                    {index < all.length - 1 ? <span className="text-onbrand">→</span> : null}
                  </span>
                ))}
              </div>
            </div>
            <p className="px-6 py-4 text-sm text-muted">
              Patients never need internet. The gateway syncs whenever its uplink is up; the console and
              these endpoints are the only online parts.
            </p>
          </section>

          {ORDER.map((id) => {
            const doc = DESCRIPTIONS[id];
            const body = JSON.stringify(doc.example);
            return (
              <section key={id} id={id} className="card scroll-mt-24 p-6">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="chip chip-brand">POST</span>
                  <code className="mono text-[15px] font-semibold">{doc.path}</code>
                </div>
                <h2 className="mt-3 text-xl">{doc.title}</h2>
                <p className="mt-2 max-w-3xl text-[14.5px] text-text-2">{doc.purpose}</p>
                <p className="mt-1 text-sm text-muted">Used by: {doc.who}</p>
                <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-text-2">
                  {doc.notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
                <div className="mt-4">
                  <CopyBlock
                    label="curl"
                    code={`curl -s -X POST ${LIVE_URL}${doc.path} \\\n  -H 'Content-Type: application/json' \\\n  -d '${body}'`}
                  />
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
