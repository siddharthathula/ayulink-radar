/**
 * Modular band configuration.
 *
 * One band platform, many people. Each person gets only the modules they need:
 * an elder living alone gets fall detection and SOS location; an office worker
 * gets a phone link and no GPS; a heart follow-up patient gets rhythm checks.
 *
 * "built" = on the prototype in the photos. "planned" = designed, not built yet.
 */

export type ModuleId = "ppg" | "temp" | "imu" | "oled" | "lora" | "gps" | "ble" | "ecg" | "gsr" | "fuel";
export type Status = "built" | "planned";
export type Power = 1 | 2 | 3; // relative draw: light, moderate, heavy

export interface BandModule {
  id: ModuleId;
  name: string;
  part: string;
  measures: string;
  why: string;
  status: Status;
  power: Power;
  group: "sense" | "connect" | "show";
  privacy?: string;
}

export const MODULES: BandModule[] = [
  {
    id: "ppg",
    name: "Pulse sensor",
    part: "MAX30102",
    measures: "Heart rate, beat-to-beat timing, SpO₂",
    why: "The core signal. Learns each person's own resting heart rate.",
    status: "built",
    power: 2,
    group: "sense",
  },
  {
    id: "temp",
    name: "Skin temperature",
    part: "LM35",
    measures: "Skin temperature trend",
    why: "A warmth trend adds context to a heart-rate drift.",
    status: "built",
    power: 1,
    group: "sense",
  },
  {
    id: "imu",
    name: "Motion sensor",
    part: "MPU6050",
    measures: "Movement, rest periods, falls",
    why: "Uses only resting readings for the baseline; spots falls.",
    status: "built",
    power: 1,
    group: "sense",
  },
  {
    id: "ecg",
    name: "ECG lead",
    part: "AD8232",
    measures: "Single-lead ECG on demand",
    why: "Sharper rhythm checks for heart follow-up patients.",
    status: "planned",
    power: 2,
    group: "sense",
  },
  {
    id: "gsr",
    name: "Skin response (GSR)",
    part: "Grove GSR",
    measures: "Sweat / skin conductance",
    why: "Heat-stress and strain signal for outdoor workers.",
    status: "planned",
    power: 1,
    group: "sense",
  },
  {
    id: "lora",
    name: "LoRa radio",
    part: "SX1278 · 433 MHz",
    measures: "Sends readings several km to a gateway",
    why: "Works with no phone and no internet. Villages, camps, campuses.",
    status: "built",
    power: 2,
    group: "connect",
  },
  {
    id: "ble",
    name: "Phone link",
    part: "ESP32 Bluetooth LE",
    measures: "Syncs through the wearer's phone",
    why: "For city users who already carry a smartphone.",
    status: "planned",
    power: 1,
    group: "connect",
  },
  {
    id: "gps",
    name: "GPS",
    part: "u-blox NEO-6M",
    measures: "Location",
    why: "Find someone after an SOS or a fall. Off unless chosen.",
    status: "built",
    power: 3,
    group: "connect",
    privacy: "Location is personal data. Default: off. 'SOS only' sends location only when help is called.",
  },
  {
    id: "oled",
    name: "Screen",
    part: "SH1106 OLED",
    measures: "Shows pulse, status, alerts on the band",
    why: "Wearer sees their own reading. Skip it to save battery.",
    status: "built",
    power: 2,
    group: "show",
  },
  {
    id: "fuel",
    name: "Battery gauge",
    part: "MAX17048",
    measures: "Accurate battery %",
    why: "Today's board can't measure its own battery. This fixes it.",
    status: "planned",
    power: 1,
    group: "show",
  },
];

export const MODULE_BY_ID = Object.fromEntries(MODULES.map((m) => [m.id, m])) as Record<ModuleId, BandModule>;

export type GpsMode = "off" | "sos" | "always";
export type Upload = "summary" | "every";

export interface BandConfig {
  profile: string;
  modules: ModuleId[];
  gpsMode: GpsMode;
  samplePeriodMin: 1 | 5 | 15;
  upload: Upload;
}

