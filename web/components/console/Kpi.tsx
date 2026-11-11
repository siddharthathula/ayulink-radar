"use client";

import { Info, type LucideIcon } from "lucide-react";

type Tone = "brand" | "watch" | "alert" | "rhythm" | "vitals" | "neutral";

const TONE: Record<Tone, { text: string; stroke: string; fill: string; iconBg: string }> = {
  brand: { text: "text-brand-strong", stroke: "var(--green-700)", fill: "var(--green-100)", iconBg: "bg-brand-soft text-brand" },
  watch: { text: "text-watch", stroke: "var(--amber-400)", fill: "var(--amber-100)", iconBg: "bg-watch-soft text-watch" },
  alert: { text: "text-alert", stroke: "var(--red-600)", fill: "var(--red-100)", iconBg: "bg-alert-soft text-alert" },
  rhythm: { text: "text-rhythm", stroke: "var(--purple-500)", fill: "var(--purple-100)", iconBg: "bg-rhythm-soft text-rhythm" },
  vitals: { text: "text-vitals", stroke: "var(--pink-500)", fill: "var(--pink-100)", iconBg: "bg-vitals-soft text-vitals" },
  neutral: { text: "text-text", stroke: "var(--blue-500)", fill: "var(--blue-100)", iconBg: "bg-info-soft text-info" },
};

export function Sparkline({
  values,
  tone = "brand",
  width = 120,
  height = 34,
  markIndex,
  fluid = false,
}: {
  values: number[];
  tone?: Tone;
  width?: number;
  height?: number;
  markIndex?: number;
  fluid?: boolean;
}) {
  if (values.length < 2) return <svg width={fluid ? "100%" : width} height={height} aria-hidden="true" className="block" />;
  const max = Math.max(1, ...values);
  const step = width / (values.length - 1);
  const y = (v: number) => height - 3 - (v / max) * (height - 6);
  const points = values.map((v, i) => `${(i * step).toFixed(1)},${y(v).toFixed(1)}`);
  const area = `M0,${height} L${points.join(" L")} L${width},${height} Z`;
  const colors = TONE[tone];
  return (
    <svg
      width={fluid ? "100%" : width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio={fluid ? "none" : undefined}
      aria-hidden="true"
      className="block overflow-visible"
    >
      <path d={area} fill={colors.fill} opacity={0.55} />
      <polyline points={points.join(" ")} fill="none" stroke={colors.stroke} strokeWidth={1.6} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      {markIndex !== undefined && markIndex >= 0 && markIndex < values.length ? (
        <circle cx={markIndex * step} cy={y(values[markIndex])} r={2.8} fill="#fff" stroke={colors.stroke} strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
      ) : null}
    </svg>
  );
}

export function KpiTile({
  label,
  value,
  sub,
  Icon,
  tone = "brand",
  series,
  markIndex,
  emphasize = false,
  hint,
}: {
  hint?: string;
  label: string;
  value: string | number;
  sub?: string;
  Icon: LucideIcon;
  tone?: Tone;
  series?: number[];
  markIndex?: number;
  emphasize?: boolean;
}) {
  const colors = TONE[tone];
  return (
    <div
      className={`card relative min-w-0 p-3.5 transition-shadow ${
        emphasize ? "ring-2 ring-red-100" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="eyebrow flex items-center gap-1 leading-snug">
            {label}
            {hint ? (
              <span className="group relative inline-flex cursor-help normal-case tracking-normal" tabIndex={0} aria-label={hint}>
                <Info size={12} className="text-muted" aria-hidden="true" />
                <span
                  role="tooltip"
                  className="pointer-events-none absolute left-1/2 top-5 z-30 hidden w-60 -translate-x-1/2 rounded-lg border border-border bg-surface p-2.5 text-[12px] font-normal leading-snug text-text shadow-[var(--shadow-md)] group-hover:block group-focus:block"
                >
                  {hint}
                </span>
              </span>
            ) : null}
          </p>
          <p className={`mono mt-1.5 text-[26px] font-semibold leading-none ${colors.text}`}>{value}</p>
          {sub ? <p className="mt-1.5 line-clamp-2 text-[11.5px] leading-snug text-muted">{sub}</p> : null}
        </div>
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${colors.iconBg}`}>
          <Icon size={16} aria-hidden="true" />
        </span>
      </div>
      {series ? (
        <div className="mt-2 -mb-1">
          <Sparkline values={series} tone={tone} width={220} height={30} markIndex={markIndex} fluid />
        </div>
      ) : null}
    </div>
  );
}
