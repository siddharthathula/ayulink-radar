/**
 * Stateless API handlers. The same engine code the browser runs.
 * No data is stored. Kept separate from route files so tests can call them.
 */
import modelJson from "@/public/model/rhythm_model.json";
import { simulate } from "@/lib/engine/simulate";
import { DEFAULT_CONFIG, MODES, SCENARIOS, STRESSES } from "@/lib/engine/presets";
import { rhythmProbability, RHYTHM_WINDOW, type RhythmModel } from "@/lib/engine/rhythm";
import { rrWindowQuality } from "@/lib/engine/signalQuality";
import { templateFor, validateTriageText, type TriageFacts } from "@/lib/triage/templates";
import type { Lang, Mode, Scenario, Stress, TriageKind } from "@/lib/engine/types";
import { isRecord } from "./http";

const model = modelJson as unknown as RhythmModel;

export type Outcome = { status: number; body: unknown };
const fail = (message: string, status = 400): Outcome => ({ status, body: { error: message } });

/* ---------------- /api/engine ---------------- */

export function runEngine(input: unknown): Outcome {
  if (!isRecord(input)) return fail("Body must be a JSON object.");
  const mode = (input.mode ?? "village") as Mode;
  const scenario = (input.scenario ?? "cluster") as Scenario;
  const stress = (input.stress ?? "none") as Stress;
  const seed = input.seed ?? DEFAULT_CONFIG.seed;
  const wearRate = input.wearRate ?? DEFAULT_CONFIG.wearRate;
  const noiseLevel = input.noiseLevel ?? DEFAULT_CONFIG.noiseLevel;

  if (!MODES.includes(mode)) return fail(`mode must be one of ${MODES.join(", ")}.`);
  if (!SCENARIOS.includes(scenario)) return fail(`scenario must be one of ${SCENARIOS.join(", ")}.`);
  if (!STRESSES.includes(stress)) return fail(`stress must be one of ${STRESSES.join(", ")}.`);
  if (typeof seed !== "number" || !Number.isInteger(seed) || seed < 0 || seed > 2 ** 31) {
    return fail("seed must be a non-negative integer.");
  }
  if (typeof wearRate !== "number" || wearRate < 0.2 || wearRate > 1) {
    return fail("wearRate must be a number between 0.2 and 1.");
  }
  if (typeof noiseLevel !== "number" || noiseLevel < 0 || noiseLevel > 1) {
    return fail("noiseLevel must be a number between 0 and 1.");
  }

  const result = simulate({ ...DEFAULT_CONFIG, mode, scenario, stress, seed, wearRate, noiseLevel });
  const zones = result.zones.map((zone) => ({
    id: zone.id,
    name: zone.name,
    wearers: result.people.filter((p) => p.zoneId === zone.id).length,
    days: result.zoneDays
      .filter((row) => row.zoneId === zone.id)
      .map((row) => ({
        day: row.day,
        level: row.level,
        k: row.k,
        n: row.n,
        pValue: Number(row.pValue.toPrecision(4)),
        ...(row.regionWide ? { regionWide: true } : {}),
      })),
  }));

  return {
    status: 200,
    body: {
      config: result.config,
      summary: {
        people: result.people.length,
        outbreakZoneId: result.outbreakZoneId,
        firstAlertDay: result.firstAlertDay,
        clinicDetectionDay: result.clinicDetectionDay,
        leadDays: result.leadDays,
        falseAlertZoneDays: result.falseAlertZoneDays,
      },
      zones,
      note: "Simulated population. Screening signals, not diagnoses. Per-person data is not returned.",
    },
  };
}

/* ---------------- /api/rhythm ---------------- */

export function runRhythm(input: unknown): Outcome {
  if (!isRecord(input)) return fail("Body must be a JSON object.");
  const rr = input.rr_ms;
  if (!Array.isArray(rr) || rr.some((v) => typeof v !== "number")) {
    return fail("rr_ms must be an array of numbers (beat-to-beat intervals in milliseconds).");
  }
  if (rr.length < RHYTHM_WINDOW || rr.length > 300) {
    return fail(`rr_ms must contain between ${RHYTHM_WINDOW} and 300 intervals.`);
  }

  const windows: Array<{ start: number; usable: boolean; reason?: string; probability?: number }> = [];
  for (let start = 0; start + RHYTHM_WINDOW <= rr.length; start += 15) {
    const window = rr.slice(start, start + RHYTHM_WINDOW) as number[];
    const quality = rrWindowQuality(window);
    if (!quality.valid) {
      windows.push({ start, usable: false, reason: quality.reason });
    } else {
      windows.push({ start, usable: true, probability: Number(rhythmProbability(window, model).toFixed(4)) });
    }
  }
  const usable = windows.filter((w) => w.usable);
  if (usable.length === 0) {
    return {
      status: 200,
      body: { usable: false, reason: windows[0]?.reason ?? "too-short", windows, message: "Signal not usable — no screening result." },
    };
  }
  const flaggedWindows = usable.filter((w) => (w.probability ?? 0) >= model.threshold).length;
  const maxProbability = Math.max(...usable.map((w) => w.probability ?? 0));
  return {
    status: 200,
    body: {
      usable: true,
      probability: maxProbability,
      threshold: model.threshold,
      flag: flaggedWindows > 0,
      flaggedWindows,
      usableWindows: usable.length,
      windows,
      note: "Irregular-rhythm screening flag, not a diagnosis. Model trained on ECG-derived intervals (PhysioNet AFDB); on-band validation pending.",
    },
  };
}

