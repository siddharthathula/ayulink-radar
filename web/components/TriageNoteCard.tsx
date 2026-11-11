"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Copy, FileText, Languages, Sparkles, Square, Volume2 } from "lucide-react";
import type { Lang, TriageKind } from "@/lib/engine/types";
import { useSettings } from "@/lib/ui/settings";
import {
  templateFor,
  type TriageFacts,
} from "@/lib/triage/templates";

const LANGS: Array<{ id: Lang; label: string; font: string }> = [
  { id: "en", label: "English", font: "" },
  { id: "te", label: "తెలుగు", font: "font-telugu" },
  { id: "hi", label: "हिन्दी", font: "font-devanagari" },
];

interface Props {
  kind: TriageKind;
  facts: TriageFacts;
}

const SPEECH_LANG: Record<Lang, string> = { en: "en-IN", te: "te-IN", hi: "hi-IN" };

export function TriageNoteCard({ kind, facts }: Props) {
  const [settings] = useSettings();
  const [langPick, setLang] = useState<Lang | null>(null);
  const lang: Lang = langPick ?? settings.noteLanguage;
  const [llm, setLlm] = useState<{ key: string; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voiceMissing, setVoiceMissing] = useState(false);

  const factsKey = JSON.stringify(facts);

  const template = useMemo(() => {
    try {
      return templateFor(kind, lang, facts);
    } catch {
      return { text: "Note unavailable for this person.", source: "template" as const };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, lang, factsKey]);

  const requestKey = `${kind}|${lang}|${factsKey}`;
  const useLlm = llm !== null && llm.key === requestKey;
  const text = useLlm ? llm.text : template.text;
  const source: "template" | "llm" = useLlm ? "llm" : "template";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/triage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lang, kind, facts }),
          signal: AbortSignal.timeout(6500),
        });
        if (!response.ok) return;
        const data = (await response.json()) as { text?: unknown; source?: unknown };
        if (
          !cancelled &&
          typeof data.text === "string" &&
          data.text.trim().length > 0 &&
          data.source === "llm"
        ) {
          setLlm({ key: requestKey, text: data.text });
        }
      } catch {
        // Keep the local template. The demo never depends on the network.
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard can be blocked; the text remains selectable.
    }
  }

  function speak() {
    if (!("speechSynthesis" in window)) {
      setVoiceMissing(true);
      return;
    }
    const synth = window.speechSynthesis;
    if (speaking) {
      synth.cancel();
      setSpeaking(false);
      return;
    }
    const target = SPEECH_LANG[lang];
    const voices = synth.getVoices();
    const voice =
      voices.find((v) => v.lang === target) ?? voices.find((v) => v.lang.startsWith(target.slice(0, 2)));
    if (lang !== "en" && !voice) {
      setVoiceMissing(true);
      return;
    }
    setVoiceMissing(false);
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = target;
    if (voice) utterance.voice = voice;
    utterance.rate = 0.92;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    setSpeaking(true);
    synth.speak(utterance);
  }

  const active = LANGS.find((item) => item.id === lang) ?? LANGS[0];

  return (
    <section className="card p-4" aria-label="Health-worker note">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-heading text-sm font-semibold">
          <Languages size={15} className="text-brand" aria-hidden="true" />
          Health-worker note
        </h3>
        <span className="inline-flex items-center gap-1 text-[11px] text-muted">
          {source === "llm" ? (
            <>
              <Sparkles size={11} aria-hidden="true" /> AI-written, fact-locked
            </>
          ) : (
            <>
              <FileText size={11} aria-hidden="true" /> Template
            </>
          )}
        </span>
      </div>

      <div
        className="mt-3 flex gap-1 rounded-lg border border-border bg-bg p-1"
        role="tablist"
        aria-label="Note language"
      >
        {LANGS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={lang === item.id}
            onClick={() => setLang(item.id)}
            className={`min-h-9 flex-1 rounded-md px-2 text-[13px] transition-colors ${item.font} ${
              lang === item.id
                ? "bg-surface-2 text-text"
                : "text-muted hover:text-text"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <p
        className={`mt-3 min-h-[96px] whitespace-pre-line text-[14px] leading-relaxed text-text ${active.font}`}
        lang={lang}
      >
        {text}
      </p>
      {voiceMissing ? (
        <p className="mt-1 text-[11px] text-watch">
          This device has no {lang === "te" ? "Telugu" : lang === "hi" ? "Hindi" : ""} voice installed. The
          note can still be copied or read on screen.
        </p>
      ) : null}

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
        <p className="text-[11px] text-muted">
          Screening flag, not a diagnosis.
        </p>
        <div className="flex gap-1.5">
        <button
          type="button"
          onClick={speak}
          className="btn min-h-9 px-3 text-xs"
          aria-pressed={speaking}
          title="Read the note aloud with this device's voice, for workers who prefer listening"
        >
          {speaking ? <Square size={12} aria-hidden="true" /> : <Volume2 size={13} aria-hidden="true" />}
          {speaking ? "Stop" : "Read aloud"}
        </button>
        <button type="button" onClick={copy} className="btn min-h-9 px-3 text-xs">
          {copied ? (
            <>
              <Check size={13} aria-hidden="true" /> Copied
            </>
          ) : (
            <>
              <Copy size={13} aria-hidden="true" /> Copy
            </>
          )}
        </button>
        </div>
      </div>
    </section>
  );
}
