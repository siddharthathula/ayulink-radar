"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Mic, MicOff, Send, Sparkles, Volume2, VolumeX, X } from "lucide-react";
import {
  STARTER_QUESTIONS,
  answerQuestion,
  type AssistantAction,
  type AssistantReply,
  type ConsoleSnapshot,
} from "@/lib/ai/assistant";
import { useOnline } from "@/lib/ui/hooks";

interface Message {
  id: number;
  role: "user" | "assistant";
  text: string;
  reply?: AssistantReply;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  snapshot: ConsoleSnapshot;
  focusZoneId: string | null;
  onAction: (action: AssistantAction) => void;
}

// Minimal typing for the browser speech recognition API (Chrome/Edge/Android).
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
}

function getRecognizer(): SpeechRecognitionLike | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

let llmStatus: Promise<boolean> | null = null;
function llmConfigured(): Promise<boolean> {
  llmStatus ??= fetch("/api/assistant", { signal: AbortSignal.timeout(4000) })
    .then((r) => (r.ok ? r.json() : { llmConfigured: false }))
    .then((d: { llmConfigured?: boolean }) => d.llmConfigured === true)
    .catch(() => false);
  return llmStatus;
}

export function Assistant({ open, onOpenChange, snapshot, focusZoneId, onAction }: Props) {
  const online = useOnline();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [speak, setSpeak] = useState(false);
  const [listening, setListening] = useState(false);
  const [canListen] = useState(() => getRecognizer() !== null);
  const recognizer = useRef<SpeechRecognitionLike | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const nextId = useRef(1);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, thinking]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  function say(text: string) {
    if (!speak || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/\n/g, ". "));
    u.lang = "en-IN";
    window.speechSynthesis.speak(u);
  }

  async function ask(question: string) {
    const q = question.trim();
    if (!q || thinking) return;
    setInput("");
    const userMsg: Message = { id: nextId.current++, role: "user", text: q };
    setMessages((m) => [...m, userMsg]);
    const local = answerQuestion(q, snapshot, focusZoneId);
    let reply = local;
    if (online && local.intent !== "medical" && local.intent !== "unknown" && (await llmConfigured())) {
      setThinking(true);
      try {
        const res = await fetch("/api/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: q, snapshot: snapshot, focusZoneId }),
          signal: AbortSignal.timeout(9000),
        });
        if (res.ok) reply = (await res.json()) as AssistantReply;
      } catch {
        reply = local;
      } finally {
        setThinking(false);
      }
    }
    setMessages((m) => [...m, { id: nextId.current++, role: "assistant", text: reply.text, reply }]);
    say(reply.text);
  }

  function toggleMic() {
    if (listening) {
      recognizer.current?.stop();
      return;
    }
    const rec = getRecognizer();
    if (!rec) return;
    rec.lang = "en-IN";
    rec.interimResults = false;
    rec.onresult = (event) => {
      const text = event.results[0]?.[0]?.transcript ?? "";
      if (text) void ask(text);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognizer.current = rec;
    setListening(true);
    rec.start();
  }

  const last = messages.filter((m) => m.role === "assistant").at(-1);
  const chips = last?.reply?.suggestions ?? STARTER_QUESTIONS;

  return (
    <>
      {!open ? (
        <button
          type="button"
          onClick={() => onOpenChange(true)}
          className="fixed bottom-5 right-5 z-[900] flex items-center gap-2 rounded-full bg-brandbar px-4 py-3 text-[13.5px] font-semibold text-white shadow-[var(--shadow-lg)] ring-1 ring-white/20 transition-transform hover:scale-[1.03] print:hidden"
          aria-label="Open Ask AyuLink assistant (A)"
        >
          <Sparkles size={16} aria-hidden="true" />
          Ask AyuLink
        </button>
      ) : null}

      {open ? (
        <section
          role="dialog"
          aria-label="Ask AyuLink assistant"
          className="fixed inset-x-2 bottom-2 z-[1000] flex max-h-[78vh] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-[var(--shadow-lg)] sm:inset-x-auto sm:right-5 sm:bottom-5 sm:w-[400px] print:hidden"
        >
          <header className="flex items-center justify-between gap-2 bg-brandbar px-4 py-3 text-white">
            <div className="flex items-center gap-2">
              <span className="grid size-8 place-items-center rounded-full bg-white/15">
                <Bot size={17} aria-hidden="true" />
              </span>
              <div>
                <p className="text-[14px] font-bold leading-tight">Ask AyuLink</p>
                <p className="text-[11px] text-onbrand">Answers from this console only · Day {snapshot.day}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setSpeak((v) => !v);
                  if (speak && typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
                }}
                className="grid size-8 place-items-center rounded-lg hover:bg-white/10"
                aria-pressed={speak}
                aria-label={speak ? "Stop reading answers aloud" : "Read answers aloud"}
              >
                {speak ? <Volume2 size={16} aria-hidden="true" /> : <VolumeX size={16} aria-hidden="true" />}
              </button>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="grid size-8 place-items-center rounded-lg hover:bg-white/10"
                aria-label="Close assistant"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
          </header>

          <div ref={listRef} className="scroll-thin flex-1 space-y-3 overflow-y-auto p-3.5" aria-live="polite">
            {messages.length === 0 ? (
              <div className="rounded-xl bg-surface-2 p-3 text-[13px] text-text-2">
                <p className="font-semibold text-text">Hi! I&apos;m your shift assistant.</p>
                <p className="mt-1">
                  I read the live console — zones, AI forecast, visit list — and answer in plain words. I
                  work offline too. I don&apos;t diagnose or suggest medicines.
                </p>
              </div>
            ) : null}
            {messages.map((m) =>
              m.role === "user" ? (
                <div key={m.id} className="flex justify-end">
                  <p className="max-w-[85%] rounded-2xl rounded-br-md bg-brand px-3 py-2 text-[13px] text-white">{m.text}</p>
                </div>
              ) : (
                <div key={m.id} className="max-w-[92%]">
                  <div className="rounded-2xl rounded-bl-md border border-border bg-surface-2 px-3 py-2 text-[13px] leading-relaxed text-text whitespace-pre-line">
                    {m.text}
                  </div>
                  {m.reply?.actions.length ? (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {m.reply.actions.map((a) => (
                        <button
                          key={`${a.kind}-${a.id}`}
                          type="button"
                          onClick={() => onAction(a)}
                          className="rounded-full border border-brand/40 bg-brand-soft px-2.5 py-1 text-[11.5px] font-semibold text-brand-strong hover:bg-surface-3"
                        >
                          {a.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <p className="mt-1 text-[10.5px] text-muted">
                    {m.reply?.source === "llm"
                      ? "Cloud AI · checked against console data"
                      : "On-device · from console data"}
                  </p>
                </div>
              ),
            )}
            {thinking ? <p className="text-[12px] text-muted">Thinking…</p> : null}
          </div>

          <div className="flex gap-1.5 overflow-x-auto border-t border-border px-3 pt-2.5 scroll-thin">
            {chips.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => void ask(chip)}
                className="shrink-0 rounded-full border border-border bg-surface px-2.5 py-1 text-[11.5px] font-medium text-text-2 hover:bg-surface-2"
              >
                {chip}
              </button>
            ))}
          </div>

          <form
            className="flex items-center gap-2 p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void ask(input);
            }}
          >
            {canListen ? (
              <button
                type="button"
                onClick={toggleMic}
                className={`grid size-10 shrink-0 place-items-center rounded-xl border ${
                  listening ? "border-[var(--alert-fill)] bg-[var(--alert-soft)] text-[var(--alert)]" : "border-border text-text-2 hover:bg-surface-2"
                }`}
                aria-pressed={listening}
                aria-label={listening ? "Stop listening" : "Ask by voice"}
              >
                {listening ? <MicOff size={16} aria-hidden="true" /> : <Mic size={16} aria-hidden="true" />}
              </button>
            ) : null}
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              maxLength={300}
              placeholder={listening ? "Listening…" : "Ask about zones, visits, risk…"}
              className="min-h-10 min-w-0 flex-1 rounded-xl border border-border bg-surface-2 px-3 text-[13.5px] outline-none focus:border-brand"
              aria-label="Your question"
            />
            <button
              type="submit"
              disabled={!input.trim() || thinking}
              className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand text-white disabled:opacity-40"
              aria-label="Send"
            >
              <Send size={16} aria-hidden="true" />
            </button>
          </form>
        </section>
      ) : null}
    </>
  );
}
