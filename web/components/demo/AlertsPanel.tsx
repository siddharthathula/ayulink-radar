"use client";

import { useState } from "react";
import { Eye, Info, TriangleAlert } from "lucide-react";
import type { SimResult, ZoneDay } from "@/lib/engine/types";
import { displayDay, qualityExclusions, zoneName } from "@/lib/ui/demo";

interface Props {
  result: SimResult;
  day: number;
  rows: ZoneDay[];
  selectedZoneId: string | null;
  onClearZone: () => void;
  scenarioHint: boolean;
}

function pValue(value: number): string {
  if (value < 0.0001) return value.toExponential(1);
  return value.toFixed(4);
}

export function AlertsPanel({
  result,
  rows,
  selectedZoneId,
  onClearZone,
  scenarioHint,
}: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const zoneCount = result.zones.length;

  if (rows.length === 0) {
    return (
      <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-2 px-4 py-8 text-center">
        <Info size={20} className="text-muted" aria-hidden="true" />
        <p className="text-sm text-text">No clusters detected. That is the normal state.</p>
        <p className="max-w-[260px] text-xs text-muted">
          {scenarioHint
            ? "Press Simulate cluster to run the 60-day scenario."
            : "No zone crossed the watch threshold on or before this day."}
        </p>
      </div>
    );
  }

  // Group the day-by-day feed into one card per zone: latest status first,
  // with the full history one click away.
  const groups: Array<{ zoneId: string; latest: ZoneDay; history: ZoneDay[] }> = [];
  for (const row of rows) {
    const group = groups.find((item) => item.zoneId === row.zoneId);
    if (group) group.history.push(row);
    else groups.push({ zoneId: row.zoneId, latest: row, history: [row] });
  }

  return (
    <div className="space-y-2.5">
      {selectedZoneId ? (
        <button type="button" onClick={onClearZone} className="text-[11.5px] font-medium text-info hover:underline">
          Clear zone filter · {zoneName(result, selectedZoneId)}
        </button>
      ) : null}

      {groups.map(({ zoneId, latest: row, history }) => {
        const id = `${row.zoneId}-${row.day}`;
        const open = openId === id;
        const isAlert = row.level === "alert";
        const firstDay = history[history.length - 1].day;
        const exclusions = qualityExclusions(result, row.zoneId, row.day);
        const threshold = isAlert
          ? `0.001 / ${zoneCount} = ${(0.001 / zoneCount).toExponential(2)}`
          : `0.01 / ${zoneCount} = ${(0.01 / zoneCount).toExponential(2)}`;

        return (
          <article
            key={zoneId}
            className={`animate-rise overflow-hidden rounded-xl border bg-surface shadow-[var(--shadow-sm)] ${
              isAlert ? "border-red-100" : "border-amber-100"
            }`}
          >
            <div className={`flex items-center justify-between gap-2 px-3 py-2 ${isAlert ? "bg-[var(--red-600)] text-white" : "bg-watch-soft text-watch"}`}>
              <p className="flex items-center gap-1.5 text-[13px] font-bold">
                {isAlert ? <TriangleAlert size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}
                {isAlert ? "Cluster alert" : "Watch"} · {zoneName(result, row.zoneId)}
              </p>
              <p className="mono text-[11px] font-semibold opacity-90">Day {displayDay(row.day)}</p>
            </div>
            <div className="p-3">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="mono text-[22px] font-semibold leading-none">
                    {row.k}
                    <span className="text-[13px] font-normal text-muted"> / {row.n} wearers</span>
                  </p>
                  <p className="mt-1 text-[11.5px] text-muted">drifting together · 3-day window</p>
                </div>
                <div className="text-right">
                  <p className="mono text-[13px] font-semibold">p = {pValue(row.pValue)}</p>
                  <p className="text-[11px] text-muted">
                    active {history.length} day{history.length === 1 ? "" : "s"} · since Day {displayDay(firstDay)}
                  </p>
                </div>
              </div>
              <p className="mt-2 text-[13px] text-text-2">
                {isAlert
                  ? "Possible febrile-illness cluster. Send a health worker to check."
                  : "More people than usual are drifting together. Watch closely."}
              </p>
              {row.regionWide ? (
                <p className="mt-1 text-[11.5px] font-medium text-watch">Region-wide shift — not a local cluster. Level was downgraded.</p>
              ) : null}
              <button
                type="button"
                onClick={() => setOpenId(open ? null : id)}
                aria-expanded={open}
                className="mt-2 text-[12px] font-semibold text-info hover:underline"
              >
                {open ? "Hide explanation" : "Explain this alert"}
              </button>

              {open ? (
                <div className="mt-2 space-y-1.5 rounded-lg bg-surface-2 p-3 text-[11.5px] leading-relaxed text-text-2">
                  <p>
                    <span className="font-semibold text-text">Why it fired:</span> {row.k} of {row.n} eligible wearers had a
                    personal drift flag in the same 3-day window. Expected rate under normal variation:{" "}
                    {(row.p0 * 100).toFixed(1)}%.
                  </p>
                  <p>
                    <span className="font-semibold text-text">Test:</span> binomial tail p = {pValue(row.pValue)}. Corrected
                    threshold for this level: {threshold}. {zoneCount} zones are tested per day.
                  </p>
                  <p>
                    <span className="font-semibold text-text">Eligible wearers:</span> {row.n} people worn and valid on at least
                    2 of the last 3 days. Each personal baseline uses 21 days, skipping the latest 2.
                  </p>
                  <p>
                    <span className="font-semibold text-text">Excluded for quality:</span> {exclusions.total} readings (
                    {exclusions.notWorn} not worn, {exclusions.shortWear} short wear, {exclusions.artefact} artefact).
                  </p>
                  <p className="font-semibold text-text">
                    What this does not establish: it does not identify a disease, confirm infection, or replace testing.
                  </p>
                  {history.length > 1 ? (
                    <div className="mt-2 border-t border-border pt-2">
                      <p className="font-semibold text-text">History</p>
                      <ul className="mono mt-1 space-y-0.5 text-[11px]">
                        {history.map((h) => (
                          <li key={h.day} className="flex justify-between">
                            <span>Day {displayDay(h.day)} · {h.level}</span>
                            <span>{h.k}/{h.n} · p={pValue(h.pValue)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}
