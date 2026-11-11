import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CircuitBoard,
  Cpu,
  Info,
  RadioTower,
  Watch,
} from "lucide-react";
import { PhotoFrame } from "@/components/PhotoFrame";
import { GITHUB_URL } from "@/lib/results";

export const metadata: Metadata = {
  title: "Hardware",
  description:
    "The AyuLink wristband and LoRa gateway: parts, packet schema, what runs on the band, and what remains unvalidated.",
};

const bandCost = process.env.BAND_COST_INR?.trim();

const PARTS = [
  {
    part: "ESP32 DevKit V1",
    role: "MCU, Wi-Fi/ESP-NOW, UART, I²C, SPI",
    note: "38-pin, 3.3 V logic",
  },
  {
    part: "MAX30102 (or MAX30100)",
    role: "Optical PPG: heart rate, SpO2, lead-off",
    note: "I²C 0x57; auto-detected",
  },
  {
    part: "MPU6050",
    role: "6-DoF accelerometer + gyroscope",
    note: "I²C 0x68; fall/tremor are prior work, not clinically validated",
  },
  {
    part: "SH1106 OLED 128×64",
    role: "On-band status and screening screen",
    note: "I²C 0x3C; not SSD1306",
  },
  {
    part: "SX1278 / RFM95W",
    role: "LoRa 433 MHz telemetry",
    note: "433 MHz antenna mandatory",
  },
  {
    part: "u-blox NEO-6M",
    role: "GPS fix for the gateway packet",
    note: "UART2, 9600 baud",
  },
  {
    part: "LM35",
    role: "Analog skin temperature",
    note: "GPIO34; skin, not core temperature",
  },
  {
    part: "SOS button, buzzer, LED",
    role: "Patient alert and status",
    note: "GPIO33 / GPIO27 / GPIO2",
  },
];

const PACKET_FIELDS = [
  ["0", "magic", "u8", "0xA7"],
  ["1", "version", "u8", "0x02"],
  ["2–3", "device_id", "u16", "Pseudonymous band id"],
  ["4–5", "seq", "u16", "Duplicate detection, ACK matching"],
  ["6", "event", "u8", "Normal, SOS, fall, tremor, sensor fault…"],
  ["7", "flags", "u8", "GPS live, charging, low battery"],
  ["8–9", "hr_bpm_x2", "u16", "Heart rate ×2; 0xFFFF invalid"],
  ["10–11", "spo2_pct_x2", "u16", "SpO2 ×2; 0xFFFF invalid"],
  ["12–13", "temp_c_x10", "i16", "Temperature ×10; 0x7FFF invalid"],
  ["14", "sensor_status", "u8", "Unknown, OK, lead-off, fault"],
  ["15", "batt_pct", "u8", "255 = unknown"],
  ["16–19", "lat_e7", "i32", "Latitude ×1e7; sentinel invalid"],
  ["20–23", "lng_e7", "i32", "Longitude ×1e7; sentinel invalid"],
  ["24–25", "uptime_s", "u16", "Monotonic device uptime"],
  ["26–31", "auth tag", "6 bytes", "Truncated HMAC-SHA256"],
];

