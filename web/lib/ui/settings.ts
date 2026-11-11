"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { Lang, Mode } from "@/lib/engine/types";

export type ThemePref = "system" | "light" | "dark";
export type Basemap = "auto" | "street" | "terrain" | "satellite" | "light" | "dark";

export interface Settings {
  theme: ThemePref;
  highContrast: boolean;
  colorSafe: boolean;
  reduceMotion: boolean;
  basemap: Basemap;
  scrollZoom: boolean;
  showZoneLabels: boolean;
  showDots: boolean;
  defaultMode: Mode;
  playbackSpeed: 1 | 2 | 4;
  noteLanguage: Lang;
  showHints: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  highContrast: false,
  colorSafe: false,
  reduceMotion: false,
  basemap: "auto",
  scrollZoom: true,
  showZoneLabels: true,
  showDots: true,
  defaultMode: "village",
  playbackSpeed: 1,
  noteLanguage: "en",
  showHints: true,
};

import { SETTINGS_KEY } from "./themeBoot";
export { SETTINGS_KEY };

const listeners = new Set<() => void>();
let memoryRaw: string | null = null;
let cachedRaw: string | null | undefined;
let cached: Settings = DEFAULT_SETTINGS;

function read(): Settings {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(SETTINGS_KEY);
  } catch {
    raw = memoryRaw;
  }
  if (raw === null) raw = memoryRaw;
  if (raw === cachedRaw) return cached;
  cachedRaw = raw;
  try {
    cached = raw ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) } : DEFAULT_SETTINGS;
  } catch {
    cached = DEFAULT_SETTINGS;
  }
  return cached;
}

function write(next: Settings) {
  const raw = JSON.stringify(next);
  memoryRaw = raw;
  try {
    window.localStorage.setItem(SETTINGS_KEY, raw);
  } catch {
    // memory copy only
  }
  applySettingsToDocument(next);
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === SETTINGS_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onMedia = () => applySettingsToDocument(read());
  media.addEventListener("change", onMedia);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
    media.removeEventListener("change", onMedia);
  };
}

export function resolvedTheme(theme: ThemePref): "light" | "dark" {
  if (theme !== "system") return theme;
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function applySettingsToDocument(settings: Settings) {
  const root = document.documentElement;
  root.dataset.theme = resolvedTheme(settings.theme);
  root.dataset.contrast = settings.highContrast ? "high" : "normal";
  root.dataset.colors = settings.colorSafe ? "safe" : "default";
  root.dataset.motion = settings.reduceMotion ? "reduce" : "normal";
  root.style.colorScheme = root.dataset.theme;
}

export function useSettings(): [Settings, (patch: Partial<Settings>) => void, () => void] {
  const settings = useSyncExternalStore(subscribe, read, () => DEFAULT_SETTINGS);
  const update = useCallback((patch: Partial<Settings>) => write({ ...read(), ...patch }), []);
  const reset = useCallback(() => write(DEFAULT_SETTINGS), []);
  return [settings, update, reset];
}

/** Theme actually in effect, tracking the OS setting when theme is "system". */
export function useResolvedTheme(): "light" | "dark" {
  const [settings] = useSettings();
  return useSyncExternalStore(
    subscribe,
    () => resolvedTheme(settings.theme),
    () => "light" as const,
  );
}
