"use client";

import type { Mode } from "@/lib/engine/types";
import { PRESETS } from "@/lib/engine/presets";

export function AssumptionsPanel({ mode }: { mode: Mode }) {
  const preset = PRESETS[mode];
  return (
    <div className="space-y-3 text-[11px] leading-relaxed text-muted">
      <p className="text-xs text-text">
        Everything on this page is simulated in your browser. No data leaves the
        device. 3 physical prototype bands exist.
      </p>
      <dl className="space-y-1.5">
        <div className="flex justify-between gap-3">
          <dt>Mode</dt>
          <dd className="text-text">
            {preset.label} · {preset.zones.length} zones
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>People per zone</dt>
          <dd className="mono text-text">{preset.peoplePerZone}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Band share</dt>
          <dd className="mono text-text">
            {(preset.bandFraction * 100).toFixed(0)}%
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Reporting lag</dt>
          <dd className="mono text-text">{preset.reportingLagDays} days</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Run length</dt>
          <dd className="mono text-text">60 days · window 28–59</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Outbreak seeded</dt>
          <dd className="mono text-text">day 34</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Baseline</dt>
          <dd className="text-text">68 ± 7 bpm, clamped 50–92</dd>
        </div>
      </dl>
      <div className="border-t border-border pt-3">
        <p className="font-medium text-text">Detection settings</p>
        <ul className="mt-1 list-disc space-y-1 pl-4">
          <li>Drift: z ≥ 2.0 on two consecutive valid days.</li>
          <li>Baseline: 21-day median, latest 2 days skipped.</li>
          <li>Cluster: 3-day unique-person window; binomial tail.</li>
          <li>Alert: k ≥ 4 and p &lt; 0.001/Z. Watch: k ≥ 3 and p &lt; 0.01/Z.</li>
          <li>Zones with fewer than 10 eligible wearers never alert.</li>
          <li>Region-wide guard downgrades a day when most zones fire.</li>
        </ul>
      </div>
      <div className="border-t border-border pt-3">
        <p className="font-medium text-text">Clinic comparison</p>
        <p className="mt-1">
          Each infected person visits a clinic with probability 0.45, 4–6 days
          after infection. Clinic detection is the third visit from the outbreak
          zone plus the mode&apos;s reporting lag ({preset.reportingLagDays} days).
          This is generous to the clinic system, so lead time is not inflated.
        </p>
      </div>
      <div className="border-t border-border pt-3">
        <p className="font-medium text-text">What this is not</p>
        <p className="mt-1">
          Not a medical device. Not clinically validated. Resting-HR drift is not
          disease-specific, and the alert never names a disease. Dot positions
          are random and carry no address information.
        </p>
      </div>
    </div>
  );
}
