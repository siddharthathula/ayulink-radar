"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Info,
  XCircle,
} from "lucide-react";
import {
  rhythmModel,
  rhythmSamples,
  extractRhythmFeatures,
  rhythmProbability,
  topContributions,
} from "@/lib/ui/rhythm";

const FEATURE_LABELS: Record<string, string> = {
  mean_rr: "Mean RR",
  sdnn: "SDNN",
  rmssd: "RMSSD",
  pnn50: "pNN50",
  cv: "CV",
  nrmssd: "normalized RMSSD",
  sd_ratio: "SD1/SD2",
  entropy: "diff entropy",
  tpr: "turning-point ratio",
};

const FEATURE_UNITS: Record<string, string> = {
  mean_rr: "ms",
  sdnn: "ms",
  rmssd: "ms",
  pnn50: "",
  cv: "",
  nrmssd: "",
  sd_ratio: "",
  entropy: "nats",
  tpr: "",
};

function formatFeature(name: string, value: number): string {
  const unit = FEATURE_UNITS[name] ?? "";
  let digits = 2;
  if (name === "mean_rr" || name === "sdnn" || name === "rmssd") digits = 1;
  if (name === "pnn50" || name === "cv" || name === "nrmssd" || name === "sd_ratio" || name === "tpr") {
    return `${value.toFixed(3)}${unit ? ` ${unit}` : ""}`;
  }
  return `${value.toFixed(digits)}${unit ? ` ${unit}` : ""}`;
}

