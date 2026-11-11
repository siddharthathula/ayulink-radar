"use client";

import { useEffect, useRef } from "react";
import {
  Eye,
  Languages,
  Map as MapIcon,
  MonitorCog,
  Palette,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import type { Lang, Mode } from "@/lib/engine/types";
import { useSettings, type Basemap, type Settings, type ThemePref } from "@/lib/ui/settings";
import { BASEMAP_OPTIONS } from "@/lib/ui/basemaps";

function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className="segmented flex w-full flex-wrap" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className="flex-1 whitespace-nowrap"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? "bg-brand" : "bg-surface-3"}`}
    >
      <span
        className={`absolute left-0 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-[22px]" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function Row({ title, help, children, inline = false }: { title: string; help: string; children: React.ReactNode; inline?: boolean }) {
  return (
    <div className={`py-3 ${inline ? "flex items-center justify-between gap-4" : ""}`}>
      <div className={inline ? "min-w-0" : ""}>
        <p className="text-[14px] font-semibold">{title}</p>
        <p className="mt-0.5 text-[12.5px] leading-snug text-muted">{help}</p>
      </div>
      <div className={inline ? "" : "mt-2"}>{children}</div>
    </div>
  );
}

function Section({ title, Icon, children }: { title: string; Icon: typeof Palette; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-surface px-4 py-2">
      <p className="flex items-center gap-2 pt-2 text-[12px] font-bold uppercase tracking-wider text-brand">
        <Icon size={14} aria-hidden="true" /> {title}
      </p>
      <div className="divide-y divide-border">{children}</div>
    </section>
  );
}

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const [settings, update, reset] = useSettings();
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const set = <K extends keyof Settings>(key: K) => (value: Settings[K]) => update({ [key]: value } as Partial<Settings>);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function clearCaseData() {
    try {
      Object.keys(window.localStorage)
        .filter((key) => key.startsWith("ayulink-cases:"))
        .forEach((key) => window.localStorage.removeItem(key));
    } catch {
      // ignore
    }
    window.location.reload();
  }

  return (
    <div className="fixed inset-0 z-[150] flex justify-end bg-black/40 backdrop-blur-[1px]" role="dialog" aria-modal="true" aria-label="Settings" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-[460px] flex-col bg-bg shadow-[var(--shadow-lg)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border bg-surface px-5 py-4">
          <div>
            <p className="flex items-center gap-2 font-heading text-lg font-bold">
              <SlidersHorizontal size={18} className="text-brand" aria-hidden="true" /> Settings
            </p>
            <p className="text-[12px] text-muted">Saved in this browser only. Nothing is sent anywhere.</p>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} className="btn btn-ghost h-10 w-10 px-0" aria-label="Close settings">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="scroll-thin flex-1 space-y-4 overflow-y-auto p-4">
          <Section title="Appearance" Icon={Palette}>
            <Row title="Theme" help="Light for daylight and projectors, dark for night shifts. System follows your device.">
              <Segmented<ThemePref>
                label="Theme"
                value={settings.theme}
                onChange={set("theme")}
                options={[
                  { value: "system", label: "System" },
                  { value: "light", label: "Light" },
                  { value: "dark", label: "Dark" },
                ]}
              />
            </Row>
            <Row inline title="High contrast" help="Darker text and stronger borders. Helps in bright sunlight.">
              <Switch label="High contrast" checked={settings.highContrast} onChange={set("highContrast")} />
            </Row>
            <Row inline title="Colour-blind-safe colours" help="Blue, orange and magenta instead of green and red.">
              <Switch label="Colour-blind-safe colours" checked={settings.colorSafe} onChange={set("colorSafe")} />
            </Row>
            <Row inline title="Reduce motion" help="Turns off pulsing and slide animations.">
              <Switch label="Reduce motion" checked={settings.reduceMotion} onChange={set("reduceMotion")} />
            </Row>
          </Section>

          <Section title="Map" Icon={MapIcon}>
            <Row title="Base map" help="Auto matches the theme. Terrain shows hills and rivers. Satellite shows real ground imagery.">
              <Segmented<Basemap>
                label="Base map"
                value={settings.basemap}
                onChange={set("basemap")}
                options={BASEMAP_OPTIONS.map((option) => ({ value: option.id, label: option.label }))}
              />
            </Row>
            <Row inline title="Scroll to zoom" help="Zoom with the mouse wheel or trackpad. Turn off if the page scroll keeps grabbing the map.">
              <Switch label="Scroll to zoom" checked={settings.scrollZoom} onChange={set("scrollZoom")} />
            </Row>
            <Row inline title="Zone labels" help="Show hamlet, colony or tower names on the map.">
              <Switch label="Zone labels" checked={settings.showZoneLabels} onChange={set("showZoneLabels")} />
            </Row>
            <Row inline title="People dots" help="Show one dot per wearer. Turn off to see zone colours only.">
              <Switch label="People dots" checked={settings.showDots} onChange={set("showDots")} />
            </Row>
          </Section>

          <Section title="Console" Icon={MonitorCog}>
            <Row title="Start in" help="Which setting the console opens with.">
              <Segmented<Mode>
                label="Default setting"
                value={settings.defaultMode}
                onChange={set("defaultMode")}
                options={[
                  { value: "village", label: "Village" },
                  { value: "ward", label: "City" },
                  { value: "society", label: "Society" },
                ]}
              />
            </Row>
            <Row title="Playback speed" help="How fast the 32-day timeline plays.">
              <Segmented<1 | 2 | 4>
                label="Playback speed"
                value={settings.playbackSpeed}
                onChange={set("playbackSpeed")}
                options={[
                  { value: 1, label: "Normal" },
                  { value: 2, label: "Fast" },
                  { value: 4, label: "Very fast" },
                ]}
              />
            </Row>
            <Row inline title="Show help hints" help="Short explanations on the console for first-time users.">
              <Switch label="Show help hints" checked={settings.showHints} onChange={set("showHints")} />
            </Row>
          </Section>

          <Section title="Language" Icon={Languages}>
            <Row title="Health-worker note language" help="Default language for notes in the console and field app.">
              <Segmented<Lang>
                label="Note language"
                value={settings.noteLanguage}
                onChange={set("noteLanguage")}
                options={[
                  { value: "en", label: "English" },
                  { value: "te", label: "తెలుగు" },
                  { value: "hi", label: "हिन्दी" },
                ]}
              />
            </Row>
          </Section>

          <Section title="Data & privacy" Icon={Eye}>
            <Row inline title="Clear case actions" help="Removes visited / referred marks saved in this browser.">
              <button type="button" onClick={clearCaseData} className="btn min-h-9 px-3 text-xs">
                <Trash2 size={13} aria-hidden="true" /> Clear
              </button>
            </Row>
            <Row inline title="Reset all settings" help="Back to the defaults.">
              <button type="button" onClick={reset} className="btn min-h-9 px-3 text-xs">
                <RotateCcw size={13} aria-hidden="true" /> Reset
              </button>
            </Row>
          </Section>
        </div>
      </div>
    </div>
  );
}
