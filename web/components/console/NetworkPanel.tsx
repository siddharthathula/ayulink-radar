"use client";

import { useMemo } from "react";
import { BatteryMedium, CloudOff, RadioTower, RefreshCcw, Wifi } from "lucide-react";
import type { SimResult } from "@/lib/engine/types";
import { formatAgo, gatewayTelemetry } from "@/lib/ui/ops";
import { LiveHardwarePanel } from "@/components/console/LiveHardwarePanel";

export function NetworkPanel({ result, day }: { result: SimResult; day: number }) {
  const rows = useMemo(() => gatewayTelemetry(result, day), [result, day]);
  const buffering = rows.filter((row) => row.uplink === "buffering");
  const totalPackets = rows.reduce((sum, row) => sum + row.packetsToday, 0);
  const rejected = rows.reduce((sum, row) => sum + row.rejected, 0);

  return (
    <section className="card p-4" aria-label="Gateway network">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-info-soft text-info">
            <RadioTower size={16} aria-hidden="true" />
          </span>
          <div>
            <h3 className="text-[15px]">LoRa network</h3>
            <p className="text-[11px] text-muted">Store-and-forward · simulated telemetry</p>
          </div>
        </div>
        <span className={`chip ${buffering.length ? "chip-watch" : "chip-brand"}`}>
          {buffering.length ? <CloudOff size={12} aria-hidden="true" /> : <Wifi size={12} aria-hidden="true" />}
          {buffering.length ? `${buffering.length} buffering` : "All synced"}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-center">
        <div className="rounded-lg bg-surface-2 px-2 py-2">
          <p className="mono text-[17px] font-semibold">{totalPackets.toLocaleString("en-IN")}</p>
          <p className="text-[10.5px] text-muted">packets today</p>
        </div>
        <div className="rounded-lg bg-surface-2 px-2 py-2">
          <p className="mono text-[17px] font-semibold text-watch">{rejected}</p>
          <p className="text-[10.5px] text-muted">days failed quality gate</p>
        </div>
      </div>

      <ul className="mt-3 divide-y divide-border">
        {rows.map((row) => (
          <li key={row.gatewayId} className="flex items-center gap-2.5 py-2" title={`Signal ${row.rssi} dBm`}>
            <span
              className={`relative h-2 w-2 shrink-0 rounded-full ${
                row.uplink === "buffering"
                  ? "bg-[var(--amber-400)] text-[var(--amber-400)] live-dot"
                  : "bg-[var(--green-500)]"
              }`}
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-[12.5px] font-semibold">
                <span className="mono text-muted">{row.gatewayId}</span>
                <span className="truncate">{row.zoneName}</span>
              </p>
              <p className="text-[11px] text-muted">
                {row.uplink === "buffering" ? (
                  <span className="text-watch">
                    Uplink down · {row.buffered.toLocaleString("en-IN")} packets held on gateway
                  </span>
                ) : row.uplink === "flushed" ? (
                  <span className="inline-flex items-center gap-1 text-brand">
                    <RefreshCcw size={10} aria-hidden="true" /> Backlog flushed · no data lost
                  </span>
                ) : (
                  <>
                    {row.bandsActive}/{row.bandsTotal} bands · synced {formatAgo(row.lastSyncMin)}
                  </>
                )}
              </p>
            </div>
            <span className="mono inline-flex shrink-0 items-center gap-0.5 text-[10.5px] text-muted">
              <BatteryMedium size={12} aria-hidden="true" />
              {row.battery}%
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[10.5px] leading-snug text-muted">
        Bands need no internet. Each gateway keeps packets when its uplink drops and forwards them
        later, so the console catches up without gaps.
      </p>
          <LiveHardwarePanel />
    </section>
  );
}
