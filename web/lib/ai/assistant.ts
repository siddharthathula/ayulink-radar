/**
 * "Ask AyuLink" — the operator assistant.
 *
 * Two layers:
 *  1. buildSnapshot(): turns the live console state into a small, serialisable
 *     fact sheet. This is the ONLY thing the assistant (rules or LLM) may use.
 *  2. answerQuestion(): deterministic, offline intent engine over that sheet.
 *     It always works — no internet, no API key.
 *
 * An optional cloud LLM (/api/assistant) may rephrase answers, but it receives
 * the same fact sheet and its output passes validateAssistantText() or is dropped.
 *
 * Hard rules: no diagnosis, no disease names, no medicines, no doses.
 */
import type { SimResult, ZoneLevel } from "@/lib/engine/types";
import type { QueueRow } from "@/lib/engine/queue";
import { riskDrivers, type ZoneForecast } from "@/lib/engine/forecast";
import { displayDay } from "@/lib/ui/demo";

export interface SnapshotZone {
  id: string;
  name: string;
  level: ZoneLevel;
  n: number;
  k: number;
  expectedPct: number;
  pValue: number;
  riskPct: number | null;
  risk: "low" | "rising" | "high";
  drivers: string[];
  neighbors: string[];
}

export interface SnapshotPerson {
  id: string;
  zone: string;
  age: number;
  score: number;
  reasons: string[];
}

export interface ConsoleSnapshot {
  day: number;
  totalDays: number;
  place: string;
  wearers: number;
  wornToday: number;
  driftingToday: number;
  rhythmFlags: number;
  regionWide: boolean;
  counts: { alert: number; watch: number; normal: number };
  zones: SnapshotZone[];
  visitList: SnapshotPerson[];
  visited: number;
  simulated: true;
}

export interface AssistantAction {
  kind: "zone" | "person" | "tab";
  id: string;
  label: string;
}

export interface AssistantReply {
  text: string;
  intent: Intent;
  actions: AssistantAction[];
  suggestions: string[];
  source: "rules" | "llm";
}

export type Intent =
  | "brief"
  | "forecast"
  | "visits"
  | "zone"
  | "person"
  | "counts"
  | "heat"
  | "quality"
  | "trust"
  | "privacy"
  | "help"
  | "medical"
  | "unknown";

export const STARTER_QUESTIONS = [
  "Brief me on today",
  "Which zone will flare up next?",
  "Who should I visit first?",
  "Why is this zone flagged?",
  "Can I trust these alerts?",
];

export function buildSnapshot(input: {
  result: SimResult;
  day: number;
  queue: QueueRow[];
  forecasts: ZoneForecast[];
  wornToday: number;
  driftingToday: number;
  rhythmFlags: number;
  visited: number;
  place: string;
}): ConsoleSnapshot {
  const { result, day, queue, forecasts } = input;
  const byZone = new Map(result.zoneDays.filter((r) => r.day === day).map((r) => [r.zoneId, r]));
  const fc = new Map(forecasts.map((f) => [f.zoneId, f]));
  const nameOf = (id: string) => result.zones.find((z) => z.id === id)?.name ?? id;
  const zones: SnapshotZone[] = result.zones.map((zone) => {
    const row = byZone.get(zone.id);
    const f = fc.get(zone.id);
    return {
      id: zone.id,
      name: zone.name,
      level: row?.level ?? "normal",
      n: row?.n ?? 0,
      k: row?.k ?? 0,
      expectedPct: Math.round((row?.p0 ?? 0) * 1000) / 10,
      pValue: row?.pValue ?? 1,
      riskPct: f && f.level !== "alert" ? Math.round(f.probability * 100) : null,
      risk: f?.risk ?? "low",
      drivers: f ? riskDrivers(f).slice(0, 2).map((c) => c.label) : [],
      neighbors: zone.neighbors.map(nameOf),
    };
  });
  const counts = { alert: 0, watch: 0, normal: 0 };
  for (const z of zones) counts[z.level] += 1;
  return {
    day: displayDay(day),
    totalDays: 32,
    place: input.place,
    wearers: result.people.length,
    wornToday: input.wornToday,
    driftingToday: input.driftingToday,
    rhythmFlags: input.rhythmFlags,
    regionWide: [...byZone.values()].some((r) => r.regionWide),
    counts,
    zones,
    visitList: queue.slice(0, 15).map((row) => ({
      id: row.person.id,
      zone: row.zoneName,
      age: row.person.age,
      score: Math.round(row.score),
      reasons: row.reasons,
    })),
    visited: input.visited,
    simulated: true,
  };
}

