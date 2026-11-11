"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, TriangleAlert } from "lucide-react";
import { simulate } from "@/lib/engine/simulate";
import { DEFAULT_CONFIG } from "@/lib/engine/presets";
import { surveillanceGrid, FIRST_DAY, LAST_DAY } from "@/lib/ui/ops";
import { displayDay } from "@/lib/ui/demo";

/** Live, looping mini-console driven by the real engine (village, cluster, seed 2026). */
export function HeroPreview() {
  const result = useMemo(() => simulate({ ...DEFAULT_CONFIG, mode: "village", scenario: "cluster" }), []);
  const grid = useMemo(() => surveillanceGrid(result), [result]);
  const [day, setDay] = useState(FIRST_DAY + 4);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const id = setTimeout(() => setDay(LAST_DAY), 0);
      return () => clearTimeout(id);
    }
    const timer = setInterval(() => {
      setDay((d) => (d >= LAST_DAY + 6 ? FIRST_DAY : d + 1));
    }, 260);
    return () => clearInterval(timer);
  }, []);

  const shown = Math.min(day, LAST_DAY);
  const alertZone = result.zones.find((z) =>
    grid.get(z.id)?.some((c) => c.day <= shown && c.level === "alert"),
  );
  const alerted = result.firstAlertDay !== null && shown >= result.firstAlertDay;

  return (
    <div className="rounded-2xl bg-surface p-4 text-text shadow-[var(--shadow-lg)] ring-1 ring-black/5">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-[13px] font-bold">
          <span className="relative flex h-2 w-2 rounded-full bg-[var(--green-500)] text-[var(--green-500)] live-dot" />
          Surveillance console
        </p>
        <span className="mono rounded-md bg-surface-2 px-2 py-0.5 text-[11px]">Day {displayDay(shown)} / 32</span>
      </div>
      <div className="mt-3 space-y-[3px]">
        {result.zones.map((zone) => (
          <div key={zone.id} className="flex items-center gap-2">
            <span className="w-[86px] shrink-0 truncate text-[11px] font-semibold text-text-2">{zone.name}</span>
            <div className="grid flex-1 grid-cols-[repeat(32,minmax(0,1fr))] gap-[2px]">
              {(grid.get(zone.id) ?? []).map((cell) => (
                <span
                  key={cell.day}
                  className={`h-[13px] rounded-[3px] transition-colors duration-300 ${
                    cell.day > shown
                      ? "bg-surface-2"
                      : cell.level === "alert"
                        ? "bg-[var(--dot-alert)]"
                        : cell.level === "watch"
                          ? "bg-[var(--dot-watch)]"
                          : "bg-[var(--cell-normal)]"
                  }`}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className={`rounded-xl p-2.5 transition-colors ${alerted ? "bg-[var(--dot-alert)] text-white" : "bg-surface-2"}`}>
          <p className="flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-wide opacity-80">
            <TriangleAlert size={11} aria-hidden="true" /> Cluster alert
          </p>
          <p className="mt-0.5 text-[14px] font-bold">{alerted && alertZone ? alertZone.name : "None yet"}</p>
        </div>
        <div className="rounded-xl bg-brand-soft p-2.5 text-brand-strong">
          <p className="flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-wide opacity-80">
            <Activity size={11} aria-hidden="true" /> Lead vs clinic
          </p>
          <p className="mono mt-0.5 text-[14px] font-bold">
            {result.clinicDetectionDay !== null && shown >= result.clinicDetectionDay && result.leadDays !== null
              ? `${result.leadDays} days earlier`
              : "—"}
          </p>
        </div>
      </div>
      <p className="mt-2 text-[10.5px] text-muted">Real engine · simulated village of 204 wearers</p>
    </div>
  );
}
