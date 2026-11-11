import { Info } from "lucide-react";

export function SimulatedBadge() {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-info/40 bg-info/10 px-2.5 py-1 text-[11px] font-medium text-info"
      title="Population data is simulated. 3 physical bands exist. See Method."
    >
      <Info size={12} aria-hidden="true" />
      Simulated data
    </span>
  );
}
