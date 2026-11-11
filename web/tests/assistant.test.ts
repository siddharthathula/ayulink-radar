import { describe, expect, it } from "vitest";
import { simulate } from "@/lib/engine/simulate";
import { DEFAULT_CONFIG } from "@/lib/engine/presets";
import { buildQueue } from "@/lib/engine/queue";
import { buildForecastIndex, zoneForecasts } from "@/lib/engine/forecast";
import { FORECAST_MODEL } from "@/lib/ai/forecastModel";
import { answerQuestion, buildSnapshot, detectIntent, validateAssistantText } from "@/lib/ai/assistant";
import { runAssistant, runForecast } from "@/lib/api/handlers";

const result = simulate({ ...DEFAULT_CONFIG, scenario: "cluster", seed: 2026 });
const day = (result.firstAlertDay ?? 45) + 1;
const queue = buildQueue(result, day);
const snapshot = buildSnapshot({
  result,
  day,
  queue,
  forecasts: zoneForecasts(result, day, FORECAST_MODEL, buildForecastIndex(result)),
  wornToday: 200,
  driftingToday: 12,
  rhythmFlags: 2,
  visited: 0,
  place: "Village",
});

describe("Ask AyuLink assistant", () => {
  it("refuses diagnosis and medicine questions", () => {
    for (const q of ["Does V-03-017 have dengue?", "What tablet should I give?", "diagnose this zone"]) {
      const reply = answerQuestion(q, snapshot);
      expect(reply.intent).toBe("medical");
      expect(reply.text.toLowerCase()).not.toMatch(/dengue|paracetamol/);
    }
  });

  it("routes common operator questions", () => {
    expect(detectIntent("brief me on today", snapshot).intent).toBe("brief");
    expect(detectIntent("which zone will flare up next?", snapshot).intent).toBe("forecast");
    expect(detectIntent("who should I visit first", snapshot).intent).toBe("visits");
    expect(detectIntent(`why is ${result.zones[0].name} flagged`, snapshot).intent).toBe("zone");
    expect(detectIntent("is it the heat?", snapshot).intent).toBe("heat");
  });

  it("grounds the visit answer in the real queue", () => {
    const reply = answerQuestion("Who should I visit first?", snapshot);
    expect(queue.length).toBeGreaterThan(0);
    expect(reply.text).toContain(queue[0].person.id);
    expect(reply.actions.some((a) => a.kind === "person")).toBe(true);
  });

  it("names the alert zone in the brief", () => {
    const alertZone = snapshot.zones.find((z) => z.level === "alert");
    expect(alertZone).toBeDefined();
    expect(answerQuestion("brief me", snapshot).text).toContain(alertZone!.name);
  });

  it("explains a person by code", () => {
    const id = queue[0].person.id;
    const reply = answerQuestion(`tell me about ${id}`, snapshot);
    expect(reply.intent).toBe("person");
    expect(reply.text).toContain("not a diagnosis");
  });

  it("rejects LLM text that invents numbers or medical terms", () => {
    const facts = JSON.stringify(snapshot);
    expect(validateAssistantText("Visit the alert zone first. This is a screening flag, not a diagnosis.", facts)).toBe(true);
    expect(validateAssistantText("Likely dengue, visit now.", facts)).toBe(false);
    expect(validateAssistantText("98765 people are sick.", facts)).toBe(false);
  });
});

describe("/api/assistant and /api/forecast", () => {
  it("answers with rules when no LLM key is set", async () => {
    const out = await runAssistant({ question: "Who should I visit first?", snapshot }, {});
    expect(out.status).toBe(200);
    expect((out.body as { source: string }).source).toBe("rules");
  });

  it("rejects bad assistant input", async () => {
    expect((await runAssistant({ question: "", snapshot }, {})).status).toBe(400);
    expect((await runAssistant({ question: "hi" }, {})).status).toBe(400);
  });

  it("returns ranked zone forecasts", () => {
    const out = runForecast({ mode: "village", scenario: "cluster", seed: 2026, day: 8 });
    expect(out.status).toBe(200);
    const body = out.body as { zones: Array<{ probability: number }> };
    expect(body.zones.length).toBeGreaterThan(0);
    for (let i = 1; i < body.zones.length; i++) expect(body.zones[i - 1].probability).toBeGreaterThanOrEqual(body.zones[i].probability);
    expect(runForecast({ day: 99 }).status).toBe(400);
  });
});
