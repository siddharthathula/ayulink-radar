"use client";

import { ArrowRight, ListOrdered } from "lucide-react";
import type { QueueRow } from "@/lib/engine/queue";

interface Props {
  rows: QueueRow[];
  onOpen: (personId: string) => void;
}

export function QueuePanel({ rows, onOpen }: Props) {
  if (rows.length === 0) {
    return (
      <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-2 px-4 py-8 text-center">
        <ListOrdered size={20} className="text-muted" aria-hidden="true" />
        <p className="text-sm text-text">No visit-first rows for this day.</p>
        <p className="max-w-[260px] text-xs text-muted">
          The queue only shows people with a screening score of 20 or more.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-2 text-[11px] text-muted">
        Ranked by the engine&apos;s visit-first score. Only score ≥ 20 is shown.
      </p>
      <ol className="space-y-2">
        {rows.slice(0, 20).map((row, index) => (
          <li
            key={row.person.id}
            className="rounded-xl border border-border bg-bg/40 p-3"
          >
            <div className="flex items-start gap-3">
              <span className="mono mt-0.5 w-5 shrink-0 text-xs text-muted">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                  <p className="mono text-sm font-medium">{row.person.id}</p>
                  <p className="mono text-[11px] text-muted">{row.score.toFixed(0)} pts</p>
                </div>
                <p className="text-[11px] text-muted">
                  {row.zoneName} · {row.person.age}
                  {row.person.sex === "F" ? "F" : "M"}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {row.reasons.slice(0, 3).map((reason) => (
                    <span key={reason} className="chip min-h-6 text-[10px]">
                      {reason}
                    </span>
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onOpen(row.person.id)}
                className="btn min-h-9 shrink-0 px-2.5 text-xs"
                aria-label={`Open ${row.person.id}`}
              >
                Open <ArrowRight size={12} aria-hidden="true" />
              </button>
            </div>
          </li>
        ))}
      </ol>
      {rows.length > 20 ? (
        <p className="mt-2 text-[11px] text-muted">
          Showing 20 of {rows.length} rows.
        </p>
      ) : null}
    </div>
  );
}