function Tachogram({ rr }: { rr: number[] }) {
  const width = 620;
  const height = 220;
  const pad = { left: 46, right: 14, top: 16, bottom: 30 };
  const min = Math.min(...rr);
  const max = Math.max(...rr);
  const span = Math.max(max - min, 1);
  const x = (index: number) =>
    pad.left + (index / (rr.length - 1)) * (width - pad.left - pad.right);
  const y = (value: number) =>
    height - pad.bottom - ((value - min) / span) * (height - pad.top - pad.bottom);
  const path = rr
    .map((value, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(1)} ${y(value).toFixed(1)}`)
    .join(" ");
  const ticks = [min, min + span / 2, max];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-auto w-full"
      role="img"
      aria-label="Tachogram of 30 RR intervals in milliseconds"
    >
      {ticks.map((value, index) => (
        <g key={index}>
          <line
            x1={pad.left}
            x2={width - pad.right}
            y1={y(value)}
            y2={y(value)}
            stroke="var(--border)"
            strokeDasharray={index === 1 ? "3 5" : undefined}
          />
          <text
            x={pad.left - 6}
            y={y(value) + 3}
            textAnchor="end"
            fontSize={9}
            fill="var(--muted)"
            fontFamily="var(--font-mono), monospace"
          >
            {Math.round(value)}
          </text>
        </g>
      ))}
      <path d={path} fill="none" stroke="var(--rhythm)" strokeWidth={1.8} />
      {rr.map((value, index) => (
        <circle
          key={index}
          cx={x(index)}
          cy={y(value)}
          r={2.2}
          fill="var(--rhythm)"
          fillOpacity={0.8}
        />
      ))}
      <text x={pad.left} y={height - 8} fontSize={9} fill="var(--muted)">
        beat 1
      </text>
      <text x={width - pad.right} y={height - 8} textAnchor="end" fontSize={9} fill="var(--muted)">
        beat {rr.length}
      </text>
      <text x={width - pad.right} y={12} textAnchor="end" fontSize={9} fill="var(--muted)">
        RR (ms)
      </text>
    </svg>
  );
}

function Poincare({ rr }: { rr: number[] }) {
  const width = 300;
  const height = 300;
  const pad = 38;
  const values = rr.slice(0, -1).concat(rr.slice(1));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 1);
  const x = (value: number) =>
    pad + ((value - min) / span) * (width - pad * 2);
  const y = (value: number) =>
    height - pad - ((value - min) / span) * (height - pad * 2);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-auto w-full max-w-[300px]"
      role="img"
      aria-label="Poincare plot of RR interval n against RR interval n plus one"
    >
      <rect
        x={pad}
        y={pad}
        width={width - pad * 2}
        height={height - pad * 2}
        fill="none"
        stroke="var(--border)"
      />
      <line
        x1={x(min)}
        y1={y(min)}
        x2={x(max)}
        y2={y(max)}
        stroke="var(--border)"
        strokeDasharray="3 5"
      />
      {rr.slice(0, -1).map((value, index) => (
        <circle
          key={index}
          cx={x(value)}
          cy={y(rr[index + 1])}
          r={3}
          fill="var(--rhythm)"
          fillOpacity={0.72}
        />
      ))}
      <text x={pad} y={height - 8} fontSize={9} fill="var(--muted)">
        RR[n] (ms)
      </text>
      <text x={width - pad} y={height - 8} textAnchor="end" fontSize={9} fill="var(--muted)">
        {Math.round(min)}–{Math.round(max)}
      </text>
      <text x={pad} y={pad - 8} fontSize={9} fill="var(--muted)">
        RR[n+1] (ms)
      </text>
    </svg>
  );
}

function ProbabilityGauge({ probability }: { probability: number }) {
  const threshold = rhythmModel.threshold;
  const radius = 80;
  const cx = 110;
  const cy = 108;
  const angle = Math.PI * (1 - probability);
  const markerAngle = Math.PI * (1 - threshold);
  const markerX = cx + radius * Math.cos(markerAngle);
  const markerY = cy - radius * Math.sin(markerAngle);
  const flag = probability >= threshold;

  return (
    <div className="flex flex-col items-center">
      <svg
        viewBox="0 0 220 130"
        className="w-full max-w-[250px]"
        role="img"
        aria-label={`Model probability ${probability.toFixed(2)}, threshold ${threshold.toFixed(2)}`}
      >
        <path
          d={`M${cx - radius} ${cy} A${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
          fill="none"
          stroke="var(--border)"
          strokeWidth={11}
          strokeLinecap="round"
        />
        <path
          d={`M${cx - radius} ${cy} A${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
          fill="none"
          stroke={flag ? "var(--rhythm)" : "var(--brand)"}
          strokeWidth={11}
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray={`${probability} 1`}
        />
        <line
          x1={cx + (radius - 16) * Math.cos(markerAngle)}
          y1={cy - (radius - 16) * Math.sin(markerAngle)}
          x2={cx + (radius + 12) * Math.cos(markerAngle)}
          y2={cy - (radius + 12) * Math.sin(markerAngle)}
          stroke="var(--text)"
          strokeWidth={1.5}
        />
        <text
          x={markerX}
          y={markerY - 18}
          textAnchor="middle"
          fontSize={9}
          fill="var(--muted)"
        >
          threshold
        </text>
        <text
          x={cx}
          y={cy - 18}
          textAnchor="middle"
          fontSize={34}
          fontFamily="var(--font-mono), monospace"
          fill="var(--text)"
        >
          {probability.toFixed(2)}
        </text>
        <text
          x={cx}
          y={cy + 2}
          textAnchor="middle"
          fontSize={10}
          fill="var(--muted)"
        >
          probability of irregular rhythm
        </text>
        <text
          x={cx}
          y={cy + 20}
          textAnchor="middle"
          fontSize={11}
          fontWeight={600}
          fill={flag ? "var(--rhythm)" : "var(--brand)"}
        >
          {flag ? "Screening flag" : "No screening flag"}
        </text>
        <circle cx={cx + radius * Math.cos(angle)} cy={cy - radius * Math.sin(angle)} r={4} fill="var(--text)" />
      </svg>
    </div>
  );
}

export function RhythmLab() {
  const searchParams = useSearchParams();
  const initial = useMemo(() => {
    const requested = searchParams.get("sample");
    return rhythmSamples.find((sample) => sample.id === requested)?.id ?? rhythmSamples[0].id;
  }, [searchParams]);

  // Picked sample and reveal state are keyed by the URL's sample, so a new
  // ?sample= resets them without an effect.
  const [picked, setPicked] = useState<{ from: string; id: string; revealed: boolean }>({
    from: initial,
    id: initial,
    revealed: false,
  });
  const current = picked.from === initial ? picked : { from: initial, id: initial, revealed: false };
  const sampleId = current.id;
  const revealed = current.revealed;
  const setSampleId = (id: string) => setPicked({ from: initial, id, revealed: false });
  const setRevealed = (value: boolean | ((previous: boolean) => boolean)) =>
    setPicked({
      ...current,
      revealed: typeof value === "function" ? value(current.revealed) : value,
    });

  const sample = rhythmSamples.find((row) => row.id === sampleId) ?? rhythmSamples[0];
  const probability = useMemo(() => rhythmProbability(sample.rr, rhythmModel), [sample]);
  const contributions = useMemo(
    () => topContributions(sample.rr, rhythmModel, 5),
    [sample],
  );
  const features = useMemo(() => extractRhythmFeatures(sample.rr), [sample]);
  const flagged = probability >= rhythmModel.threshold;
  const correct = flagged === (sample.label === 1);
  const maxContribution = Math.max(
    ...contributions.map((row) => Math.abs(row.contribution)),
    0.001,
  );
  const metrics = rhythmModel.metrics as {
    nWindows: number;
    nRecords: number;
    mean: { sensitivity: number; specificity: number; auroc: number };
    sd: { sensitivity: number; specificity: number; auroc: number };
    outOfFold: {
      sensitivity: number;
      specificity: number;
      auroc: number;
    };
  };

  function move(offset: number) {
    const index = rhythmSamples.findIndex((row) => row.id === sampleId);
    const next = (index + offset + rhythmSamples.length) % rhythmSamples.length;
    setSampleId(rhythmSamples[next].id);
    setRevealed(false);
  }

  return (
    <div className="shell pb-12 pt-6 sm:pt-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="mono text-[11px] uppercase tracking-[0.16em] text-muted">
            Rhythm Lab · public ECG sample
          </p>
          <h1 className="mt-1 text-3xl sm:text-4xl">Irregular pulse screening</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            The same nine RR-interval features run in the browser and on the
            band&apos;s ESP32. Pick a window from the held-out set, run the model,
            then reveal the true label.
          </p>
        </div>
        <span className="chip border-rhythm/40 bg-rhythm/10 text-rhythm">
          Screening, not diagnosis
        </span>
      </div>

      <section className="mt-5 card p-3 sm:p-4" aria-label="Sample picker">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted">Sample</p>
            <p className="mono text-sm">
              {sample.id}
              <span className="ml-2 text-muted">window {rhythmSamples.findIndex((row) => row.id === sampleId) + 1} of {rhythmSamples.length}</span>
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => move(-1)} className="btn min-h-10 px-3 text-xs" aria-label="Previous sample">
              <ArrowLeft size={13} aria-hidden="true" /> Prev
            </button>
            <button type="button" onClick={() => move(1)} className="btn min-h-10 px-3 text-xs" aria-label="Next sample">
              Next <ArrowRight size={13} aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-8 gap-1 sm:grid-cols-10">
          {rhythmSamples.map((row, index) => (
            <button
              key={row.id}
              type="button"
              onClick={() => {
                setSampleId(row.id);
                setRevealed(false);
              }}
              aria-pressed={row.id === sampleId}
              aria-label={`Sample ${index + 1}`}
              className={`mono min-h-9 rounded-md border text-[11px] transition-colors ${
                row.id === sampleId
                  ? "border-rhythm/60 bg-rhythm/15 text-rhythm"
                  : "border-border bg-bg text-muted hover:text-text"
              }`}
            >
              {index + 1}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-muted">
          Labels stay hidden until you reveal. Samples S01–S20 are AF windows and
          S21–S40 are normal windows from held-out records.
        </p>
      </section>

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section className="card p-3 sm:p-4" aria-label="Tachogram">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-sm font-medium">Tachogram · RR vs beat</h2>
            <span className="mono text-[11px] text-muted">30 intervals</span>
          </div>
          <Tachogram rr={sample.rr} />
          <p className="mt-2 text-[11px] text-muted">
            Each point is one beat-to-beat interval. Irregular rhythm shows as
            abrupt, uneven jumps.
          </p>
        </section>

        <section className="card flex flex-col p-3 sm:p-4" aria-label="Poincare plot">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-sm font-medium">Poincaré · RR[n] vs RR[n+1]</h2>
            <span className="mono text-[11px] text-muted">29 points</span>
          </div>
          <div className="flex flex-1 items-center justify-center">
            <Poincare rr={sample.rr} />
          </div>
          <p className="mt-2 text-[11px] text-muted">
            A tight diagonal cluster is regular. A wide cloud suggests irregular
            timing.
          </p>
        </section>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <section className="card p-4" aria-label="Model output">
          <h2 className="text-sm font-medium">Model output</h2>
          <ProbabilityGauge probability={probability} />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
            <p className="text-[11px] text-muted">
              Threshold {rhythmModel.threshold.toFixed(3)} · operating point
              chosen for ≥95% cross-validated specificity.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setRevealed((value) => !value)}
            className="btn mt-3 w-full text-sm"
          >
            {revealed ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}
            {revealed ? "Hide true label" : "Reveal true label"}
          </button>
          {revealed ? (
            <div
              className={`mt-3 flex items-start gap-2 rounded-xl border p-3 text-sm ${
                correct
                  ? "border-brand/40 bg-brand/10 text-brand"
                  : "border-watch/40 bg-watch/10 text-watch"
              }`}
              role="status"
            >
              {correct ? (
                <CheckCircle2 size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
              ) : (
                <XCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
              )}
              <div>
                <p className="font-medium">
                  {correct ? "Correct" : "Incorrect"} · true label{" "}
                  {sample.label === 1 ? "AF window" : "normal window"}
                </p>
                <p className="mt-0.5 text-[11px]">
                  Model said {flagged ? "irregular" : "regular"} at p ={" "}
                  {probability.toFixed(3)}. One window is not a diagnosis.
                </p>
              </div>
            </div>
          ) : (
            <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted">
              <Info size={12} aria-hidden="true" /> True label hidden until you reveal.
            </p>
          )}
        </section>

        <section className="card p-4" aria-label="Feature contributions">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-medium">Top contributions</h2>
            <span className="mono text-[10px] text-muted">coef × standardized</span>
          </div>
          <ul className="mt-3 space-y-3">
            {contributions.map((row) => {
              const width = (Math.abs(row.contribution) / maxContribution) * 46;
              const positive = row.contribution >= 0;
              return (
                <li key={row.feature}>
                  <div className="flex items-baseline justify-between gap-2 text-[11px]">
                    <span className="text-text">
                      {FEATURE_LABELS[row.feature] ?? row.feature}{" "}
                      <span className="text-muted">{formatFeature(row.feature, row.value)}</span>
                    </span>
                    <span className={`mono ${positive ? "text-rhythm" : "text-brand"}`}>
                      {positive ? "+" : ""}
                      {row.contribution.toFixed(2)}
                    </span>
                  </div>
                  <div className="mt-1 flex h-2 w-full items-center">
                    <div className="relative h-2 w-full rounded-full bg-bg">
                      <span className="absolute inset-y-0 left-1/2 w-px bg-border" />
                      <span
                        className={`absolute inset-y-0 rounded-full ${
                          positive ? "bg-rhythm/80" : "bg-brand/80"
                        }`}
                        style={{
                          left: positive ? "50%" : `${50 - width}%`,
                          width: `${width}%`,
                        }}
                      />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 border-t border-border pt-3 text-[11px] leading-relaxed text-muted">
            Positive values push the model toward an irregular-rhythm flag;
            negative values push toward regular. Features are standardized with
            the training mean and scale before multiplying by the coefficient.
          </p>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
            <div>
              <dt className="text-muted">Mean RR</dt>
              <dd className="mono text-text">{features[0].toFixed(1)} ms</dd>
            </div>
            <div>
              <dt className="text-muted">SDNN</dt>
              <dd className="mono text-text">{features[1].toFixed(1)} ms</dd>
            </div>
            <div>
              <dt className="text-muted">pNN50</dt>
              <dd className="mono text-text">{(features[3] * 100).toFixed(1)}%</dd>
            </div>
          </dl>
        </section>
      </div>

      <section className="mt-3 card p-4" aria-label="Validation metrics">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-medium">Validation · per-record cross-validation</h2>
            <p className="mt-1 text-[11px] text-muted">
              {metrics.nWindows.toLocaleString()} windows from {metrics.nRecords}{" "}
              records · GroupKFold(5) by record · final model fit on all windows
            </p>
          </div>
          <span className="chip">Public ECG data</span>
        </div>
        <dl className="mt-3 grid grid-cols-3 gap-2">
          {[
            { label: "Sensitivity", mean: metrics.mean.sensitivity, sd: metrics.sd.sensitivity },
            { label: "Specificity", mean: metrics.mean.specificity, sd: metrics.sd.specificity },
            { label: "AUROC", mean: metrics.mean.auroc, sd: metrics.sd.auroc },
          ].map((row) => (
            <div key={row.label} className="rounded-xl border border-border bg-bg p-3">
              <dt className="text-[10px] uppercase tracking-wide text-muted">{row.label}</dt>
              <dd className="mono mt-1 text-lg">{row.mean.toFixed(3)}</dd>
              <dd className="mono text-[10px] text-muted">± {row.sd.toFixed(3)}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-[11px] leading-relaxed text-muted">
          Out-of-fold at the chosen threshold: sensitivity{" "}
          {(metrics.outOfFold.sensitivity * 100).toFixed(1)}%, specificity{" "}
          {(metrics.outOfFold.specificity * 100).toFixed(1)}%, AUROC{" "}
          {metrics.outOfFold.auroc.toFixed(3)}. Metrics are reported as computed;
          they were not edited.
        </p>
      </section>

      <aside className="mt-3 card border-watch/30 p-4" aria-label="Caveat">
        <h2 className="flex items-center gap-2 text-sm font-medium text-watch">
          <Info size={15} aria-hidden="true" /> What this model is and is not
        </h2>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[12px] leading-relaxed text-muted">
          <li>
            Trained on ECG-derived RR intervals from the MIT-BIH Atrial
            Fibrillation Database (ODC-BY 1.0). Cite Moody &amp; Mark 1983 and
            PhysioNet.
          </li>
          <li>
            The band uses an optical/analog pulse sensor. On-band optical
            validation is pending; the model has not been validated on wrist
            pulse data.
          </li>
          <li>
            A flag means &ldquo;irregular rhythm, refer for ECG&rdquo;. It does not
            diagnose atrial fibrillation or any other condition, and it is not a
            medical device.
          </li>
          <li>
            Held-out samples are a small derived subset shared for demonstration;
            one window can be wrong.
          </li>
        </ul>
        <div className="mt-3 flex flex-wrap gap-4 border-t border-border pt-3 text-[11px]">
          <Link href="/demo" className="text-info underline underline-offset-2 hover:text-text">
            See rhythm screening in the demo
          </Link>
          <Link href="/method" className="text-info underline underline-offset-2 hover:text-text">
            Method, metrics and limits
          </Link>
        </div>
      </aside>
    </div>
  );
}
