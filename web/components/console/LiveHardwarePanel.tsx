"use client";

import { useEffect, useRef, useState } from "react";
import { Cable, FlaskConical, HeartPulse, Plug, PlugZap, Thermometer, Wind } from "lucide-react";

/**
 * Live hardware strip for the console.
 *
 * Two clearly separated sources, never mixed with the simulated village:
 *  - LIVE HARDWARE: packets from a real gateway, pushed by
 *    firmware/tools/gateway-bridge.mjs over Server-Sent Events on
 *    http://localhost:8787/live. Only connects when the operator asks.
 *  - TEST PACKET: a synthetic packet the operator sends to /api/ingest to
 *    check the pipeline. Shown in amber and labelled synthetic.
 */

export interface LivePacket {
  band_id: string;
  ts: number;
  hr_bpm: number | null;
  spo2_pct?: number | null;
  skin_temp_c?: number | null;
  worn?: boolean;
  link?: "lora" | "espnow" | string;
  rssi_dbm?: number | null;
  snr_db?: number | null;
  seq?: number;
  source: "hardware" | "test";
  recorded?: boolean;
  ingest?: { accepted: boolean; problems: string[] };
}

const BRIDGE_URL = "http://localhost:8787";
type BridgeState = "off" | "connecting" | "connected" | "lost";

