import type { Basemap } from "./settings";

export interface BasemapDef {
  id: Exclude<Basemap, "auto">;
  label: string;
  url: string;
  attribution: string;
  maxNativeZoom: number;
  subdomains?: string;
  /** Optional transparent label layer drawn above the base tiles. */
  labelsUrl?: string;
  muted?: boolean;
}

const OSM = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors';
const ESRI_CANVAS = `Tiles &copy; <a href="https://www.esri.com" target="_blank" rel="noreferrer">Esri</a> — Esri, HERE, Garmin, ${OSM}, and the GIS user community`;
const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services";

/**
 * Optional CARTO key. Since 25 Sep 2026 CARTO raster tiles need a (free) key and
 * return an "API KEY REQUIRED" image without one. With no key we use Esri's
 * keyless Canvas basemaps instead, so the map always works out of the box.
 * The key ends up in the browser, so treat it as public and restrict it to your domain.
 */
const CARTO_KEY = (process.env.NEXT_PUBLIC_CARTO_KEY ?? "").trim();

function cartoOr(style: "light_all" | "dark_all", fallback: Omit<BasemapDef, "id" | "label">): Omit<BasemapDef, "id" | "label"> {
  if (!CARTO_KEY) return fallback;
  return {
    url: `https://basemaps.cartocdn.com/${style}/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(CARTO_KEY)}`,
    attribution: `${OSM} &copy; <a href="https://carto.com/attributions" target="_blank" rel="noreferrer">CARTO</a>`,
    maxNativeZoom: 20,
  };
}

/**
 * Tile sources that work with no key. Each keeps its required attribution.
 * Check each provider's usage policy before heavy or commercial use.
 */
export const BASEMAPS: Record<BasemapDef["id"], BasemapDef> = {
  street: {
    id: "street",
    label: "Street",
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: OSM,
    maxNativeZoom: 19,
    muted: true,
  },
  terrain: {
    id: "terrain",
    label: "Terrain",
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    subdomains: "abc",
    attribution: `Map data ${OSM}, SRTM | Style &copy; <a href="https://opentopomap.org" target="_blank" rel="noreferrer">OpenTopoMap</a> (CC-BY-SA)`,
    maxNativeZoom: 17,
  },
  satellite: {
    id: "satellite",
    label: "Satellite",
    url: `${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`,
    labelsUrl: `${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`,
    attribution:
      'Tiles &copy; <a href="https://www.esri.com" target="_blank" rel="noreferrer">Esri</a> — Source: Esri, Maxar, Earthstar Geographics, and the GIS user community',
    maxNativeZoom: 18,
  },
  light: {
    id: "light",
    label: "Light",
    ...cartoOr("light_all", {
      url: `${ESRI}/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`,
      labelsUrl: `${ESRI}/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}`,
      attribution: ESRI_CANVAS,
      maxNativeZoom: 16,
    }),
  },
  dark: {
    id: "dark",
    label: "Dark",
    ...cartoOr("dark_all", {
      url: `${ESRI}/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`,
      labelsUrl: `${ESRI}/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`,
      attribution: ESRI_CANVAS,
      maxNativeZoom: 16,
    }),
  },
};

export const BASEMAP_OPTIONS: Array<{ id: Basemap; label: string }> = [
  { id: "auto", label: "Auto" },
  { id: "street", label: "Street" },
  { id: "terrain", label: "Terrain" },
  { id: "satellite", label: "Satellite" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];

export function resolveBasemap(choice: Basemap, theme: "light" | "dark"): BasemapDef {
  if (choice === "auto") return theme === "dark" ? BASEMAPS.dark : BASEMAPS.light;
  return BASEMAPS[choice];
}