export interface Profile {
  id: string;
  name: string;
  who: string;
  where: string;
  config: Omit<BandConfig, "profile">;
}

export const PROFILES: Profile[] = [
  {
    id: "village",
    name: "Village health watch",
    who: "Families covered by an ASHA worker",
    where: "Villages, tribal hamlets, no phone needed",
    config: { modules: ["ppg", "temp", "imu", "lora", "oled"], gpsMode: "off", samplePeriodMin: 5, upload: "summary" },
  },
  {
    id: "elder",
    name: "Elder living alone",
    who: "Parents at home while kids work in another city",
    where: "Any home, city or village",
    config: { modules: ["ppg", "temp", "imu", "lora", "gps", "oled"], gpsMode: "sos", samplePeriodMin: 5, upload: "summary" },
  },
  {
    id: "everyday",
    name: "Everyday wellness",
    who: "Office workers, students, anyone with a phone",
    where: "Cities, hostels, offices",
    config: { modules: ["ppg", "temp", "imu", "ble"], gpsMode: "off", samplePeriodMin: 15, upload: "summary" },
  },
  {
    id: "cardiac",
    name: "Heart follow-up",
    who: "People sent home after a heart-related hospital stay",
    where: "Home, with the hospital watching",
    config: { modules: ["ppg", "ecg", "imu", "ble", "lora", "oled"], gpsMode: "off", samplePeriodMin: 1, upload: "every" },
  },
  {
    id: "outdoor",
    name: "Outdoor worker heat",
    who: "Construction, farm, delivery and traffic workers",
    where: "Sites, fields, roads in summer",
    config: { modules: ["ppg", "temp", "gsr", "imu", "lora"], gpsMode: "sos", samplePeriodMin: 5, upload: "summary" },
  },
  {
    id: "event",
    name: "Camp or mass event",
    who: "Relief camps, pilgrimages, marathons, school trips",
    where: "Temporary sites with no network",
    config: { modules: ["ppg", "temp", "imu", "lora", "gps"], gpsMode: "always", samplePeriodMin: 5, upload: "summary" },
  },
];

export function profileConfig(id: string): BandConfig {
  const p = PROFILES.find((x) => x.id === id) ?? PROFILES[0];
  return normalizeConfig({ profile: p.id, ...p.config, modules: [...p.config.modules] });
}

/** Keep the config consistent: GPS mode follows the GPS module. */
export function normalizeConfig(c: BandConfig): BandConfig {
  const modules = MODULES.map((m) => m.id).filter((id) => c.modules.includes(id));
  const hasGps = modules.includes("gps");
  return {
    ...c,
    modules,
    gpsMode: hasGps ? (c.gpsMode === "off" ? "sos" : c.gpsMode) : "off",
  };
}

export function toggleModule(c: BandConfig, id: ModuleId): BandConfig {
  const has = c.modules.includes(id);
  return normalizeConfig({ ...c, profile: "custom", modules: has ? c.modules.filter((m) => m !== id) : [...c.modules, id] });
}

/* ---------------- what the AI can do with this band ---------------- */

export interface AiFeature {
  id: string;
  name: string;
  what: string;
  needs: string;
  enabled: boolean;
  status: "live" | "planned" | "prior-work";
  missing?: string;
}

