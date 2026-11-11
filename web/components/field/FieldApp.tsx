"use client";

import { useMemo, useState } from "react";
import {
  BatteryFull,
  CheckCircle2,
  ChevronLeft,
  CloudUpload,
  HeartPulse,
  Hospital,
  Languages,
  MapPin,
  Signal,
  SignalZero,
  Thermometer,
  UserRound,
  WifiOff,
} from "lucide-react";
import { simulate } from "@/lib/engine/simulate";
import { DEFAULT_CONFIG } from "@/lib/engine/presets";
import { buildQueue, type QueueRow } from "@/lib/engine/queue";
import type { Lang } from "@/lib/engine/types";
import { templateFor } from "@/lib/triage/templates";
import { consecutiveFlagged, displayDay } from "@/lib/ui/demo";
import { demoRhythmFlags } from "@/lib/ui/rhythm";
import { defaultWorker, FIELD_WORKERS } from "@/lib/ui/ops";
import { SimulatedBadge } from "@/components/SimulatedBadge";

type Screen = { kind: "list" } | { kind: "visit"; personId: string };

interface VisitRecord {
  temperature: string;
  fever: boolean | null;
  symptoms: string[];
  outcome: "visited" | "referred" | null;
  synced: boolean;
}

const SYMPTOMS: Array<{ id: string; en: string; te: string; hi: string }> = [
  { id: "fever", en: "Fever", te: "జ్వరం", hi: "बुखार" },
  { id: "bodyache", en: "Body pain", te: "ఒళ్ళు నొప్పులు", hi: "बदन दर्द" },
  { id: "weakness", en: "Weakness", te: "నీరసం", hi: "कमज़ोरी" },
  { id: "headache", en: "Headache", te: "తలనొప్పి", hi: "सिरदर्द" },
  { id: "breath", en: "Breathlessness", te: "ఆయాసం", hi: "सांस फूलना" },
];

const UI: Record<Lang, Record<string, string>> = {
  en: { visits: "Today's visits", open: "Open", saved: "Saved on phone", sync: "Sync now", note: "Why this visit", record: "Record visit", temp: "Temperature °F", symptoms: "Symptoms", done: "Mark visited", refer: "Refer to PHC", back: "Back", none: "No visits today", pending: "waiting to sync" },
  te: { visits: "ఈ రోజు సందర్శనలు", open: "తెరవండి", saved: "ఫోన్‌లో సేవ్ అయింది", sync: "ఇప్పుడు సింక్", note: "ఎందుకు సందర్శన", record: "సందర్శన నమోదు", temp: "ఉష్ణోగ్రత °F", symptoms: "లక్షణాలు", done: "సందర్శించారు", refer: "PHCకి పంపండి", back: "వెనక్కి", none: "ఈ రోజు సందర్శనలు లేవు", pending: "సింక్ కోసం వేచి ఉంది" },
  hi: { visits: "आज की विज़िट", open: "खोलें", saved: "फ़ोन में सेव", sync: "अभी सिंक", note: "विज़िट क्यों", record: "विज़िट दर्ज करें", temp: "तापमान °F", symptoms: "लक्षण", done: "विज़िट हो गई", refer: "PHC भेजें", back: "वापस", none: "आज कोई विज़िट नहीं", pending: "सिंक बाकी" },
};

const EMPTY_RECORD: VisitRecord = { temperature: "", fever: null, symptoms: [], outcome: null, synced: false };

const FONT: Record<Lang, string> = { en: "", te: "font-telugu", hi: "font-devanagari" };

