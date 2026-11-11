"use client";

import { ArrowRight, X } from "lucide-react";

const STEPS = [
  "Each dot is a person wearing a band. All calm.",
  "Running the same engine over 60 simulated days. Watch the timeline.",
  "Several people in one hamlet drifted above their own normal.",
  "The health worker gets a ranked list and a note in her language.",
  "Compared with simulated clinic reporting. That gap is the product.",
];

interface Props {
  step: number;
  onNext: () => void;
  onSkip: () => void;
}

export function TourOverlay({ step, onNext, onSkip }: Props) {
  if (step < 1 || step > STEPS.length) return null;

  return (
    <div
      className="fixed inset-x-2 bottom-2 z-[90] mx-auto w-auto max-w-md rounded-2xl border border-brand/40 bg-surface/95 p-3 shadow-2xl backdrop-blur sm:bottom-4 sm:right-4 sm:left-auto sm:mx-0"
      role="dialog"
      aria-label={`Guided tour, step ${step} of ${STEPS.length}`}
      aria-live="polite"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-1.5">
          {STEPS.map((_, index) => (
            <span
              key={index}
              className={`h-1.5 rounded-full transition-all ${
                index + 1 === step
                  ? "w-5 bg-brand"
                  : index + 1 < step
                    ? "w-1.5 bg-brand/60"
                    : "w-1.5 bg-border"
              }`}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={onSkip}
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-text"
          aria-label="Skip tour"
        >
          <X size={15} aria-hidden="true" />
        </button>
      </div>
      <p className="mt-2 text-sm leading-snug text-text">{STEPS[step - 1]}</p>
      <div className="mt-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onSkip}
          className="min-h-9 px-2 text-xs text-muted hover:text-text"
        >
          Skip
        </button>
        <button
          type="button"
          onClick={onNext}
          className="btn btn-primary min-h-9 px-3 text-xs"
        >
          {step === STEPS.length ? "Finish" : "Next"}
          <ArrowRight size={13} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
