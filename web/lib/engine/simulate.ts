import { computeDrift } from "./baseline";
import { detectClusters } from "./cluster";
import { PRESETS } from "./presets";
import { gaussian, mulberry32 } from "./rng";
import { dayQuality } from "./signalQuality";
import type {
  DayObs,
  HealthState,
  Person,
  SimConfig,
  SimResult,
  Zone,
  ZoneDay,
} from "./types";
import sampleData from "../../public/model/samples.json";

const AF_SAMPLE_IDS = (sampleData as Array<{ id: string; label: number }>)
  .filter((sample) => sample.label === 1)
  .map((sample) => sample.id);

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

interface PersonMeta {
  dow: number;
  severity: number;
  visitsClinic: boolean;
  clinicDelay: number;
}

interface InfectionState {
  state: HealthState;
  effect: number;
}

function infectionState(tau: number, severity: number): InfectionState {
  if (tau < 0) return { state: "healthy", effect: 0 };
  if (tau === 0) return { state: "incubating", effect: 0 };
  if (tau <= 2) return { state: "incubating", effect: tau === 1 ? 2 : 4 };
  if (tau <= 6) return { state: "symptomatic", effect: 9 * severity };
  if (tau <= 10) {
    const start = 6 * severity;
    const effect = start + ((1 - start) * (tau - 7)) / 3;
    return { state: "recovering", effect };
  }
  return { state: "healthy", effect: 0 };
}

export function normalizeConfig(input: SimConfig): SimConfig {
  const config: SimConfig = { ...input };
  if (config.stress === "noisy") config.noiseLevel = 0.8;
  return config;
}