export function aiFeatures(c: BandConfig): AiFeature[] {
  const has = (id: ModuleId) => c.modules.includes(id);
  const uplink = has("lora") || has("ble");
  const f = (
    id: string,
    name: string,
    what: string,
    needs: string,
    ok: boolean,
    status: AiFeature["status"],
    missing?: string,
  ): AiFeature => ({ id, name, what, needs, enabled: ok, status, missing: ok ? undefined : missing });
  return [
    f("baseline", "Personal baseline", "Learns what's normal for this person and flags a steady drift.", "Pulse sensor", has("ppg"), "live", "Add the pulse sensor"),
    f("rest", "Rest-only readings", "Ignores readings taken while moving, so a walk doesn't look like illness.", "Motion sensor", has("imu"), "live", "Add the motion sensor"),
    f("cluster", "Neighbourhood cluster alert", "Spots when many people nearby drift at the same time.", "Pulse + LoRa or phone link", has("ppg") && uplink, "live", "Needs the pulse sensor and a radio"),
    f("forecast", "3-day AI forecast", "Predicts which zone is likely to reach alert next.", "Cluster alert", has("ppg") && uplink, "live", "Needs the cluster alert"),
    f("rhythm", "Irregular pulse screen", "Checks beat-to-beat timing for an irregular rhythm.", "Pulse sensor (ECG improves it)", has("ppg") || has("ecg"), has("ecg") && !has("ppg") ? "planned" : "live", "Add pulse sensor or ECG"),
    f("ecg", "ECG rhythm confirmation", "Records a short ECG when the pulse screen is unsure.", "ECG lead", has("ecg"), "planned", "Add the ECG lead"),
    f("warmth", "Skin warmth trend", "Adds a warming trend to the drift picture.", "Skin temperature", has("temp"), "live", "Add skin temperature"),
    f("heat", "Heat-stress signal", "Combines pulse, warmth and sweat to flag strain in heat.", "Pulse + temperature + GSR", has("ppg") && has("temp") && has("gsr"), "planned", "Needs pulse, temperature and GSR"),
    f("fall", "Fall alert", "Detects a hard fall followed by no movement.", "Motion sensor", has("imu"), "prior-work", "Add the motion sensor"),
    f("sos", "SOS with location", "Help button sends where the person is.", "GPS + radio", has("gps") && uplink && c.gpsMode !== "off", "live", "Needs GPS and a radio"),
    f("assistant", "Ask AyuLink assistant", "Operator asks in plain words: who to visit, which zone is next.", "Console", true, "live"),
  ];
}

/* ---------------- power, privacy, packet ---------------- */

export function powerScore(c: BandConfig): { score: number; label: "Light" | "Moderate" | "Heavy"; notes: string[] } {
  let score = 1; // MCU baseline
  for (const id of c.modules) score += MODULE_BY_ID[id].power;
  if (c.gpsMode === "always") score += 2;
  if (c.samplePeriodMin === 1) score += 2;
  else if (c.samplePeriodMin === 15) score -= 1;
  if (c.upload === "every") score += 1;
  const notes: string[] = [];
  if (c.gpsMode === "always") notes.push("GPS always on is the biggest drain. 'SOS only' saves most of it.");
  if (c.samplePeriodMin === 1) notes.push("Reading every minute uses more power than every 5 or 15.");
  if (c.modules.includes("oled")) notes.push("The screen can be turned off for longer battery life.");
  const label = score <= 8 ? "Light" : score <= 13 ? "Moderate" : "Heavy";
  return { score, label, notes };
}

export function privacySummary(c: BandConfig): string[] {
  const lines = ["Wearer shows up as a code, never a name.", "Raw readings stay on the band and gateway; the console sees zone counts and the visit list."];
  if (!c.modules.includes("gps")) lines.push("No GPS on this band. Location is never collected.");
  else if (c.gpsMode === "sos") lines.push("Location is sent only when SOS is pressed or a fall is detected.");
  else lines.push("Location is sent with every packet. Use only with consent, e.g. at a camp or event.");
  lines.push(c.upload === "summary" ? "Only a daily summary leaves the band." : "Every reading is uploaded, for close clinical follow-up.");
  return lines;
}

export interface PacketField {
  bytes: string;
  name: string;
  filled: boolean;
  note: string;
}

