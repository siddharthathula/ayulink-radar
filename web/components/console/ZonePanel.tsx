"use client";

import { useMemo } from "react";
import { MapPinned, Users } from "lucide-react";
import type { SimResult } from "@/lib/engine/types";
import { dailySeries } from "@/lib/ui/ops";
import { displayDay, qualityExclusions, zoneDayAt } from "@/lib/ui/demo";
import { Sparkline } from "./Kpi";

interface Props {
  result: SimResult;
  day: number;
  zoneId: string | null;
  onPickZone: (zoneId: string) => void;
}

function fmtP(value: number) {
  return value < 0.0001 ? value.toExponential(1) : value.toFixed(4);
}

export function ZonePanel({ result, day, zoneId, onPickZone }: Props) {
  const rows = useMemo(
    () =>
      result.zones.map((zone) => {
        const today = zoneDayAt(result.zoneDays, zone.id, day);
        const series = dailySeries(result, zone.id).filter((p) => p.day <= day);
        return { zone, today, series };
      }),
    [result, day],
  );

  const focus = zoneId ? rows.find((row) => row.zone.id === zoneId) : null;

  return (
    <div className="space-y-3">
      {focus ? (
        <div className="rounded-xl border border-border bg-surface-2 p-3">
          <p className="eyebrow">Selected zone</p>
          <p className="mt-1 font-heading text-lg font-bold">{focus.zone.name}</p>
          {(() => {
            const today = focus.today;
            const q = qualityExclusions(result, focus.zone.id, day);
            return (
              <dl className="mt-2 grid grid-cols-2 gap-2 text-[12px]">
                <div className="rounded-lg bg-surface p-2">
                  <dt className="text-muted">Eligible wearers (n)</dt>
                  <dd className="mono text-base font-semibold">{today?.n ?? "—"}</dd>
                </div>
                <div className="rounded-lg bg-surface p-2">
                  <dt className="text-muted">Drifting together (k)</dt>
                  <dd className="mono text-base font-semibold text-watch">{today?.k ?? "—"}</dd>
                </div>
                <div className="rounded-lg bg-surface p-2">
                  <dt className="text-muted">Expected rate (p₀)</dt>
                  <dd className="mono text-base font-semibold">{today ? `${(today.p0 * 100).toFixed(1)}%` : "—"}</dd>
                </div>
                <div className="rounded-lg bg-surface p-2">
                  <dt className="text-muted">Binomial p-value</dt>
                  <dd className="mono text-base font-semibold">{today ? fmtP(today.pValue) : "—"}</dd>
                </div>
                <div className="col-span-2 rounded-lg bg-surface p-2">
                  <dt className="text-muted">Readings excluded by quality gate (3-day window)</dt>
                  <dd className="mono text-[13px]">
                    {q.total} · {q.notWorn} not worn · {q.shortWear} short wear · {q.artefact} artefact
                  </dd>
                </div>
              </dl>
            );
          })()}
          <p className="mt-2 text-[11px] text-muted">
            Values come straight from the engine for Day {displayDay(day)}. Zones under 10 eligible
            wearers never alert.
          </p>
        </div>
      ) : (
        <p className="flex items-center gap-2 rounded-lg bg-surface-2 p-3 text-[12px] text-muted">
          <MapPinned size={14} aria-hidden="true" /> Pick a zone on the map, the grid or below.
        </p>
      )}

      <ul className="space-y-1.5">
        {rows.map(({ zone, today, series }) => {
          const level = today?.level ?? "normal";
          return (
            <li key={zone.id}>
              <button
                type="button"
                onClick={() => onPickZone(zone.id)}
                className={`flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition-colors ${
                  zoneId === zone.id ? "border-green-300 bg-brand-soft" : "border-border bg-surface hover:bg-surface-2"
                }`}
              >
                <span
                  className={`h-9 w-1.5 shrink-0 rounded-full ${
                    level === "alert"
                      ? "bg-[var(--dot-alert)]"
                      : level === "watch"
                        ? "bg-[var(--dot-watch)]"
                        : "bg-[var(--cell-normal)]"
                  }`}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold">{zone.name}</p>
                  <p className="mono flex items-center gap-1 text-[11px] text-muted">
                    <Users size={11} aria-hidden="true" />
                    {today ? `${today.k}/${today.n}` : "—"} · {level}
                  </p>
                </div>
                <Sparkline
                  values={series.map((p) => p.flagged)}
                  tone={level === "alert" ? "alert" : level === "watch" ? "watch" : "brand"}
                  width={90}
                  height={28}
                />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