/* ---------------- intent detection ---------------- */

const MEDICAL =
  /(diagnos|disease|dengue|malaria|covid|typhoid|chikungunya|flu\b|influenza|infection|medicine|medication|tablet|pill|dose|dosage|paracetamol|antibiotic|treat|cure|prescri|what (does|do) (he|she|they) have|is (he|she|it) sick)/i;

const INTENTS: Array<{ intent: Intent; re: RegExp }> = [
  { intent: "privacy", re: /(privacy|private|gps|location|track|consent|data (stored|kept)|who (can )?see)/i },
  { intent: "heat", re: /(heat|hot|weather|temperature|festival|region.?wide|everyone)/i },
  { intent: "quality", re: /(quality|not worn|battery|artefact|artifact|noisy|signal|wear time|missing)/i },
  { intent: "trust", re: /(trust|accura|false (alarm|alert|positive)|reliable|how good|auroc|precision|wrong)/i },
  { intent: "forecast", re: /(forecast|predict|next|tomorrow|flare|escalat|likely|risk|coming days|soon)/i },
  { intent: "visits", re: /(visit|who (should|to)|first|priorit|queue|list|send|worker|asha)/i },
  { intent: "counts", re: /(how many|count|number of|total|alerts? today|flagged)/i },
  { intent: "brief", re: /(brief|summary|summar|status|overview|what'?s (happening|up|going on)|today|handover|shift)/i },
  { intent: "help", re: /(help|what can you|how do i|how to use|commands)/i },
];

const PERSON_ID = /\b([VWS]-\d{2}-\d{3})\b/i;

export function detectIntent(question: string, snapshot: ConsoleSnapshot): { intent: Intent; zone?: SnapshotZone; personId?: string } {
  const q = question.trim();
  if (MEDICAL.test(q)) return { intent: "medical" };
  const pid = q.match(PERSON_ID);
  if (pid) return { intent: "person", personId: pid[1].toUpperCase() };
  const lowered = q.toLowerCase();
  const zone = snapshot.zones.find(
    (z) => lowered.includes(z.name.toLowerCase()) || new RegExp(`\\b${z.id.toLowerCase()}\\b`).test(lowered),
  );
  if (zone && !/(visit|who)/i.test(q)) return { intent: "zone", zone };
  if (/why/i.test(q) && /(zone|flag|alert|watch|this)/i.test(q)) return { intent: "zone" };
  for (const { intent, re } of INTENTS) if (re.test(q)) return { intent, zone };
  return { intent: "unknown" };
}

/* ---------------- answers ---------------- */

function pct(n: number): string {
  return `${Math.round(n)}%`;
}

function listNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function plainEvidence(p: number): string {
  if (p < 1e-4) return "very unlikely to be chance";
  if (p < 1e-2) return "unlikely to be chance";
  return "could still be chance";
}

function zoneAnswer(z: SnapshotZone, s: ConsoleSnapshot): string {
  const head =
    z.level === "alert"
      ? `${z.name} is on ALERT.`
      : z.level === "watch"
        ? `${z.name} is on WATCH.`
        : `${z.name} looks normal today.`;
  const body = `${z.k} of ${z.n} wearers with good readings are running above their own normal resting heart rate over the last 3 days. Normally about ${z.expectedPct}% would be, so ${z.k} is ${plainEvidence(z.pValue)}.`;
  const fc =
    z.riskPct === null
      ? ""
      : ` AI forecast: ${pct(z.riskPct)} chance of reaching alert in the next 3 days${
          z.drivers.length ? `, mainly from ${z.drivers.map((d) => d.toLowerCase()).join(" and ")}` : ""
        }.`;
  const region = s.regionWide ? " Several zones shifted together today, so this may be heat or a festival, not a local cluster." : "";
  const small = z.n < 10 ? " Fewer than 10 wearers have good data here, so it cannot alert yet." : "";
  return `${head} ${body}${fc}${region}${small}`;
}

export function answerQuestion(question: string, s: ConsoleSnapshot, focusZoneId: string | null = null): AssistantReply {
  const detected = detectIntent(question, s);
  let { intent } = detected;
  const actions: AssistantAction[] = [];
  let text = "";
  let suggestions: string[] = [];

  const ranked = [...s.zones].sort((a, b) => (b.riskPct ?? 101) - (a.riskPct ?? 101));
  const alerts = s.zones.filter((z) => z.level === "alert");
  const watches = s.zones.filter((z) => z.level === "watch");
  const rising = s.zones.filter((z) => z.level !== "alert" && z.risk === "high");

  switch (intent) {
    case "medical":
      text =
        "I can't diagnose or suggest medicines — that's for a doctor or nurse. What I can tell you is who to check first and why. Anyone who feels unwell should be seen at the nearest clinic.";
      suggestions = ["Who should I visit first?", "Brief me on today"];
      break;

    case "brief": {
      const parts: string[] = [];
      parts.push(`Day ${s.day} of ${s.totalDays}, ${s.place.toLowerCase()} view. ${s.wornToday} of ${s.wearers} bands sent good readings.`);
      if (alerts.length) parts.push(`On alert: ${listNames(alerts.map((z) => z.name))}.`);
      if (watches.length) parts.push(`On watch: ${listNames(watches.map((z) => z.name))}.`);
      if (!alerts.length && !watches.length) parts.push("All zones look normal.");
      if (rising.length) parts.push(`AI says ${listNames(rising.map((z) => z.name))} may reach alert within 3 days.`);
      parts.push(`${s.driftingToday} people are above their own normal today; ${s.visitList.length} are on the visit list.`);
      if (s.visitList[0]) parts.push(`Start with ${s.visitList[0].id} in ${s.visitList[0].zone}.`);
      if (s.regionWide) parts.push("Heads up: many zones moved together — likely heat or a festival, alerts are held back.");
      text = parts.join(" ");
      for (const z of [...alerts, ...rising].slice(0, 3)) actions.push({ kind: "zone", id: z.id, label: `Open ${z.name}` });
      actions.push({ kind: "tab", id: "queue", label: "Open visit list" });
      suggestions = ["Which zone will flare up next?", "Who should I visit first?"];
      break;
    }

    case "forecast": {
      const top = ranked.filter((z) => z.riskPct !== null).slice(0, 3);
      if (alerts.length) text += `${listNames(alerts.map((z) => z.name))} ${alerts.length > 1 ? "are" : "is"} already on alert. `;
      if (top.length === 0) text += "Every zone is already on alert — focus on visits.";
      else {
        text += `Most likely to escalate in the next 3 days: ${top
          .map((z) => `${z.name} (${pct(z.riskPct ?? 0)})`)
          .join(", ")}.`;
        const lead = top[0];
        if (lead.risk === "high") {
          text += ` ${lead.name} is above the warning line${lead.drivers.length ? ` because of ${lead.drivers.map((d) => d.toLowerCase()).join(" and ")}` : ""}. Sending a worker there today can catch it before it becomes an alert.`;
        } else {
          text += " None of them is above the warning line. Keep routine visits.";
        }
        actions.push({ kind: "zone", id: lead.id, label: `Open ${lead.name}` });
      }
      actions.push({ kind: "tab", id: "forecast", label: "Open AI forecast" });
      suggestions = ["Can I trust these alerts?", "Who should I visit first?"];
      break;
    }

    case "visits": {
      const top = s.visitList.slice(0, 5);
      if (!top.length) text = "Nobody needs a visit right now. Nice.";
      else {
        text = `Visit in this order:\n${top
          .map((p, i) => `${i + 1}. ${p.id} (${p.zone}, age ${p.age}) — ${p.reasons[0] ?? "flagged"}`)
          .join("\n")}`;
        if (s.visitList.length > 5) text += `\n…and ${s.visitList.length - 5} more on the list.`;
        actions.push({ kind: "person", id: top[0].id, label: `Open ${top[0].id}` });
        actions.push({ kind: "tab", id: "queue", label: "Open visit list" });
      }
      suggestions = [`Tell me about ${top[0]?.id ?? "V-01-001"}`, "Brief me on today"];
      break;
    }

    case "zone": {
      const zone =
        detected.zone ??
        s.zones.find((z) => z.id === focusZoneId) ??
        alerts[0] ??
        watches[0] ??
        ranked[0];
      if (!zone) {
        text = "Pick a zone on the map and ask again.";
        break;
      }
      text = zoneAnswer(zone, s);
      actions.push({ kind: "zone", id: zone.id, label: `Open ${zone.name}` });
      suggestions = ["Who should I visit first?", "Can I trust these alerts?"];
      break;
    }

    case "person": {
      const p = s.visitList.find((row) => row.id === detected.personId);
      if (!p) {
        text = `${detected.personId} isn't on today's visit list, so nothing stands out for them right now.`;
      } else {
        const rank = s.visitList.indexOf(p) + 1;
        text = `${p.id} (${p.zone}, age ${p.age}) is #${rank} on the visit list. Why: ${p.reasons.join("; ")}. Suggested: visit, ask how they feel, and refer to the clinic if unwell. This is a screening flag, not a diagnosis.`;
        actions.push({ kind: "person", id: p.id, label: `Open ${p.id}` });
      }
      suggestions = ["Who should I visit first?"];
      break;
    }

    case "counts":
      text = `Today: ${s.counts.alert} zone${s.counts.alert === 1 ? "" : "s"} on alert, ${s.counts.watch} on watch, ${s.counts.normal} normal. ${s.driftingToday} people above their own normal, ${s.rhythmFlags} irregular-pulse screens, ${s.visitList.length} on the visit list, ${s.visited} visits logged.`;
      suggestions = ["Brief me on today"];
      break;

    case "heat":
      text = s.regionWide
        ? "Yes — more than half the zones moved together today. That pattern looks like heat, a festival or a fasting day, not a local outbreak, so AyuLink holds alerts back one level. Keep an eye on elderly people anyway."
        : "No region-wide shift today. If heat or a festival pushes everyone's heart rate up at once, AyuLink spots that pattern and holds alerts back. Honest limit: in our heatwave test the AI forecast still gave extra warnings, so treat warnings on very hot days with care.";
      suggestions = ["Can I trust these alerts?"];
      break;

    case "quality":
      text = `${s.wornToday} of ${s.wearers} bands sent usable readings today. Days with under 2 hours of wear or lots of motion noise are dropped before any analysis, so a loose strap can't trigger an alert. Zones with fewer than 10 good wearers never alert.`;
      suggestions = ["Can I trust these alerts?"];
      break;

    case "trust":
      text =
        "Short version: alerts need several people drifting at once, checked with a statistics test that corrects for looking at many zones. In our simulated tests the AI forecast warned before the alert in most outbreak zones, about 2 days early, with few false warnings on calm days. Weak spots: heatwaves and low band wear. None of this is from real patients yet — a pilot will tell.";
      actions.push({ kind: "tab", id: "forecast", label: "See the numbers" });
      suggestions = ["Which zone will flare up next?"];
      break;

    case "privacy":
      text =
        "People show up only as codes like V-03-017, never names. Bands send heart rate and wear time, not location — GPS is an optional module that's off by default. Raw data stays on the local gateway; the console sees zone counts and the visit list.";
      break;

    case "help":
      text =
        "Ask me things like: “brief me”, “which zone will flare up next?”, “who should I visit first?”, “why is Kukatpally on watch?”, or a person code like V-03-017. I only use what's on this console. I won't diagnose or suggest medicines.";
      suggestions = STARTER_QUESTIONS.slice(0, 3);
      break;

    default:
      intent = "unknown";
      text =
        "I'm not sure what you mean. I can brief you, forecast which zone may flare up, rank who to visit, or explain why a zone or person is flagged.";
      suggestions = STARTER_QUESTIONS.slice(0, 4);
  }

  if (!suggestions.length) suggestions = STARTER_QUESTIONS.slice(0, 2);
  return { text, intent, actions, suggestions, source: "rules" };
}

/* ---------------- LLM output guard ---------------- */

const BLOCKED = [
  "diagnos",
  "dengue",
  "malaria",
  "covid",
  "typhoid",
  "chikungunya",
  "influenza",
  "tablet",
  "antibiotic",
  "paracetamol",
  "dose",
  "mg ",
  "prescri",
];

/**
 * Accept an LLM answer only if it is short, avoids medical advice terms and
 * every number in it also appears in the fact sheet or the rules draft.
 * "diagnosis" is allowed only inside the standard "not a diagnosis" phrase.
 */
export function validateAssistantText(text: string, facts: string): boolean {
  if (!text || text.length > 900) return false;
  const lowered = text.toLowerCase().replace(/not a diagnosis/g, "");
  if (BLOCKED.some((word) => lowered.includes(word))) return false;
  const numbers = text.match(/\d+(\.\d+)?/g) ?? [];
  for (const n of numbers) if (!facts.includes(n)) return false;
  return true;
}
