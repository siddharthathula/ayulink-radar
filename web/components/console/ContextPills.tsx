"use client";

import { CloudSun, Keyboard, ThermometerSun, Wifi, WifiOff, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { useOnline, useWeather } from "@/lib/ui/hooks";

export function WeatherPill({ lat, lng }: { lat: number; lng: number }) {
  const weather = useWeather(lat, lng);
  if (weather.status === "loading") {
    return (
      <span className="chip">
        <CloudSun size={12} aria-hidden="true" /> Weather…
      </span>
    );
  }
  if (weather.status === "error") {
    return (
      <span className="chip" title="Live weather could not be loaded. The console works without it.">
        <CloudSun size={12} aria-hidden="true" /> Weather offline
      </span>
    );
  }
  const { temperature, maxToday, maxNext, fetchedAt } = weather.data;
  const hot = Math.max(maxToday, ...maxNext) >= 38;
  return (
    <span
      className={`chip ${hot ? "chip-watch" : "chip-info"}`}
      title={`Live weather near the illustrative location (Open-Meteo, CC BY 4.0), fetched ${fetchedAt}. Max next days: ${maxNext
        .map((v) => `${Math.round(v)}°`)
        .join(", ")}. Heat can lift resting HR for everyone at once; the engine's region-wide guard treats that as a regional shift, not a local cluster.`}
    >
      <ThermometerSun size={12} aria-hidden="true" />
      Live {Math.round(temperature)}°C · max {Math.round(maxToday)}°
      {hot ? " · heat watch" : ""}
    </span>
  );
}

export function OnlinePill() {
  const online = useOnline();
  return (
    <span className={`chip ${online ? "chip-brand" : "chip-watch"}`} title="Console connectivity. Bands and gateways do not need internet.">
      {online ? <Wifi size={12} aria-hidden="true" /> : <WifiOff size={12} aria-hidden="true" />}
      {online ? "Console online" : "Console offline · running locally"}
    </span>
  );
}

const SHORTCUTS: Array<[string, string]> = [
  ["Space", "Play / pause timeline"],
  ["← / →", "Previous / next day"],
  ["Home / End", "First / last day"],
  ["1 · 2 · 3", "Village · City · Society"],
  ["C", "Simulate cluster"],
  ["S", "Simulate spread"],
  ["R", "Situation report"],
  ["A", "Ask AyuLink assistant"],
  ["F", "AI forecast tab"],
  ["Esc", "Close drawer or dialog"],
  ["?", "This help"],
];

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    ref.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
      <div className="w-full max-w-sm rounded-2xl bg-surface p-5 shadow-[var(--shadow-lg)]">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-2 font-heading font-bold">
            <Keyboard size={16} className="text-brand" aria-hidden="true" /> Keyboard shortcuts
          </p>
          <button ref={ref} type="button" onClick={onClose} className="btn btn-ghost min-h-9 w-9 px-0" aria-label="Close">
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <dl className="mt-3 divide-y divide-border">
          {SHORTCUTS.map(([key, label]) => (
            <div key={key} className="flex items-center justify-between py-2 text-sm">
              <dt className="text-text-2">{label}</dt>
              <dd>
                <kbd className="mono rounded-md border border-border-strong bg-surface-2 px-2 py-0.5 text-[12px]">{key}</kbd>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
