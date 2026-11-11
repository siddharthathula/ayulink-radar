"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Activity,
  BrainCircuit,
  ClipboardList,
  Clock,
  FileText,
  HeartPulse,
  Info,
  Keyboard,
  ListOrdered,
  MapPinned,
  Play,
  ShieldAlert,
  SlidersHorizontal,
  TriangleAlert,
  Users,
  X,
} from "lucide-react";
import { simulate } from "@/lib/engine/simulate";
import { DEFAULT_CONFIG, PRESETS } from "@/lib/engine/presets";
import { buildQueue } from "@/lib/engine/queue";
import type {
  Mode,
  Scenario,
  Stress,
  ZoneDay,
} from "@/lib/engine/types";
import { displayDay, alertFeed, countFlaggedToday, defaultConsoleDay, zoneCounts } from "@/lib/ui/demo";
import { demoRhythmFlags } from "@/lib/ui/rhythm";
import { SimulatedBadge } from "@/components/SimulatedBadge";
import { RadarMap } from "@/components/RadarMap";
import { DemoControls } from "@/components/demo/DemoControls";
import { Timeline } from "@/components/demo/Timeline";
import { LeadTimeBanner } from "@/components/demo/LeadTimeBanner";
import { AlertsPanel } from "@/components/demo/AlertsPanel";
import { StressLab } from "@/components/demo/StressLab";
import { AssumptionsPanel } from "@/components/demo/AssumptionsPanel";
import { PersonDrawer } from "@/components/demo/PersonDrawer";
import { TourOverlay } from "@/components/demo/TourOverlay";
import { KpiTile } from "@/components/console/Kpi";
import { SurveillanceGrid } from "@/components/console/SurveillanceGrid";
import { EpiCurve } from "@/components/console/EpiCurve";
import { NetworkPanel } from "@/components/console/NetworkPanel";
import { VisitPanel } from "@/components/console/VisitPanel";
import { ZonePanel } from "@/components/console/ZonePanel";
import { SitrepModal } from "@/components/console/SitrepModal";
import { OnlinePill, ShortcutsDialog, WeatherPill } from "@/components/console/ContextPills";
import { dailySeries, FIRST_DAY } from "@/lib/ui/ops";
import { useCaseLog } from "@/lib/ui/hooks";
import { useSettings } from "@/lib/ui/settings";
import { HelpCard } from "@/components/console/HelpCard";
import { ForecastPanel } from "@/components/console/ForecastPanel";
import { Assistant } from "@/components/console/Assistant";
import { buildSnapshot, type AssistantAction } from "@/lib/ai/assistant";
import { buildForecastIndex, zoneForecasts } from "@/lib/engine/forecast";
import { FORECAST_MODEL } from "@/lib/ai/forecastModel";

type Tab = "alerts" | "forecast" | "queue" | "zone" | "stress" | "assumptions";

const TABS: Array<{
  id: Tab;
  label: string;
  Icon: typeof TriangleAlert;
}> = [
  { id: "alerts", label: "Alerts", Icon: TriangleAlert },
  { id: "forecast", label: "AI forecast", Icon: BrainCircuit },
  { id: "queue", label: "Visit list", Icon: ListOrdered },
  { id: "zone", label: "Zones", Icon: MapPinned },
  { id: "stress", label: "Stress Lab", Icon: SlidersHorizontal },
  { id: "assumptions", label: "Assumptions", Icon: Info },
];

