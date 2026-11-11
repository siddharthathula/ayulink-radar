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

export const DESCRIPTIONS: Record<"engine" | "rhythm" | "triage" | "ingest", EndpointDoc> = {
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
    notes: ["This public demo validates only; it does not store packets."],
  },
};
