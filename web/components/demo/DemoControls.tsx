"use client";

import { Activity, RotateCcw, Shuffle, Sun, Waves } from "lucide-react";
import type { Mode, Scenario } from "@/lib/engine/types";
import { MODES, PRESETS } from "@/lib/engine/presets";

interface Props {
  mode: Mode;
  scenario: Scenario;
  wearRate: number;
  seed: number;
  onMode: (mode: Mode) => void;
  onScenario: (scenario: Scenario) => void;
  onWearRate: (value: number) => void;
  onNewSeed: () => void;
  onReset: () => void;
}

export function DemoControls({
  mode,
  scenario,
  wearRate,
  seed,
  onMode,
  onScenario,
  onWearRate,
  onNewSeed,
  onReset,
}: Props) {
  return (
    <div className="card flex flex-col gap-4 p-3.5 lg:flex-row lg:flex-wrap lg:items-center lg:gap-x-6">
      <div className="flex flex-col gap-1.5">
        <p className="eyebrow">Setting</p>
        <div className="segmented" role="group" aria-label="Community setting">
          {MODES.map((value, index) => (
            <button
              key={value}
              type="button"
              onClick={() => onMode(value)}
              aria-pressed={mode === value}
              title={`${PRESETS[value].label} (key ${index + 1})`}
            >
              {PRESETS[value].label}
            </button>
          ))}
        </div>
      </div>

      <div className="hidden h-10 w-px bg-border lg:block" aria-hidden="true" />

      <div className="flex flex-col gap-1.5">
        <p className="eyebrow">Scenario</p>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => onScenario("cluster")}
            aria-pressed={scenario === "cluster"}
            className={`btn min-h-[38px] px-3 text-[13px] ${scenario === "cluster" ? "btn-danger" : ""}`}
            title="Simulate cluster (C)"
          >
            <Activity size={14} aria-hidden="true" />
            Simulate cluster
          </button>
          <button
            type="button"
            onClick={() => onScenario("spread")}
            aria-pressed={scenario === "spread"}
            className={`btn min-h-[38px] px-3 text-[13px] ${
              scenario === "spread" ? "border-[var(--pink-500)] bg-vitals-soft text-vitals" : ""
            }`}
            title="Simulate spread (S)"
          >
            <Waves size={14} aria-hidden="true" />
            Simulate spread
          </button>
          <button
            type="button"
            onClick={() => onScenario("calm")}
            aria-pressed={scenario === "calm"}
            className={`btn min-h-[38px] px-3 text-[13px] ${
              scenario === "calm" ? "border-green-300 bg-brand-soft text-brand-strong" : ""
            }`}
          >
            <Sun size={14} aria-hidden="true" />
            Calm season
          </button>
          <button type="button" onClick={onReset} className="btn btn-ghost min-h-[38px] px-3 text-[13px] text-muted">
            <RotateCcw size={14} aria-hidden="true" />
            Reset
          </button>
        </div>
      </div>

      <div className="hidden h-10 w-px bg-border lg:block" aria-hidden="true" />

      <div className="flex min-w-[260px] flex-1 flex-col gap-1.5">
        <label className="eyebrow" htmlFor="wear-rate">
          Daily band wear
        </label>
        <div className="flex items-center gap-3">
          <input
            id="wear-rate"
            type="range"
            min={40}
            max={100}
            step={5}
            value={Math.round(wearRate * 100)}
            onChange={(event) => onWearRate(Number(event.target.value) / 100)}
            className="max-w-[260px]"
            aria-valuetext={`${Math.round(wearRate * 100)} percent of people wear the band daily`}
          />
          <span className="mono w-11 text-right text-sm font-semibold">{Math.round(wearRate * 100)}%</span>
        </div>
      </div>

      <div className="flex items-center gap-2 lg:ml-auto">
        <span className="mono rounded-md bg-surface-2 px-2 py-1 text-[11px] text-muted">seed {seed}</span>
        <button type="button" onClick={onNewSeed} className="btn btn-ghost min-h-9 px-2.5 text-[12.5px] text-info">
          <Shuffle size={13} aria-hidden="true" />
          New run
        </button>
      </div>
    </div>
  );
}
