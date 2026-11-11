# Third-party notices

AyuLink Radar is MIT-licensed. This file lists every third-party package,
dataset and tile service used. Versions are the resolved versions at the time
of writing; `web/package-lock.json` and `ml/requirements.txt` are authoritative.

## Code and libraries

| Name | Version | License | URL | Used for |
|---|---|---|---|---|
| Next.js | 16.4.6 | MIT | https://nextjs.org | React framework, routing, API routes |
| React | 19.3.0 | MIT | https://react.dev | UI runtime |
| Tailwind CSS | 4.3.3 | MIT | https://tailwindcss.com | Styling |
| Recharts | 3.10.1 | MIT | https://recharts.org | HR and evaluation charts |
| Leaflet | 1.9.4 | BSD-2-Clause | https://leafletjs.com | Radar map |
| lucide-react | 1.72.0 | ISC | https://lucide.dev | Icons |
| @fontsource-variable/inter | 5.3.0 | OFL-1.1 (font) / MIT (package) | https://fontsource.org/fonts/inter | Body font, self-hosted |
| @fontsource-variable/plus-jakarta-sans | 5.3.0 | OFL-1.1 (font) / MIT (package) | https://fontsource.org/fonts/plus-jakarta-sans | Heading font, self-hosted |
| @fontsource-variable/jetbrains-mono | 5.3.0 | OFL-1.1 (font) / MIT (package) | https://fontsource.org/fonts/jetbrains-mono | Numbers, self-hosted |
| @fontsource/noto-sans-telugu | 5.3.0 | OFL-1.1 (font) / MIT (package) | https://fontsource.org/fonts/noto-sans-telugu | Telugu notes |
| @fontsource/noto-sans-devanagari | 5.3.0 | OFL-1.1 (font) / MIT (package) | https://fontsource.org/fonts/noto-sans-devanagari | Hindi notes |
| Vitest | 5.1.0 | MIT | https://vitest.dev | Unit and parity tests |
| tsx | 4.23.15 | MIT | https://tsx.is | Running TypeScript scripts |
| TypeScript | 5.x | Apache-2.0 | https://typescriptlang.org | Types |
| NumPy | see `ml/requirements.txt` | BSD-3-Clause | https://numpy.org | Numeric computation |
| pandas | see `ml/requirements.txt` | BSD-3-Clause | https://pandas.pydata.org | Tabular data |
| scikit-learn | see `ml/requirements.txt` | BSD-3-Clause | https://scikit-learn.org | Logistic regression, CV, metrics |
| wfdb | see `ml/requirements.txt` | MIT | https://wfdb.readthedocs.io | PhysioNet annotation reading |
| matplotlib | see `ml/requirements.txt` | PSF-based (matplotlib license) | https://matplotlib.org | ROC and confusion figures |
| pyserial | see `ml/requirements.txt` | BSD-3-Clause | https://pyserial.readthedocs.io | Gateway serial input |

## Data

| Name | License | URL | Used for |
|---|---|---|---|
| MIT-BIH Atrial Fibrillation Database (PhysioNet `afdb`) | PhysioNet open license (ODC-BY 1.0) — see PhysioNet page | https://physionet.org/content/afdb/1.0.0/ | Rhythm model training and held-out samples |

The small derived sample set in `web/public/model/samples.json` contains only
RR-interval windows (no waveforms), is attributed to PhysioNet, and is shared
under the same ODC-BY 1.0 terms. Raw ECG data is never committed.

## Basemap

| Name | License | URL | Used for |
|---|---|---|---|
| OpenStreetMap standard tiles | Tile data © OpenStreetMap contributors, ODbL 1.0; tile service subject to the OSM tile usage policy | https://www.openstreetmap.org/copyright | Illustrative zone basemap |
| OpenTopoMap | Map data © OpenStreetMap contributors, SRTM; style © OpenTopoMap (CC-BY-SA) | https://opentopomap.org | Terrain layer |
| Esri World Imagery + Boundaries and Places | Tiles © Esri; Source: Esri, Maxar, Earthstar Geographics, GIS user community; Esri terms of use | https://www.esri.com/en-us/legal/terms/full-master-agreement | Satellite layer |
| Esri Light / Dark Gray Canvas (base + reference) | Tiles © Esri; Esri, HERE, Garmin, © OpenStreetMap contributors; Esri terms of use | https://www.esri.com/en-us/legal/terms/full-master-agreement | Light / dark layers (default, no key) |
| CARTO Positron / Dark Matter (optional) | © OpenStreetMap contributors © CARTO; needs a free key since Sep 2026 | https://carto.com/legal/basemap-terms/ | Light / dark layers only if `NEXT_PUBLIC_CARTO_KEY` is set |

Attribution "© OpenStreetMap contributors" is rendered on every Leaflet map.
No bulk tile downloading is performed. The SVG schematic works with tiles
blocked.

## Fonts

| Name | License | URL | Used for |
|---|---|---|---|
| Space Grotesk | SIL Open Font License 1.1 | https://fonts.google.com/specimen/Space+Grotesk | Headings |
| Inter | SIL Open Font License 1.1 | https://fonts.google.com/specimen/Inter | Body |
| JetBrains Mono | SIL Open Font License 1.1 | https://fonts.google.com/specimen/JetBrains+Mono | Numerals |
| Noto Sans Telugu | SIL Open Font License 1.1 | https://fonts.google.com/noto/specimen/Noto+Sans+Telugu | Telugu triage note |
| Noto Sans Devanagari | SIL Open Font License 1.1 | https://fonts.google.com/noto/specimen/Noto+Sans+Devanagari | Hindi triage note |

Fonts are self-hosted by `next/font/google` at build time.

## Prior work by the team

The wristband firmware under `firmware/ayulink_band/`, and the hardware in the
`gateway.jpg` photo, were built by the AyuLink team before INNOVEX 2026. They
are included as prior work with the team's permission. The detection engine,
cluster radar, rhythm model, evaluation and this web application are new.

## Live context data

| Name | License | URL | Used for |
|---|---|---|---|
| Open-Meteo forecast API | CC BY 4.0 (data), free non-commercial use, no key | https://open-meteo.com | Live temperature pill in the operator console. Real data, labelled as real, shown beside simulated surveillance data. The console works without it. |

Weather data by Open-Meteo.com.