export default function HardwarePage() {
  return (
    <div className="shell pb-14 pt-6 sm:pt-10">
      <p className="mono text-[11px] uppercase tracking-[0.16em] text-brand">
        Hardware · prior team work, bench-tested
      </p>
      <h1 className="mt-2 text-3xl sm:text-4xl">Three bands, one gateway.</h1>
      <p className="mt-3 max-w-[68ch] text-base leading-relaxed text-muted">
        The wristband hardware and an earlier dashboard were built by our team
        before INNOVEX 2026. The detection engine, cluster radar, rhythm model,
        evaluation and this web app are new. Three physical prototype bands
        exist. None has been clinically validated.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <span className="chip border-brand/40 bg-brand/10 text-brand">
          <CircuitBoard size={12} aria-hidden="true" /> Bench prototype
        </span>
        <span className="chip border-watch/40 bg-watch/10 text-watch">
          <Info size={12} aria-hidden="true" /> Clinical validation: not yet performed
        </span>
      </div>

      <section className="mt-8" aria-labelledby="gallery">
        <h2 id="gallery" className="text-xl">Prototype photos</h2>
        <p className="mt-1 text-sm text-muted">
          Real photos only. A labelled placeholder means the photo has not been
          supplied yet; we do not use renders or stock images.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <PhotoFrame
            src="/hardware/band-hero.jpg"
            alt="AyuLink wristband prototype on an elastic strap: ESP32 board, OLED showing heart rate 71 BPM, SpO2 and skin temperature, with Li-Po battery and USB-C charger"
            caption="AyuLink wristband: OLED vitals, Li-Po + USB-C charging. Real photo, bench test."
            imgClassName="aspect-[3/4]"
          />
          <PhotoFrame
            src="/hardware/band-oled.jpg"
            alt="Close-up of the band's OLED: BPM 71, SpO2 reading, skin temperature 28.9 degrees C, signal icons"
            caption="On-band screen: BPM, SpO2, skin temperature. Bench reading, not clinical."
            imgClassName="aspect-[3/4]"
          />
          <PhotoFrame
            src="/hardware/gateway.jpg"
            alt="AyuLink LoRa gateway prototype: ESP32 with an SX1278 LoRa module and OLED on perfboard, status LEDs lit"
            caption="LoRa gateway: ESP32 + SX1278 + OLED. Real photo; GPS digits blurred."
            imgClassName="aspect-[3/4]"
          />
        </div>
      </section>

      <section className="mt-10" aria-labelledby="build">
        <h2 id="build" className="text-xl">How we built it</h2>
        <p className="mt-1 text-sm text-muted">
          Off-the-shelf modules on a hand-soldered perfboard carrier. Real photos from our bench.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <PhotoFrame
            src="/hardware/build-components.jpg"
            alt="All parts laid out: NEO-6M GPS, OLED, Ra-02 LoRa module with antenna, GPS patch antenna, perfboard carrier with GPS and MPU6050 mounted, ESP32-WROOM-32 DevKit and a 3.7 V 2000 mAh Li-Po battery"
            caption="Full parts set: ESP32-WROOM-32, NEO-6M GPS, MPU6050, Ra-02 LoRa, OLED, 2000 mAh Li-Po."
            imgClassName="aspect-[4/3]"
          />
          <PhotoFrame
            src="/hardware/build-modules.jpg"
            alt="u-blox NEO-6M GPS module (GY-NEO6MV2) above an Ra-02 SX1278 LoRa module on a breakout board"
            caption="NEO-6M GPS (GY-NEO6MV2) and Ra-02 SX1278 LoRa (433 MHz)."
            imgClassName="aspect-[4/3]"
          />
          <PhotoFrame
            src="/hardware/build-perfboard.jpg"
            alt="Green perfboard with two rows of female headers soldered as a carrier for the ESP32"
            caption="Perfboard carrier with female headers for the ESP32."
            imgClassName="aspect-[4/3]"
          />
        </div>
      </section>

      <section className="mt-10" aria-labelledby="diagram">
        <h2 id="diagram" className="text-xl">How the pieces connect</h2>
        <div className="mt-4 card p-4">
          <div className="grid items-stretch gap-3 sm:grid-cols-[1fr_auto_1fr_auto_1fr]">
            <div className="rounded-xl border border-border bg-bg p-3">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <Watch size={15} className="text-brand" aria-hidden="true" /> Band
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-muted">
                MAX30102 + MPU6050 + LM35 → ESP32 → SH1106 OLED. Rhythm
                inference in C on the band. LoRa packet every 2 s.
              </p>
            </div>
            <div className="flex items-center justify-center text-muted" aria-hidden="true">
              <ArrowRight size={18} className="rotate-90 sm:rotate-0" />
            </div>
            <div className="rounded-xl border border-border bg-bg p-3">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <RadioTower size={15} className="text-info" aria-hidden="true" /> Gateway
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-muted">
                SX1278 receives the 32-byte frame, verifies the HMAC tag, and
                writes newline-delimited JSON over USB serial. No internet
                required.
              </p>
            </div>
            <div className="flex items-center justify-center text-muted" aria-hidden="true">
              <ArrowRight size={18} className="rotate-90 sm:rotate-0" />
            </div>
            <div className="rounded-xl border border-border bg-bg p-3">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <Cpu size={15} className="text-rhythm" aria-hidden="true" /> Browser
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-muted">
                The radar engine runs the same baseline and cluster code as the
                evaluation. Output: zone level, ranked visit list, note.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-10" aria-labelledby="parts">
        <h2 id="parts" className="text-xl">Parts</h2>
        <p className="mt-1 text-sm text-muted">
          Confirmed against the provided wristband firmware and wiring guide.
          Prices are not invented: the BOM is still being costed.
        </p>
        <div className="mt-4 overflow-x-auto rounded-[14px] border border-border">
          <table className="w-full min-w-[620px] border-collapse text-left text-sm">
            <thead className="bg-surface-2 text-[11px] uppercase tracking-wide text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Part</th>
                <th scope="col" className="px-4 py-3 font-medium">Role</th>
                <th scope="col" className="px-4 py-3 font-medium">Note</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Cost</th>
              </tr>
            </thead>
            <tbody>
              {PARTS.map((row) => (
                <tr key={row.part} className="border-t border-border">
                  <td className="px-4 py-3 font-medium text-text">{row.part}</td>
                  <td className="px-4 py-3 text-muted">{row.role}</td>
                  <td className="px-4 py-3 text-muted">{row.note}</td>
                  <td className="mono px-4 py-3 text-right text-muted">TBD</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-muted">
          BOM total: <span className="mono">{bandCost ? `₹${bandCost}` : "TBD"}</span>.
          The cost model is not filled yet.
        </p>
      </section>

      <section className="mt-10" aria-labelledby="schema">
        <h2 id="schema" className="text-xl">Packet schema</h2>
        <p className="mt-1 max-w-[68ch] text-sm leading-relaxed text-muted">
          <span className="mono text-text">TelemetryV2</span> is 32 bytes on air:
          26 bytes of body plus a 6-byte truncated HMAC-SHA256 tag. There is no
          name or patient id in the packet. A faulty or unknown sensor forces
          heart rate, SpO2 and temperature to explicit invalid sentinels.
        </p>
        <div className="mt-4 overflow-x-auto rounded-[14px] border border-border">
          <table className="w-full min-w-[620px] border-collapse text-left text-sm">
            <thead className="bg-surface-2 text-[11px] uppercase tracking-wide text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Byte</th>
                <th scope="col" className="px-4 py-3 font-medium">Field</th>
                <th scope="col" className="px-4 py-3 font-medium">Type</th>
                <th scope="col" className="px-4 py-3 font-medium">Meaning</th>
              </tr>
            </thead>
            <tbody>
              {PACKET_FIELDS.map((row) => (
                <tr key={row[1]} className="border-t border-border">
                  <td className="mono px-4 py-2.5 text-muted">{row[0]}</td>
                  <td className="mono px-4 py-2.5 text-text">{row[1]}</td>
                  <td className="px-4 py-2.5 text-muted">{row[2]}</td>
                  <td className="px-4 py-2.5 text-muted">{row[3]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-muted">
          Source: <span className="mono">firmware/ayulink_band/common/ayulink_protocol.h</span>.
          Host-tested with the firmware tests; not yet validated on a patient.
        </p>
      </section>

      <section className="mt-10" aria-labelledby="runs">
        <h2 id="runs" className="text-xl">What runs where</h2>
        <div className="mt-4 overflow-x-auto rounded-[14px] border border-border">
          <table className="w-full min-w-[620px] border-collapse text-left text-sm">
            <thead className="bg-surface-2 text-[11px] uppercase tracking-wide text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Runtime</th>
                <th scope="col" className="px-4 py-3 font-medium">Does</th>
                <th scope="col" className="px-4 py-3 font-medium">Does not</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-border">
                <td className="px-4 py-3 font-medium text-text">Band (ESP32)</td>
                <td className="px-4 py-3 text-muted">
                  Samples PPG and motion, quality-gates readings, runs rhythm
                  inference in C, shows a local screen, sends authenticated LoRa
                  telemetry.
                </td>
                <td className="px-4 py-3 text-muted">
                  No diagnosis, no disease name, no cloud dependency.
                </td>
              </tr>
              <tr className="border-t border-border">
                <td className="px-4 py-3 font-medium text-text">Gateway</td>
                <td className="px-4 py-3 text-muted">
                  Receives LoRa frames, verifies the tag, forwards JSON over USB
                  serial. Works offline.
                </td>
                <td className="px-4 py-3 text-muted">
                  No clinical logic; does not store a patient record.
                </td>
              </tr>
              <tr className="border-t border-border">
                <td className="px-4 py-3 font-medium text-text">Browser / cloud</td>
                <td className="px-4 py-3 text-muted">
                  Runs the radar engine, cluster statistics and visit-first
                  queue. Optional stateless triage note route.
                </td>
                <td className="px-4 py-3 text-muted">
                  No database, no sessions, no government integration.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-10" aria-labelledby="cost">
        <h2 id="cost" className="text-xl">Cost</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {[
            { label: "Per band", value: bandCost ? `₹${bandCost}` : "TBD" },
            { label: "Per gateway", value: "TBD" },
            { label: "Per village of 200", value: "TBD" },
          ].map((row) => (
            <div key={row.label} className="card p-4">
              <p className="text-[11px] text-muted">{row.label}</p>
              <p className="mono mt-1 text-xl">{row.value}</p>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-muted">
          Every figure will be computed from <span className="mono">docs/bom.csv</span>;
          until that file exists, the figures stay TBD. No rounding or guesses.
        </p>
      </section>

      <section className="mt-10 card border-watch/30 p-4" aria-labelledby="limits">
        <h2 id="limits" className="flex items-center gap-2 text-lg text-watch">
          <Info size={17} aria-hidden="true" /> Honest limits
        </h2>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted">
          <li>Three physical prototype bands. No field deployment has been completed.</li>
          <li>Optical pulse screening has not been validated on the wrist against ECG.</li>
          <li>SpO2 and skin temperature are experimental; skin temperature is not core temperature.</li>
          <li>Fall and tremor detection are prior firmware features and are not clinically validated.</li>
          <li>Battery percentage is unknown on the current board (no fuel gauge).</li>
        </ul>
      </section>

      <div className="mt-8 flex flex-wrap gap-4 border-t border-border pt-4 text-sm">
        <a
          href={`${GITHUB_URL}/tree/main/firmware/ayulink_band`}
          target="_blank"
          rel="noreferrer"
          className="text-info underline underline-offset-2 hover:text-text"
        >
          Firmware source on GitHub
        </a>
        <a
          href={`${GITHUB_URL}/blob/main/firmware/ayulink_band/Wrist_Band/WIRING.md`}
          target="_blank"
          rel="noreferrer"
          className="text-info underline underline-offset-2 hover:text-text"
        >
          Wiring guide
        </a>
        <Link href="/method" className="text-info underline underline-offset-2 hover:text-text">
          Method and evaluation
        </Link>
      </div>
    </div>
  );
}
