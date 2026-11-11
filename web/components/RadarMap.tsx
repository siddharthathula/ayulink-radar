"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { Crosshair, Layers, Maximize2, Minimize2, Mountain, Satellite, Map as MapIcon, Moon, Sun } from "lucide-react";
import type { DayObs, DriftPoint, Mode, Person, Zone, ZoneDay } from "@/lib/engine/types";
import { useOnline } from "@/lib/ui/hooks";
import { useResolvedTheme, useSettings, type Basemap } from "@/lib/ui/settings";
import { resolveBasemap } from "@/lib/ui/basemaps";
import { RadarMapSvg } from "./RadarMapSvg";

const HEIGHT = "h-[440px] sm:h-[520px] xl:h-[580px] 2xl:h-[640px]";

const RadarMapLeaflet = dynamic(() => import("./RadarMapLeaflet"), {
  ssr: false,
  loading: () => (
    <div className={`flex w-full items-center justify-center bg-[var(--map-bg)] text-sm text-muted ${HEIGHT}`}>
      Loading map…
    </div>
  ),
});

export interface RadarMapProps {
  mode: Mode;
  zones: Zone[];
  people: Person[];
  obs: Record<string, DayObs[]>;
  drift: Record<string, DriftPoint[]>;
  zoneDays: ZoneDay[];
  day: number;
  seed: number;
  rhythmFlags: Record<string, boolean>;
  selectedZoneId: string | null;
  selectedPersonId: string | null;
  onSelectZone: (zoneId: string | null) => void;
  onSelectPerson: (personId: string) => void;
  forceSvg: boolean;
}

const LAYER_BUTTONS: Array<{ id: Basemap; label: string; Icon: typeof MapIcon }> = [
  { id: "auto", label: "Auto", Icon: Layers },
  { id: "street", label: "Street", Icon: MapIcon },
  { id: "terrain", label: "Terrain", Icon: Mountain },
  { id: "satellite", label: "Satellite", Icon: Satellite },
  { id: "light", label: "Light", Icon: Sun },
  { id: "dark", label: "Dark", Icon: Moon },
];

export function RadarMap(props: RadarMapProps) {
  const [failedFor, setFailedFor] = useState<string | null>(null);
  const [recenterKey, setRecenterKey] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const offline = !useOnline();
  const [settings, update] = useSettings();
  const theme = useResolvedTheme();
  const basemap = resolveBasemap(settings.basemap, theme);
  const tileFailed = failedFor === basemap.id;
  const showSvg = props.forceSvg || offline || tileFailed;

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === wrapRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await wrapRef.current?.requestFullscreen();
    } catch {
      // Fullscreen can be blocked (iframes, iOS). The map still works.
    }
  }

  const { forceSvg, ...shared } = props;
  void forceSvg;
  const heightClass = fullscreen ? "h-[calc(100vh-112px)]" : HEIGHT;

  return (
    <div ref={wrapRef} className="map-fullscreen card overflow-hidden bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Base map">
          {LAYER_BUTTONS.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              aria-pressed={settings.basemap === id}
              onClick={() => update({ basemap: id })}
              disabled={showSvg && !tileFailed}
              className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-semibold transition-colors ${
                settings.basemap === id
                  ? "bg-brand text-[var(--brand-ink)]"
                  : "text-text-2 hover:bg-surface-2"
              } disabled:opacity-40`}
              title={`${label} map`}
            >
              <Icon size={13} aria-hidden="true" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setRecenterKey((value) => value + 1)}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-semibold text-text-2 hover:bg-surface-2"
            title="Fit all zones"
          >
            <Crosshair size={13} aria-hidden="true" /> <span className="hidden md:inline">Recenter</span>
          </button>
          <button
            type="button"
            onClick={toggleFullscreen}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-semibold text-text-2 hover:bg-surface-2"
            title={fullscreen ? "Exit full screen" : "Full screen"}
          >
            {fullscreen ? <Minimize2 size={13} aria-hidden="true" /> : <Maximize2 size={13} aria-hidden="true" />}
            <span className="hidden md:inline">{fullscreen ? "Exit" : "Full screen"}</span>
          </button>
        </div>
      </div>

      {showSvg ? (
        <div>
          {tileFailed ? (
            <div className="flex items-center justify-between gap-2 border-b border-amber-100 bg-watch-soft px-3 py-1.5 text-[12px] text-watch">
              <span>{basemap.label} tiles did not load. Showing the schematic view.</span>
              <button type="button" className="font-semibold underline" onClick={() => setFailedFor(null)}>
                Retry
              </button>
            </div>
          ) : null}
          <RadarMapSvg {...shared} />
        </div>
      ) : (
        <RadarMapLeaflet
          {...shared}
          basemap={basemap}
          scrollZoom={settings.scrollZoom}
          showZoneLabels={settings.showZoneLabels}
          showDots={settings.showDots}
          theme={theme}
          recenterKey={recenterKey}
          heightClass={heightClass}
          onTileFailure={() => setFailedFor(basemap.id)}
        />
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border px-4 py-2 text-[12px] text-text-2">
        <span className="inline-flex items-center gap-1.5">
          <span className="dot border border-[var(--surface)] bg-[var(--dot-normal)] shadow-[0_0_0_1px_var(--dot-normal-stroke)]" /> Normal
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="dot bg-[var(--dot-watch)] shadow-[0_0_0_1px_var(--dot-watch-stroke)]" /> Drift flag
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="dot border-2 border-[var(--dot-rhythm)] bg-transparent" /> Rhythm screen
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="dot border border-[var(--dot-normal-stroke)] bg-transparent" /> Not worn today
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-3.5 rounded-sm border-2 border-[var(--dot-watch)]" /> Watch zone
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-3.5 rounded-sm border-2 border-[var(--dot-alert)] bg-[color-mix(in_srgb,var(--dot-alert)_25%,transparent)]" /> Cluster alert
        </span>
        <span className="ml-auto text-[11px] text-muted">
          {showSvg ? "Schematic" : `${basemap.label} map`} · drag to pan{settings.scrollZoom ? ", scroll to zoom" : ""}
        </span>
      </div>
      <p className="border-t border-border bg-surface-2/60 px-4 py-2 text-[11px] leading-relaxed text-muted">
        Illustrative zones on a real basemap. No real deployment at this location. Dot positions are random, not homes.
      </p>
    </div>
  );
}
