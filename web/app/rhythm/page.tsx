import type { Metadata } from "next";
import { Suspense } from "react";
import { RhythmLab } from "@/components/rhythm/RhythmLab";

export const metadata: Metadata = {
  title: "Rhythm Lab",
  description:
    "Run the irregular-pulse screening model in your browser on held-out public ECG windows. See the probability, feature contributions and true label.",
};

export default function RhythmPage() {
  return (
    <Suspense
      fallback={
        <div className="shell py-10 text-sm text-muted">
          Loading Rhythm Lab…
        </div>
      }
    >
      <RhythmLab />
    </Suspense>
  );
}
