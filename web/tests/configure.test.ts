import { describe, expect, it } from "vitest";
import {
  PROFILES,
  aiFeatures,
  configHeader,
  decodeConfig,
  encodeConfig,
  packetPreview,
  powerScore,
  profileConfig,
  toggleModule,
} from "@/lib/config/modules";
import { validatePacket } from "@/lib/api/handlers";

const BASE = { band_id: "BAND-03", ts: 1794390000, hr_bpm: 74, activity: 0.9, worn: true, fall: false, seizure: false, batt_pct: 81 };

describe("modular band configurator", () => {
  it("every profile round-trips through the share link", () => {
    for (const p of PROFILES) {
      const c = profileConfig(p.id);
      expect(decodeConfig(new URLSearchParams(encodeConfig(c)))).toEqual(c);
    }
  });

  it("removing GPS turns location off everywhere", () => {
    const elder = profileConfig("elder");
    expect(elder.gpsMode).toBe("sos");
    const noGps = toggleModule(elder, "gps");
    expect(noGps.gpsMode).toBe("off");
    expect(aiFeatures(noGps).find((f) => f.id === "sos")?.enabled).toBe(false);
    expect(packetPreview(noGps).fields.find((f) => f.name.startsWith("lat"))?.filled).toBe(false);
  });

  it("cluster alert and forecast need a pulse sensor and a radio", () => {
    const c = profileConfig("village");
    expect(aiFeatures(c).find((f) => f.id === "forecast")?.enabled).toBe(true);
    const noRadio = toggleModule(c, "lora");
    expect(aiFeatures(noRadio).find((f) => f.id === "cluster")?.enabled).toBe(false);
  });

  it("always-on GPS is heavier than SOS-only", () => {
    const sos = profileConfig("elder");
    expect(powerScore({ ...sos, gpsMode: "always" }).score).toBeGreaterThan(powerScore(sos).score);
  });

  it("firmware header marks planned modules", () => {
    const h = configHeader(profileConfig("cardiac"));
    expect(h).toMatch(/AYU_MOD_ECG\s+1\s+\/\/ PLANNED/);
    expect(h).toContain("#pragma once");
  });

  it("ignores unknown modules in a shared link", () => {
    const c = decodeConfig(new URLSearchParams("p=x&m=ppg.evil.lora&g=always&s=7&u=every"));
    expect(c?.modules).toEqual(["ppg", "lora"]);
    expect(c?.gpsMode).toBe("off");
    expect(c?.samplePeriodMin).toBe(5);
  });
});

describe("ingest accepts module fields", () => {
  it("accepts a fully modular packet", () => {
    expect(
      validatePacket({ ...BASE, modules: ["ppg", "temp", "gps", "gsr"], spo2_pct: 97, skin_temp_c: 33.1, gsr_us: 4.2, lat: 17.4, lng: 78.4 }),
    ).toEqual([]);
  });

  it("rejects location from a band without GPS", () => {
    expect(validatePacket({ ...BASE, modules: ["ppg"], lat: 17.4, lng: 78.4 }).join()).toMatch(/gps module/);
  });

  it("accepts a real gateway packet with no battery gauge and LoRa link metadata", () => {
    const { batt_pct, ...noBattery } = BASE;
    void batt_pct;
    expect(
      validatePacket({ ...noBattery, source: "hardware", link: "lora", rssi_dbm: -97, snr_db: 7.5, spo2_pct: 97, skin_temp_c: 33.2 }),
    ).toEqual([]);
    expect(validatePacket({ ...BASE, source: "simulated-but-claims-real" }).length).toBe(1);
    expect(validatePacket({ ...BASE, link: "wifi" }).length).toBe(1);
  });

  it("rejects out-of-range module values", () => {
    expect(validatePacket({ ...BASE, skin_temp_c: 80 }).length).toBe(1);
    expect(validatePacket({ ...BASE, lat: 17.4 }).join()).toMatch(/together/);
    expect(validatePacket({ ...BASE, modules: ["xray"] }).length).toBe(1);
  });
});
