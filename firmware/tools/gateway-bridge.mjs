#!/usr/bin/env node
/**
 * AyuLink gateway bridge — zero dependencies (Node 18+).
 *
 * Moves verified packets from a real AyuLink gateway (USB serial) to:
 *   1. the AyuLink console in your browser (Server-Sent Events, http://localhost:8787/live)
 *   2. the /api/ingest validator (local dev server or the deployed site)
 *
 * The gateway prints one line per verified packet:  AYU-JSON {"type":"vitals",...}
 *
 * Usage
 *   node firmware/tools/gateway-bridge.mjs --port /dev/ttyUSB0
 *   node firmware/tools/gateway-bridge.mjs --port /dev/ttyUSB0 --record session.jsonl
 *   node firmware/tools/gateway-bridge.mjs --replay session.jsonl      # RECORDED hardware, labelled as such
 *   node firmware/tools/gateway-bridge.mjs --demo-packet               # SYNTHETIC test packets, labelled "test"
 *
 * Options
 *   --port <path>      serial device (Linux /dev/ttyUSB0 or /dev/ttyACM0, macOS /dev/cu.usbserial-*)
 *   --baud <n>         default 115200
 *   --ingest <url>     default http://localhost:3000/api/ingest ; "none" to skip
 *   --listen <port>    SSE port for the console, default 8787
 *   --record <file>    append every hardware packet to a JSONL file
 *   --replay <file>    replay a recorded JSONL file (packets marked recorded:true)
 *   --demo-packet      send a synthetic packet every 5 s (marked source:"test", never "hardware")
 *
 * Windows: native COM ports are not supported by this zero-dependency reader.
 * Use WSL with usbipd, or Linux/macOS.
 */
import { spawnSync } from "node:child_process";
import { createReadStream, appendFileSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { platform } from "node:os";

const args = parseArgs(process.argv.slice(2));
const INGEST = args.ingest ?? "http://localhost:3000/api/ingest";
const LISTEN = Number(args.listen ?? 8787);
const STALE_MS = 30_000;

const clients = new Set();
let lastPacketMs = 0;
let total = 0;
let accepted = 0;
let rejected = 0;
let mode = "idle";

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) out[key] = true;
    else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

function log(...parts) {
  console.log(new Date().toISOString().slice(11, 19), ...parts);
}

// ── Console side: Server-Sent Events ─────────────────────────────────────
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
  // Chrome Private Network Access: lets the https console reach localhost.
  "Access-Control-Allow-Private-Network": "true",
};

