"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import type { LayerGroup, Map as LeafletMap, TileLayer } from "leaflet";
import type { DayObs, DriftPoint, Mode, Person, Zone, ZoneDay } from "@/lib/engine/types";
import { allBounds, dotPosition, zoneBounds } from "@/lib/ui/geo";
import type { BasemapDef } from "@/lib/ui/basemaps";

interface Props {
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
  onTileFailure: () => void;
  basemap: BasemapDef;
  scrollZoom: boolean;
  showZoneLabels: boolean;
  showDots: boolean;
  theme: "light" | "dark";
  recenterKey: number;
  heightClass: string;
}

/** Read a colour token from CSS so the map follows theme and colour settings. */
function token(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function fitAll(map: LeafletMap, mode: Mode) {
  const bounds = allBounds(mode);
  map.fitBounds(
    [
      [bounds.south, bounds.west],
      [bounds.north, bounds.east],
    ],
    { padding: [28, 28] },
  );
}

export default function RadarMapLeaflet(props: Props) {
  const {
    mode,
    zones,
    people,
    obs,
    drift,
    zoneDays,
    day,
    seed,
    rhythmFlags,
    selectedZoneId,
    selectedPersonId,
    onSelectZone,
    onSelectPerson,
    onTileFailure,
    basemap,
    scrollZoom,
    showZoneLabels,
    showDots,
    theme,
    recenterKey,
    heightClass,
  } = props;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<LayerGroup | null>(null);
  const tileRef = useRef<TileLayer | null>(null);
  const labelsRef = useRef<TileLayer | null>(null);
  const onTileFailureRef = useRef(onTileFailure);
  useEffect(() => {
    onTileFailureRef.current = onTileFailure;
  }, [onTileFailure]);
  const [ready, setReady] = useState(false);

  // Create the map once.
  useEffect(() => {
    let removed = false;
    let map: LeafletMap | null = null;
    (async () => {
      const L = await import("leaflet");
      if (removed || !containerRef.current) return;
      map = L.map(containerRef.current, {
        zoomControl: true,
        scrollWheelZoom: true,
        dragging: true,
        touchZoom: true,
        doubleClickZoom: true,
        attributionControl: true,
        minZoom: 4,
        maxZoom: 18,
        worldCopyJump: true,
      });
      mapRef.current = map;
      fitAll(map, mode);
      layerRef.current = L.layerGroup().addTo(map);
      setReady(true);
    })();
    return () => {
      removed = true;
      layerRef.current = null;
      tileRef.current = null;
      labelsRef.current = null;
      map?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Base layer. Swapped when the setting or theme changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    (async () => {
      const L = await import("leaflet");
      if (cancelled) return;
      tileRef.current?.remove();
      labelsRef.current?.remove();
      labelsRef.current = null;
      let loaded = false;
      let errors = 0;
      const tiles = L.tileLayer(basemap.url, {
        maxZoom: 19,
        maxNativeZoom: basemap.maxNativeZoom,
        subdomains: basemap.subdomains ?? "abc",
        attribution: basemap.attribution,
        className: basemap.muted ? "tiles-muted" : "",
        crossOrigin: true,
      });
      tiles.on("tileload", () => {
        loaded = true;
      });
      tiles.on("tileerror", () => {
        errors += 1;
        if (errors >= 6 && !loaded) onTileFailureRef.current();
      });
      tiles.addTo(map);
      tiles.bringToBack();
      tileRef.current = tiles;
      if (basemap.labelsUrl) {
        // Place-name labels above the base, below our zones (overlay pane is above tile pane).
        const labels = L.tileLayer(basemap.labelsUrl, {
          maxZoom: 19,
          maxNativeZoom: basemap.maxNativeZoom,
          crossOrigin: true,
          opacity: 0.9,
        });
        labels.addTo(map);
        labelsRef.current = labels;
      }
      timer = setTimeout(() => {
        if (!loaded) onTileFailureRef.current();
      }, 6000);
    })();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [basemap, ready]);

  // Scroll-wheel zoom follows the setting.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (scrollZoom) map.scrollWheelZoom.enable();
    else map.scrollWheelZoom.disable();
  }, [scrollZoom, ready]);

  // Refit on mode change or when the user presses "Recenter".
  useEffect(() => {
    const map = mapRef.current;
    if (map) fitAll(map, mode);
  }, [mode, recenterKey]);

  // Leaflet needs to know when its box changes size (fullscreen, layout).
  useEffect(() => {
    const map = mapRef.current;
    const element = containerRef.current;
    if (!map || !element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(element);
    return () => observer.disconnect();
  }, [ready]);

  // Zones and dots.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    let cancelled = false;
    (async () => {
      const L = await import("leaflet");
      if (cancelled) return;
      const group = layerRef.current ?? L.layerGroup().addTo(map);
      layerRef.current = group;
      group.clearLayers();

      const onImagery = basemap.id === "satellite";
      const C = {
        normal: token("--dot-normal", "#4B9B6E"),
        normalStroke: token("--dot-normal-stroke", "#2E7D5C"),
        watch: token("--dot-watch", "#F59E0B"),
        watchStroke: token("--dot-watch-stroke", "#B45309"),
        alert: token("--dot-alert", "#F44336"),
        rhythm: token("--dot-rhythm", "#9C27B0"),
        text: token("--text", "#0F2219"),
        ring: theme === "dark" || onImagery ? "#0b1310" : "#ffffff",
        select: onImagery ? "#ffffff" : token("--text", "#0F2219"),
      };

      const levelByZone = new Map<string, string>();
      for (const row of zoneDays) if (row.day === day) levelByZone.set(row.zoneId, row.level);

      for (const zone of zones) {
        const bounds = zoneBounds(mode, zone);
        const level = levelByZone.get(zone.id) ?? "normal";
        const color = level === "alert" ? C.alert : level === "watch" ? C.watch : onImagery ? "#ffffff" : C.normal;
        const rectangle = L.rectangle(
          [
            [bounds.south, bounds.west],
            [bounds.north, bounds.east],
          ],
          {
            color: selectedZoneId === zone.id ? C.select : color,
            weight: selectedZoneId === zone.id ? 3 : level === "normal" ? 1.4 : 2.6,
            opacity: level === "normal" ? (onImagery ? 0.85 : 0.75) : 1,
            fillColor: level === "normal" ? C.normal : color,
            fillOpacity: level === "alert" ? 0.24 : level === "watch" ? 0.16 : onImagery ? 0.02 : 0.05,
            dashArray: level === "normal" ? "5 5" : undefined,
          },
        );
        rectangle.on("click", () => onSelectZone(zone.id));
        const wearers = people.filter((person) => person.zoneId === zone.id).length;
        if (showZoneLabels || level !== "normal") {
          rectangle.bindTooltip(
            level === "normal"
              ? `${zone.name} · ${wearers} wearers`
              : `${zone.name} · ${level === "alert" ? "Cluster alert" : "Watch"}`,
            {
              permanent: true,
              direction: "center",
              className: `zone-tip ${level === "alert" ? "zone-tip-alert" : level === "watch" ? "zone-tip-watch" : ""}`,
              opacity: 1,
            },
          );
        } else {
          rectangle.bindTooltip(`${zone.name} · ${wearers} wearers`, { className: "zone-tip", opacity: 1 });
        }
        rectangle.addTo(group);
      }

      if (!showDots) return;
      for (const person of people) {
        const zone = zones.find((row) => row.id === person.zoneId);
        if (!zone) continue;
        const point = dotPosition(mode, zone, person, seed);
        const worn = obs[person.id]?.[day]?.valid === true;
        const flagged = drift[person.id]?.[day]?.flagged === true;
        const rhythm = rhythmFlags[person.id] === true;
        const selected = selectedPersonId === person.id;
        const fill = flagged ? C.watch : C.normal;
        const stroke = flagged ? C.watchStroke : C.normalStroke;

        if (rhythm && worn) {
          L.circleMarker([point.lat, point.lng], {
            radius: 8,
            color: C.rhythm,
            weight: 2,
            fill: false,
            opacity: 1,
            interactive: false,
          }).addTo(group);
        }

        const marker = L.circleMarker([point.lat, point.lng], {
          radius: flagged ? 5.5 : 4,
          color: selected ? C.select : worn ? C.ring : stroke,
          weight: selected ? 2.5 : worn ? 1.2 : 1.2,
          opacity: worn ? 1 : 0.7,
          fillColor: fill,
          fillOpacity: worn ? (flagged ? 1 : 0.85) : 0,
        });
        if (mode !== "society") {
          marker.bindTooltip(
            `${person.id} · ${person.age}${person.sex}${flagged ? " · drift flag" : worn ? "" : " · not worn today"}${rhythm ? " · rhythm screen" : ""}`,
            { direction: "top", className: "zone-tip", opacity: 1 },
          );
          marker.on("click", () => onSelectPerson(person.id));
        }
        marker.addTo(group);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, mode, zones, people, obs, drift, zoneDays, day, seed, rhythmFlags, selectedZoneId, selectedPersonId, basemap, showZoneLabels, showDots, theme]);

  return (
    <div
      ref={containerRef}
      className={`w-full ${heightClass}`}
      role="application"
      aria-label="Radar map of illustrative zones. Drag to pan, scroll or pinch to zoom, tap a zone to filter alerts. Dot positions are random and carry no address information."
    />
  );
}
