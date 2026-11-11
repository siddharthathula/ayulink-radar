import type { Metadata } from "next";
import { Suspense } from "react";
import { ConfigureClient } from "@/components/configure/ConfigureClient";

export const metadata: Metadata = {
  title: "Configure a band",
  description:
    "Build an AyuLink band around one person: pick modules (pulse, temperature, motion, GPS, LoRa, ECG, GSR) and see which AI features, battery load and privacy settings follow.",
};

export default function ConfigurePage() {
  return (
    <Suspense fallback={<div className="shell py-10 text-sm text-muted">Loading the configurator…</div>}>
      <ConfigureClient />
    </Suspense>
  );
}
