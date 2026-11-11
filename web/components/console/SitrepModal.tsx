"use client";

import { useEffect, useMemo, useRef } from "react";
import { Copy, Download, FileText, Printer, X } from "lucide-react";
import type { QueueRow } from "@/lib/engine/queue";
import type { SimResult } from "@/lib/engine/types";
import type { CaseEntry } from "@/lib/ui/hooks";
import { PRESETS } from "@/lib/engine/presets";
import { CASE_LABEL, downloadText } from "@/lib/ui/ops";
import { displayDay, zoneDayAt, zoneName } from "@/lib/ui/demo";

interface Props {
  result: SimResult;
  day: number;
  queue: QueueRow[];
  log: Record<string, CaseEntry>;
  onClose: () => void;
}

function fmtP(value: number) {
  return value < 0.0001 ? value.toExponential(1) : value.toFixed(4);
}

export function SitrepModal({ result, day, queue, log, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const zones = useMemo(
    () =>
      result.zones
        .map((zone) => ({ zone, row: zoneDayAt(result.zoneDays, zone.id, day) }))
        .sort((a, b) => {
          const rank = { alert: 0, watch: 1, normal: 2 };
          return rank[a.row?.level ?? "normal"] - rank[b.row?.level ?? "normal"];
        }),
    [result, day],
  );

  const top = queue.slice(0, 10);
  const alertZones = zones.filter((z) => z.row?.level === "alert");
  const watchZones = zones.filter((z) => z.row?.level === "watch");
  const preset = PRESETS[result.config.mode];

  const markdown = useMemo(() => {
    const lines = [
      `# AyuLink Radar — situation report`,
      ``,
      `Setting: ${preset.label} · Day ${displayDay(day)} of 32 · Generated ${new Date().toLocaleString("en-IN")}`,
      `**SIMULATED DATA. Screening flags, not diagnoses.**`,
      ``,
      `## Summary`,
      `- Zones on alert: ${alertZones.length} (${alertZones.map((z) => z.zone.name).join(", ") || "none"})`,
      `- Zones on watch: ${watchZones.length} (${watchZones.map((z) => z.zone.name).join(", ") || "none"})`,
      `- People on visit-first list: ${queue.length}`,
      ``,
      `## Zones`,
      `| Zone | Level | Drifting (k/n) | p-value |`,
      `|---|---|---|---|`,
      ...zones.map(
        ({ zone, row }) =>
          `| ${zone.name} | ${row?.level ?? "normal"} | ${row ? `${row.k}/${row.n}` : "—"} | ${row ? fmtP(row.pValue) : "—"} |`,
      ),
      ``,
      `## Visit first (top ${top.length})`,
      `| # | Code | Zone | Status | Reasons |`,
      `|---|---|---|---|---|`,
      ...top.map(
        (row, index) =>
          `| ${index + 1} | ${row.person.id} | ${row.zoneName} | ${CASE_LABEL[log[row.person.id]?.status ?? "pending"]} | ${row.reasons.join("; ")} |`,
      ),
      ``,
      `## Recommended actions`,
      alertZones.length
        ? `- Send health workers to listed households in ${alertZones.map((z) => z.zone.name).join(", ")} today; check temperature and ask about fever.`
        : `- No zone on alert. Continue routine visits.`,
      `- Report confirmed fever cases through the usual IDSP channel.`,
      ``,
      `_AyuLink Radar is a screening prototype, not a medical device. It does not identify a disease or replace testing._`,
    ];
    return lines.join("\n");
  }, [preset.label, day, alertZones, watchZones, queue.length, zones, top, log]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(markdown);
    } catch {
      // ignore
    }
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-black/45 p-3 backdrop-blur-[2px] sm:p-8" role="dialog" aria-modal="true" aria-label="Situation report">
      <div className="print-area w-full max-w-3xl rounded-2xl bg-surface shadow-[var(--shadow-lg)]">
        <div className="no-print flex items-center justify-between gap-2 border-b border-border px-5 py-3">
          <p className="flex items-center gap-2 font-heading text-[15px] font-bold">
            <FileText size={16} className="text-brand" aria-hidden="true" /> Situation report
          </p>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={copy} className="btn min-h-9 px-3 text-xs">
              <Copy size={13} aria-hidden="true" /> Copy
            </button>
            <button
              type="button"
              onClick={() => downloadText(`ayulink-sitrep-day${displayDay(day)}.md`, markdown, "text/markdown")}
              className="btn min-h-9 px-3 text-xs"
            >
              <Download size={13} aria-hidden="true" /> .md
            </button>
            <button type="button" onClick={() => window.print()} className="btn btn-primary min-h-9 px-3 text-xs">
              <Printer size={13} aria-hidden="true" /> Print / PDF
            </button>
            <button ref={closeRef} type="button" onClick={onClose} className="btn btn-ghost min-h-9 w-9 px-0" aria-label="Close report">
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="px-6 py-6 sm:px-8">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-brand pb-4">
            <div>
              <p className="eyebrow text-brand">AyuLink Radar · PHC situation report</p>
              <h2 className="mt-1 text-2xl">{preset.label} setting · Day {displayDay(day)}</h2>
              <p className="mt-1 text-sm text-muted">Generated {new Date().toLocaleString("en-IN")}</p>
            </div>
            <span className="chip chip-info">Simulated data</span>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-alert-soft p-3">
              <p className="mono text-2xl font-semibold text-alert">{alertZones.length}</p>
              <p className="text-xs text-text-2">zones on alert</p>
            </div>
            <div className="rounded-xl bg-watch-soft p-3">
              <p className="mono text-2xl font-semibold text-watch">{watchZones.length}</p>
              <p className="text-xs text-text-2">zones on watch</p>
            </div>
            <div className="rounded-xl bg-brand-soft p-3">
              <p className="mono text-2xl font-semibold text-brand-strong">{queue.length}</p>
              <p className="text-xs text-text-2">people to visit</p>
            </div>
          </div>

          <h3 className="mt-6 text-base">Zones</h3>
          <table className="mt-2 w-full text-left text-sm">
            <thead className="text-[11px] uppercase tracking-wide text-muted">
              <tr className="border-b border-border">
                <th className="py-2 font-semibold">Zone</th>
                <th className="py-2 font-semibold">Level</th>
                <th className="py-2 text-right font-semibold">k / n</th>
                <th className="py-2 text-right font-semibold">p-value</th>
              </tr>
            </thead>
            <tbody>
              {zones.map(({ zone, row }) => (
                <tr key={zone.id} className="border-b border-border/70">
                  <td className="py-2 font-medium">{zone.name}</td>
                  <td className="py-2">
                    <span className={`chip ${row?.level === "alert" ? "chip-alert" : row?.level === "watch" ? "chip-watch" : "chip-brand"}`}>
                      {row?.level ?? "normal"}
                    </span>
                  </td>
                  <td className="mono py-2 text-right">{row ? `${row.k} / ${row.n}` : "—"}</td>
                  <td className="mono py-2 text-right">{row ? fmtP(row.pValue) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3 className="mt-6 text-base">Visit first</h3>
          {top.length === 0 ? (
            <p className="mt-2 text-sm text-muted">No one on the visit-first list today.</p>
          ) : (
            <table className="mt-2 w-full text-left text-sm">
              <thead className="text-[11px] uppercase tracking-wide text-muted">
                <tr className="border-b border-border">
                  <th className="py-2 font-semibold">#</th>
                  <th className="py-2 font-semibold">Code</th>
                  <th className="py-2 font-semibold">Zone</th>
                  <th className="py-2 font-semibold">Status</th>
                  <th className="py-2 font-semibold">Why</th>
                </tr>
              </thead>
              <tbody>
                {top.map((row, index) => (
                  <tr key={row.person.id} className="border-b border-border/70 align-top">
                    <td className="mono py-2 pr-2">{index + 1}</td>
                    <td className="mono whitespace-nowrap py-2 pr-3 font-medium">{row.person.id}</td>
                    <td className="whitespace-nowrap py-2 pr-3">{row.zoneName}</td>
                    <td className="whitespace-nowrap py-2 pr-3">{CASE_LABEL[log[row.person.id]?.status ?? "pending"]}</td>
                    <td className="py-2 text-[12.5px] text-text-2">{row.reasons.join(" · ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <h3 className="mt-6 text-base">Recommended actions</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-text-2">
            {alertZones.length ? (
              <li>
                Send health workers to the listed households in{" "}
                {alertZones.map((z) => z.zone.name).join(", ")} today. Check temperature, ask about
                fever, body pain and weakness.
              </li>
            ) : (
              <li>No zone on alert. Continue routine visits.</li>
            )}
            <li>Report confirmed fever cases through the usual IDSP channel.</li>
            {result.leadDays !== null && result.leadDays > 0 && day >= (result.clinicDetectionDay ?? 99) ? (
              <li>
                In this simulated run, the first cluster alert came {result.leadDays} days before
                simulated clinic-based detection in {zoneName(result, result.outbreakZoneId)}.
              </li>
            ) : null}
          </ul>

          <p className="mt-6 rounded-lg border border-amber-100 bg-watch-soft p-3 text-[12px] text-text-2">
            AyuLink Radar is a screening prototype, not a medical device. It does not identify a
            disease, confirm infection, or replace testing. Population data shown is simulated.
          </p>
        </div>
      </div>
    </div>
  );
}