/* ---------------- /api/triage ---------------- */

const LANGS: Lang[] = ["en", "te", "hi"];
const KINDS: TriageKind[] = ["drift", "rhythm", "cluster"];

function parseFacts(value: unknown): TriageFacts | null {
  if (value === undefined) return {};
  if (!isRecord(value)) return null;
  const facts: TriageFacts = {};
  for (const key of ["days", "deltaBpm", "k", "n"] as const) {
    const v = value[key];
    if (v === undefined) continue;
    if (typeof v !== "number" || !Number.isFinite(v) || v < -100 || v > 10_000) return null;
    facts[key] = v;
  }
  if (value.zone !== undefined) {
    if (typeof value.zone !== "string" || value.zone.length > 40) return null;
    facts.zone = value.zone;
  }
  return facts;
}

export async function runTriage(input: unknown, env: { key?: string; model?: string }): Promise<Outcome> {
  if (!isRecord(input)) return fail("Body must be a JSON object.");
  const lang = input.lang as Lang;
  const kind = input.kind as TriageKind;
  if (!LANGS.includes(lang)) return fail("lang must be en, te or hi.");
  if (!KINDS.includes(kind)) return fail("kind must be drift, rhythm or cluster.");
  const facts = parseFacts(input.facts);
  if (facts === null) return fail("facts must hold only numeric days/deltaBpm/k/n and a short zone label.");

  let template: { text: string };
  try {
    template = templateFor(kind, lang, facts);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "missing triage fact");
  }
  if (!env.key) return { status: 200, body: { text: template.text, source: "template" } };

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.key}` },
      body: JSON.stringify({
        model: env.model ?? "llama-3.1-8b-instant",
        temperature: 0.2,
        max_tokens: 220,
        messages: [
          {
            role: "system",
            content:
              "You write a short note for a community health worker. Use ONLY the given facts. Max 60 words. No diagnosis. No disease names. No medicines. End with the sentence: 'This is a screening flag, not a diagnosis.' translated into the requested language and keep the English word 'screening' in brackets. Write in the requested language.",
          },
          { role: "user", content: JSON.stringify({ language: lang, kind, facts }) },
        ],
      }),
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) throw new Error("llm status");
    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = data.choices?.[0]?.message?.content?.trim() ?? "";
    if (validateTriageText(text, lang)) return { status: 200, body: { text, source: "llm" } };
  } catch {
    // fall through to the template
  }
  return { status: 200, body: { text: template.text, source: "template" } };
}

/* ---------------- /api/ingest ---------------- */

export interface BandPacket {
  band_id: string;
  ts: number;
  hr_bpm: number;
  rr_ms?: number[];
  activity: number;
  worn: boolean;
  fall: boolean;
  seizure: boolean;
  batt_pct: number;
}

/** Validate one gateway packet. Returns a list of problems (empty = valid). */
export function validatePacket(value: unknown): string[] {
  const problems: string[] = [];
  if (!isRecord(value)) return ["packet must be an object"];
  if (typeof value.band_id !== "string" || !/^[A-Za-z0-9_-]{2,32}$/.test(value.band_id)) {
    problems.push("band_id must be 2–32 letters, digits, - or _");
  }
  if (typeof value.ts !== "number" || !Number.isInteger(value.ts) || value.ts < 1_600_000_000 || value.ts > 4_102_444_800) {
    problems.push("ts must be a unix time in seconds");
  }
  if (typeof value.hr_bpm !== "number" || value.hr_bpm < 25 || value.hr_bpm > 240) problems.push("hr_bpm must be 25–240");
  if (value.rr_ms !== undefined) {
    if (!Array.isArray(value.rr_ms) || value.rr_ms.length > 300 || value.rr_ms.some((v) => typeof v !== "number")) {
      problems.push("rr_ms must be an array of up to 300 numbers");
    }
  }
  if (typeof value.activity !== "number" || value.activity < 0 || value.activity > 10) problems.push("activity must be 0–10");
  for (const key of ["worn", "fall", "seizure"] as const) {
    if (typeof value[key] !== "boolean") problems.push(`${key} must be true or false`);
  }
  if (typeof value.batt_pct !== "number" || value.batt_pct < 0 || value.batt_pct > 100) problems.push("batt_pct must be 0–100");
  return problems;
}

export function runIngest(input: unknown): Outcome {
  const packets = isRecord(input) && Array.isArray(input.packets) ? input.packets : Array.isArray(input) ? input : [input];
  if (packets.length === 0 || packets.length > 50) return fail("Send 1–50 packets per request.");
  const results = packets.map((packet, index) => {
    const problems = validatePacket(packet);
    const p = packet as Partial<BandPacket>;
    const events: string[] = [];
    if (problems.length === 0) {
      if (p.fall) events.push("fall");
      if (p.seizure) events.push("seizure-like motion");
      if (p.worn === false) events.push("not worn");
      if ((p.batt_pct ?? 100) < 15) events.push("low battery");
    }
    return { index, accepted: problems.length === 0, problems, events };
  });
  const accepted = results.filter((r) => r.accepted).length;
  return {
    status: accepted === results.length ? 200 : 207,
    body: {
      accepted,
      rejected: results.length - accepted,
      results,
      stored: false,
      note: "Validation endpoint. This public demo does not store packets.",
    },
  };
}
