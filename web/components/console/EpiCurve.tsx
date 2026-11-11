"use client";

import { useMemo } from "react";
import { TrendingUp } from "lucide-react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SimResult } from "@/lib/engine/types";
import { dailySeries } from "@/lib/ui/ops";
import { displayDay, zoneName } from "@/lib/ui/demo";

interface Props {
  result: SimResult;
  day: number;
  zoneId: string | null;
}

export function EpiCurve({ result, day, zoneId }: Props) {
  const data = useMemo(
    () =>
      dailySeries(result, zoneId).map((point) => ({
        label: displayDay(point.day),
        day: point.day,
        flagged: point.day <= day ? point.flagged : null,
        rate: point.day <= day && point.worn > 0 ? Math.round((point.flagged / point.worn) * 1000) / 10 : null,
      })),
    [result, zoneId, day],
  );

  const alertDay = result.firstAlertDay;
  const clinicDay = result.clinicDetectionDay;

  return (
    <section className="card p-4" aria-label="Drift curve">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-vitals-soft text-vitals">
            <TrendingUp size={16} aria-hidden="true" />
          </span>
          <div>
            <h3 className="text-[15px]">Drift curve · {zoneName(result, zoneId)}</h3>
            <p className="text-[11.5px] text-muted">
              Wearers flagged per day (bars) and share of valid wearers flagged (line).
            </p>
          </div>
        </div>
      </div>
      <div className="mt-3 h-[240px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 22, right: 12, bottom: 0, left: -18 }}>
            <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 4" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: "var(--chart-tick)", fontSize: 10 }} stroke="var(--chart-axis)" interval={3} />
            <YAxis yAxisId="n" tick={{ fill: "var(--chart-tick)", fontSize: 10 }} stroke="var(--chart-axis)" allowDecimals={false} />
            <YAxis yAxisId="r" orientation="right" hide domain={[0, "auto"]} />
            <Tooltip
              cursor={{ fill: "var(--brand-soft)" }}
              contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12, color: "var(--text)" }}
              formatter={(value, name) =>
                name === "rate" ? [`${value}%`, "Share flagged"] : [value, "Wearers flagged"]
              }
              labelFormatter={(label) => `Day ${label}`}
            />
            <Bar yAxisId="n" dataKey="flagged" fill="var(--pink-400, #f06292)" radius={[4, 4, 0, 0]} maxBarSize={14} />
            <Line yAxisId="r" dataKey="rate" stroke="var(--rhythm)" strokeWidth={1.8} dot={false} connectNulls={false} />
            {alertDay !== null && alertDay <= day ? (
              <ReferenceLine
                yAxisId="n"
                x={displayDay(alertDay)}
                stroke="var(--dot-alert)"
                strokeDasharray="4 3"
                label={{ value: "AyuLink alert", fill: "var(--alert)", fontSize: 10, fontWeight: 600, position: "insideTopRight" }}
              />
            ) : null}
            {clinicDay !== null && clinicDay <= day ? (
              <ReferenceLine
                yAxisId="n"
                x={displayDay(clinicDay)}
                stroke="var(--blue-500)"
                strokeDasharray="4 3"
                label={{ value: "Clinic (sim.)", fill: "var(--blue-700)", fontSize: 10, fontWeight: 600, position: "insideTopLeft" }}
              />
            ) : null}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
