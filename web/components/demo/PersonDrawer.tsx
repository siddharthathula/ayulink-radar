"use client";

import { useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  Radio,
  Watch,
  X,
  ExternalLink,
  HeartPulse,
} from "lucide-react";
import type { SimResult } from "@/lib/engine/types";
import { displayDay, zoneLevelAt, zoneDayAt } from "@/lib/ui/demo";
import {
  rhythmModel,
  sampleById,
  sampleProbabilityById,
} from "@/lib/ui/rhythm";
import { PoincareMini } from "@/components/PoincareMini";
import { TriageNoteCard } from "@/components/TriageNoteCard";

interface Props {
  result: SimResult;
  personId: string;
  day: number;
  rhythmFlags: Record<string, boolean>;
  onClose: () => void;
}

export function PersonDrawer({
  result,
  personId,
  day,
  rhythmFlags,
  onClose,
}: Props) {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  const person = result.people.find((row) => row.id === personId);
  const zone = person
    ? result.zones.find((row) => row.id === person.zoneId)
    : undefined;
  const observation = result.obs[personId]?.[day];
  const point = result.drift[personId]?.[day];
  const zoneLevel = person ? zoneLevelAt(result.zoneDays, person.zoneId, day) : "normal";
  const zoneDay = person ? zoneDayAt(result.zoneDays, person.zoneId, day) : undefined;
  const rhythmFlag = rhythmFlags[personId] === true;
  const sample = person?.rhythmSampleId
    ? sampleById.get(person.rhythmSampleId)
    : undefined;
  const probability = sample ? sampleProbabilityById.get(sample.id) ?? null : null;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const root = dialogRef.current;
      if (!root) return;
      const focusable = Array.from(
        root.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.offsetParent !== null);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
      opener?.focus();
    };
  }, []);

  const chartData = useMemo(() => {
    const obs = result.obs[personId] ?? [];
    const drift = result.drift[personId] ?? [];
    return obs.map((row, index) => {
      const driftPoint = drift[index];
      const lower =
        driftPoint?.baseline !== null && driftPoint?.baseline !== undefined && driftPoint.sigma !== null
          ? driftPoint.baseline - 2 * driftPoint.sigma
          : null;
      const upper =
        driftPoint?.baseline !== null && driftPoint?.baseline !== undefined && driftPoint.sigma !== null
          ? driftPoint.baseline + 2 * driftPoint.sigma
          : null;
      return {
        day: index,
        rhr: row.valid ? row.rhr : null,
        baseline: driftPoint?.baseline ?? null,
        lower,
        upper,
        band:
          lower !== null && upper !== null ? Math.max(0, upper - lower) : null,
        flagged: driftPoint?.flagged && row.valid ? row.rhr : null,
      };
    });
  }, [result, personId]);

  const yDomain = useMemo<[number, number]>(() => {
    const values = chartData
      .flatMap((row) => [row.rhr, row.lower, row.upper])
      .filter((value): value is number => typeof value === "number");
    if (values.length === 0) return [55, 85];
    return [
      Math.floor(Math.min(...values) - 3),
      Math.ceil(Math.max(...values) + 3),
    ];
  }, [chartData]);

  if (!person) return null;

  const flagged = point?.flagged === true;
  const delta =
    point?.baseline !== null && point?.baseline !== undefined && observation?.rhr !== null && observation?.rhr !== undefined
      ? Math.round(observation.rhr - point.baseline)
      : 0;

  let consecutive = 0;
  for (let offset = 0; offset <= day; offset++) {
    if (result.drift[personId]?.[day - offset]?.flagged) consecutive += 1;
    else break;
  }

  const kind = flagged
    ? "drift"
    : rhythmFlag
      ? "rhythm"
      : zoneLevel !== "normal"
        ? "cluster"
        : null;

  const facts = flagged
    ? { days: Math.max(consecutive, 1), deltaBpm: delta }
    : kind === "cluster"
      ? { k: zoneDay?.k ?? 0, n: zoneDay?.n ?? 0, zone: zone?.name ?? "" }
      : {};

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 sm:items-stretch sm:justify-end"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="person-drawer-title"
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[90vh] w-full flex-col overflow-y-auto rounded-t-2xl border border-border bg-surface shadow-2xl sm:max-h-none sm:h-full sm:max-w-[480px] sm:rounded-none sm:border-y-0 sm:border-r-0"
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-surface/95 px-4 py-3 backdrop-blur">
          <div>
            <div className="flex items-center gap-2">
              <h2
                id="person-drawer-title"
                className="mono text-lg font-semibold tracking-tight"
              >
                {person.id}
              </h2>
              <span
                className={`chip ${
                  flagged
                    ? "border-watch/40 bg-watch/10 text-watch"
                    : "text-muted"
                }`}
              >
                {flagged ? "Drift flag" : "No drift flag today"}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted">
              {zone?.name} · {person.age}
              {person.sex === "F" ? "F" : "M"} ·{" "}
              {person.source === "ayulink-band" ? "AyuLink band" : "Smartwatch"}
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-text"
            aria-label="Close person details"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-4 p-4">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-border bg-bg p-3">
              <p className="text-[11px] text-muted">Resting HR today</p>
              <p className="mono mt-1 text-xl">
                {observation?.valid && observation.rhr !== null
                  ? `${observation.rhr.toFixed(1)} bpm`
                  : "Not worn"}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-bg p-3">
              <p className="text-[11px] text-muted">Personal baseline</p>
              <p className="mono mt-1 text-xl">
                {point?.baseline !== null && point?.baseline !== undefined
                  ? `${point.baseline.toFixed(1)} bpm`
                  : "Learning"}
              </p>
            </div>
          </div>

          <section aria-label="Resting heart rate chart" className="card p-3">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 text-sm font-medium">
                <Activity size={14} className="text-brand" aria-hidden="true" />
                Resting HR vs own baseline
              </h3>
              <span className="text-[10px] text-muted">study days 1–32</span>
            </div>
            <div className="h-[220px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 4" vertical={false} />
                  <XAxis
                    dataKey="day"
                    type="number"
                    domain={[0, 59]}
                    ticks={[28, 35, 42, 49, 56, 59]}
                    tickFormatter={(value: number) => String(displayDay(value))}
                    tick={{ fill: "var(--chart-tick)", fontSize: 10 }}
                    stroke="var(--chart-axis)"
                  />
                  <YAxis
                    domain={yDomain}
                    tick={{ fill: "var(--chart-tick)", fontSize: 10 }}
                    stroke="var(--chart-axis)"
                    width={40}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      borderRadius: 10,
                      fontSize: 12,
                      color: "var(--text)",
                    }}
                    labelFormatter={(value) => {
                      const dayNumber = Number(value);
                      return dayNumber >= 28
                        ? `Monitoring day ${displayDay(dayNumber)}`
                        : `Warm-up day ${dayNumber}`;
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="lower"
                    stackId="band"
                    stroke="none"
                    fill="transparent"
                    isAnimationActive={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="band"
                    stackId="band"
                    stroke="none"
                    fill="var(--dot-watch)"
                    fillOpacity={0.12}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="baseline"
                    stroke="var(--muted)"
                    strokeDasharray="4 4"
                    strokeWidth={1.2}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="rhr"
                    stroke="var(--vitals)"
                    strokeWidth={2}
                    dot={false}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="flagged"
                    stroke="none"
                    dot={{ r: 3.4, fill: "var(--dot-watch)", stroke: "var(--surface)", strokeWidth: 1 }}
                    isAnimationActive={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-1 text-[10px] text-muted">
              Teal: valid daily reading. Dashed: own 21-day median baseline. Band:
              baseline ± 2σ. Amber: drift flag (two consecutive elevated valid days).
              Gaps are unworn or quality-rejected days.
            </p>
          </section>

          {sample && probability !== null ? (
            <section className="card p-3" aria-label="Rhythm screening">
              <div className="flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-1.5 text-sm font-medium">
                  <HeartPulse size={14} className="text-rhythm" aria-hidden="true" />
                  Irregular pulse rhythm screen
                </h3>
                <span
                  className={`chip ${
                    probability >= rhythmModel.threshold
                      ? "border-rhythm/40 bg-rhythm/10 text-rhythm"
                      : "text-muted"
                  }`}
                >
                  {probability >= rhythmModel.threshold ? "Flag" : "No flag"}
                </span>
              </div>
              <div className="mt-3 flex items-center gap-4">
                <PoincareMini rr={sample.rr} width={170} height={130} />
                <div>
                  <p className="text-[11px] text-muted">Model probability</p>
                  <p className="mono text-2xl">{probability.toFixed(2)}</p>
                  <p className="mt-1 text-[11px] text-muted">
                    threshold {rhythmModel.threshold.toFixed(2)}
                  </p>
                  <Link
                    href={`/rhythm?sample=${sample.id}`}
                    className="mt-2 inline-flex items-center gap-1 text-xs text-info underline underline-offset-2 hover:text-text"
                  >
                    Open in Rhythm Lab <ExternalLink size={11} aria-hidden="true" />
                  </Link>
                </div>
              </div>
              <p className="mt-2 text-[10px] text-muted">
                Simulated linkage to a public ECG-derived sample. Optical-pulse
                validation on the band is pending.
              </p>
            </section>
          ) : null}

          {kind ? (
            <TriageNoteCard kind={kind} facts={facts} />
          ) : (
            <p className="card p-3 text-sm text-muted">
              No screening flag for this person today, so no visit note is
              generated.
            </p>
          )}

          <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-bg px-3 py-2 text-[11px] text-muted">
            <span className="inline-flex items-center gap-1.5">
              {person.source === "ayulink-band" ? (
                <Radio size={12} aria-hidden="true" />
              ) : (
                <Watch size={12} aria-hidden="true" />
              )}
              {person.source === "ayulink-band"
                ? "AyuLink band · simulated"
                : "Existing smartwatch · simulated"}
            </span>
            <span>Screening flag, not a diagnosis.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
