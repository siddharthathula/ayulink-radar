"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Activity,
  BatteryMedium,
  Bluetooth,
  BrainCircuit,
  Check,
  Copy,
  Cpu,
  Download,
  Droplets,
  HeartPulse,
  Lock,
  MapPin,
  Monitor,
  Move3d,
  Radio,
  Thermometer,
  X,
  Zap,
} from "lucide-react";
import {
  MODULES,
  PROFILES,
  aiFeatures,
  configHeader,
  configJson,
  decodeConfig,
  encodeConfig,
  normalizeConfig,
  packetPreview,
  powerScore,
  privacySummary,
  profileConfig,
  toggleModule,
  type BandConfig,
  type BandModule,
  type ModuleId,
} from "@/lib/config/modules";
import { Segmented } from "@/components/SettingsPanel";
import { downloadText } from "@/lib/ui/ops";

const ICONS: Record<ModuleId, typeof Activity> = {
  ppg: HeartPulse,
  temp: Thermometer,
  imu: Move3d,
  ecg: Activity,
  gsr: Droplets,
  lora: Radio,
  ble: Bluetooth,
  gps: MapPin,
  oled: Monitor,
  fuel: BatteryMedium,
};

const GROUPS: Array<{ id: BandModule["group"]; title: string }> = [
  { id: "sense", title: "What it senses" },
  { id: "connect", title: "How it connects" },
  { id: "show", title: "On the band" },
];

function writeUrl(c: BandConfig) {
  try {
    window.history.replaceState(null, "", `${window.location.pathname}?${encodeConfig(c)}`);
  } catch {
    // URL sync is a convenience only
  }
}