function send(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function broadcast(event, data) {
  for (const res of clients) send(res, event, data);
}

function status() {
  return {
    mode,
    packets: total,
    ingestAccepted: accepted,
    ingestRejected: rejected,
    lastPacketAgoS: lastPacketMs ? Math.round((Date.now() - lastPacketMs) / 1000) : null,
    gatewaySilent: mode === "serial" && (!lastPacketMs || Date.now() - lastPacketMs > STALE_MS),
  };
}

createServer((req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    return res.end();
  }
  if (req.url === "/live") {
    res.writeHead(200, { ...CORS, "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    res.write(": ayulink bridge\n\n");
    clients.add(res);
    send(res, "status", status());
    req.on("close", () => clients.delete(res));
    return;
  }
  if (req.url === "/status") {
    res.writeHead(200, { ...CORS, "Content-Type": "application/json" });
    return res.end(JSON.stringify(status()));
  }
  res.writeHead(404, CORS);
  res.end("ayulink bridge: try /live or /status\n");
}).listen(LISTEN, "127.0.0.1", () => log(`console feed on http://localhost:${LISTEN}/live`));

setInterval(() => {
  broadcast("status", status());
  for (const res of clients) res.write(": keepalive\n\n");
}, 5000);

// ── Packet handling ──────────────────────────────────────────────────────
function num(v) {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Gateway JSON -> console packet. Never invents a value the band did not send. */
function fromGateway(doc, source, recorded = false) {
  const link = doc.link === "lora" || doc.link === "espnow" ? doc.link : undefined;
  return {
    band_id: String(doc.node ?? `D${doc.device_id ?? "?"}`).replace(/[^A-Za-z0-9_-]/g, "") || "D000",
    ts: Math.floor(Date.now() / 1000),
    seq: num(doc.seq) ?? undefined,
    hr_bpm: num(doc.hr),
    spo2_pct: num(doc.spo2),
    skin_temp_c: num(doc.temp),
    worn: typeof doc.worn === "boolean" ? doc.worn : undefined,
    fall: Boolean(doc.fall),
    seizure: Boolean(doc.tremor),
    sos: Boolean(doc.sos),
    link,
    // ESP-NOW frames carry a placeholder RSSI in the gateway; only LoRa RSSI is measured.
    rssi_dbm: link === "lora" ? num(doc.rssi) : null,
    snr_db: link === "lora" ? num(doc.snr) : null,
    source,
    recorded,
  };
}

async function ingest(packet) {
  if (INGEST === "none" || packet.hr_bpm === null) return undefined;
  const body = {
    band_id: packet.band_id,
    ts: packet.ts,
    hr_bpm: packet.hr_bpm,
    worn: packet.worn ?? true,
    fall: packet.fall,
    seizure: packet.seizure,
    source: packet.source,
    ...(packet.link ? { link: packet.link } : {}),
    ...(packet.rssi_dbm !== null ? { rssi_dbm: packet.rssi_dbm } : {}),
    ...(packet.snr_db !== null ? { snr_db: packet.snr_db } : {}),
    ...(packet.spo2_pct !== null && packet.spo2_pct >= 50 ? { spo2_pct: packet.spo2_pct } : {}),
    ...(packet.skin_temp_c !== null && packet.skin_temp_c >= 20 && packet.skin_temp_c <= 45 ? { skin_temp_c: packet.skin_temp_c } : {}),
  };
  try {
    const res = await fetch(INGEST, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json();
    const r = json.results?.[0];
    if (r?.accepted) accepted++;
    else rejected++;
    return r ? { accepted: r.accepted, problems: r.problems ?? [] } : undefined;
  } catch (err) {
    rejected++;
    return { accepted: false, problems: [`ingest unreachable: ${err.message}`] };
  }
}

async function handle(packet, raw) {
  total++;
  lastPacketMs = Date.now();
  if (args.record && packet.source === "hardware" && !packet.recorded) {
    appendFileSync(args.record, JSON.stringify({ at: new Date().toISOString(), ...raw }) + "\n");
  }
  packet.ingest = await ingest(packet);
  broadcast("packet", packet);
  log(
    `${packet.recorded ? "RECORDED" : packet.source.toUpperCase()} ${packet.band_id}`,
    `seq=${packet.seq ?? "-"} link=${packet.link ?? "-"} hr=${packet.hr_bpm ?? "—"} spo2=${packet.spo2_pct ?? "—"} temp=${packet.skin_temp_c ?? "—"}`,
    packet.rssi_dbm !== null ? `rssi=${packet.rssi_dbm}` : "",
    packet.ingest ? (packet.ingest.accepted ? "ingest=ok" : `ingest=REJECTED ${packet.ingest.problems.join("; ")}`) : "",
  );
}

function parseLine(line) {
  const at = line.indexOf("AYU-JSON ");
  const text = at >= 0 ? line.slice(at + 9) : line.trim().startsWith("{") ? line.trim() : null;
  if (!text) return null;
  try {
    const doc = JSON.parse(text);
    return doc && doc.type === "vitals" ? doc : null;
  } catch {
    return null;
  }
}

// ── Sources ──────────────────────────────────────────────────────────────
function openSerial(port, baud) {
  mode = "serial";
  let retryTimer = null;
  const retry = (why) => {
    if (retryTimer) return;
    log(`${why} — gateway unplugged or rebooting? retrying every 2 s`);
    broadcast("status", { ...status(), gatewaySilent: true });
    retryTimer = setTimeout(() => {
      retryTimer = null;
      open();
    }, 2000);
  };
  const open = () => {
    const flag = platform() === "darwin" ? "-f" : "-F";
    const stty = spawnSync("stty", [flag, port, String(baud), "raw", "-echo"], { encoding: "utf8" });
    if (stty.status !== 0) {
      retry(`cannot open ${port} (${(stty.stderr || "stty failed").trim()}); check the name with ls /dev/ttyUSB* /dev/ttyACM* and that you are in the dialout group`);
      return;
    }
    log(`reading gateway on ${port} @ ${baud}`);
    let buffer = "";
    const stream = createReadStream(port, { encoding: "utf8" });
    stream.on("data", (chunk) => {
      buffer += chunk;
      let nl;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).replace(/\r$/, "");
        buffer = buffer.slice(nl + 1);
        const doc = parseLine(line);
        if (doc) void handle(fromGateway(doc, "hardware"), doc);
      }
      if (buffer.length > 8192) buffer = buffer.slice(-2048);
    });
    stream.on("error", (err) => retry(`serial error: ${err.message}`));
    stream.on("close", () => retry("serial port closed"));
  };
  open();
}

function replay(file) {
  mode = "replay";
  const docs = readFileSync(file, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter((d) => d && d.type === "vitals");
  if (docs.length === 0) {
    console.error(`no recorded vitals in ${file}`);
    process.exit(1);
  }
  log(`replaying ${docs.length} RECORDED hardware packets from ${file} (labelled recorded in the console)`);
  let i = 0;
  setInterval(() => {
    const doc = docs[i++ % docs.length];
    void handle(fromGateway(doc, "hardware", true), doc);
  }, 3000);
}

function demo() {
  mode = "test";
  log('sending SYNTHETIC test packets every 5 s (source:"test" — never shown as live hardware)');
  let seq = 0;
  setInterval(() => {
    const doc = {
      type: "vitals",
      node: "D103",
      device_id: 103,
      seq: seq++,
      hr: 70 + Math.round(Math.random() * 10),
      spo2: 96 + Math.round(Math.random() * 2),
      temp: 33 + Math.round(Math.random() * 10) / 10,
      worn: true,
      link: "lora",
      rssi: -90 - Math.round(Math.random() * 15),
      snr: 6 + Math.round(Math.random() * 40) / 10,
    };
    const packet = fromGateway(doc, "test");
    packet.band_id = "TEST-D103";
    void handle(packet, doc);
  }, 5000);
}

if (args.port) openSerial(String(args.port), Number(args.baud ?? 115200));
else if (args.replay) replay(String(args.replay));
else if (args["demo-packet"]) demo();
else {
  console.log(readFileSync(new URL(import.meta.url), "utf8").split("*/")[0]);
  process.exit(0);
}
