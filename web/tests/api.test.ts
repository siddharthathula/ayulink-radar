import { describe, expect, it } from "vitest";
import { runEngine, runIngest, runRhythm, runTriage, validatePacket } from "@/lib/api/handlers";
import { AF_EXAMPLE_RR } from "@/lib/api/docs";
import { simulate } from "@/lib/engine/simulate";
import { DEFAULT_CONFIG } from "@/lib/engine/presets";

describe("/api/engine", () => {
  it("matches the in-browser engine for the same config", () => {
    const out = runEngine({ mode: "village", scenario: "cluster", seed: 2026, wearRate: 0.8 });
    expect(out.status).toBe(200);
    const direct = simulate({ ...DEFAULT_CONFIG, mode: "village", scenario: "cluster", seed: 2026, wearRate: 0.8 });
    const body = out.body as { summary: { firstAlertDay: number | null; leadDays: number | null } };
    expect(body.summary.firstAlertDay).toBe(direct.firstAlertDay);
    expect(body.summary.leadDays).toBe(direct.leadDays);
  });

  it("rejects bad input", () => {
    expect(runEngine({ mode: "city" }).status).toBe(400);
    expect(runEngine({ seed: -1 }).status).toBe(400);
    expect(runEngine("nope").status).toBe(400);
  });
});

describe("/api/rhythm", () => {
  it("scores a real AF sample window", () => {
    const out = runRhythm({ rr_ms: AF_EXAMPLE_RR });
    expect(out.status).toBe(200);
    expect((out.body as { usable: boolean }).usable).toBe(true);
  });

  it("refuses unusable signal instead of scoring it", () => {
    const junk = Array.from({ length: 30 }, () => 150);
    const out = runRhythm({ rr_ms: junk });
    expect((out.body as { usable: boolean; reason: string }).usable).toBe(false);
    expect((out.body as { reason: string }).reason).toBe("out-of-range");
  });

  it("rejects too few intervals", () => {
    expect(runRhythm({ rr_ms: [800, 810] }).status).toBe(400);
  });
});

describe("/api/triage", () => {
  it("returns a template without a key", async () => {
    const out = await runTriage({ lang: "en", kind: "drift", facts: { days: 3, deltaBpm: 9 } }, {});
    const body = out.body as { text: string; source: string };
    expect(body.source).toBe("template");
    expect(body.text.toLowerCase()).toContain("screening");
  });

  it("rejects identifiers smuggled into facts", async () => {
    const out = await runTriage(
      { lang: "en", kind: "drift", facts: { days: 2, deltaBpm: 7, name: "Ravi" } as never },
      {},
    );
    expect(out.status).toBe(200); // unknown keys are ignored, never echoed
    expect(JSON.stringify(out.body)).not.toContain("Ravi");
    const bad = await runTriage({ lang: "en", kind: "drift", facts: { zone: "x".repeat(80) } }, {});
    expect(bad.status).toBe(400);
  });

  it("returns 400, not a crash, when a required fact is missing", async () => {
    const out = await runTriage({ lang: "hi", kind: "drift", facts: {} }, {});
    expect(out.status).toBe(400);
  });
});

describe("/api/ingest", () => {
  const good = { band_id: "BAND-03", ts: 1794390000, hr_bpm: 74, activity: 0.9, worn: true, fall: true, seizure: false, batt_pct: 9 };
  it("accepts a valid packet and reports events", () => {
    expect(validatePacket(good)).toEqual([]);
    const out = runIngest({ packets: [good] });
    const body = out.body as { accepted: number; results: Array<{ events: string[] }> };
    expect(body.accepted).toBe(1);
    expect(body.results[0].events).toEqual(["fall", "low battery"]);
  });
  it("rejects a malformed packet", () => {
    const out = runIngest({ packets: [{ ...good, hr_bpm: 400 }] });
    expect(out.status).toBe(207);
  });
});
