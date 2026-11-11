import type { Metadata } from "next";
import { Suspense } from "react";
import { DemoClient } from "@/components/demo/DemoClient";

export const metadata: Metadata = {
  title: "Radar demo",
  description:
    "30-second simulated demo: personal heart-rate baselines, community cluster alerts, and a ranked health-worker visit list.",
};

export default function DemoPage() {
  return (
    <Suspense
      fallback={
        <div className="shell py-10 text-sm text-muted">
          Preparing the simulated radar…
        </div>
      }
    >
      <DemoClient />
    </Suspense>
  );
}
