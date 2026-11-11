"use client";

import { Flame, Gauge, RadioTower, ShieldAlert, Zap } from "lucide-react";
import {
  evalData,
  formatNum,
  formatPct,
} from "@/lib/results";
import type { Mode, SimResult, Stress } from "@/lib/engine/types";
import { displayDay, runAlertCount } from "@/lib/ui/demo";

interface Props {
  mode: Mode;
  stress: Stress;
  wearRate: number;
  result: SimResult;
  onApply: (stress: Stress, wearRate: number) => void;
}

const PRESETS: Array<{
  label: string;
  stress: Stress;
  wearRate: number;
  evalName: string;
  description: string;
  Icon: typeof Flame;
}> = [
  {
    label: "Heatwave",
    stress: "heatwave",
    wearRate: 0.8,
    evalName: "heatwave",
    description: "5 hot days, +3 bpm region-wide. A false-alert trap.",
    Icon: Flame,
  },
  {
    label: "Low participation",
    stress: "none",
    wearRate: 0.4,
    evalName: "low-participation",
    description: "Only 40% wear the band daily.",
    Icon: Gauge,
  },
  {
    label: "Noisy sensors",
    stress: "noisy",
    wearRate: 0.8,
    evalName: "noisy",
    description: "High motion/contact artefact (noise 0.8).",
    Icon: RadioTower,
  },
  {
    label: "Isolated illness",
    stress: "isolated",
    wearRate: 0.8,
    evalName: "isolated",
    description: "Sporadic illness ×3, no outbreak. False-alert test.",
    Icon: ShieldAlert,
  },
  {
    label: "Fast spread",
    stress: "fast",
    wearRate: 0.8,
    evalName: "fast",
    description: "Beta 0.9, spillover 0.12. Detection test.",
    Icon: Zap,
  },
];

export function StressLab({ mode, stress, wearRate, result, onApply }: Props) {
  const active = PRESETS.find(
    (preset) => preset.stress === stress && preset.wearRate === wearRate,
  );
  const currentAlerts = runAlertCount(result);
  const evalName = active?.evalName;
  const benchmark = evalName
    ? evalData.stress.find(
        (row) =>
          row.mode === mode && row.stress === evalName && row.detector === "D4",
      )
    : undefined;
  const missed = result.config.scenario === "cluster" && result.firstAlertDay === null;
  const isolated = stress === "isolated";

  return (
    <div>
      <p className="text-[11px] leading-relaxed text-muted">
        Each preset reruns the same engine with different simulated inputs. The
        comparison row is the D4 full engine from `eval.json`.
      </p>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        {PRESETS.map((preset) => {
          const selected =
            preset.stress === stress && preset.wearRate === wearRate;
          return (
            <button
              key={preset.label}
              type="button"
              onClick={() => onApply(preset.stress, preset.wearRate)}
              aria-pressed={selected}
              className={`flex min-h-11 items-center gap-1.5 rounded-lg border px-2 text-left text-[11px] font-medium transition-colors ${
                selected
                  ? "border-brand/50 bg-brand/10 text-brand"
                  : "border-border bg-surface-2 text-muted hover:text-text"
              }`}
            >
              <preset.Icon size={13} aria-hidden="true" />
              {preset.label}
            </button>
          );
        })}
      </div>

      {active ? (
        <p className="mt-2 text-[11px] text-muted">{active.description}</p>
      ) : (
        <p className="mt-2 text-[11px] text-muted">
          Default run: wear rate {(wearRate * 100).toFixed(0)}%, no stress.
        </p>
      )}

      <div className="mt-3 rounded-xl border border-border bg-bg p-3">
        <p className="text-[11px] font-medium text-text">This run</p>
        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-[11px]">
          <div>
            <dt className="text-muted">Alerts fired (zone-days)</dt>
            <dd className="mono text-sm">{currentAlerts}</dd>
          </div>
          <div>
            <dt className="text-muted">False-alert zone-days</dt>
            <dd className="mono text-sm">{result.falseAlertZoneDays}</dd>
          </div>
          <div>
            <dt className="text-muted">Lead time, this run</dt>
            <dd className="mono text-sm">
              {result.leadDays === null ? "—" : `${result.leadDays} d`}
            </dd>
          </div>
          <div>
            <dt className="text-muted">First alert</dt>
            <dd className="mono text-sm">
              {result.firstAlertDay === null
                ? "—"
                : `Day ${displayDay(result.firstAlertDay)}`}
            </dd>
          </div>
        </dl>
        {isolated ? (
          <p className="mt-2 text-[11px] text-muted">
            No outbreak is seeded in this test. The measure is whether sporadic
            illness creates false alerts.
          </p>
        ) : missed ? (
          <p className="mt-2 text-[11px] text-watch">
            Missed at {(wearRate * 100).toFixed(0)}% participation in this run.
          </p>
        ) : null}
      </div>

      <div className="mt-3 rounded-xl border border-border bg-bg p-3">
        <p className="text-[11px] font-medium text-text">
          Matching eval row · {mode} · D4
        </p>
        {benchmark ? (
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-[11px]">
            <div>
              <dt className="text-muted">Detection rate</dt>
              <dd className="mono text-sm">{formatPct(benchmark.detectionRate)}</dd>
            </div>
            <div>
              <dt className="text-muted">False alerts / zone / 30d</dt>
              <dd className="mono text-sm">
                {formatNum(benchmark.falseAlertsPerZonePer30d, 3)}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Median lead</dt>
              <dd className="mono text-sm">
                {benchmark.medianLeadDays === null
                  ? "—"
                  : `${formatNum(benchmark.medianLeadDays, 1)} d`}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Specificity</dt>
              <dd className="mono text-sm">
                {formatPct(benchmark.zoneDaySpecificity)}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="mt-1 text-[11px] text-muted">
            No matching eval row for this run.
          </p>
        )}
        <p className="mt-2 text-[10px] text-muted">
          Eval rows are means over test seeds. A single run can differ.
        </p>
      </div>
    </div>
  );
}
