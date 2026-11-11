"use client";

import { useMemo } from "react";
import { Grid3x3 } from "lucide-react";
import type { SimResult } from "@/lib/engine/types";
import { FIRST_DAY, LAST_DAY, surveillanceGrid } from "@/lib/ui/ops";
import { displayDay } from "@/lib/ui/demo";

interface Props {
  result: SimResult;
  day: number;
  selectedZoneId: string | null;
  onPick: (zoneId: string, day: number) => void;
}

const LEVEL_CLASS = {
  normal: "bg-[var(--cell-normal)] opacity-70 hover:opacity-100",
  watch: "bg-[var(--dot-watch)] hover:brightness-95",
  alert: "bg-[var(--dot-alert)] hover:brightness-95",
} as const;

export function SurveillanceGrid({ result, day, selectedZoneId, onPick }: Props) {
  const grid = useMemo(() => surveillanceGrid(result), [result]);
  const days = LAST_DAY - FIRST_DAY + 1;

  return (
    <section className="card p-4" aria-label="Surveillance grid, zones by day">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-soft text-brand">
            <Grid3x3 size={16} aria-hidden="true" />
          </span>
          <div>
            <h3 className="text-[15px]">Surveillance grid</h3>
            <p className="text-[11.5px] text-muted">Every zone, every day. Click a cell to jump there.</p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-muted">
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[var(--cell-normal)]" /> Normal</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[var(--dot-watch)]" /> Watch</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[var(--dot-alert)]" /> Alert</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm border border-dashed border-border-strong" /> Future</span>
        </div>
      </div>

      <div className="scroll-thin mt-4 overflow-x-auto">
        <div className="min-w-[560px]">
          {result.zones.map((zone) => {
            const cells = grid.get(zone.id) ?? [];
            const isSelected = selectedZoneId === zone.id;
            const isOutbreak = result.outbreakZoneId === zone.id && day >= LAST_DAY;
            return (
              <div key={zone.id} className="flex items-center gap-2 py-[3px]">
                <p
                  className={`w-[110px] shrink-0 truncate text-[12px] font-semibold ${
                    isSelected ? "text-brand-strong" : "text-text-2"
                  }`}
                  title={zone.name}
                >
                  {zone.name}
                  {isOutbreak ? <span className="ml-1 text-[10px] font-medium text-muted">· seeded</span> : null}
                </p>
                <div
                  className="grid flex-1 gap-[3px]"
                  style={{ gridTemplateColumns: `repeat(${days}, minmax(0, 1fr))` }}
                >
                  {cells.map((cell) => {
                    const future = cell.day > day;
                    const current = cell.day === day;
                    return (
                      <button
                        key={cell.day}
                        type="button"
                        onClick={() => onPick(zone.id, cell.day)}
                        className={`h-[18px] rounded-[4px] transition ${
                          future
                            ? "border border-dashed border-border bg-transparent"
                            : LEVEL_CLASS[cell.level]
                        } ${current ? "outline outline-2 outline-offset-1 outline-[var(--text)]" : ""} ${
                          isSelected && !future ? "ring-1 ring-brand/30" : ""
                        }`}
                        title={`${zone.name} · Day ${displayDay(cell.day)} · ${cell.level}${
                          future ? " (not yet reached)" : ` · ${cell.k} of ${cell.n} drifting · p=${cell.pValue < 0.0001 ? cell.pValue.toExponential(1) : cell.pValue.toFixed(4)}`
                        }${cell.regionWide ? " · region-wide shift" : ""}`}
                        aria-label={`${zone.name}, day ${displayDay(cell.day)}, ${future ? "not reached" : cell.level}`}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
          <div className="mt-1 flex items-center gap-2">
            <span className="w-[110px] shrink-0" />
            <div className="mono flex flex-1 justify-between text-[10px] text-muted">
              <span>Day 1</span>
              <span>Day 8</span>
              <span>Day 16</span>
              <span>Day 24</span>
              <span>Day 32</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
