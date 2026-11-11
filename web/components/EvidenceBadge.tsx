import { BookOpen, FlaskConical, CircuitBoard, ShieldQuestion } from "lucide-react";

export type EvidenceLabel =
  | "Published research"
  | "Simulated evaluation"
  | "Bench hardware test"
  | "Clinical validation: not yet performed";

const STYLES: Record<
  EvidenceLabel,
  { className: string; Icon: typeof BookOpen }
> = {
  "Published research": {
    className: "border-info/40 bg-info/10 text-info",
    Icon: BookOpen,
  },
  "Simulated evaluation": {
    className: "border-info/40 bg-info/10 text-info",
    Icon: FlaskConical,
  },
  "Bench hardware test": {
    className: "border-brand/40 bg-brand/10 text-brand",
    Icon: CircuitBoard,
  },
  "Clinical validation: not yet performed": {
    className: "border-watch/40 bg-watch/10 text-watch",
    Icon: ShieldQuestion,
  },
};

export function EvidenceBadge({ label }: { label: EvidenceLabel }) {
  const { className, Icon } = STYLES[label];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${className}`}
    >
      <Icon size={12} aria-hidden="true" />
      {label}
    </span>
  );
}
