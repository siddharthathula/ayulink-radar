/** Endpoint descriptions shared by GET handlers and the /api-docs page. */
export interface EndpointDoc {
  path: string;
  method: "POST";
  title: string;
  purpose: string;
  who: string;
  example: unknown;
  notes: string[];
}

export const AF_EXAMPLE_RR = [560, 440, 540, 952, 588, 900, 480, 804, 456, 484, 668, 664, 580, 852, 808, 668, 508, 684, 1172, 744, 700, 768, 836, 1124, 516, 600, 736, 740, 536, 576];

export const DESCRIPTIONS: Record<"engine" | "forecast" | "rhythm" | "triage" | "assistant" | "ingest", EndpointDoc> = {
  engine: {
    path: "/api/engine",
    method: "POST",
    title: "Run the detection engine",
    purpose:
      "Runs the same simulation and cluster detector the console uses, on the server, and returns per-zone levels for every day.",
    who: "Dashboards, evaluation scripts, judges reproducing a run.",
    example: { mode: "village", scenario: "cluster", seed: 2026, wearRate: 0.8 },
    notes: [
      "mode: village | ward | society. scenario: calm | cluster | spread. stress: none | heatwave | noisy | isolated | fast.",
      "Per-person data is never returned. Population is simulated.",
    ],
  },
  forecast: {
    path: "/api/forecast",
    method: "POST",
    title: "AI zone forecast (next 3 days)",
    purpose:
      "Ranks every zone by its chance of reaching ALERT within 3 days, using the trained forecaster, and names the top factors behind each score.",
    who: "Planners deciding where to send health workers tomorrow.",
    example: { mode: "village", scenario: "cluster", seed: 2026, wearRate: 0.8, day: 8 },
    notes: [
      "Same config fields as /api/engine plus day (1–32).",
      "Logistic model trained on simulated seeds 1–100, tested on 101–200. Forecasts escalation of the engine's alert, not disease.",
    ],
  },
  rhythm: {
    path: "/api/rhythm",
    method: "POST",
    title: "Irregular-rhythm screening",
    purpose:
      "Scores beat-to-beat intervals with the trained rhythm model in 30-beat windows. Unusable windows are rejected by the quality gate instead of scored.",
    who: "A gateway forwarding RR intervals from a band.",
    example: { rr_ms: [560, 440, 540, 952, 588, 900, 480, 804, 456, 484, 668, 664, 580, 852, 808, 668, 508, 684, 1172, 744, 700, 768, 836, 1124, 516, 600, 736, 740, 536, 576] },
    notes: [
      "rr_ms: 30–300 intervals in milliseconds.",
      "Returns a screening flag, never a diagnosis. Trained on ECG-derived intervals from PhysioNet AFDB.",
    ],
  },
  triage: {
    path: "/api/triage",
    method: "POST",
    title: "Health-worker note",
    purpose:
      "Returns a short note in English, Telugu or Hindi. Uses a fixed template; if an LLM key is configured, an LLM may rephrase it, and its output is checked and replaced by the template if it breaks any rule.",
    who: "The console and the field app.",
    example: { lang: "te", kind: "drift", facts: { days: 3, deltaBpm: 9 } },
    notes: [
      "kind: drift | rhythm | cluster. facts: days, deltaBpm, k, n (numbers) and zone (short label).",
      "Only numbers and a zone label are accepted. No identifiers.",
    ],
  },
  assistant: {
    path: "/api/assistant",
    method: "POST",
    title: "Ask AyuLink (operator assistant)",
    purpose:
      "Answers an operator's question from a console fact sheet: briefings, forecasts, who to visit, why a zone is flagged. Rules engine always answers; if an LLM key is set, the LLM may rephrase, and its output is rejected if it adds numbers, disease names or medicine words.",
    who: "The console's chat panel, or any dashboard that can send its fact sheet.",
    example: {
      question: "Who should I visit first?",
      snapshot: {
        day: 9,
        totalDays: 32,
        place: "Village",
        wearers: 306,
        wornToday: 241,
        driftingToday: 14,
        rhythmFlags: 3,
        regionWide: false,
        counts: { alert: 1, watch: 1, normal: 7 },
        zones: [{ id: "V-03", name: "Peddagudem", level: "alert", n: 27, k: 7, expectedPct: 4.1, pValue: 0.00003, riskPct: null, risk: "high", drivers: [], neighbors: ["Chintapalle"] }],
        visitList: [{ id: "V-03-017", zone: "Peddagudem", age: 67, score: 88, reasons: ["Resting HR +11 bpm above own baseline for 3 days", "Zone on cluster alert"] }],
        visited: 0,
        simulated: true,
      },
    },
    notes: [
      "Never diagnoses, never names diseases, never suggests medicines. Medical questions get a referral line.",
      "Body limit 32 KB. GET reports whether an LLM is configured.",
    ],
  },
  ingest: {
    path: "/api/ingest",
    method: "POST",
    title: "Validate gateway packets",
    purpose:
      "Checks band packets against the packet schema and reports events (fall, seizure-like motion, not worn, low battery). Up to 50 packets per call.",
    who: "LoRa gateways syncing their store-and-forward buffer.",
    example: {
      packets: [
        { band_id: "BAND-03", ts: 1794390000, hr_bpm: 74, activity: 0.9, worn: true, fall: false, seizure: false, batt_pct: 81 },
      ],
    },
    notes: [
      "This public demo validates only; it does not store packets.",
      "Modular bands may add: modules (list), spo2_pct, skin_temp_c, gsr_us, ecg_rr_ms, lat + lng. Location or ECG/GSR fields are rejected unless the matching module is declared.",
    ],
  },
};