export function ConfigureClient() {
  const params = useSearchParams();
  const [config, setConfigState] = useState<BandConfig>(
    () => decodeConfig(new URLSearchParams(params.toString())) ?? profileConfig("village"),
  );
  const [copied, setCopied] = useState(false);

  function setConfig(next: BandConfig) {
    const n = normalizeConfig(next);
    setConfigState(n);
    writeUrl(n);
  }

  const features = aiFeatures(config);
  const power = powerScore(config);
  const privacy = privacySummary(config);
  const packet = packetPreview(config);
  const profile = PROFILES.find((p) => p.id === config.profile);
  const planned = config.modules.filter((id) => MODULES.find((m) => m.id === id)?.status === "planned");
  const enabledCount = features.filter((f) => f.enabled).length;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="shell py-8 sm:py-10">
      <header className="max-w-3xl">
        <p className="eyebrow text-brand">Modular band</p>
        <h1 className="mt-2 text-3xl sm:text-4xl">One band. Built around each person.</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-text-2">
          A grandmother living alone needs fall alerts and SOS location. An office worker wants a phone
          link and no GPS. A heart patient needs rhythm checks. Pick a starting point, switch modules on or
          off, and see exactly what the AI can do with that band — and what it costs in battery and
          privacy.
        </p>
      </header>

      <section aria-label="Starting profiles" className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
        {PROFILES.map((p) => {
          const active = config.profile === p.id;
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={active}
              onClick={() => setConfig(profileConfig(p.id))}
              className={`rounded-xl border p-3.5 text-left transition-colors ${
                active ? "border-brand bg-brand-soft" : "border-border bg-surface hover:bg-surface-2"
              }`}
            >
              <p className="flex items-center justify-between gap-2 text-[14px] font-bold">
                {p.name}
                {active ? <Check size={15} className="text-brand" aria-hidden="true" /> : null}
              </p>
              <p className="mt-0.5 text-[12.5px] text-text-2">{p.who}</p>
              <p className="mt-0.5 text-[11.5px] text-muted">{p.where}</p>
            </button>
          );
        })}
      </section>

      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-5">
          {GROUPS.map((group) => (
            <section key={group.id} className="card p-4 sm:p-5">
              <h2 className="text-lg">{group.title}</h2>
              <div className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-2.5 md:grid-cols-2">
                {MODULES.filter((m) => m.group === group.id).map((m) => {
                  const on = config.modules.includes(m.id);
                  const Icon = ICONS[m.id];
                  return (
                    <button
                      key={m.id}
                      type="button"
                      role="switch"
                      aria-checked={on}
                      onClick={() => setConfig(toggleModule(config, m.id))}
                      className={`flex gap-3 rounded-xl border p-3 text-left transition-colors ${
                        on ? "border-brand bg-brand-soft" : "border-border bg-surface hover:bg-surface-2"
                      }`}
                    >
                      <span
                        className={`grid size-9 shrink-0 place-items-center rounded-lg ${
                          on ? "bg-brand text-white" : "bg-surface-3 text-text-2"
                        }`}
                      >
                        <Icon size={17} aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[13.5px] font-bold">{m.name}</span>
                          <span className={m.status === "built" ? "chip chip-brand" : "chip chip-info"}>
                            {m.status === "built" ? "On prototype" : "Planned"}
                          </span>
                        </span>
                        <span className="mono block text-[11px] text-muted">{m.part}</span>
                        <span className="mt-1 block text-[12.5px] text-text-2">{m.measures}</span>
                        <span className="mt-0.5 block text-[11.5px] text-muted">{m.why}</span>
                      </span>
                      <span
                        aria-hidden="true"
                        className={`mt-1 h-5 w-9 shrink-0 rounded-full p-0.5 transition-colors ${on ? "bg-brand" : "bg-surface-3"}`}
                      >
                        <span className={`block size-4 rounded-full bg-white shadow transition-transform ${on ? "translate-x-4" : ""}`} />
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}

          <section className="card p-4 sm:p-5">
            <h2 className="text-lg">Settings for this person</h2>
            <div className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-3">
              <div>
                <p className="mb-1.5 text-[12.5px] font-semibold text-text-2">GPS</p>
                {config.modules.includes("gps") ? (
                  <Segmented
                    label="GPS mode"
                    value={config.gpsMode}
                    options={[
                      { value: "sos", label: "SOS only" },
                      { value: "always", label: "Always" },
                    ]}
                    onChange={(v) => setConfig({ ...config, profile: "custom", gpsMode: v })}
                  />
                ) : (
                  <p className="rounded-lg bg-surface-2 px-3 py-2 text-[12.5px] text-muted">Off — no GPS module</p>
                )}
              </div>
              <div>
                <p className="mb-1.5 text-[12.5px] font-semibold text-text-2">Take a reading every</p>
                <Segmented
                  label="Reading interval"
                  value={config.samplePeriodMin}
                  options={[
                    { value: 1, label: "1 min" },
                    { value: 5, label: "5 min" },
                    { value: 15, label: "15 min" },
                  ]}
                  onChange={(v) => setConfig({ ...config, profile: "custom", samplePeriodMin: v })}
                />
              </div>
              <div>
                <p className="mb-1.5 text-[12.5px] font-semibold text-text-2">Send</p>
                <Segmented
                  label="Upload"
                  value={config.upload}
                  options={[
                    { value: "summary", label: "Daily summary" },
                    { value: "every", label: "Every reading" },
                  ]}
                  onChange={(v) => setConfig({ ...config, profile: "custom", upload: v })}
                />
              </div>
            </div>
          </section>

          <section className="card p-4 sm:p-5">
            <h2 className="flex items-center gap-2 text-lg">
              <Cpu size={17} className="text-brand" aria-hidden="true" /> What goes over the air
            </h2>
            <p className="mt-1 text-[12.5px] text-muted">
              The band&apos;s 32-byte LoRa frame (v2). Fields this band won&apos;t fill carry an &ldquo;invalid&rdquo;
              marker, so the same gateway handles every configuration.
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[460px] text-left text-[12.5px]">
                <thead className="text-[11px] uppercase tracking-wide text-muted">
                  <tr>
                    <th className="py-1.5 pr-3 font-semibold">Bytes</th>
                    <th className="py-1.5 pr-3 font-semibold">Field</th>
                    <th className="py-1.5 font-semibold">This band</th>
                  </tr>
                </thead>
                <tbody>
                  {packet.fields.map((f) => (
                    <tr key={f.bytes} className="border-t border-border">
                      <td className="mono py-1.5 pr-3 text-muted">{f.bytes}</td>
                      <td className="mono py-1.5 pr-3">{f.name}</td>
                      <td className={`py-1.5 ${f.filled ? "text-text" : "text-muted"}`}>
                        <span className="inline-flex items-center gap-1.5">
                          {f.filled ? (
                            <Check size={13} className="text-brand" aria-hidden="true" />
                          ) : (
                            <X size={13} aria-hidden="true" />
                          )}
                          {f.note}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {packet.needsV3.length ? (
              <p className="mt-3 rounded-lg bg-[var(--info-soft)] px-3 py-2 text-[12px] text-text-2">
                {packet.needsV3.map((id) => id.toUpperCase()).join(" and ")} need a v3 frame with extra fields —
                planned with the module. The ingest API already accepts them.
              </p>
            ) : null}
          </section>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-[calc(var(--header-h)+16px)] xl:self-start">
          <section className="card overflow-hidden">
            <div className="bg-brandbar px-4 py-3 text-white">
              <p className="flex items-center gap-2 text-[14px] font-bold">
                <BrainCircuit size={16} aria-hidden="true" /> What the AI can do with this band
              </p>
              <p className="text-[12px] text-onbrand">
                {profile ? profile.name : "Custom band"} · {enabledCount} of {features.length} features on
              </p>
            </div>
            <ul className="divide-y divide-border">
              {features.map((f) => (
                <li key={f.id} className="flex gap-2.5 px-4 py-2.5">
                  <span
                    className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full ${
                      f.enabled ? "bg-brand text-white" : "bg-surface-3 text-muted"
                    }`}
                    aria-hidden="true"
                  >
                    {f.enabled ? <Check size={12} /> : <X size={12} />}
                  </span>
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className={`text-[13px] font-semibold ${f.enabled ? "" : "text-muted"}`}>{f.name}</span>
                      {f.enabled && f.status === "planned" ? <span className="chip chip-info">Planned</span> : null}
                      {f.enabled && f.status === "prior-work" ? <span className="chip chip-watch">Not validated</span> : null}
                    </span>
                    <span className="block text-[12px] text-muted">{f.enabled ? f.what : f.missing}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="card p-4">
            <p className="flex items-center gap-2 text-[14px] font-bold">
              <Zap size={15} className="text-[var(--watch)]" aria-hidden="true" /> Battery load: {power.label}
            </p>
            <div className="mt-2 flex gap-1" aria-hidden="true">
              {Array.from({ length: 18 }, (_, i) => (
                <span
                  key={i}
                  className="h-2 flex-1 rounded-sm"
                  style={{
                    background:
                      i < power.score
                        ? power.label === "Heavy"
                          ? "var(--alert-fill)"
                          : power.label === "Moderate"
                            ? "var(--watch-fill)"
                            : "var(--normal)"
                        : "var(--surface-3)",
                  }}
                />
              ))}
            </div>
            <ul className="mt-2 space-y-1 text-[12px] text-text-2">
              {power.notes.map((n) => (
                <li key={n}>• {n}</li>
              ))}
              <li className="text-muted">
                Relative load only. Real battery hours will be measured in the pilot — today&apos;s board has no
                battery gauge.
              </li>
            </ul>
          </section>

          <section className="card p-4">
            <p className="flex items-center gap-2 text-[14px] font-bold">
              <Lock size={15} className="text-brand" aria-hidden="true" /> Privacy for this wearer
            </p>
            <ul className="mt-2 space-y-1 text-[12.5px] text-text-2">
              {privacy.map((line) => (
                <li key={line}>• {line}</li>
              ))}
            </ul>
          </section>

          {planned.length ? (
            <p className="rounded-xl border border-[var(--info)]/30 bg-[var(--info-soft)] px-4 py-3 text-[12.5px] text-text-2">
              Includes planned modules ({planned.map((id) => MODULES.find((m) => m.id === id)?.name).join(", ")}). They are
              designed but not on the prototype yet.
            </p>
          ) : null}

          <section className="card p-4">
            <p className="text-[14px] font-bold">Take this configuration</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                className="btn justify-center"
                onClick={() => downloadText(`ayulink-${config.profile}.json`, configJson(config), "application/json")}
              >
                <Download size={15} aria-hidden="true" /> JSON
              </button>
              <button
                type="button"
                className="btn justify-center"
                onClick={() => downloadText("ayulink_config.h", configHeader(config), "text/x-c")}
              >
                <Download size={15} aria-hidden="true" /> Firmware .h
              </button>
              <button type="button" className="btn btn-primary col-span-2 justify-center" onClick={copyLink}>
                {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
                {copied ? "Link copied" : "Copy link to this band"}
              </button>
            </div>
            <p className="mt-2 text-[11.5px] text-muted">
              The firmware header sets which modules start. Wiring it into the band firmware is in progress.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
