import type { Basemap } from "./settings";

export interface BasemapDef {
  id: Exclude<Basemap, "auto">;
  label: string;
  url: string;
  attribution: string;
  maxNativeZoom: number;
  subdomains?: string;
  muted?: boolean;
}

/**
 * Free tile sources that need no key. Each keeps its required attribution.
 * Check each provider's usage policy before heavy or commercial use.
 */
export const BASEMAPS: Record<BasemapDef["id"], BasemapDef> = {
  street: {
    id: "street",
    label: "Street",
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
    maxNativeZoom: 19,
    muted: true,
  },
  terrain: {
    id: "terrain",
    label: "Terrain",
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    subdomains: "abc",
    attribution:
      'Map data &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors, SRTM | Style &copy; <a href="https://opentopomap.org" target="_blank" rel="noreferrer">OpenTopoMap</a> (CC-BY-SA)',
    maxNativeZoom: 17,
  },
  satellite: {
    id: "satellite",
    label: "Satellite",
    url: "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg",
    attribution:
      '<a href="https://s2maps.eu" target="_blank" rel="noreferrer">Sentinel-2 cloudless</a> by EOX IT Services GmbH (contains modified Copernicus Sentinel data 2016)',
    maxNativeZoom: 15,
  },
  light: {
    id: "light",
    label: "Light",
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    subdomains: "abcd",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions" target="_blank" rel="noreferrer">CARTO</a>',
    maxNativeZoom: 20,
  },
  dark: {
    id: "dark",
    label: "Dark",
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    subdomains: "abcd",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions" target="_blank" rel="noreferrer">CARTO</a>',
    maxNativeZoom: 20,
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
