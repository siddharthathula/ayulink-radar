"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyBlock({ code, label }: { code: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="overflow-hidden rounded-xl border border-black/20 bg-brandbar-2">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
        <span className="mono text-[11px] uppercase tracking-wider text-onbrand">{label}</span>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(code);
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            } catch {
              // ignore
            }
          }}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] text-onbrand hover:bg-white/10"
        >
          {copied ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="scroll-thin mono overflow-x-auto px-4 py-3 text-[12.5px] leading-relaxed text-[#e7f5ec]">{code}</pre>
    </div>
  );
}