export function simulate(input: SimConfig): SimResult {
  const config = normalizeConfig(input);
  const rand = mulberry32(config.seed);
  const preset = PRESETS[config.mode];
  const zones: Zone[] = preset.zones.map((zone) => ({
    ...zone,
    neighbors: [...zone.neighbors],
  }));

  const prefix = config.mode === "village" ? "V" : config.mode === "ward" ? "W" : "S";
  const people: Person[] = [];
  const meta = new Map<string, PersonMeta>();

  for (let zoneIndex = 0; zoneIndex < zones.length; zoneIndex++) {
    const zone = zones[zoneIndex];
    for (let index = 0; index < preset.peoplePerZone; index++) {
      const baseRhr = clamp(68 + 7 * gaussian(rand), 50, 92);
      const age = 18 + Math.floor(rand() * 63);
      const sex: "F" | "M" = rand() < 0.5 ? "F" : "M";
      const dow = rand() - 0.5;
      const severity = 0.6 + rand() * 0.8;
      let rhythmSampleId: string | null = null;
      if (age >= 55 && rand() < 0.06) {
        rhythmSampleId = AF_SAMPLE_IDS[Math.floor(rand() * AF_SAMPLE_IDS.length)] ?? null;
      }
      let source: Person["source"];
      if (preset.bandFraction === 1) source = "ayulink-band";
      else if (preset.bandFraction === 0) source = "smartwatch";
      else source = index % 2 === 0 ? "ayulink-band" : "smartwatch";

      const id = `${prefix}-${String(zoneIndex + 1).padStart(2, "0")}-${String(
        index + 1,
      ).padStart(3, "0")}`;
      people.push({
        id,
        zoneId: zone.id,
        age,
        sex,
        baseRhr,
        source,
        rhythmSampleId,
      });
      meta.set(id, {
        dow,
        severity,
        visitsClinic: rand() < 0.45,
        clinicDelay: 1 + Math.floor(rand() * 3),
      });
    }
  }

  // Two fixed hot days after day 28 (a region-wide confounder), or five
  // consecutive hotter days under the heatwave stress.
  const heatDays = new Set<number>();
  if (config.stress === "heatwave") {
    const latestStart = Math.max(31, config.days - 5);
    const start = clamp(
      31 + Math.floor(rand() * (config.days - 5 - 31 + 1 || 1)),
      31,
      latestStart,
    );
    for (let offset = 0; offset < 5; offset++) heatDays.add(start + offset);
  } else {
    let guard = 0;
    while (heatDays.size < 2 && config.days > 29 && guard < 200) {
      heatDays.add(29 + Math.floor(rand() * (config.days - 29)));
      guard += 1;
    }
  }
  const heatEffect = config.stress === "heatwave" ? 3 : 1.5;

  const peopleByZone = new Map<string, Person[]>();
  for (const zone of zones) peopleByZone.set(zone.id, []);
  for (const person of people) peopleByZone.get(person.zoneId)?.push(person);

  const outbreakAllowed =
    config.scenario !== "calm" && config.stress !== "isolated" && config.days > config.outbreakDay;
  let outbreakZoneId: string | null = null;
  const seeded = new Set<string>();
  if (outbreakAllowed) {
    const zone = zones[Math.floor(rand() * zones.length)];
    outbreakZoneId = zone.id;
    const candidates = peopleByZone.get(zone.id) ?? [];
    while (seeded.size < Math.min(3, candidates.length)) {
      seeded.add(candidates[Math.floor(rand() * candidates.length)].id);
    }
  }

  const infectionDay = new Map<string, number | null>();
  const sporadicUntil = new Map<string, number>();
  for (const person of people) {
    infectionDay.set(person.id, null);
    sporadicUntil.set(person.id, -1);
  }
  for (const id of seeded) infectionDay.set(id, config.outbreakDay);

  const obs: Record<string, DayObs[]> = {};
  for (const person of people) obs[person.id] = [];

  let beta = 0;
  let spill = 0;
  if (config.stress === "fast") {
    beta = 0.9;
    spill = 0.12;
  } else if (config.scenario === "cluster") {
    beta = 0.55;
    spill = 0;
  } else if (config.scenario === "spread") {
    beta = 0.55;
    spill = 0.06;
  }

  const zoneSize = new Map<string, number>();
  for (const zone of zones) zoneSize.set(zone.id, peopleByZone.get(zone.id)?.length ?? 0);

  const sporadicProbability = config.stress === "isolated" ? 0.009 : 0.003;

  for (let day = 0; day < config.days; day++) {
    // Transmission at the start of the day, using who was infectious before
    // any new infections today. New infections are tau=0 and not infectious.
    if (outbreakZoneId !== null && day > config.outbreakDay && beta > 0) {
      const infectious = new Map<string, number>();
      for (const zone of zones) infectious.set(zone.id, 0);
      for (const person of people) {
        const start = infectionDay.get(person.id);
        if (start === null || start === undefined) continue;
        const tau = day - start;
        if (tau >= 2 && tau <= 8) {
          infectious.set(person.zoneId, (infectious.get(person.zoneId) ?? 0) + 1);
        }
      }

      for (const person of people) {
        if (infectionDay.get(person.id) !== null) continue;
        const nOwn = zoneSize.get(person.zoneId) ?? 1;
        let hazard =
          (beta * (infectious.get(person.zoneId) ?? 0)) / nOwn;
        const zone = zones.find((row) => row.id === person.zoneId);
        for (const neighborId of zone?.neighbors ?? []) {
          const nNeighbor = zoneSize.get(neighborId) ?? 1;
          hazard += (spill * (infectious.get(neighborId) ?? 0)) / nNeighbor;
        }
        const probability = 1 - Math.exp(-hazard);
        if (probability > 0 && rand() < probability) {
          infectionDay.set(person.id, day);
          sporadicUntil.set(person.id, -1);
        }
      }
    }

    for (const person of people) {
      const info = meta.get(person.id);
      if (!info) continue;
      const start = infectionDay.get(person.id) ?? null;
      const tau = start === null ? null : day - start;

      let state: HealthState = "healthy";
      let effect = 0;
      if (tau !== null) {
        const infection = infectionState(tau, info.severity);
        state = infection.state;
        effect = infection.effect;
      } else {
        const until = sporadicUntil.get(person.id) ?? -1;
        if (day <= until) {
          state = "sporadic";
          effect = 6;
        } else if (rand() < sporadicProbability) {
          state = "sporadic";
          effect = 6;
          sporadicUntil.set(person.id, day + 3);
        }
      }

      const worn = rand() < config.wearRate;
      let rhr: number | null = null;
      let activity: number | null = null;
      let wearMin: number | null = null;
      let artefactFrac: number | null = null;
      let valid = false;

      if (worn) {
        wearMin = clamp(300 + 150 * gaussian(rand), 0, 600);
        artefactFrac = clamp(
          Math.abs(gaussian(rand)) * (0.08 + 0.35 * config.noiseLevel),
          0,
          1,
        );
        const healthy =
          person.baseRhr +
          (1.6 + 10 * artefactFrac) * gaussian(rand) +
          info.dow;
        const heat = heatDays.has(day) ? heatEffect : 0;
        rhr = round1(healthy + effect + heat);
        const baseActivity = clamp(1 + 0.15 * gaussian(rand), 0.3, 1.6);
        activity = state === "symptomatic" ? baseActivity * 0.6 : baseActivity;
        valid = dayQuality(wearMin, artefactFrac).valid;
      }

      obs[person.id].push({
        day,
        rhr,
        activity,
        state,
        wearMin,
        artefactFrac,
        valid,
        tau,
      });
    }
  }

  const drift: SimResult["drift"] = {};
  for (const person of people) {
    drift[person.id] = computeDrift(obs[person.id]);
  }

  const zoneDays: ZoneDay[] = detectClusters(people, zones, obs, drift, {
    guard: true,
  });

  let firstAlertDay: number | null = null;
  if (outbreakZoneId !== null) {
    const alerts = zoneDays
      .filter(
        (row) =>
          row.zoneId === outbreakZoneId &&
          row.day >= config.outbreakDay &&
          row.level === "alert",
      )
      .map((row) => row.day)
      .sort((a, b) => a - b);
    firstAlertDay = alerts.length > 0 ? alerts[0] : null;
  }

  let clinicDetectionDay: number | null = null;
  if (outbreakZoneId !== null) {
    const visits: number[] = [];
    for (const person of peopleByZone.get(outbreakZoneId) ?? []) {
      const start = infectionDay.get(person.id);
      const info = meta.get(person.id);
      if (start === null || start === undefined || !info?.visitsClinic) continue;
      visits.push(start + 3 + info.clinicDelay);
    }
    visits.sort((a, b) => a - b);
    if (visits.length >= 3) {
      clinicDetectionDay = visits[2] + preset.reportingLagDays;
    }
  }

  const leadDays =
    firstAlertDay !== null && clinicDetectionDay !== null
      ? clinicDetectionDay - firstAlertDay
      : null;

  let falseAlertZoneDays = 0;
  for (const row of zoneDays) {
    if (row.level !== "alert") continue;
    const ids = (peopleByZone.get(row.zoneId) ?? []).map((person) => person.id);
    let active = 0;
    for (const id of ids) {
      const tau = obs[id]?.[row.day]?.tau ?? null;
      if (tau !== null && tau >= 1 && tau <= 10) active += 1;
    }
    if (active < 3) falseAlertZoneDays += 1;
  }

  return {
    config,
    zones,
    people,
    obs,
    drift,
    zoneDays,
    outbreakZoneId,
    firstAlertDay,
    clinicDetectionDay,
    leadDays,
    falseAlertZoneDays,
  };
}
