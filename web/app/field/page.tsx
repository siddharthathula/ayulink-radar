import type { Metadata } from "next";
import { Suspense } from "react";
import { FieldApp } from "@/components/field/FieldApp";

export const metadata: Metadata = { title: "Field app" };

export default function FieldPage() {
  return (
    <Suspense fallback={<div className="shell py-16 text-muted">Loading field app…</div>}>
      <FieldApp />
    </Suspense>
  );
}
