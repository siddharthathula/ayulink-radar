"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ArrowUpRight, BrainCircuit, TrendingUp } from "lucide-react";
import type { SimResult } from "@/lib/engine/types";
import { buildForecastIndex, riskDrivers, zoneForecasts } from "@/lib/engine/forecast";
import type { ZoneForecast } from "@/lib/engine/forecast";
import { FORECAST_EVAL, FORECAST_MODEL } from "@/lib/ai/forecastModel";
import { displayDay } from "@/lib/ui/demo";

interface Props {
  result: SimResult;
  day: number;
  selectedZoneId: string | null;
  onPickZone: (zoneId: string) => void;
}

const RISK_STYLE: Record<ZoneForecast["risk"], { chip: string; bar: string; label: string }> = {
  high: { chip: "chip chip-alert", bar: "var(--alert-fill)", label: "High" },
  rising: { chip: "chip chip-watch", bar: "var(--watch-fill)", label: "Rising" },
  low: { chip: "chip chip-brand", bar: "var(--normal)", label: "Low" },
};

/** Turn the top contributing factors into a plain sentence. */
export function explainForecast(f: ZoneForecast): string {
  if (f.level === "alert") return "Already on alert. Focus on the visit list.";
  if (f.risk === "low") return "Nothing unusual. Readings look like this zone's normal.";
  const drivers = riskDrivers(f).slice(0, 2);
  if (drivers.length === 0) return "Several small signals adding up.";
  return `Driven by: ${drivers.map((d) => d.label.toLowerCase()).join("; ")}.`;
}

export function ForecastPanel({ result, day, selectedZoneId, onPickZone }: Props) {
  const index = useMemo(() => buildForecastIndex(result), [result]);
  const forecasts = useMemo(
    () => zoneForecasts(result, day, FORECAST_MODEL, index),
    [result, day, index],
  );
  const zoneName = (id: string) => result.zones.find((z) => z.id === id)?.name ?? id;
  const high = forecasts.filter((f) => f.risk === "high" && f.level !== "alert");
  const ev = FORECAST_EVAL;

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-[var(--info)]/30 bg-[var(--info-soft)] p-3">
        <p className="flex items-center gap-2 text-[13px] font-bold text-text">
          <BrainCircuit size={15} className="text-[var(--info)]" aria-hidden="true" />
          AI forecast · next {FORECAST_MODEL.horizonDays} days
        </p>
        <p className="mt-1 text-[12px] leading-relaxed text-text-2">
          {high.length > 0
            ? `${high.map((f) => zoneName(f.zoneId)).join(", ")} likely to reach alert soon. Send a worker before it does.`
            : `No zone is likely to escalate from Day ${displayDay(day)}. Keep routine visits.`}
        </p>
      </div>

      <ol className="space-y-2" aria-label="Zones ranked by escalation risk">
        {forecasts.map((f) => {
          const style = RISK_STYLE[f.risk];
          const pct = Math.round(f.probability * 100);
          const selected = selectedZoneId === f.zoneId;
          return (
            <li key={f.zoneId}>
              <button
                type="button"
                onClick={() => onPickZone(f.zoneId)}
                aria-pressed={selected}
                className={`w-full rounded-xl border p-2.5 text-left transition-colors ${
                  selected ? "border-brand bg-brand-soft" : "border-border bg-surface hover:bg-surface-2"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[13px] font-semibold">{zoneName(f.zoneId)}</span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {f.level !== "normal" ? (
                      <span className={f.level === "alert" ? "chip chip-alert" : "chip chip-watch"}>
                        {f.level === "alert" ? "On alert" : "Watch"}
                      </span>
                    ) : null}
                    <span className={style.chip}>{style.label}</span>
                    <span className="mono w-10 text-right text-[12px] font-semibold">{f.level === "alert" ? "—" : `${pct}%`}</span>
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-3" aria-hidden="true">
                  <div className="h-full rounded-full" style={{ width: `${Math.max(2, pct)}%`, background: style.bar }} />
                </div>
                <p className="mt-1.5 text-[11.5px] text-muted">{explainForecast(f)}</p>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="rounded-xl border border-border bg-surface-2 p-3 text-[11.5px] text-text-2">
        <p className="flex items-center gap-1.5 font-semibold text-text">
          <TrendingUp size={13} aria-hidden="true" /> How good is it? (held-out simulated test)
        </p>
        <ul className="mt-1.5 space-y-1">
          <li>
            Warned before the alert in <b>{Math.round(ev.earlyWarning.warnedShare * 100)}%</b> of outbreak zones,
            median <b>{ev.earlyWarning.medianDaysEarlier} days</b> earlier.
          </li>
          <li>
            AUROC <b className="mono">{ev.test.auroc}</b> vs <span className="mono">{ev.test.baselineEvidenceAuroc}</span> for
            the p-value alone. False warnings in calm runs:{" "}
            <b className="mono">{ev.falseWarnings.perZonePer30Days}</b> per zone per 30 days.
          </li>
          <li className="text-muted">
            Weak spot: heatwaves ({ev.stress.heatwave?.falseWarnings.perZonePer30Days ?? "—"} false warnings / zone / 30 d).
            Simulated data only.
          </li>
        </ul>
        <Link href="/ai" className="mt-2 inline-flex items-center gap-1 font-semibold text-brand hover:underline">
          Model card <ArrowUpRight size={12} aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