export function FieldApp() {
  const result = useMemo(() => simulate({ ...DEFAULT_CONFIG, mode: "village", scenario: "cluster" }), []);
  const rhythmFlags = useMemo(() => demoRhythmFlags(result.people), [result.people]);
  const alertDay = result.firstAlertDay ?? 45;
  const [day, setDay] = useState(alertDay);
  const [worker, setWorker] = useState(FIELD_WORKERS[0]);
  const [lang, setLang] = useState<Lang>("te");
  const [online, setOnline] = useState(false);
  const [screen, setScreen] = useState<Screen>({ kind: "list" });
  const [records, setRecords] = useState<Record<string, VisitRecord>>({});

  const zoneIndex = useMemo(() => new Map(result.zones.map((z, i) => [z.id, i])), [result.zones]);
  const queue = useMemo(() => buildQueue(result, day, rhythmFlags), [result, day, rhythmFlags]);
  const mine = queue.filter((row) => defaultWorker(zoneIndex.get(row.person.zoneId) ?? 0) === worker);
  const unsynced = Object.values(records).filter((r) => r.outcome && !r.synced).length;
  const t = UI[lang];

  function noteFor(row: QueueRow): string {
    try {
      if (row.rhythmFlag && !row.flagged) return templateFor("rhythm", lang, {}).text;
      const days = Math.max(1, consecutiveFlagged(result, row.person.id, day));
      const delta = row.rhr !== null && row.baseline !== null ? Math.round(row.rhr - row.baseline) : 0;
      if (!row.flagged) return templateFor("cluster", lang, { k: 0, n: 0, zone: row.zoneName }).text;
      return templateFor("drift", lang, { days, deltaBpm: delta }).text;
    } catch {
      return "";
    }
  }

  function save(personId: string, patch: Partial<VisitRecord>) {
    setRecords((prev) => ({
      ...prev,
      [personId]: { ...(prev[personId] ?? EMPTY_RECORD), ...patch, synced: false },
    }));
  }

  function sync() {
    if (!online) return;
    setRecords((prev) =>
      Object.fromEntries(Object.entries(prev).map(([id, r]) => [id, { ...r, synced: r.outcome ? true : r.synced }])),
    );
  }

  const current = screen.kind === "visit" ? queue.find((r) => r.person.id === screen.personId) : undefined;
  const record = current ? records[current.person.id] : undefined;

  return (
    <div className="shell py-8 lg:py-12">
      <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_420px] xl:grid-cols-[minmax(0,1fr)_440px] xl:gap-16">
        <div>
          <p className="eyebrow text-brand">Health-worker field app · prototype screen</p>
          <h1 className="mt-2 text-3xl sm:text-4xl">The alert reaches the doorstep, not just the dashboard.</h1>
          <p className="mt-4 max-w-2xl text-[15.5px] text-text-2">
            The console ranks who to visit. This is what an ASHA worker sees on her phone: her own
            list, a note in her language, a 30-second visit form, and a sync button that waits for
            signal. Visits are saved on the phone first, so a village with no network loses nothing.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <SimulatedBadge />
            <span className="chip chip-watch">Prototype UI · not deployed</span>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {[
              { Icon: UserRound, title: "Her list only", text: "Visit-first rows for the zones assigned to her, ranked by the engine." },
              { Icon: Languages, title: "Her language", text: "Notes in Telugu, Hindi or English, with read-aloud on the console." },
              { Icon: Thermometer, title: "30-second form", text: "Temperature, five symptom taps, visited or referred. Nothing else." },
              { Icon: CloudUpload, title: "Offline first", text: "Records queue on the phone and sync when signal returns." },
            ].map(({ Icon, title, text }) => (
              <div key={title} className="card flex gap-3 p-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
                  <Icon size={17} aria-hidden="true" />
                </span>
                <div>
                  <p className="text-[14.5px] font-semibold">{title}</p>
                  <p className="mt-0.5 text-[13px] text-muted">{text}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="card mt-6 p-5">
            <p className="text-sm font-semibold">Try it</p>
            <div className="mt-3 grid gap-4 sm:grid-cols-3">
              <label className="text-[13px]">
                <span className="eyebrow">Worker</span>
                <select value={worker} onChange={(e) => { setWorker(e.target.value); setScreen({ kind: "list" }); }} className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-2">
                  {FIELD_WORKERS.slice(0, 3).map((w) => <option key={w}>{w}</option>)}
                </select>
              </label>
              <label className="text-[13px]">
                <span className="eyebrow">Day (simulated)</span>
                <select value={day} onChange={(e) => { setDay(Number(e.target.value)); setScreen({ kind: "list" }); }} className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-2">
                  {Array.from({ length: 32 }, (_, i) => 28 + i).map((d) => (
                    <option key={d} value={d}>Day {displayDay(d)}{d === result.firstAlertDay ? " · first alert" : ""}</option>
                  ))}
                </select>
              </label>
              <div className="text-[13px]">
                <span className="eyebrow">Phone signal</span>
                <div className="segmented mt-1 w-full">
                  <button type="button" aria-pressed={!online} onClick={() => setOnline(false)} className="flex-1">No signal</button>
                  <button type="button" aria-pressed={online} onClick={() => setOnline(true)} className="flex-1">Signal</button>
                </div>
              </div>
            </div>
            <p className="mt-3 text-[12px] text-muted">
              The list comes from the same engine run as the console (village, cluster, seed 2026).
              Worker codes and zone assignment are placeholders.
            </p>
          </div>
        </div>

        {/* Phone */}
        <div className="mx-auto w-full max-w-[400px] lg:sticky lg:top-[calc(var(--header-h)+24px)]">
          <div className="rounded-[44px] bg-brandbar-2 p-3 shadow-[var(--shadow-lg)] ring-1 ring-black/10">
            <div className="relative overflow-hidden rounded-[34px] bg-bg">
              {/* status bar */}
              <div className="flex items-center justify-between bg-brandbar px-5 pb-2 pt-3 text-[11px] font-semibold text-white">
                <span className="mono">09:41</span>
                <span className="h-5 w-20 rounded-full bg-black/60" aria-hidden="true" />
                <span className="flex items-center gap-1">
                  {online ? <Signal size={12} aria-hidden="true" /> : <SignalZero size={12} aria-hidden="true" />}
                  <BatteryFull size={14} aria-hidden="true" />
                </span>
              </div>
              {/* app bar */}
              <div className="bg-brandbar px-4 pb-4 text-white">
                <div className="flex items-center justify-between">
                  {screen.kind === "visit" ? (
                    <button type="button" onClick={() => setScreen({ kind: "list" })} className={`flex items-center gap-1 text-[13px] font-semibold ${FONT[lang]}`}>
                      <ChevronLeft size={16} aria-hidden="true" /> {t.back}
                    </button>
                  ) : (
                    <p className={`text-[17px] font-bold ${FONT[lang]}`}>{t.visits}</p>
                  )}
                  <div className="flex rounded-lg bg-white/10 p-0.5 text-[11px]">
                    {(["te", "hi", "en"] as Lang[]).map((l) => (
                      <button key={l} type="button" onClick={() => setLang(l)} aria-pressed={lang === l} className={`rounded-md px-2 py-1 font-semibold ${lang === l ? "bg-white text-[#1b5e3a]" : "text-onbrand"} ${FONT[l]}`}>
                        {l === "te" ? "తె" : l === "hi" ? "हि" : "EN"}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="mt-1 text-[11.5px] text-onbrand">
                  {worker} · Day {displayDay(day)} · <span className={FONT[lang]}>{mine.length} {lang === "en" ? "visits" : lang === "te" ? "సందర్శనలు" : "विज़िट"}</span>
                </p>
              </div>

              {/* sync banner */}
              <div className={`flex items-center justify-between gap-2 px-4 py-2 text-[11.5px] ${online ? "bg-brand-soft text-brand-strong" : "bg-watch-soft text-watch"}`}>
                <span className={`flex items-center gap-1.5 font-semibold ${FONT[lang]}`}>
                  {online ? <CloudUpload size={13} aria-hidden="true" /> : <WifiOff size={13} aria-hidden="true" />}
                  {unsynced > 0 ? `${unsynced} ${t.pending}` : t.saved}
                </span>
                <button type="button" onClick={sync} disabled={!online || unsynced === 0} className={`rounded-md bg-surface px-2 py-1 font-semibold shadow-sm disabled:opacity-50 ${FONT[lang]}`}>
                  {t.sync}
                </button>
              </div>

              <div className="scroll-thin h-[560px] overflow-y-auto px-3 py-3">
                {screen.kind === "list" ? (
                  mine.length === 0 ? (
                    <p className={`mt-16 text-center text-sm text-muted ${FONT[lang]}`}>{t.none}</p>
                  ) : (
                    <ul className="space-y-2">
                      {mine.map((row, index) => {
                        const rec = records[row.person.id];
                        return (
                          <li key={row.person.id}>
                            <button type="button" onClick={() => setScreen({ kind: "visit", personId: row.person.id })} className="flex w-full items-center gap-3 rounded-2xl border border-border bg-surface p-3 text-left shadow-sm active:scale-[0.99]">
                              <span className={`mono flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${index < 3 ? "bg-alert-soft text-alert" : "bg-surface-2 text-text-2"}`}>{index + 1}</span>
                              <div className="min-w-0 flex-1">
                                <p className="mono text-[14px] font-semibold">{row.person.id}</p>
                                <p className="flex items-center gap-1 text-[11.5px] text-muted">
                                  <MapPin size={11} aria-hidden="true" /> {row.zoneName} · {row.person.age}{row.person.sex}
                                </p>
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {row.flagged ? <span className="chip chip-watch text-[10px]"><HeartPulse size={10} aria-hidden="true" />+{row.rhr !== null && row.baseline !== null ? Math.round(row.rhr - row.baseline) : 0} bpm</span> : null}
                                  {row.rhythmFlag ? <span className="chip chip-rhythm text-[10px]">rhythm</span> : null}
                                  {row.zoneLevel === "alert" ? <span className="chip chip-alert text-[10px]">cluster</span> : null}
                                </div>
                              </div>
                              {rec?.outcome ? (
                                <CheckCircle2 size={20} className={rec.outcome === "referred" ? "text-alert" : "text-brand"} aria-label={rec.outcome} />
                              ) : (
                                <span className={`text-[12px] font-semibold text-brand ${FONT[lang]}`}>{t.open}</span>
                              )}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )
                ) : current ? (
                  <div className="space-y-3">
                    <div className="rounded-2xl border border-border bg-surface p-3">
                      <p className="mono text-[16px] font-bold">{current.person.id}</p>
                      <p className="text-[12px] text-muted">{current.zoneName} · {current.person.age}{current.person.sex}</p>
                    </div>
                    <div className="rounded-2xl border border-pink-100 bg-vitals-soft p-3">
                      <p className={`text-[11px] font-bold uppercase tracking-wide text-vitals ${FONT[lang]}`}>{t.note}</p>
                      <p className={`mt-1 text-[13.5px] leading-relaxed ${FONT[lang]}`} lang={lang}>{noteFor(current)}</p>
                    </div>
                    <div className="rounded-2xl border border-border bg-surface p-3">
                      <p className={`text-[11px] font-bold uppercase tracking-wide text-muted ${FONT[lang]}`}>{t.record}</p>
                      <label className={`mt-2 block text-[12.5px] ${FONT[lang]}`}>
                        {t.temp}
                        <input inputMode="decimal" value={record?.temperature ?? ""} onChange={(e) => save(current.person.id, { temperature: e.target.value.replace(/[^0-9.]/g, "").slice(0, 5) })} placeholder="98.6" className="mono mt-1 h-11 w-full rounded-xl border border-border bg-bg px-3 text-[16px]" />
                      </label>
                      <p className={`mt-3 text-[12.5px] ${FONT[lang]}`}>{t.symptoms}</p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {SYMPTOMS.map((s) => {
                          const on = record?.symptoms.includes(s.id) ?? false;
                          return (
                            <button key={s.id} type="button" aria-pressed={on} onClick={() => save(current.person.id, { symptoms: on ? (record?.symptoms ?? []).filter((x) => x !== s.id) : [...(record?.symptoms ?? []), s.id] })} className={`rounded-full border px-3 py-1.5 text-[12.5px] font-medium ${on ? "border-green-300 bg-brand-soft text-brand-strong" : "border-border bg-surface text-text-2"} ${FONT[lang]}`}>
                              {s[lang]}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => { save(current.person.id, { outcome: "visited" }); setScreen({ kind: "list" }); }} className={`flex h-12 items-center justify-center gap-1.5 rounded-xl bg-brand text-[13.5px] font-bold text-white ${FONT[lang]}`}>
                        <CheckCircle2 size={16} aria-hidden="true" /> {t.done}
                      </button>
                      <button type="button" onClick={() => { save(current.person.id, { outcome: "referred" }); setScreen({ kind: "list" }); }} className={`flex h-12 items-center justify-center gap-1.5 rounded-xl bg-[var(--red-600)] text-[13.5px] font-bold text-white ${FONT[lang]}`}>
                        <Hospital size={16} aria-hidden="true" /> {t.refer}
                      </button>
                    </div>
                    <p className="text-center text-[10.5px] text-muted">Screening flag, not a diagnosis.</p>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
          <p className="mt-3 text-center text-[11.5px] text-muted">
            Prototype screen. Telugu and Hindi strings pending native-speaker proofread.
          </p>
        </div>
      </div>
    </div>
  );
}
