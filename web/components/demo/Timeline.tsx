"use client";

import { Pause, Play } from "lucide-react";
import { displayDay } from "@/lib/ui/demo";

interface Props {
  day: number;
  min: number;
  max: number;
  playing: boolean;
  speed: number;
  onChange: (day: number) => void;
  onPlayPause: () => void;
  onSpeed: (speed: number) => void;
  markers: {
    outbreak: number | null;
    alert: number | null;
    clinic: number | null;
  };
  showOutbreak: boolean;
}

function pos(day: number, min: number, max: number): string {
  return `${((day - min) / (max - min)) * 100}%`;
}

function Marker({
  day,
  min,
  max,
  label,
  className,
  title,
}: {
  day: number;
  min: number;
  max: number;
  label: string;
  className: string;
  title: string;
}) {
  return (
    <span
      title={title}
      className="pointer-events-none absolute top-0 -translate-x-1/2"
      style={{ left: pos(day, min, max) }}
    >
      <span className={`block whitespace-nowrap rounded-md px-1.5 py-0.5 text-[10px] font-bold ${className}`}>
        {label}
      </span>
      <span className={`mx-auto mt-0.5 block h-[22px] w-[2px] ${className}`} />
    </span>
  );
}

export function Timeline({
  day,
  min,
  max,
  playing,
  speed,
  onChange,
  onPlayPause,
  onSpeed,
  markers,
  showOutbreak,
}: Props) {
  const percent = ((day - min) / (max - min)) * 100;

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onPlayPause}
            className={`flex h-11 w-11 items-center justify-center rounded-full text-white shadow-md transition-colors ${
              playing ? "bg-[var(--pink-700)] hover:bg-[var(--pink-500)]" : "bg-brand hover:bg-brand-strong"
            }`}
            aria-label={playing ? "Pause timeline" : "Play timeline"}
            aria-pressed={playing}
            title="Play / pause (Space)"
          >
            {playing ? <Pause size={17} aria-hidden="true" /> : <Play size={17} className="ml-0.5" aria-hidden="true" />}
          </button>
          <div>
            <p className="eyebrow">Timeline · 32 simulated days</p>
            <p className="mono text-[17px] font-semibold">
              Day {displayDay(day)} <span className="text-muted">/ 32</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-text-2 md:flex">
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[var(--purple-500)]" /> Outbreak seeded</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[var(--red-600)]" /> First AyuLink alert</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[var(--blue-500)]" /> Clinic detection (sim.)</span>
          </div>
          <div className="segmented" role="group" aria-label="Playback speed">
            {[1, 2, 4].map((value) => (
              <button key={value} type="button" onClick={() => onSpeed(value)} aria-pressed={speed === value} className="!px-2.5">
                {value}×
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="relative mt-3 pt-[26px]">
        {showOutbreak && markers.outbreak !== null ? (
          <Marker day={markers.outbreak} min={min} max={max} label="Seeded" className="bg-[var(--purple-500)] text-white" title="Outbreak seeded in simulation" />
        ) : null}
        {markers.alert !== null ? (
          <Marker day={markers.alert} min={min} max={max} label="Alert" className="bg-[var(--red-600)] text-white" title="First AyuLink cluster alert" />
        ) : null}
        {markers.clinic !== null ? (
          <Marker day={markers.clinic} min={min} max={max} label="Clinic" className="bg-[var(--blue-500)] text-white" title="Simulated clinic-based detection" />
        ) : null}
        <div className="relative">
          <div className="pointer-events-none absolute inset-x-0 top-[10px] h-[6px] rounded-full bg-surface-3" />
          <div
            className="pointer-events-none absolute left-0 top-[10px] h-[6px] rounded-full"
            style={{ width: `${percent}%`, background: "linear-gradient(90deg, var(--green-300), var(--green-700))" }}
          />
          <input
            type="range"
            min={min}
            max={max}
            step={1}
            value={day}
            onChange={(event) => onChange(Number(event.target.value))}
            aria-label="Timeline day"
            aria-valuetext={`Day ${displayDay(day)} of 32`}
            className="timeline-range relative z-10"
          />
        </div>
        <div className="mono mt-1 flex justify-between text-[10px] text-muted">
          <span>Day 1</span>
          <span>Day 8</span>
          <span>Day 16</span>
          <span>Day 24</span>
          <span>Day 32</span>
        </div>
      </div>
    </div>
  );
}