export function DemoClient() {
  const searchParams = useSearchParams();
  const tour = searchParams.get("tour") === "1";
  const forceSvg = searchParams.get("map") === "svg";

  const [settings, updateSettings] = useSettings();
  const [modePick, setMode] = useState<Mode | null>(null);
  const mode: Mode = modePick ?? settings.defaultMode;
  // Judges skim: without ?tour=1 the console opens mid-outbreak (cluster
  // scenario, the day after the first alert) instead of an all-zero screen.
  const [scenario, setScenario] = useState<Scenario>(tour ? "calm" : "cluster");
  const [seed, setSeed] = useState(2026);
  const [wearRate, setWearRate] = useState(0.8);
  const [stress, setStress] = useState<Stress>("none");
  // null = "show the default active day" (computed from the run below).
  const [dayPick, setDayPick] = useState<number | null>(tour ? 28 : null);
  const [playing, setPlaying] = useState(false);
  const [speedPick, setSpeed] = useState<number | null>(null);
  const speed = speedPick ?? settings.playbackSpeed;
  const [tab, setTab] = useState<Tab>("alerts");
  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const [selectedPerson, setSelectedPerson] = useState<string | null>(null);
  const [tourStep, setTourStep] = useState(tour ? 1 : 0);
  const [showSitrep, setShowSitrep] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);

  const result = useMemo(
    () =>
      simulate({
        ...DEFAULT_CONFIG,
        mode,
        scenario,
        seed,
        wearRate,
        stress,
      }),
    [mode, scenario, seed, wearRate, stress],
  );

  const defaultDay = defaultConsoleDay(result, scenario);
  const day = dayPick ?? defaultDay;
  const openedMidOutbreak = dayPick === null && scenario !== "calm";
  function setDay(next: number | ((value: number) => number)) {
    setDayPick((previous) => (typeof next === "function" ? next(previous ?? defaultDay) : next));
  }

  const rhythmFlags = useMemo(() => demoRhythmFlags(result.people), [result.people]);
  const counts = useMemo(() => zoneCounts(result, day), [result, day]);
  const flaggedToday = useMemo(() => countFlaggedToday(result, day), [result, day]);
  const alerts = useMemo(
    () => alertFeed(result.zoneDays, day, selectedZone),
    [result.zoneDays, day, selectedZone],
  );
  const queueAll = useMemo(
    () => buildQueue(result, day, rhythmFlags),
    [result, day, rhythmFlags],
  );
  const queue = useMemo(
    () =>
      selectedZone
        ? queueAll.filter((row) => row.person.zoneId === selectedZone)
        : queueAll,
    [queueAll, selectedZone],
  );

  const firstSignalRow = useMemo<ZoneDay | undefined>(() => {
    return result.zoneDays
      .filter((row) => row.day >= result.config.outbreakDay && row.level !== "normal")
      .sort((a, b) => a.day - b.day)[0];
  }, [result.zoneDays, result.config.outbreakDay]);

  const series = useMemo(() => dailySeries(result), [result]);
  const dayIndex = day - FIRST_DAY;
  const seriesToDay = series.slice(0, dayIndex + 1);
  const wornToday = series[dayIndex]?.worn ?? 0;
  const rhythmCount = Object.keys(rhythmFlags).length;
  const { log: caseLog, update: updateCase } = useCaseLog(
    `ayulink-cases:${mode}:${scenario}:${seed}:${stress}:${wearRate}`,
  );

  const forecastIndex = useMemo(() => buildForecastIndex(result), [result]);
  const forecasts = useMemo(() => zoneForecasts(result, day, FORECAST_MODEL, forecastIndex), [result, day, forecastIndex]);
  const snapshot = useMemo(
    () =>
      buildSnapshot({
        result,
        day,
        queue: queueAll,
        forecasts,
        wornToday,
        driftingToday: flaggedToday,
        rhythmFlags: rhythmCount,
        visited: Object.values(caseLog).filter((c) => c.status === "visited" || c.status === "referred").length,
        place: PRESETS[mode].label,
      }),
    [result, day, queueAll, forecasts, wornToday, flaggedToday, rhythmCount, caseLog, mode],
  );

  function runAssistantAction(action: AssistantAction) {
    if (action.kind === "zone") {
      setSelectedZone(action.id);
      setTab("zone");
    } else if (action.kind === "person") {
      setTab("queue");
      setSelectedPerson(action.id);
    } else if (action.kind === "tab") {
      setTab(action.id as Tab);
    }
  }

  // Playback.
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      setDayPick((previous) => {
        const current = previous ?? 28;
        if (current >= 59) {
          setPlaying(false);
          return current;
        }
        return current + 1;
      });
    }, 700 / speed);
    return () => clearInterval(timer);
  }, [playing, speed]);

  // Tour step 1: hold on the calm map, then start the cluster run.
  useEffect(() => {
    if (!tour || tourStep !== 1) return;
    const timer = setTimeout(() => {
      setScenario("cluster");
      setStress("none");
      setDayPick(34);
      setPlaying(true);
      setSelectedZone(null);
      setSelectedPerson(null);
      setTab("alerts");
      setTourStep(2);
    }, 2600);
    return () => clearTimeout(timer);
  }, [tour, tourStep]);

  // Tour step 2: stop at the first watch or alert.
  useEffect(() => {
    if (tourStep !== 2) return;
    if (firstSignalRow && day >= firstSignalRow.day) {
      // The tour is a small state machine driven by playback; reacting to the
      // day reaching the first signal is the intended synchronisation here.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPlaying(false);
      setDayPick(firstSignalRow.day);
      setSelectedZone(firstSignalRow.zoneId);
      setTab("alerts");
      setTourStep(3);
    } else if (day >= 59) {
      setPlaying(false);
      setSelectedZone(result.outbreakZoneId);
      setTab("alerts");
      setTourStep(3);
    }
  }, [tourStep, day, firstSignalRow, result.outbreakZoneId]);

  // Tour step 3: open the top visit-first person.
  useEffect(() => {
    if (tourStep !== 3) return;
    const timer = setTimeout(() => {
      const top = queueAll[0];
      if (top) {
        setTab("queue");
        setSelectedPerson(top.person.id);
        setTourStep(4);
      } else {
        setTourStep(5);
      }
    }, 3600);
    return () => clearTimeout(timer);
  }, [tourStep, queueAll]);

  // Tour step 4: close the drawer and reveal the full run.
  useEffect(() => {
    if (tourStep !== 4) return;
    const timer = setTimeout(() => {
      setSelectedPerson(null);
      setTab("alerts");
      setDayPick(59);
      setTourStep(5);
    }, 4400);
    return () => clearTimeout(timer);
  }, [tourStep]);

  // Tour step 5: finish.
  useEffect(() => {
    if (tourStep !== 5) return;
    const timer = setTimeout(() => setTourStep(0), 6000);
    return () => clearTimeout(timer);
  }, [tourStep]);

  // Keyboard shortcuts for operators.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === " ") {
        event.preventDefault();
        togglePlay();
      } else if (event.key === "ArrowRight") {
        setPlaying(false);
        setDay((value) => Math.min(59, value + 1));
      } else if (event.key === "ArrowLeft") {
        setPlaying(false);
        setDay((value) => Math.max(28, value - 1));
      } else if (event.key === "Home") {
        setPlaying(false);
        setDay(28);
      } else if (event.key === "End") {
        setPlaying(false);
        setDay(59);
      } else if (event.key === "1") changeMode("village");
      else if (event.key === "2") changeMode("ward");
      else if (event.key === "3") changeMode("society");
      else if (event.key.toLowerCase() === "c") changeScenario("cluster");
      else if (event.key.toLowerCase() === "s") changeScenario("spread");
      else if (event.key.toLowerCase() === "r") setShowSitrep(true);
      else if (event.key === "?") setShowKeys(true);
      else if (event.key.toLowerCase() === "a") {
        event.preventDefault();
        setAssistantOpen(true);
      } else if (event.key.toLowerCase() === "f") setTab("forecast");
      else if (event.key === "Escape") {
        setSelectedPerson(null);
        setShowSitrep(false);
        setShowKeys(false);
        setAssistantOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function reset() {
    setMode(null);
    setScenario("calm");
    setSeed(2026);
    setWearRate(0.8);
    setStress("none");
    setDay(28);
    setPlaying(false);
    setSpeed(null);
    setTab("alerts");
    setSelectedZone(null);
    setSelectedPerson(null);
  }

  function changeScenario(next: Scenario) {
    setScenario(next);
    setStress("none");
    setSelectedPerson(null);
    setSelectedZone(null);
    setTab("alerts");
    if (next === "calm") {
      setDay(28);
      setPlaying(false);
    } else {
      setDay(34);
      setPlaying(true);
    }
  }

  function changeMode(next: Mode) {
    setMode(next);
    setPlaying(false);
    setSelectedZone(null);
    setSelectedPerson(null);
    setDay(scenario === "calm" ? 28 : 34);
  }

  function changeWearRate(value: number) {
    setWearRate(value);
    setPlaying(false);
  }

  function replayOutbreak() {
    setScenario("cluster");
    setStress("none");
    setSelectedPerson(null);
    setSelectedZone(null);
    setTab("alerts");
    setDay(28);
    setPlaying(true);
  }

  function togglePlay() {
    if (!playing && day >= 59) setDay(28);
    else if (dayPick === null) setDay(day);
    setPlaying((value) => !value);
  }

  function applyStress(nextStress: Stress, nextWearRate: number) {
    setStress(nextStress);
    setWearRate(nextWearRate);
    setScenario("cluster");
    setSelectedPerson(null);
    setSelectedZone(null);
    setDay(28);
    setPlaying(true);
    setTab("stress");
  }

  function jumpToSignal() {
    setPlaying(false);
    if (firstSignalRow) {
      setDay(firstSignalRow.day);
      setSelectedZone(firstSignalRow.zoneId);
      setTab("alerts");
      setTourStep(3);
    } else {
      setDay(59);
      setTourStep(3);
    }
  }

  function openTopQueue() {
    const top = queueAll[0];
    if (top) {
      setTab("queue");
      setSelectedPerson(top.person.id);
      setTourStep(4);
    } else {
      setTourStep(5);
    }
  }

  function advanceTour() {
    if (tourStep === 1) {
      setScenario("cluster");
      setStress("none");
      setDay(34);
      setPlaying(true);
      setTab("alerts");
      setTourStep(2);
    } else if (tourStep === 2) {
      jumpToSignal();
    } else if (tourStep === 3) {
      openTopQueue();
    } else if (tourStep === 4) {
      setSelectedPerson(null);
      setTab("alerts");
      setDay(59);
      setTourStep(5);
    } else if (tourStep === 5) {
      setTourStep(0);
      setPlaying(false);
    }
  }

  function skipTour() {
    setTourStep(0);
    setPlaying(false);
  }

  const leadVisible =
    scenario === "calm" ||
    (result.firstAlertDay !== null && day >= result.firstAlertDay) ||
    day >= 59 ||
    tourStep === 5;

  const preset = PRESETS[mode];
  const leadValue =
    result.leadDays !== null && result.leadDays > 0 && leadVisible && scenario !== "calm"
      ? `${result.leadDays} d`
      : "—";

  const rightPanel = (
    <aside className="card flex min-w-0 flex-col xl:sticky xl:top-[calc(var(--header-h)+16px)] xl:max-h-[calc(100vh-var(--header-h)-32px)]">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <p className="flex items-center gap-2 text-[14px] font-bold">
          <ClipboardList size={16} className="text-brand" aria-hidden="true" />
          Triage desk
        </p>
        <span className="mono rounded-md bg-surface-2 px-2 py-0.5 text-[11px] text-text-2">
          Day {displayDay(day)} / 32
        </span>
      </div>
      <div
        className="flex flex-wrap gap-1 border-b border-border px-2 py-1.5"
        role="tablist"
        aria-label="Console panels"
      >
        {TABS.map(({ id, label, Icon }) => {
          const count = id === "alerts" ? alerts.length : id === "queue" ? queue.length : 0;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-semibold transition-colors ${
                tab === id ? "bg-brand-soft text-brand-strong" : "text-muted hover:bg-surface-2 hover:text-text"
              }`}
            >
              <Icon size={13} aria-hidden="true" />
              {label}
              {count > 0 ? (
                <span
                  className={`mono rounded-full px-1.5 text-[10px] ${
                    id === "alerts" && counts.alert > 0 ? "bg-[var(--red-600)] text-white" : "bg-surface-3 text-text-2"
                  }`}
                >
                  {count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="scroll-thin min-h-[320px] flex-1 overflow-y-auto p-3.5">
        <div role="tabpanel" hidden={tab !== "alerts"}>
          {tab === "alerts" ? (
            <AlertsPanel
              result={result}
              day={day}
              rows={alerts}
              selectedZoneId={selectedZone}
              onClearZone={() => setSelectedZone(null)}
              scenarioHint={scenario === "calm" && day <= 28}
            />
          ) : null}
        </div>
        <div role="tabpanel" hidden={tab !== "forecast"}>
          {tab === "forecast" ? (
            <ForecastPanel
              result={result}
              day={day}
              selectedZoneId={selectedZone}
              onPickZone={(zoneId) => setSelectedZone(zoneId)}
            />
          ) : null}
        </div>
        <div role="tabpanel" hidden={tab !== "queue"}>
          {tab === "queue" ? (
            <VisitPanel
              result={result}
              rows={queue}
              day={day}
              log={caseLog}
              onUpdate={updateCase}
              onOpen={(personId) => setSelectedPerson(personId)}
            />
          ) : null}
        </div>
        <div role="tabpanel" hidden={tab !== "zone"}>
          {tab === "zone" ? (
            <ZonePanel
              result={result}
              day={day}
              zoneId={selectedZone}
              onPickZone={(zoneId) => setSelectedZone(zoneId)}
            />
          ) : null}
        </div>
        <div role="tabpanel" hidden={tab !== "stress"}>
          {tab === "stress" ? (
            <StressLab mode={mode} stress={stress} wearRate={wearRate} result={result} onApply={applyStress} />
          ) : null}
        </div>
        <div role="tabpanel" hidden={tab !== "assumptions"}>
          {tab === "assumptions" ? <AssumptionsPanel mode={mode} /> : null}
        </div>
      </div>

      <p className="border-t border-border bg-surface-2/60 px-4 py-2 text-[10.5px] text-muted">
        Simulated population · Not a medical device · Screening flag, not a diagnosis
      </p>
    </aside>
  );

  return (
    <div className="shell pb-12 pt-5">
      {/* Title row */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow text-brand">Operator console · {preset.label} setting</p>
          <div className="mt-1 flex flex-wrap items-center gap-2.5">
            <h1 className="text-[26px] sm:text-[30px]">Surveillance console</h1>
            <SimulatedBadge />
          </div>
          <p className="mt-1 max-w-2xl text-[13.5px] text-muted">
            Bands work offline over LoRa. Gateways store and forward. This console — the only part
            that needs internet — turns personal drift into cluster alerts and a ranked visit list.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <OnlinePill />
          <WeatherPill lat={preset.center[0]} lng={preset.center[1]} />
          <button type="button" onClick={() => setShowKeys(true)} className="btn btn-ghost min-h-9 px-2.5 text-[12.5px] text-muted" title="Keyboard shortcuts (?)">
            <Keyboard size={14} aria-hidden="true" />
            <span className="hidden sm:inline">Shortcuts</span>
          </button>
          <button type="button" onClick={() => setShowSitrep(true)} className="btn btn-primary min-h-9 px-3 text-[12.5px]" title="Situation report (R)">
            <FileText size={14} aria-hidden="true" />
            Situation report
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--alert-fill)]/30 bg-[var(--alert-soft)] px-4 py-3">
        <p className="text-[13.5px] text-text">
          <b>{scenario === "calm" ? "Calm season." : `Day ${displayDay(day)} of 32 — simulated outbreak.`}</b>{" "}
          <span className="text-text-2">
            {openedMidOutbreak
              ? "We opened on the outbreak's peak day so you see the system working. Replay it from day 1, or take the 30-second tour."
              : "Replay the whole 32-day outbreak to watch personal drift turn into a cluster alert."}
          </span>
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={replayOutbreak} className="btn btn-primary min-h-9 px-3 text-[13px]">
            <Play size={14} aria-hidden="true" /> Replay 32-day outbreak
          </button>
          {/* Full reload: the tour state machine is set up on first render. */}
          <button type="button" onClick={() => window.location.assign(new URL("/demo?tour=1", window.location.href).toString())} className="btn min-h-9 px-3 text-[13px]">
            30-sec tour
          </button>
        </div>
      </div>

      {settings.showHints ? (
        <HelpCard onDismiss={() => updateSettings({ showHints: false })} />
      ) : null}

      <div className="mt-4">
        <DemoControls
          mode={mode}
          scenario={scenario}
          wearRate={wearRate}
          seed={seed}
          onMode={changeMode}
          onScenario={changeScenario}
          onWearRate={changeWearRate}
          onNewSeed={() => {
            setSeed((value) => value + 1);
            setSelectedPerson(null);
            setSelectedZone(null);
          }}
          onReset={reset}
        />
      </div>

      {/* KPI row */}
      <dl className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6 [&>*]:min-w-0">
        <KpiTile hint="Everyone in this simulated area who has a band or smartwatch linked." label="People monitored" value={result.people.length} sub={`${result.zones.length} zones · ${preset.label.toLowerCase()}`} Icon={Users} tone="neutral" />
        <KpiTile hint="People whose band was worn long enough today and gave a clean reading. Bad readings are thrown away, never turned into alerts." label="Valid readings today" value={wornToday} sub={`${Math.round((wornToday / Math.max(1, result.people.length)) * 100)}% passed quality gate`} Icon={HeartPulse} tone="vitals" series={seriesToDay.map((p) => p.worn)} markIndex={dayIndex} />
        <KpiTile hint="People whose resting heart rate stayed clearly above their OWN normal for 2+ days. Often an early sign of fever or infection." label="Drift flags today" value={flaggedToday} sub="above own baseline, 2+ days" Icon={Activity} tone="watch" series={seriesToDay.map((p) => p.flagged)} markIndex={dayIndex} />
        <KpiTile hint="Areas where more people than usual are drifting at the same time. Keep an eye on them." label="Zones on watch" value={counts.watch} sub={`of ${result.zones.length} zones`} Icon={ShieldAlert} tone="watch" series={seriesToDay.map((p) => p.watchZones)} markIndex={dayIndex} />
        <KpiTile hint="Areas where so many people drift together that chance alone is very unlikely. Send a health worker." label="Zones on alert" value={counts.alert} sub={counts.alert ? "send health workers" : "no cluster"} Icon={TriangleAlert} tone="alert" series={seriesToDay.map((p) => p.alertZones)} markIndex={dayIndex} emphasize={counts.alert > 0} />
        <KpiTile hint="How many days earlier AyuLink raised the alert than simulated clinic reporting in the same zone." label="Lead vs clinic" value={leadValue} sub={rhythmCount ? `${rhythmCount} rhythm screens flagged` : "simulated comparison"} Icon={Clock} tone="brand" />
      </dl>

      {/* Main grid */}
      <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1fr)_420px] 2xl:grid-cols-[300px_minmax(0,1fr)_440px]">
        <div className="hidden 2xl:block">
          <div className="sticky top-[calc(var(--header-h)+16px)] space-y-4">
            <NetworkPanel result={result} day={day} />
            <p className="rounded-xl border border-border bg-surface p-3 text-[11px] leading-relaxed text-muted">
              {preset.fictionalNote} Society mode shows aggregates only. The clinic comparison
              assumes 45% of infected people visit a clinic; the third visit from the outbreak zone
              plus reporting lag counts as detection — a deliberately generous baseline.
            </p>
          </div>
        </div>

        <div className="min-w-0 space-y-4">
          {selectedZone ? (
            <div className="flex items-center gap-2 text-xs">
              <span className="chip chip-brand min-h-7">
                Zone filter: {result.zones.find((zone) => zone.id === selectedZone)?.name}
                <button
                  type="button"
                  onClick={() => setSelectedZone(null)}
                  className="ml-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full hover:bg-green-100"
                  aria-label="Clear zone filter"
                >
                  <X size={11} aria-hidden="true" />
                </button>
              </span>
            </div>
          ) : null}

          <RadarMap
            mode={mode}
            zones={result.zones}
            people={result.people}
            obs={result.obs}
            drift={result.drift}
            zoneDays={result.zoneDays}
            day={day}
            seed={seed}
            rhythmFlags={rhythmFlags}
            selectedZoneId={selectedZone}
            selectedPersonId={selectedPerson}
            onSelectZone={(zoneId) => {
              setSelectedZone(zoneId);
              setTab("zone");
            }}
            onSelectPerson={(personId) => {
              if (mode === "society") return;
              setSelectedPerson(personId);
            }}
            forceSvg={forceSvg}
          />

          <Timeline
            day={day}
            min={28}
            max={59}
            playing={playing}
            speed={speed}
            onChange={(next) => {
              setDay(next);
              setPlaying(false);
            }}
            onPlayPause={togglePlay}
            onSpeed={setSpeed}
            markers={{
              outbreak: scenario === "calm" ? null : 34,
              alert:
                result.firstAlertDay !== null && day >= result.firstAlertDay ? result.firstAlertDay : null,
              clinic:
                result.clinicDetectionDay !== null && day >= result.clinicDetectionDay
                  ? result.clinicDetectionDay
                  : null,
            }}
            showOutbreak={day >= 59 || tourStep > 0 || !playing}
          />

          {leadVisible ? (
            <LeadTimeBanner result={result} />
          ) : (
            <div className="card flex items-center gap-2 px-4 py-3 text-[13px] text-muted">
              <Clock size={15} aria-hidden="true" /> Lead time appears when the run reaches the first alert…
            </div>
          )}

          <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
            <SurveillanceGrid
              result={result}
              day={day}
              selectedZoneId={selectedZone}
              onPick={(zoneId, pickedDay) => {
                setPlaying(false);
                setSelectedZone(zoneId);
                if (pickedDay <= 59) setDay(pickedDay);
                setTab("zone");
              }}
            />
            <EpiCurve result={result} day={day} zoneId={selectedZone} />
          </div>

          <div className="2xl:hidden">
            <NetworkPanel result={result} day={day} />
          </div>
        </div>

        {rightPanel}
      </div>

      {selectedPerson ? (
        <PersonDrawer
          result={result}
          personId={selectedPerson}
          day={day}
          rhythmFlags={rhythmFlags}
          onClose={() => setSelectedPerson(null)}
        />
      ) : null}

      {showSitrep ? (
        <SitrepModal result={result} day={day} queue={queueAll} log={caseLog} onClose={() => setShowSitrep(false)} />
      ) : null}

      {showKeys ? <ShortcutsDialog onClose={() => setShowKeys(false)} /> : null}

      {!tour || tourStep === 0 ? (
        <Assistant
          open={assistantOpen}
          onOpenChange={setAssistantOpen}
          snapshot={snapshot}
          focusZoneId={selectedZone}
          onAction={runAssistantAction}
        />
      ) : null}

      {tour ? <TourOverlay step={tourStep} onNext={advanceTour} onSkip={skipTour} /> : null}
    </div>
  );
}
