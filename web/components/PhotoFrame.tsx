"use client";

import { useState } from "react";
import { Camera } from "lucide-react";

interface PhotoFrameProps {
  src: string;
  alt: string;
  caption: string;
  className?: string;
  priority?: boolean;
  hideCaption?: boolean;
  imgClassName?: string;
}

/**
 * Renders a real photo when it exists and a labelled placeholder otherwise.
 * Never shows a broken image.
 */
export function PhotoFrame({
  src,
  alt,
  caption,
  className = "",
  priority = false,
  hideCaption = false,
  imgClassName = "aspect-[4/3]",
}: PhotoFrameProps) {
  const [failed, setFailed] = useState(src === "");

  if (failed || !src) {
    return (
      <figure
        className={`flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-[14px] border border-dashed border-border bg-surface p-4 text-center ${className}`}
      >
        <Camera size={22} className="text-muted" aria-hidden="true" />
        <figcaption className="text-sm text-muted">{caption}</figcaption>
        <span className="mono text-[11px] uppercase tracking-wide text-muted/70">
          Photo pending
        </span>
      </figure>
    );
  }

  return (
    <figure className={`overflow-hidden rounded-[14px] border border-border bg-surface ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        loading={priority ? "eager" : "lazy"}
        onError={() => setFailed(true)}
        className={`w-full object-cover ${imgClassName}`}
      />
      {hideCaption ? null : <figcaption className="px-3 py-2 text-xs text-muted">{caption}</figcaption>}
    </figure>
  );
}