function fmt(value: number | null | undefined, digits = 0, unit = ""): string {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(digits)}${unit}` : "—";
}

export function LiveHardwarePanel() {
  const [bridge, setBridge] = useState<BridgeState>("off");
  const [packet, setPacket] = useState<LivePacket | null>(null);
  const [count, setCount] = useState(0);
  const [flash, setFlash] = useState(false);
  const [testing, setTesting] = useState(false);
  const [silent, setSilent] = useState(false);
  const sourceRef = useRef<EventSource | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      sourceRef.current?.close();
      if (flashTimer.current) clearTimeout(flashTimer.current);
    },
    [],
  );

  function show(next: LivePacket) {
    setPacket(next);
    setCount((c) => c + 1);
    setFlash(true);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(false), 2500);
  }

  function connect() {
    if (sourceRef.current) {
      sourceRef.current.close();
      sourceRef.current = null;
      setBridge("off");
      return;
    }
    setBridge("connecting");
    try {
      const es = new EventSource(`${BRIDGE_URL}/live`);
      sourceRef.current = es;
      es.onopen = () => setBridge("connected");
      es.onerror = () => setBridge((s) => (s === "connected" ? "lost" : "connecting"));
      es.addEventListener("status", (event) => {
        try {
          const st = JSON.parse((event as MessageEvent).data) as { gatewaySilent?: boolean };
          setSilent(Boolean(st.gatewaySilent));
        } catch {
          // ignore malformed event
        }
      });
      es.addEventListener("packet", (event) => {
        try {
          show(JSON.parse((event as MessageEvent).data) as LivePacket);
        } catch {
          // ignore malformed event
        }
      });
    } catch {
      setBridge("lost");
    }
  }

  async function sendTestPacket() {
    setTesting(true);
    const synthetic: LivePacket = {
      band_id: "TEST-D103",
      ts: Math.floor(Date.now() / 1000),
      hr_bpm: 72 + Math.round(Math.random() * 8),
      spo2_pct: 97,
      skin_temp_c: 33.4,
      worn: true,
      link: "lora",
      rssi_dbm: null,
      snr_db: null,
      source: "test",
    };
    try {
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          band_id: synthetic.band_id,
          ts: synthetic.ts,
          hr_bpm: synthetic.hr_bpm,
          activity: 0.2,
          worn: true,
          fall: false,
          seizure: false,
          spo2_pct: synthetic.spo2_pct,
          skin_temp_c: synthetic.skin_temp_c,
          modules: ["ppg", "temp", "imu", "lora"],
          source: "test",
        }),
      });
      const body = (await res.json()) as { results?: Array<{ accepted: boolean; problems: string[] }> };
      const r = body.results?.[0];
      show({ ...synthetic, ingest: r ? { accepted: r.accepted, problems: r.problems } : undefined });
    } catch {
      show({ ...synthetic, ingest: { accepted: false, problems: ["network error"] } });
    } finally {
      setTesting(false);
    }
  }

  const isHardware = packet?.source === "hardware";
  const linkName = packet?.link === "lora" ? "LoRa" : packet?.link === "espnow" ? "ESP-NOW" : "radio";
  const badge = !packet
    ? null
    : isHardware && packet.recorded
      ? { text: `Recorded hardware packet (${linkName} replay)`, cls: "chip chip-info" }
      : isHardware
        ? { text: `Live ${linkName} packet received`, cls: "chip chip-brand" }
        : { text: "Test packet — synthetic", cls: "chip chip-watch" };

  return (
    <div className="mt-3 rounded-xl border border-border bg-surface-2/60 p-3" aria-live="polite">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[12.5px] font-semibold">
          <Cable size={13} aria-hidden="true" /> Real hardware
        </p>
        <span
          className={`chip ${bridge === "connected" && silent ? "chip-watch" : bridge === "connected" ? "chip-brand" : bridge === "lost" ? "chip-alert" : "chip-info"}`}
        >
          {bridge === "connected" && silent ? "Gateway silent" : bridge === "connected" ? "Bridge connected" : bridge === "connecting" ? "Connecting…" : bridge === "lost" ? "Bridge lost" : "Not connected"}
        </span>
      </div>

      {packet ? (
        <div
          className={`mt-2 rounded-lg border p-2.5 transition-colors ${
            flash ? (isHardware ? "border-brand bg-brand-soft" : "border-[var(--watch-fill)] bg-[var(--watch-soft)]") : "border-border bg-surface"
          }`}
        >
          {badge ? <span className={badge.cls}>{badge.text}</span> : null}
          <p className="mono mt-1.5 text-[11px] text-muted">
            {packet.band_id}
            {packet.seq !== undefined ? ` · seq ${packet.seq}` : ""}
            {isHardware && packet.rssi_dbm != null ? ` · RSSI ${packet.rssi_dbm} dBm` : ""}
            {isHardware && packet.snr_db != null ? ` · SNR ${fmt(packet.snr_db, 1)} dB` : ""}
          </p>
          <div className="mt-1.5 grid grid-cols-3 gap-1.5 text-center">
            <div className="rounded-md bg-surface-2 px-1 py-1.5">
              <HeartPulse size={13} className="mx-auto text-[var(--vitals)]" aria-hidden="true" />
              <p className="mono text-[14px] font-semibold">{fmt(packet.hr_bpm)}</p>
              <p className="text-[10px] text-muted">BPM</p>
            </div>
            <div className="rounded-md bg-surface-2 px-1 py-1.5">
              <Wind size={13} className="mx-auto text-info" aria-hidden="true" />
              <p className="mono text-[14px] font-semibold">{fmt(packet.spo2_pct, 0, "%")}</p>
              <p className="text-[10px] text-muted">SpO₂</p>
            </div>
            <div className="rounded-md bg-surface-2 px-1 py-1.5">
              <Thermometer size={13} className="mx-auto text-watch" aria-hidden="true" />
              <p className="mono text-[14px] font-semibold">{fmt(packet.skin_temp_c, 1, "°")}</p>
              <p className="text-[10px] text-muted">skin °C</p>
            </div>
          </div>
          {packet.ingest ? (
            <p className="mt-1.5 text-[11px] text-muted">
              /api/ingest: {packet.ingest.accepted ? "accepted" : `rejected (${packet.ingest.problems.join("; ")})`}
            </p>
          ) : null}
          <p className="mt-1 text-[10.5px] text-muted">{count} packet{count === 1 ? "" : "s"} this session · not mixed into the simulated village</p>
        </div>
      ) : (
        <p className="mt-2 text-[11.5px] leading-relaxed text-muted">
          Plug the gateway into this computer and run{" "}
          <span className="mono">node firmware/tools/gateway-bridge.mjs --port /dev/ttyUSB0</span>, then connect.
        </p>
      )}

      <div className="mt-2 flex flex-wrap gap-1.5">
        <button type="button" onClick={connect} className="btn min-h-8 px-2.5 text-[12px]">
          {bridge === "off" ? <PlugZap size={13} aria-hidden="true" /> : <Plug size={13} aria-hidden="true" />}
          {bridge === "off" ? "Connect bridge" : "Disconnect"}
        </button>
        <button type="button" onClick={sendTestPacket} disabled={testing} className="btn btn-ghost min-h-8 px-2.5 text-[12px] text-muted">
          <FlaskConical size={13} aria-hidden="true" /> {testing ? "Sending…" : "Send test packet"}
        </button>
      </div>
    </div>
  );
}
