"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { CaseStatus } from "./ops";

export interface CaseEntry {
  status: CaseStatus;
  worker?: string;
  note?: string;
  updatedDay: number;
}

/* Tiny localStorage-backed store. Falls back to memory when storage is blocked. */
const memory = new Map<string, string>();
const listeners = new Set<() => void>();

function readRaw(key: string): string | null {
  try {
    const value = window.localStorage.getItem(key);
    if (value !== null) return value;
  } catch {
    // fall through to memory
  }
  return memory.get(key) ?? null;
}

function writeRaw(key: string, value: string | null) {
  if (value === null) memory.delete(key);
  else memory.set(key, value);
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // memory copy is enough
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Case log for the visit list. Per-browser only; never shared or sent anywhere. */
export function useCaseLog(storageKey: string) {
  const raw = useSyncExternalStore(
    subscribe,
    () => readRaw(storageKey),
    () => null,
  );

  const log = useMemo<Record<string, CaseEntry>>(() => {
    if (!raw) return {};
    try {
      return JSON.parse(raw) as Record<string, CaseEntry>;
    } catch {
      return {};
    }
  }, [raw]);

  const update = useCallback(
    (personId: string, entry: Partial<CaseEntry> & { updatedDay: number }) => {
      let previous: Record<string, CaseEntry> = {};
      try {
        previous = JSON.parse(readRaw(storageKey) ?? "{}") as Record<string, CaseEntry>;
      } catch {
        previous = {};
      }
      const next: Record<string, CaseEntry> = {
        ...previous,
        [personId]: { ...{ status: "pending" as CaseStatus, updatedDay: entry.updatedDay }, ...previous[personId], ...entry },
      };
      writeRaw(storageKey, JSON.stringify(next));
    },
    [storageKey],
  );

  const clear = useCallback(() => writeRaw(storageKey, null), [storageKey]);

  return { log, update, clear };
}

export interface WeatherNow {
  temperature: number;
  humidity: number;
  maxToday: number;
  maxNext: number[];
  fetchedAt: string;
}

export type WeatherState =
  | { status: "loading" }
  | { status: "ok"; data: WeatherNow }
  | { status: "error" };

/**
 * Real weather near the illustrative location (Open-Meteo, free, no key, CC BY 4.0).
 * Shown beside simulated surveillance data and labelled as real.
 */
export function useWeather(lat: number, lng: number): WeatherState {
  const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  const [result, setResult] = useState<{ key: string; state: WeatherState } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lng.toFixed(3)}` +
      `&current=temperature_2m,relative_humidity_2m&daily=temperature_2m_max&timezone=Asia%2FKolkata&forecast_days=4`;
    fetch(url, { signal: AbortSignal.timeout(6000) })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("bad status"))))
      .then(
        (json: {
          current?: { temperature_2m?: number; relative_humidity_2m?: number };
          daily?: { temperature_2m_max?: number[] };
        }) => {
          const t = json.current?.temperature_2m;
          const h = json.current?.relative_humidity_2m;
          const maxes = json.daily?.temperature_2m_max ?? [];
          if (typeof t !== "number" || maxes.length === 0) throw new Error("missing fields");
          if (cancelled) return;
          setResult({
            key,
            state: {
              status: "ok",
              data: {
                temperature: t,
                humidity: typeof h === "number" ? h : NaN,
                maxToday: maxes[0],
                maxNext: maxes.slice(1),
                fetchedAt: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
              },
            },
          });
        },
      )
      .catch(() => {
        if (!cancelled) setResult({ key, state: { status: "error" } });
      });
    return () => {
      cancelled = true;
    };
  }, [key, lat, lng]);

  return result && result.key === key ? result.state : { status: "loading" };
}

function subscribeOnline(listener: () => void) {
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => {
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}
