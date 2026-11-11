"use client";

import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  CheckCircle2,
  CircleDashed,
  Download,
  HeartPulse,
  Hospital,
  ListChecks,
  MinusCircle,
  UserRound,
} from "lucide-react";
import type { QueueRow } from "@/lib/engine/queue";
import type { SimResult } from "@/lib/engine/types";
import type { CaseEntry } from "@/lib/ui/hooks";
import {
  CASE_LABEL,
  FIELD_WORKERS,
  defaultWorker,
  downloadText,
  toCsv,
  type CaseStatus,
} from "@/lib/ui/ops";
import { displayDay } from "@/lib/ui/demo";

interface Props {
  result: SimResult;
  rows: QueueRow[];
  day: number;
  log: Record<string, CaseEntry>;
  onUpdate: (personId: string, entry: Partial<CaseEntry> & { updatedDay: number }) => void;
  onOpen: (personId: string) => void;
}

const STATUS_STYLE: Record<CaseStatus, { className: string; Icon: typeof CheckCircle2 }> = {
  pending: { className: "chip", Icon: CircleDashed },
  visited: { className: "chip chip-brand", Icon: CheckCircle2 },
  referred: { className: "chip chip-alert", Icon: Hospital },
  dismissed: { className: "chip", Icon: MinusCircle },
};

type Filter = "open" | "all" | "done";

