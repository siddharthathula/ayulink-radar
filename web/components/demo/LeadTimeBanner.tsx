"use client";

import Link from "next/link";
import { Clock, Info, TriangleAlert } from "lucide-react";
import type { SimResult } from "@/lib/engine/types";
import { displayDay } from "@/lib/ui/demo";

export function LeadTimeBanner({ result }: { result: SimResult }) {
  const calm = result.config.scenario === "calm";
  const alertDay = result.firstAlertDay;
  const clinicDay = result.clinicDetectionDay;
  const lead = result.leadDays;

  let content: React.ReactNode;

  if (calm) {
    content = (
      <p className="text-sm text-muted">
        <span className="text-text">Calm season.</span> No outbreak is seeded, so
        there is no lead time to report. The engine should stay quiet; that is the
        normal state.
      </p>
    );
  } else if (alertDay === null) {
    content = (
      <p className="text-sm text-muted">
        <span className="text-watch">No cluster alert in this run.</span> The
        simulated clinic is not compared against an alert that did not happen.
      </p>
    );
  } else if (clinicDay === null) {
    content = (
      <p className="text-sm text-muted">
        <span className="text-text">AyuLink alert: Day {displayDay(alertDay)}.</span>{" "}
        Fewer than 3 clinic visits from this zone occurred in the run, so no
        simulated clinic detection day is available.
      </p>
    );
  } else if (lead !== null && lead > 0) {
    content = (
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <div className="text-sm">
          <span className="text-text">AyuLink cluster alert: Day {displayDay(alertDay)}</span>
          <span className="text-muted"> · </span>
          <span className="text-muted">
            Clinic-based detection (simulated): Day {displayDay(clinicDay)}
          </span>
        </div>
        <p className="mono text-lg text-brand">{lead} days earlier</p>
      </div>
    );
  } else {
    content = (
      <p className="text-sm text-muted">
        <span className="text-text">AyuLink alert: Day {displayDay(alertDay)}.</span>{" "}
        The simulated clinic reported on Day {displayDay(clinicDay)} — the alert was{" "}
        {lead === 0 ? "on the same day" : `${Math.abs(lead ?? 0)} days later`}. We
        publish that as it is.
      </p>
    );
  }

  return (
    <div
      className="card flex items-start gap-3 border-l-2 border-l-brand p-3"
      aria-live="polite"
    >
      <Clock size={16} className="mt-0.5 shrink-0 text-brand" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {content}
        <p className="mt-1 text-[10px] text-muted">
          Same-zone comparison. Reporting lags: village 3 d, ward/society 2 d.{" "}
          <Link href="/method" className="text-info underline underline-offset-2 hover:text-text">
            Assumptions
          </Link>
          .
        </p>
      </div>
      {result.config.scenario !== "calm" && alertDay === null ? (
        <TriangleAlert size={14} className="mt-0.5 text-watch" aria-hidden="true" />
      ) : (
        <Info size={14} className="mt-0.5 text-muted" aria-hidden="true" />
      )}
    </div>
  );
}
