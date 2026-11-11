"use client";

import { Activity, HelpCircle, ListChecks, MapPinned, PlayCircle, X } from "lucide-react";

const STEPS = [
  {
    Icon: PlayCircle,
    title: "1 · Start a scenario",
    text: "Press Simulate cluster. 32 days play out on a simulated village of wearers.",
  },
  {
    Icon: Activity,
    title: "2 · Watch the dots",
    text: "Orange dots are people whose resting heart rate is above their OWN normal for 2+ days.",
  },
  {
    Icon: MapPinned,
    title: "3 · Watch the zones",
    text: "When many people in one zone drift together, it turns orange (watch) then red (alert).",
  },
  {
    Icon: ListChecks,
    title: "4 · Act",
    text: "Open the Visit list. It ranks who a health worker should see first, with a note in her language.",
  },
];

export function HelpCard({ onDismiss }: { onDismiss: () => void }) {
  return (
    <section className="animate-rise mt-4 rounded-2xl border border-green-100 bg-brand-soft p-4" aria-label="How to read this console">
      <div className="flex items-start justify-between gap-3">
        <p className="flex items-center gap-2 text-[14px] font-bold text-brand-strong">
          <HelpCircle size={16} aria-hidden="true" /> New here? How to read this console in 20 seconds
        </p>
        <button
          type="button"
          onClick={onDismiss}
          className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[12px] font-semibold text-text-2 hover:bg-surface"
          title="Hide hints (you can turn them back on in Settings)"
        >
          Got it <X size={13} aria-hidden="true" />
        </button>
      </div>
      <ol className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {STEPS.map(({ Icon, title, text }) => (
          <li key={title} className="flex gap-3 rounded-xl bg-surface p-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
              <Icon size={16} aria-hidden="true" />
            </span>
            <div>
              <p className="text-[13px] font-semibold">{title}</p>
              <p className="mt-0.5 text-[12.5px] leading-snug text-muted">{text}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-[11.5px] text-muted">
        Everything here is simulated and runs in your browser. Hover the ⓘ icons for plain-language meanings. Settings (gear icon, top right) changes theme, map style and language.
      </p>
    </section>
  );
}