export function VisitPanel({ result, rows, day, log, onUpdate, onOpen }: Props) {
  const [filter, setFilter] = useState<Filter>("open");
  const zoneIndex = useMemo(
    () => new Map(result.zones.map((zone, index) => [zone.id, index])),
    [result.zones],
  );

  const enriched = rows.map((row) => {
    const entry = log[row.person.id];
    return {
      row,
      status: entry?.status ?? ("pending" as CaseStatus),
      worker: entry?.worker ?? defaultWorker(zoneIndex.get(row.person.zoneId) ?? 0),
    };
  });

  const counts = {
    pending: enriched.filter((item) => item.status === "pending").length,
    visited: enriched.filter((item) => item.status === "visited").length,
    referred: enriched.filter((item) => item.status === "referred").length,
  };

  const shown = enriched.filter((item) =>
    filter === "all" ? true : filter === "open" ? item.status === "pending" : item.status !== "pending",
  );

  function exportCsv() {
    const header = ["rank", "person_code", "zone", "age", "sex", "score", "status", "assigned_to", "reasons", "day"];
    const body = enriched.map((item, index) => [
      index + 1,
      item.row.person.id,
      item.row.zoneName,
      item.row.person.age,
      item.row.person.sex,
      Math.round(item.row.score),
      CASE_LABEL[item.status],
      item.worker,
      item.row.reasons.join("; "),
      displayDay(day),
    ]);
    downloadText(
      `ayulink-visit-list-${result.config.mode}-day${displayDay(day)}.csv`,
      `# AyuLink Radar visit list. SIMULATED DATA. Screening flags, not diagnoses.\n${toCsv([header, ...body])}\n`,
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex min-h-[220px] flex-col items-center justify-center gap-2 px-4 py-8 text-center">
        <ListChecks size={22} className="text-muted" aria-hidden="true" />
        <p className="text-sm font-semibold">No one needs a visit today.</p>
        <p className="max-w-[260px] text-xs text-muted">
          The list shows people whose visit-first score is 20 or more.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-surface-2 p-2 text-center">
          <p className="mono text-lg font-semibold">{counts.pending}</p>
          <p className="text-[10.5px] text-muted">to visit</p>
        </div>
        <div className="rounded-lg bg-brand-soft p-2 text-center">
          <p className="mono text-lg font-semibold text-brand-strong">{counts.visited}</p>
          <p className="text-[10.5px] text-muted">visited</p>
        </div>
        <div className="rounded-lg bg-alert-soft p-2 text-center">
          <p className="mono text-lg font-semibold text-alert">{counts.referred}</p>
          <p className="text-[10.5px] text-muted">referred</p>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="segmented" role="group" aria-label="Filter visit list">
          {(["open", "done", "all"] as Filter[]).map((value) => (
            <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>
              {value === "open" ? "Open" : value === "done" ? "Actioned" : "All"}
            </button>
          ))}
        </div>
        <button type="button" onClick={exportCsv} className="btn min-h-9 px-3 text-xs">
          <Download size={13} aria-hidden="true" /> CSV
        </button>
      </div>

      <ol className="mt-3 space-y-2">
        {shown.slice(0, 30).map(({ row, status, worker }) => {
          const rank = enriched.findIndex((item) => item.row.person.id === row.person.id) + 1;
          const style = STATUS_STYLE[status];
          return (
            <li key={row.person.id} className="animate-rise rounded-xl border border-border bg-surface p-3 shadow-[var(--shadow-sm)]">
              <div className="flex items-start gap-3">
                <span
                  className={`mono flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[12px] font-semibold ${
                    rank <= 3 ? "bg-alert-soft text-alert" : "bg-surface-2 text-muted"
                  }`}
                >
                  {rank}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                    <button
                      type="button"
                      onClick={() => onOpen(row.person.id)}
                      className="mono inline-flex items-center gap-1 text-[13.5px] font-semibold text-text hover:text-brand"
                    >
                      {row.person.id}
                      <ArrowUpRight size={13} aria-hidden="true" />
                    </button>
                    <span className={style.className}>
                      <style.Icon size={11} aria-hidden="true" />
                      {CASE_LABEL[status]}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11.5px] text-muted">
                    {row.zoneName} · {row.person.age}
                    {row.person.sex} · score <span className="mono">{row.score.toFixed(0)}</span>
                    {row.rhr !== null && row.baseline !== null ? (
                      <>
                        {" "}· <HeartPulse size={11} className="inline text-vitals" aria-hidden="true" />{" "}
                        <span className="mono">{row.rhr.toFixed(0)}</span> vs{" "}
                        <span className="mono">{row.baseline.toFixed(0)}</span> bpm
                      </>
                    ) : null}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {row.reasons.slice(0, 3).map((reason) => (
                      <span
                        key={reason}
                        className={`chip text-[10.5px] ${
                          reason.startsWith("Irregular")
                            ? "chip-rhythm"
                            : reason.startsWith("Zone on cluster")
                              ? "chip-alert"
                              : reason.startsWith("Resting")
                                ? "chip-watch"
                                : ""
                        }`}
                      >
                        {reason}
                      </span>
                    ))}
                  </div>
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    <label className="inline-flex items-center gap-1 text-[11px] text-muted">
                      <UserRound size={12} aria-hidden="true" />
                      <select
                        value={worker}
                        onChange={(event) =>
                          onUpdate(row.person.id, { worker: event.target.value, updatedDay: day })
                        }
                        className="h-8 rounded-md border border-border bg-surface px-1.5 text-[11.5px] text-text"
                        aria-label={`Assign ${row.person.id}`}
                      >
                        {FIELD_WORKERS.map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="ml-auto flex gap-1">
                      <button
                        type="button"
                        onClick={() => onUpdate(row.person.id, { status: "visited", updatedDay: day })}
                        className="btn min-h-8 px-2 text-[11px]"
                        aria-pressed={status === "visited"}
                      >
                        <CheckCircle2 size={12} aria-hidden="true" /> Visited
                      </button>
                      <button
                        type="button"
                        onClick={() => onUpdate(row.person.id, { status: "referred", updatedDay: day })}
                        className="btn min-h-8 px-2 text-[11px]"
                        aria-pressed={status === "referred"}
                      >
                        <Hospital size={12} aria-hidden="true" /> Refer
                      </button>
                      {status !== "pending" ? (
                        <button
                          type="button"
                          onClick={() => onUpdate(row.person.id, { status: "pending", updatedDay: day })}
                          className="btn btn-ghost min-h-8 px-2 text-[11px] text-muted"
                        >
                          Undo
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      {shown.length > 30 ? <p className="mt-2 text-[11px] text-muted">Showing 30 of {shown.length}.</p> : null}
      <p className="mt-3 text-[10.5px] text-muted">
        Case actions are stored in this browser only. Field-worker codes are placeholders.
      </p>
    </div>
  );
}