/** The current 32-byte v2 frame and which fields this band will fill. */
export function packetPreview(c: BandConfig): { fields: PacketField[]; needsV3: ModuleId[] } {
  const has = (id: ModuleId) => c.modules.includes(id);
  const gpsLive = has("gps") && c.gpsMode !== "off";
  const fields: PacketField[] = [
    { bytes: "0–7", name: "header, id, seq, event, flags", filled: true, note: "always" },
    { bytes: "8–9", name: "hr_bpm_x2", filled: has("ppg"), note: has("ppg") ? "heart rate" : "0xFFFF (no pulse sensor)" },
    { bytes: "10–11", name: "spo2_pct_x2", filled: has("ppg"), note: has("ppg") ? "SpO₂" : "0xFFFF" },
    { bytes: "12–13", name: "temp_c_x10", filled: has("temp"), note: has("temp") ? "skin temperature" : "0x7FFF" },
    { bytes: "14–15", name: "sensor_status, batt_pct", filled: true, note: has("fuel") ? "battery % measured" : "battery 255 = unknown" },
    {
      bytes: "16–23",
      name: "lat_e7, lng_e7",
      filled: gpsLive,
      note: !has("gps") ? "sentinel — no GPS" : c.gpsMode === "sos" ? "sentinel unless SOS/fall" : "every packet",
    },
    { bytes: "24–25", name: "uptime_s", filled: true, note: "always" },
    { bytes: "26–31", name: "auth tag", filled: true, note: "HMAC, always" },
  ];
  const needsV3 = (["ecg", "gsr"] as ModuleId[]).filter((id) => has(id));
  return { fields, needsV3 };
}

/* ---------------- exports ---------------- */

export function configJson(c: BandConfig): string {
  return JSON.stringify(
    {
      schema: "ayulink-band-config/1",
      profile: c.profile,
      modules: c.modules,
      gps_mode: c.gpsMode,
      sample_period_min: c.samplePeriodMin,
      upload: c.upload,
      planned_modules: c.modules.filter((id) => MODULE_BY_ID[id].status === "planned"),
      ai_features: aiFeatures(c).filter((f) => f.enabled).map((f) => f.id),
    },
    null,
    2,
  );
}

export function configHeader(c: BandConfig): string {
  const on = (id: ModuleId) => (c.modules.includes(id) ? 1 : 0);
  const lines = [
    "// ayulink_config.h — generated by the AyuLink band configurator.",
    `// Profile: ${c.profile}. Integration into the band firmware is in progress;`,
    "// modules marked PLANNED are not on the current prototype.",
    "#pragma once",
    "",
    `#define AYU_PROFILE        "${c.profile}"`,
    ...MODULES.map(
      (m) =>
        `#define AYU_MOD_${m.id.toUpperCase().padEnd(5)}      ${on(m.id)}${m.status === "planned" ? "   // PLANNED" : ""}`,
    ),
    "",
    `#define AYU_GPS_MODE       ${c.gpsMode === "off" ? 0 : c.gpsMode === "sos" ? 1 : 2}   // 0 off, 1 SOS only, 2 always`,
    `#define AYU_SAMPLE_PERIOD_S ${c.samplePeriodMin * 60}`,
    `#define AYU_UPLOAD_SUMMARY ${c.upload === "summary" ? 1 : 0}`,
    "",
  ];
  return lines.join("\n");
}

export function encodeConfig(c: BandConfig): string {
  const p = new URLSearchParams({
    p: c.profile,
    m: c.modules.join("."),
    g: c.gpsMode,
    s: String(c.samplePeriodMin),
    u: c.upload,
  });
  return p.toString();
}

export function decodeConfig(params: URLSearchParams): BandConfig | null {
  const m = params.get("m");
  if (m === null) {
    const p = params.get("p");
    return p && PROFILES.some((x) => x.id === p) ? profileConfig(p) : null;
  }
  const ids = new Set(MODULES.map((x) => x.id));
  const modules = m.split(".").filter((x): x is ModuleId => ids.has(x as ModuleId));
  const g = params.get("g");
  const s = Number(params.get("s"));
  const u = params.get("u");
  return normalizeConfig({
    profile: (params.get("p") ?? "custom").slice(0, 20),
    modules,
    gpsMode: g === "always" || g === "sos" ? g : "off",
    samplePeriodMin: s === 1 || s === 15 ? s : 5,
    upload: u === "every" ? "every" : "summary",
  });
}
