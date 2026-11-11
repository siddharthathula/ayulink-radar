/*
 * AyuLink Gateway Firmware  —  UI v2
 * =========================================================================
 * Hardware: ESP32 DevKit V1, SX1278 LoRa 433 MHz, SH1106 OLED, RGB LED.
 * Role: LoRa <-> WiFi bridge at the Primary Health Centre.
 *
 * Authenticated LoRa -> sequence window -> WS / LittleFS -> priority ACK queue.
 * Notification delivery uses a bounded authenticated notice/receipt path.
 *
 * UI v2
 *   - Boot splash with progress bar
 *   - Status bar: WiFi arcs, server icon, LoRa antenna + signal bars,
 *     queue depth, page title
 *   - Slide transition between pages (220 ms ease-out)
 *   - Vitals: beating heart synced to BPM, HR sparkline, SpO2, temp, age
 *   - Network / Radio (RSSI meter) / Care Hub (slot pills) / Location (radar)
 *   - Emergency screen: flashes until ACK, then goes calm + "EN ROUTE",
 *     live incident timer, indeterminate wait bar
 *   - Toast notifications: wrapped text, real countdown bar
 *   - Stale-data chip, burn-in dimming, adaptive frame rate
 *
 * LIMITS (stated, not hidden)
 *   - Single gateway serves one site. Multi-gateway federation not built.
 *   - No OTA: firmware updates require physical access.
 *   - MAX_OFFLINE_RECORDS bounds the queue; beyond that oldest records drop.
 */

#include <Arduino.h>
#include <ArduinoJson.h>
#include <LoRa.h>
#include <SPI.h>
#include <U8g2lib.h>
#include <WebSocketsClient.h>
#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>
#include <ESPmDNS.h>
#include <Wire.h>
#include <LittleFS.h>
#include <Preferences.h>
#include <esp_task_wdt.h>
#include "soc/soc.h"
#include "soc/rtc_cntl_reg.h"
#include "soc/rtc_wdt.h"
#include "../../common/ayulink_protocol.h"
#include "../../common/ayulink_discovery.h"
#include "../../common/downlink_queue.h"
#include "../../common/notice_delivery.h"
#include "../../common/ayulink_device_crypto.h"

// ── Hardware Pins ──────────────────────────────────────────────────────────
#define LORA_SCK     18
#define LORA_MISO    19
#define LORA_MOSI    23
#define LORA_NSS      5
#define LORA_RST     14
#define LORA_DIO0    26

#define PIN_LED_R    25
#define PIN_LED_G    33
#define PIN_LED_B    32
#define PIN_BUZZER   27

// ── Configuration Constants ───────────────────────────────────────────────
#ifndef AYULINK_WIFI_SSID
#define AYULINK_WIFI_SSID "WiFi"
#endif
#ifndef AYULINK_WIFI_PASS
#define AYULINK_WIFI_PASS "wordpass"
#endif
#ifndef AYULINK_WS_HOST
#define AYULINK_WS_HOST "ayulink.local"
#endif
#ifndef AYULINK_GATEWAY_TOKEN
#define AYULINK_GATEWAY_TOKEN "ayulink-demo-gateway-v1"
#endif
const char* WIFI_SSID = AYULINK_WIFI_SSID;
const char* WIFI_PASS = AYULINK_WIFI_PASS;
const char *WS_HOST   = AYULINK_WS_HOST;

#define GATEWAY_TOKEN AYULINK_GATEWAY_TOKEN
const uint16_t WS_PORT = 8000;
const char *WS_PATH   = "/ws/gateway";

#define QUEUE_FILE_PATH     "/offline_telemetry.jsonl"
#define MAX_OFFLINE_RECORDS 250
#define EMERGENCY_LOCK_MS   8000
#define ESCALATE_AFTER_MS  30000
#define PAGE_INTERVAL_MS    5000
#define WS_QUEUE_SIZE       8

// ── UI constants ──────────────────────────────────────────────────────────
#define UI_HIST            48       // sparkline samples
#define STALE_MS        30000UL     // no packet for this long = stale
// How often hub room state is relayed to the wristband.
// Reduced to 1500ms for fast real-time sync with minimal delay.
#define HUB_FORWARD_INTERVAL_MS 10000
#define SLIDE_MS          220       // page transition
#define DIM_AFTER_MS   120000UL     // burn-in protection
#define CONTRAST_ACTIVE   190
#define CONTRAST_DIM       25
#define CONTRAST_ALERT    255

// ── Legacy 14-byte structs (documentation compatibility only) ─────────────
#pragma pack(push, 1)
struct VitalPacket {
  uint8_t header;
  uint8_t patient_id;
  uint8_t hr;
  uint8_t spo2;
  int16_t temp_x10;
  uint8_t flags;
  int16_t lat_x1000;
  int16_t lng_x1000;
  uint8_t checksum;
  uint8_t footer;
};

struct AckPacket {
  uint8_t header;
  uint8_t patient_id;
  uint8_t ack_type;
  uint8_t footer;
};
#pragma pack(pop)

// ── Global Hardware Handles ──────────────────────────────────────────────
U8G2_SSD1306_128X64_NONAME_F_HW_I2C u8g2(U8G2_R0, U8X8_PIN_NONE);
WebSocketsClient ws;

// ── System State Structures ───────────────────────────────────────────────
struct Vitals {
  uint8_t patientId = 108;
  char node[16] = "P108";
  int hr = 0;
  int spo2 = 0;
  float temp = 0.0f;
  bool sos = false;
  bool fall = false;
  bool tremor = false;
  bool worn = false;
  float lat = 17.162860f; // configured indoor anchor; not live GPS
  float lng = 78.658591f;
  bool hasLiveSatFix = false;
  int loraRssi = 0;
  unsigned long lastRx = 0;
} vit;

struct Hub {
  float temp = 0.0f;
  float humidity = 0.0f;
  int airPpm = 0;
  char aqi[16] = "---";
  bool flame = false;
  bool slot[4] = {false, false, false, false};
  char rtcTime[12] = "--:--:--";
  bool received = false;
} hub;

struct Notif {
  char title[32] = "";
  char msg[64]   = "";
  bool active    = false;
  unsigned long expiry = 0;
  unsigned long dur = 7000;       // UI v2: real duration for countdown bar
} notif;

// ── Operational Variables ────────────────────────────────────────────────
bool wsConnected = false;
bool wsConfigured = false;
int totalPkts = 0;
int totalAlerts = 0;
int offlineCachedCount = 0;
unsigned long bootMs = 0;
unsigned long alertClearTime = 0;
unsigned long sosTime = 0;
unsigned long fallTime = 0;

int page = 0;
const int PAGES = 5;
unsigned long lastPageFlip = 0;

struct BuzzerTask {
  int total = 0;
  int onMs = 100;
  int offMs = 60;
  bool buzzing = false;
  unsigned long nextMs = 0;
} bz;

static bool fsAvailable = false;
static bool loraOk = false;
static uint32_t droppedNoFs = 0, droppedAtCap = 0;
static int flushOffsetLines = 0;
static bool loraTxActive = false;
static volatile bool loraTxDone = false;
static unsigned long loraTxStartMs = 0, loraRxReadyMs = 0;
static unsigned long lastLoraInitAttempt = 0;

// ── Fixed Station MAC Configuration ───────────────────────────────────────
static const uint8_t AYULINK_GATEWAY_MAC[6]  = {0x88, 0x13, 0xBF, 0x61, 0xF7, 0x64};
static const uint8_t AYULINK_WRISTBAND_MAC[6] = {0xCC, 0x7B, 0x5C, 0x1E, 0xBA, 0xAC};

// ── Built-in Wireless Non-blocking Priority RX Queues (Phase 3) ───────────
// Strict priority ordering:
// Priority 0: SOS, FALL, SEIZURE (critical emergencies)
// Priority 1: Event Cancellations (EV_SOS_CANCEL, EV_FALL_CANCEL, SENSOR_FAULT)
// Priority 2: Downlink ACKs from wristband (AckV2)
// Priority 3: Routine Telemetry (Vitals)

struct GatewayRxPacket {
  uint8_t data[250];
  size_t len;
  int rssi;
  uint32_t rx_ms;
  uint8_t priority;
};

static const size_t GW_P0_QUEUE_SIZE = 16; // Emergencies (never dropped for vitals)
static const size_t GW_P1_QUEUE_SIZE = 8;  // Cancellations & critical state changes
static const size_t GW_P2_QUEUE_SIZE = 8;  // ACKs
static const size_t GW_P3_QUEUE_SIZE = 16; // Routine vitals (drops oldest when full)

static GatewayRxPacket gwP0Queue[GW_P0_QUEUE_SIZE];
static volatile size_t gwP0Head = 0, gwP0Tail = 0;

static GatewayRxPacket gwP1Queue[GW_P1_QUEUE_SIZE];
static volatile size_t gwP1Head = 0, gwP1Tail = 0;

static GatewayRxPacket gwP2Queue[GW_P2_QUEUE_SIZE];
static volatile size_t gwP2Head = 0, gwP2Tail = 0;

static GatewayRxPacket gwP3Queue[GW_P3_QUEUE_SIZE];
static volatile size_t gwP3Head = 0, gwP3Tail = 0;

// High-Priority In-Memory WebSocket Forwarding Queue for Offline / Reconnect Resilience
// Emergency packets are held in RAM and forwarded FIRST on reconnect.
struct EmergencyWsFrame {
  char json[384];
  uint32_t queued_ms;
};
static const size_t GW_EMERGENCY_WS_SIZE = 16;
static EmergencyWsFrame gwEmergencyWsQueue[GW_EMERGENCY_WS_SIZE];
static volatile size_t gwEmergencyWsHead = 0, gwEmergencyWsTail = 0;

static void queueEmergencyWs(const String &msg) {
  size_t next = (gwEmergencyWsHead + 1) % GW_EMERGENCY_WS_SIZE;
  if (next == gwEmergencyWsTail) {
    gwEmergencyWsTail = (gwEmergencyWsTail + 1) % GW_EMERGENCY_WS_SIZE; // Drop oldest if RAM queue fills
  }
  strncpy(gwEmergencyWsQueue[gwEmergencyWsHead].json, msg.c_str(), sizeof(gwEmergencyWsQueue[0].json) - 1);
  gwEmergencyWsQueue[gwEmergencyWsHead].json[sizeof(gwEmergencyWsQueue[0].json) - 1] = '\0';
  gwEmergencyWsQueue[gwEmergencyWsHead].queued_ms = millis();
  gwEmergencyWsHead = next;
  Serial.printf("[WS-PRIO] Emergency buffered in RAM (depth: %d)\n",
                (int)((gwEmergencyWsHead - gwEmergencyWsTail + GW_EMERGENCY_WS_SIZE) % GW_EMERGENCY_WS_SIZE));
}

static void flushEmergencyWsQueue() {
  while (gwEmergencyWsTail != gwEmergencyWsHead && wsConnected) {
    String msg = gwEmergencyWsQueue[gwEmergencyWsTail].json;
    gwEmergencyWsTail = (gwEmergencyWsTail + 1) % GW_EMERGENCY_WS_SIZE;
    ws.sendTXT(msg);
    Serial.println(F("[WS-PRIO] Forwarded buffered emergency packet to backend"));
  }
}

static void onWirelessDataRecv(const uint8_t *mac_addr, const uint8_t *data, int data_len) {
  if (!data || data_len <= 0 || data_len > 250) return;
  bool macMatch = (memcmp(mac_addr, AYULINK_WRISTBAND_MAC, 6) == 0);
  Serial.printf("[G1-ESPNOW-RECV] Frame len=%d from %02X:%02X:%02X:%02X:%02X:%02X | Match=%d | Ch=%u\n",
                data_len,
                mac_addr ? mac_addr[0] : 0, mac_addr ? mac_addr[1] : 0,
                mac_addr ? mac_addr[2] : 0, mac_addr ? mac_addr[3] : 0,
                mac_addr ? mac_addr[4] : 0, mac_addr ? mac_addr[5] : 0,
                macMatch, WiFi.channel());
  if (!macMatch) {
    Serial.printf("[G1-MAC-MISMATCH] Expected %02X:%02X:%02X:%02X:%02X:%02X, got %02X:%02X:%02X:%02X:%02X:%02X\n",
                  AYULINK_WRISTBAND_MAC[0], AYULINK_WRISTBAND_MAC[1], AYULINK_WRISTBAND_MAC[2],
                  AYULINK_WRISTBAND_MAC[3], AYULINK_WRISTBAND_MAC[4], AYULINK_WRISTBAND_MAC[5],
                  mac_addr ? mac_addr[0] : 0, mac_addr ? mac_addr[1] : 0,
                  mac_addr ? mac_addr[2] : 0, mac_addr ? mac_addr[3] : 0,
                  mac_addr ? mac_addr[4] : 0, mac_addr ? mac_addr[5] : 0);
    return; // Drop unrecognized packet
  }

  uint32_t now_ms = millis();
  uint8_t priority = 3; // default routine vitals
  uint8_t ev = 0, fl = 0;
  uint16_t seq = 0;

  if (data_len == (int)ayulink::kAckSize) {
    priority = 2; // ACK
  } else if (data_len == (int)ayulink::kTelemetrySize) {
    seq = (uint16_t)data[4] | ((uint16_t)data[5] << 8);
    ev = data[6];
    fl = data[7];
    bool isEmergency = (fl & (ayulink::FLAG_SOS | ayulink::FLAG_FALL | ayulink::FLAG_TREMOR)) ||
                       (ev == ayulink::EV_SOS || ev == ayulink::EV_FALL_CONFIRM || ev == ayulink::EV_TREMOR || ev == ayulink::EV_FALL_IMPACT);
    bool isCancel = (ev == ayulink::EV_SOS_CANCEL || ev == ayulink::EV_FALL_CANCEL || ev == ayulink::EV_SENSOR_FAULT);

    if (isEmergency) priority = 0;
    else if (isCancel) priority = 1;
    else priority = 3;

    Serial.printf("[G2-VALIDATED] TelemetryV2 seq=%u ev=%u flags=0x%02X prio=%u\n",
                  seq, ev, fl, priority);
  }

  if (priority == 0) {
    size_t nextHead = (gwP0Head + 1) % GW_P0_QUEUE_SIZE;
    if (nextHead != gwP0Tail) {
      memcpy(gwP0Queue[gwP0Head].data, data, (size_t)data_len);
      gwP0Queue[gwP0Head].len = (size_t)data_len;
      gwP0Queue[gwP0Head].rssi = -55;
      gwP0Queue[gwP0Head].rx_ms = now_ms;
      gwP0Queue[gwP0Head].priority = 0;
      gwP0Head = nextHead;
      Serial.printf("[G3-QUEUED] Enqueued to P0 Emergency (depth=%u)\n",
                    (gwP0Head - gwP0Tail + GW_P0_QUEUE_SIZE) % GW_P0_QUEUE_SIZE);
    }
  } else if (priority == 1) {
    size_t nextHead = (gwP1Head + 1) % GW_P1_QUEUE_SIZE;
    if (nextHead != gwP1Tail) {
      memcpy(gwP1Queue[gwP1Head].data, data, (size_t)data_len);
      gwP1Queue[gwP1Head].len = (size_t)data_len;
      gwP1Queue[gwP1Head].rssi = -55;
      gwP1Queue[gwP1Head].rx_ms = now_ms;
      gwP1Queue[gwP1Head].priority = 1;
      gwP1Head = nextHead;
      Serial.printf("[G3-QUEUED] Enqueued to P1 Cancel (depth=%u)\n",
                    (gwP1Head - gwP1Tail + GW_P1_QUEUE_SIZE) % GW_P1_QUEUE_SIZE);
    }
  } else if (priority == 2) {
    size_t nextHead = (gwP2Head + 1) % GW_P2_QUEUE_SIZE;
    if (nextHead != gwP2Tail) {
      memcpy(gwP2Queue[gwP2Head].data, data, (size_t)data_len);
      gwP2Queue[gwP2Head].len = (size_t)data_len;
      gwP2Queue[gwP2Head].rssi = -55;
      gwP2Queue[gwP2Head].rx_ms = now_ms;
      gwP2Queue[gwP2Head].priority = 2;
      gwP2Head = nextHead;
    }
  } else {
    size_t nextHead = (gwP3Head + 1) % GW_P3_QUEUE_SIZE;
    if (nextHead == gwP3Tail) {
      // Vitals buffer full: drop oldest routine telemetry
      gwP3Tail = (gwP3Tail + 1) % GW_P3_QUEUE_SIZE;
    }
    memcpy(gwP3Queue[gwP3Head].data, data, (size_t)data_len);
    gwP3Queue[gwP3Head].len = (size_t)data_len;
    gwP3Queue[gwP3Head].rssi = -55;
    gwP3Queue[gwP3Head].rx_ms = now_ms;
    gwP3Queue[gwP3Head].priority = 3;
    gwP3Head = nextHead;
  }
}

static bool popRxPacket(GatewayRxPacket &pkt) {
  if (gwP0Tail != gwP0Head) {
    pkt = gwP0Queue[gwP0Tail];
    gwP0Tail = (gwP0Tail + 1) % GW_P0_QUEUE_SIZE;
    Serial.printf("[G4-DISPATCH] Dispatching P0 Emergency (queue wait %lums)\n",
                  millis() - pkt.rx_ms);
    return true;
  }
  if (gwP1Tail != gwP1Head) {
    pkt = gwP1Queue[gwP1Tail];
    gwP1Tail = (gwP1Tail + 1) % GW_P1_QUEUE_SIZE;
    Serial.printf("[G4-DISPATCH] Dispatching P1 Cancel (queue wait %lums)\n",
                  millis() - pkt.rx_ms);
    return true;
  }
  if (gwP2Tail != gwP2Head) {
    pkt = gwP2Queue[gwP2Tail];
    gwP2Tail = (gwP2Tail + 1) % GW_P2_QUEUE_SIZE;
    return true;
  }
  if (gwP3Tail != gwP3Head) {
    pkt = gwP3Queue[gwP3Tail];
    gwP3Tail = (gwP3Tail + 1) % GW_P3_QUEUE_SIZE;
    return true;
  }
  return false;
}

static void onWirelessDataSent(const uint8_t *mac_addr, esp_now_send_status_t status) {
  (void)mac_addr;
  (void)status;
  loraTxDone = true;
}
static uint16_t noticeSeq = 0;
static uint16_t lastNoticeQueued = 0, lastNoticeAcked = 0;
static unsigned long lastNoticeQueuedMs = 0;
static char lastEchoBody[ayulink::kNoticeTextMax + 1] = "";
static unsigned long lastEchoQueuedMs = 0;
static Preferences noticeStore;
static bool noticeStoreOk = false;
static ayulink::DownlinkQueue dlq(8);
static ayulink::NoticeRegistry noticeRegistry;
static unsigned long lastNoticeStatusSendMs = 0;

struct DeviceState {
  uint16_t device_id = 0;
  uint16_t last_seq = 0;
  bool     seen = false;
  unsigned long lastRx = 0;
  unsigned long emergencySince = 0;
  bool     sos = false, fall = false, tremor = false;
  bool     acknowledged = false;
  uint32_t dropped = 0;
};
static DeviceState dev;

static ayulink::SeqWindow seqWindow(64);

String wsQueue[WS_QUEUE_SIZE];
int wsQHead = 0;
int wsQTail = 0;

enum NetState { STATE_INIT, STATE_WIFI_CONNECTING, STATE_WIFI_ONLINE, STATE_WS_CONNECTING };
NetState netState = STATE_INIT;
#define WIFI_RETRY_MS        5000
#define WIFI_BACKOFF_MAX_MS 60000
unsigned long lastWifiCheckMs = 0;
unsigned long wifiBackoff = WIFI_RETRY_MS;

// ── UI state ──────────────────────────────────────────────────────────────
static int16_t hrHist[UI_HIST];   static uint8_t hrHistN = 0;
static int prevPage = 0;
static bool sliding = false;
static unsigned long slideStart = 0;
static unsigned long lastActivity = 0;
static int curContrast = -1;
static const char *PAGE_TITLES[PAGES] = {"VITALS", "NETWORK", "RADIO", "CARE HUB", "LOCATION"};

// ── Function Declarations ────────────────────────────────────────────────
void setupLoRa();
void setupOLED();
void setupLittleFS();
void setLED(bool r, bool g, bool b);
void beepAsync(int n, int onMs = 100, int offMs = 60);
void buzzerTick();
void tickLoRaRetry();
void scheduleBinaryAck(uint16_t device_id, uint16_t seq, uint8_t ack_type);
void scheduleTextDownlink(const char *pkt, int retries = 3, bool force = false);
bool scheduleNotice(const char *text, uint8_t retries = 6,
                    uint32_t ttl_ms = 30000, bool dedup_text = true,
                    uint16_t *radio_seq = nullptr, uint32_t received_ms = 0);
void flushNoticeStatuses();
void onLoRaTxDone();

void processLoraPacket(uint8_t *buffer, size_t size, int rssi, uint32_t rx_ms = 0, uint8_t priority = 3);
void processWsMessage(const String &msg);
void startBackendSocket();

// Last time hub room state was relayed to the wristband, so the backend's
// per-frame hub_data publish does not saturate the downlink queue.
static unsigned long lastHubForwardMs = 0;

void queueTelemetry(const String &fhirJson);
bool trimTo(int keep);                 // FIX: was used before declaration
void flushOfflineQueue();

void wsPush(const String &s);
bool wsPop(String &out);

// UI
void updateDisplay();
void showNotif(const char *title, const char *msg, int durationMs = 7000);
void bootStep(const char *label, int pct);
void gotoPage(int p);
String uptimeStr();

// ── WebSocket Event Callback ──────────────────────────────────────────────
void wsEvent(WStype_t type, uint8_t *payload, size_t len) {
  switch (type) {
    case WStype_CONNECTED:
      wsConnected = true;
      Serial.println(F("[WS] Server Connection Established"));
      {
        char hello[160];
        snprintf(hello, sizeof(hello),
                 "{\"type\":\"auth\",\"token\":\"%s\"}", GATEWAY_TOKEN);
        ws.sendTXT(hello);
        ws.sendTXT("{\"type\":\"identify\",\"node\":\"GATEWAY\"}");
      }
      flushEmergencyWsQueue(); // Flush pending high-priority emergency frames immediately
      noticeRegistry.replay_all(millis());
      break;

    case WStype_DISCONNECTED:
      wsConnected = false;
      Serial.println(F("[WS] Server Connection Disconnected"));
      break;

    case WStype_TEXT:
      if (len > 0 && len <= 1024) {
        // WebSocket payload is length-delimited, not necessarily NUL-terminated.
        String message;
        message.reserve(len + 1);
        for (size_t i = 0; i < len; ++i) message += (char)payload[i];
        wsPush(message);
      }
      break;

    default:
      break;
  }
}

// ── Ring Buffer Logic ────────────────────────────────────────────────────
void wsPush(const String &s) {
  int next = (wsQHead + 1) % WS_QUEUE_SIZE;
  if (next == wsQTail) {
    wsQTail = (wsQTail + 1) % WS_QUEUE_SIZE;
  }
  wsQueue[wsQHead] = s;
  wsQHead = next;
}

bool wsPop(String &out) {
  if (wsQHead == wsQTail) return false;
  out = wsQueue[wsQTail];
  wsQTail = (wsQTail + 1) % WS_QUEUE_SIZE;
  return true;
}

// ── Setup Initialization ──────────────────────────────────────────────────
void setup() {
  // 1. Stable 240MHz CPU clock for reliable Wi-Fi stack & FreeRTOS scheduling
  setCpuFrequencyMhz(240);

  // 2. Hardware protections: disable brownout reset AND RTC watchdog
  WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0);
  rtc_wdt_protect_off();
  rtc_wdt_disable();

  bootMs = millis();
  Serial.begin(115200);
  noticeStoreOk = noticeStore.begin("ayu-notice", false);
  if (noticeStoreOk) noticeSeq = noticeStore.getUShort("seq", 0);
  else Serial.println(F("[NOTICE] nonvolatile sequence unavailable; notices refused"));
  delay(100);
  Serial.println(F("\n=================================================="));
  Serial.println(F(" AyuLink Gateway Starting (240MHz Bridge Mode)"));
  Serial.println(F("=================================================="));
  uint8_t baseMac[6];
  esp_read_mac(baseMac, ESP_MAC_WIFI_STA);
  Serial.printf("[BOOT] Gateway STA MAC: %02X:%02X:%02X:%02X:%02X:%02X\n",
                baseMac[0], baseMac[1], baseMac[2], baseMac[3], baseMac[4], baseMac[5]);
  Serial.flush();

  // Hardware watchdog: relaxed to 30s, panic disabled to prevent boot reboots
#if defined(ESP_ARDUINO_VERSION_MAJOR) && ESP_ARDUINO_VERSION_MAJOR >= 3
  esp_task_wdt_config_t twdt = {30000, 0, false};
  esp_task_wdt_reconfigure(&twdt);
#else
  esp_task_wdt_init(30, false);
#endif
  esp_task_wdt_add(NULL);

  pinMode(PIN_LED_R, OUTPUT);
  pinMode(PIN_LED_G, OUTPUT);
  pinMode(PIN_LED_B, OUTPUT);
  pinMode(PIN_BUZZER, OUTPUT);
  digitalWrite(PIN_BUZZER, LOW);
  setLED(false, false, false); // Keep LEDs off during boot to conserve current

  Serial.println(F("[BOOT] 1. Initializing OLED display...")); Serial.flush();
  setupOLED();                 // splash 10%
  delay(50);
  esp_task_wdt_reset();

  Serial.println(F("[BOOT] 2. Initializing LittleFS storage...")); Serial.flush();
  setupLittleFS();
  bootStep("STORAGE", 40);
  delay(50);
  esp_task_wdt_reset();

  Serial.println(F("[BOOT] 3. Initializing WiFi (safe 5dBm low-surge mode)...")); Serial.flush();
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);

  // Lock TX power immediately when STA starts
  WiFi.onEvent([](WiFiEvent_t event, WiFiEventInfo_t info) {
    WiFi.setTxPower(WIFI_POWER_5dBm);
    Serial.println(F("[WIFI] TX Power locked: 5dBm (Low Surge)"));
  }, ARDUINO_EVENT_WIFI_STA_START);

  delay(50);
  WiFi.setTxPower(WIFI_POWER_5dBm);
  WiFi.setSleep(false); // Gateway is continuously active bridge; keep modem active to avoid clock/WDT jitter

  Serial.println(F("[BOOT] 4. Initializing Built-in Radio...")); Serial.flush();
  setupLoRa();
  bootStep(loraOk ? "RADIO" : "RADIO FAULT", 70);
  delay(50);
  esp_task_wdt_reset();

  WiFi.begin(WIFI_SSID, WIFI_PASS);
  netState = STATE_WIFI_CONNECTING;
  lastWifiCheckMs = millis();

  // Allow power rail to settle before driving I2C display
  delay(100);
  esp_task_wdt_reset();

  bootStep("NETWORK", 90);
  Serial.println(F("[BOOT] 5. Network initialized. Proceeding...")); Serial.flush();

  if (strlen(WS_HOST) == 0) {
    Serial.println(F("[FATAL] WS_HOST not configured; set it for this site."));
    u8g2.clearBuffer();
    u8g2.setFont(u8g2_font_6x10_tr);
    u8g2.drawStr(0, 30, "No backend host");
    u8g2.drawStr(0, 44, "set WS_HOST");
    u8g2.sendBuffer();
    while (1) { beepAsync(1, 200); delay(400); esp_task_wdt_reset(); }
  }
  ws.onEvent(wsEvent);
  ws.setReconnectInterval(3000);
  ws.enableHeartbeat(15000, 3000, 2);

  beepAsync(2, 80, 50);
  bootStep("READY", 100);
  for (int i = 0; i < 6; i++) { delay(50); esp_task_wdt_reset(); }
  lastActivity = millis();
}

// ── Backend discovery ─────────────────────────────────────────────────────
// Cache lives in common/ayulink_discovery.h so the gateway and the NodeMCU hub
// cannot drift. The UDP probe is the resilient path: it needs no multicast,
// which is what a hotspot tends to break.
static ayulink::DiscoveryCache discoveryCache;

// Broadcast one probe to the whole subnet and wait briefly for the backend's
// reply. Bounded so it can never stall loop(): the watchdog fires at 8 s and
// this is called from the connection path.
static ayulink::DiscoveryResult udpProbeBackend() {
  WiFiUDP udp;
  if (udp.begin(0) != 1) {
    Serial.println(F("[DISC] UDP socket unavailable"));
    return ayulink::DiscoveryResult::none();
  }
  const uint16_t probePort = ayulink::kDiscoveryPort;
  // beginPacket/write/endPacket is portable across the ESP32 and ESP8266 cores,
  // unlike writeTo(). Explicit broadcast address rather than a multicast group:
  // the whole point of this path is to avoid depending on multicast.
  const IPAddress kBroadcast(255, 255, 255, 255);
  IPAddress localIp = WiFi.localIP();
  IPAddress subnet = WiFi.subnetMask();
  IPAddress subnetBcast((uint32_t)localIp | ~(uint32_t)subnet);

  // Two attempts. A phone hotspot can be briefly slow to answer the first one
  // while the laptop is still bringing up its socket.
  for (int attempt = 0; attempt < 2; ++attempt) {
    udp.beginPacket(kBroadcast, probePort);
    udp.write((const uint8_t*)ayulink::kDiscoveryMagic,
              strlen(ayulink::kDiscoveryMagic));
    udp.endPacket();

    if (subnetBcast != kBroadcast && subnetBcast != IPAddress((uint32_t)0)) {
      udp.beginPacket(subnetBcast, probePort);
      udp.write((const uint8_t*)ayulink::kDiscoveryMagic,
                strlen(ayulink::kDiscoveryMagic));
      udp.endPacket();
    }
    const unsigned long deadline = millis() + 900;
    while (static_cast<long>(millis() - deadline) < 0) {
      int size = udp.parsePacket();
      if (size > 0) {
        char buf[96];
        int n = udp.read((uint8_t*)buf, sizeof(buf) - 1);
        if (n > 0) {
          buf[n] = '\0';
          ayulink::DiscoveryResult r = ayulink::DiscoveryResult::none();
          if (ayulink::parseDiscoveryReply(buf, (size_t)n, &r)) {
            udp.stop();
            return r;
          }
        }
      } else {
        delay(10);
      }
      esp_task_wdt_reset();
    }
  }
  udp.stop();
  return ayulink::DiscoveryResult::none();
}

void startBackendSocket() {
  if (wsConfigured || WiFi.status() != WL_CONNECTED) return;

  // Resolution order: cached address, then UDP broadcast probe (hotspot-safe), then DHCP gateway, then mDNS.
  ayulink::DiscoveryResult found = discoveryCache.get(WS_PORT);
  if (found.ok()) {
    Serial.printf("[DISC] cache -> %08X:%u\n",
                  (unsigned)found.ip_be, (unsigned)found.port);
  } else {
    // 1. UDP broadcast probe on local subnet FIRST (fastest, most reliable across mobile hotspots!)
    found = udpProbeBackend();
    esp_task_wdt_reset();
    if (found.ok()) {
      IPAddress ip = found.toIP();
      Serial.printf("[DISC] UDP broadcast discovered backend -> %s:%u\n",
                    ip.toString().c_str(), (unsigned)found.port);
    } else {
      // 2. Fallback: DHCP gateway probe
      IPAddress gw = WiFi.gatewayIP();
      if (gw != IPAddress((uint32_t)0) && gw != IPAddress(255, 255, 255, 255)) {
        Serial.printf("[DISC] DHCP gateway -> %s:%u\n",
                      gw.toString().c_str(), (unsigned)ayulink::kDiscoveryPort);
        WiFiUDP gudp;
        if (gudp.begin(0) == 1) {
          gudp.beginPacket(gw, ayulink::kDiscoveryPort);
          gudp.write((const uint8_t*)ayulink::kDiscoveryMagic, strlen(ayulink::kDiscoveryMagic));
          gudp.endPacket();
          const unsigned long deadline = millis() + 600;
          while (static_cast<long>(millis() - deadline) < 0) {
            if (gudp.parsePacket() > 0) {
              char probe[96];
              int n = gudp.read((uint8_t*)probe, sizeof(probe) - 1);
              if (n > 0) {
                probe[n] = '\0';
                if (ayulink::parseDiscoveryReply(probe, (size_t)n, &found)) {
                  found.source = ayulink::kDiscoveryGateway;
                  Serial.printf("[DISC] DHCP gateway is the backend: %s\n",
                                gw.toString().c_str());
                  break;
                }
              }
            }
            delay(5);
          }
          gudp.stop();
        }
      }

      // 3. Fallback: mDNS with local subnet verification
      if (!found.ok()) {
        String host(WS_HOST);
        if (host.endsWith(".local")) {
          String base = host.substring(0, host.length() - 6);
          IPAddress mdnsIp((uint32_t)0);
          mdnsIp = MDNS.queryHost(base.c_str(), 2000);
          esp_task_wdt_reset();
          if (mdnsIp != IPAddress((uint32_t)0)) {
            IPAddress localIp = WiFi.localIP();
            IPAddress mask = WiFi.subnetMask();
            if (((uint32_t)mdnsIp & (uint32_t)mask) == ((uint32_t)localIp & (uint32_t)mask)) {
              found.ip_be = ayulink::ipAddressToBE(mdnsIp);
              found.port = WS_PORT;
              found.source = ayulink::kDiscoveryMdns;
              Serial.printf("[DISC] mDNS %s -> %s (subnet matched)\n", WS_HOST,
                            mdnsIp.toString().c_str());
            } else {
              Serial.printf("[DISC-WARN] mDNS %s -> %s is outside local subnet %s! Ignoring.\n",
                            WS_HOST, mdnsIp.toString().c_str(), localIp.toString().c_str());
            }
          }
        }
      }
    }

    if (!found.ok()) {
      Serial.println(F("[DISC] no backend found (UDP, DHCP gateway and mDNS all failed)"));
      Serial.printf("[DISC] subnet %s - is the laptop running backend on port %u?\n",
                    WiFi.localIP().toString().c_str(), (unsigned)WS_PORT);
      wsConfigured = false;
      return;
    }
    discoveryCache.remember(found);
  }

  ws.begin(found.toIP(), found.port, WS_PATH);
  wsConfigured = true;
}

// ── UI: contrast manager (burn-in protection) ────────────────────────────
static void uiContrastTick(bool alert) {
  int target = alert ? CONTRAST_ALERT
             : (millis() - lastActivity > DIM_AFTER_MS ? CONTRAST_DIM : CONTRAST_ACTIVE);
  if (target != curContrast) {
    u8g2.setContrast(target);
    curContrast = target;
  }
}

// ── Non-Blocking Main Execution Loop ──────────────────────────────────────
void loop() {
  ws.loop();
  // Keep store-and-forward bounded so a reconnect cannot stall LoRa RX for
  // all 250 historical records before a new SOS is received.
  if (wsConnected && gwEmergencyWsTail != gwEmergencyWsHead) {
    flushEmergencyWsQueue();
  }
  static unsigned long lastOfflineFlushMs = 0;
  if (wsConnected && offlineCachedCount > 0 && millis() - lastOfflineFlushMs >= 250) {
    lastOfflineFlushMs = millis();
    flushOfflineQueue();
  }
  buzzerTick();

  unsigned long now = millis();
  if (netState == STATE_WIFI_ONLINE && WiFi.status() != WL_CONNECTED) {
    netState = STATE_WIFI_CONNECTING;
    wsConfigured = false;
    wsConnected = false;
    lastWifiCheckMs = now;
  }
  if (netState == STATE_WIFI_CONNECTING) {
    if (WiFi.status() == WL_CONNECTED) {
      netState = STATE_WIFI_ONLINE;
      wifiBackoff = WIFI_RETRY_MS;
      MDNS.begin("ayulink-gateway");
      startBackendSocket();
      setLED(false, true, false);
      Serial.printf("[WIFI] Connected! Local IP: %s | RSSI: %d dBm | Ch: %u\n",
                    WiFi.localIP().toString().c_str(), WiFi.RSSI(), WiFi.channel());
    } else if (now - lastWifiCheckMs > wifiBackoff) {   // FIX: backoff was computed but never used
      wifiBackoff = (wifiBackoff < WIFI_BACKOFF_MAX_MS) ? wifiBackoff * 2 : WIFI_BACKOFF_MAX_MS;
      if (wifiBackoff > WIFI_BACKOFF_MAX_MS) wifiBackoff = WIFI_BACKOFF_MAX_MS;
      WiFi.disconnect();
      WiFi.begin(WIFI_SSID, WIFI_PASS);
      lastWifiCheckMs = now;
      Serial.printf("[WIFI] retry in backoff (now %lums)\n", wifiBackoff);
    }
  }

  noticeRegistry.expire(millis());
  String wsMsg;
  while (wsPop(wsMsg)) {
    processWsMessage(wsMsg);
  }
  noticeRegistry.expire(millis());
  flushNoticeStatuses();

  // Phase 3: Drain priority queues completely so emergencies are never delayed behind batch queues
  GatewayRxPacket rxPkt;
  while (loraOk && popRxPacket(rxPkt)) {
    totalPkts++;
    processLoraPacket(rxPkt.data, rxPkt.len, rxPkt.rssi, rxPkt.rx_ms, rxPkt.priority);
  }
  tickLoRaRetry();
  if (!loraOk && now - lastLoraInitAttempt >= 10000UL) {
    lastLoraInitAttempt = now;
    setupLoRa();
  }

  // Incident lifecycle
  bool emergency = (dev.sos || dev.fall || dev.tremor) && dev.emergencySince > 0;
  static unsigned long escalateAfter = 0;
  if (!emergency) escalateAfter = 0;                       // FIX: timer leaked across incidents
  if (emergency && !dev.acknowledged && escalateAfter == 0)
    escalateAfter = now + ESCALATE_AFTER_MS;
  if (emergency && !dev.acknowledged && now >= escalateAfter) {
    escalateAfter = now + ESCALATE_AFTER_MS;               // re-arm: keep nagging until ACK
    showNotif("UNACKNOWLEDGED", "No responder yet", EMERGENCY_LOCK_MS);
    beepAsync(2, 200, 100);
  }

  // LED strobe
  if (emergency || hub.flame) {
    static bool strobe = false;
    static unsigned long lastStrobe = 0;
    if (now - lastStrobe > 250) {
      strobe = !strobe;
      lastStrobe = now;
      setLED(strobe, false, false);
    }
  } else if (wsConnected) {
    setLED(false, true, false);
  } else {
    setLED(true, true, false);
  }

  // Auto page flip (with slide)
  if (!emergency && !notif.active && !sliding && (now - lastPageFlip > PAGE_INTERVAL_MS)) {
    gotoPage((page + 1) % PAGES);
    lastPageFlip = now;
  }

  if (notif.active && now > notif.expiry) {
    notif.active = false;
  }

  esp_task_wdt_reset();

  // Adaptive frame rate: smooth when animating, lazy when idle
  static unsigned long lastDraw = 0;
  bool animating = sliding || emergency || notif.active || hub.flame;
  unsigned long frameMs = animating ? 50 : 100;
  if (now - lastDraw >= frameMs) {
    // Process any urgent emergency packet immediately before blocking on display I2C push
    GatewayRxPacket urgentPkt;
    while (loraOk && popRxPacket(urgentPkt)) {
      totalPkts++;
      processLoraPacket(urgentPkt.data, urgentPkt.len, urgentPkt.rssi, urgentPkt.rx_ms, urgentPkt.priority);
    }
    lastDraw = now;
    uiContrastTick(emergency || notif.active || hub.flame);
    updateDisplay();
  }
}

// ── Ingestion: authenticated binary only ───────────────────────────────────
void processLoraPacket(uint8_t* buffer, size_t size, int rssi, uint32_t rx_ms, uint8_t priority) {
  if (size == 0) return;
  uint32_t proc_ms = millis();
  uint32_t queue_delay = (proc_ms >= rx_ms && rx_ms > 0) ? (proc_ms - rx_ms) : 0;

  if (size == ayulink::kAckSize && ayulink::verify_ack(buffer, size,
      ayulink::kDevicePsk, sizeof(ayulink::kDevicePsk), ayulink::device_hmac_cb)) {
    ayulink::AckV2 a;
    ayulink::decode_ack(buffer, &a);
    if (a.device_id == 108 && a.ack_type == ayulink::ACK_NOTIFICATION &&
        dlq.on_ack(a.device_id, a.seq, a.ack_type, millis())) {
      lastNoticeAcked = a.seq;
      if (noticeRegistry.displayed(a.seq, millis())) flushNoticeStatuses();
      Serial.printf("[NOTICE] wristband displayed seq=%u (queue delay %lums)\n", a.seq, queue_delay);
    }
    return;
  }

  if (size == ayulink::kTelemetrySize) {
    if (!ayulink::verify_telemetry(buffer, size, ayulink::kDevicePsk,
                                   sizeof(ayulink::kDevicePsk),
                                   ayulink::device_hmac_cb)) {
      dev.dropped++;
      Serial.println(F("[LORA-SEC] tag invalid -> dropped (corrupt or forged)"));
      return;
    }

    ayulink::TelemetryV2 m;
    ayulink::decode_telemetry(buffer, &m);
    if (m.device_id != 108) { dev.dropped++; return; }

    ayulink::SeqWindow::Result r = seqWindow.accept(m.seq);
    if (r != ayulink::SeqWindow::kAccept) {
      dev.dropped++;
      Serial.printf("[LORA-SEC] seq=%u rejected (%s)\n", m.seq,
                    r == ayulink::SeqWindow::kRejectDuplicate ? "duplicate" : "stale");
      return;
    }

    dev.device_id = m.device_id;
    dev.last_seq  = m.seq;
    dev.seen      = true;
    dev.lastRx    = millis();

    bool wasSos = dev.sos, wasFall = dev.fall, wasTremor = dev.tremor;
    // Read every event bit, not just the single `event` byte. A patient who
    // pressed SOS and then fell used to report only SOS here, and the fall was
    // lost between the wristband and the backend.
    dev.sos     = ayulink::has_sos(m);
    dev.fall    = ayulink::has_fall(m);
    dev.tremor  = ayulink::has_tremor(m);

    // Tremor counts as an emergency here too. It already raised a dashboard
    // alert; silently keeping it off the gateway OLED made the two screens
    // disagree about whether anything was happening.
    bool newSos = dev.sos && !wasSos;
    bool newFall = dev.fall && !wasFall;
    bool newTremor = dev.tremor && !wasTremor;
    if (dev.sos || dev.fall || dev.tremor) {
      if (!dev.emergencySince) dev.emergencySince = millis();
      if (newSos || newFall || newTremor || (!wasSos && !wasFall && !wasTremor)) {
      dev.acknowledged = false;
      totalAlerts++;
      beepAsync(4, 150, 50);
      showNotif(newSos || (!wasSos && dev.sos) ? "!! SOS ALERT !!" :
                newFall || (!wasFall && dev.fall) ? "!! FALL DETECTED !!" : "!! SEIZURE !!",
                newSos || (!wasSos && dev.sos) ? "Patient pressed SOS" :
                newFall || (!wasFall && dev.fall) ? "Fall confirmed by device" : "Seizure motion detected",
                 EMERGENCY_LOCK_MS);
      }
    }
    // FIX: original condition required wasSos==false && wasFall==false, so a
    // device-side clear NEVER reset emergencySince. Next SOS then skipped the
    // beep + toast + counter because emergencySince was still non-zero.
    if (!dev.sos && !dev.fall && !dev.tremor && (wasSos || wasFall || wasTremor)) {
      dev.emergencySince = 0;
      dev.acknowledged = false;
    }
    if (m.event == ayulink::EV_FALL_CANCEL) {
      dev.fall = false;
      if (!dev.sos && !dev.tremor) {
        dev.emergencySince = 0;
        dev.acknowledged = false;
      }
      showNotif("FALL CANCELLED", "Patient cancelled fall", 4000);
      beepAsync(2, 80, 50);
    }
    if (m.event == ayulink::EV_SOS_CANCEL) {
      dev.sos = false;
      if (!dev.fall && !dev.tremor) {
        dev.emergencySince = 0;
        dev.acknowledged = false;
      }
      showNotif("SOS CANCELLED", "Patient cancelled SOS", 4000);
      beepAsync(2, 80, 50);
    }
    if (m.event == ayulink::EV_SENSOR_FAULT) {
      showNotif("SENSOR FAULT", "Vitals unavailable", EMERGENCY_LOCK_MS);
      beepAsync(2, 120, 60);
    }

    // FIX: the authenticated path never fed `vit`, so the OLED showed "--"
    // for every vital in production. UI now reads from here.
    vit.lastRx   = millis();
    vit.loraRssi = rssi;
    snprintf(vit.node, sizeof(vit.node), "D%u", m.device_id);
    vit.hr   = ayulink::hr_valid(m)   ? (int)ayulink::hr_bpm(m)    : 0;
    vit.spo2 = ayulink::spo2_valid(m) ? (int)ayulink::spo2_pct(m)  : 0;
    vit.temp = ayulink::temp_valid(m) ? (float)ayulink::temp_c(m)  : 0.0f;
    vit.worn = m.sensor_status == ayulink::SS_OK;
    vit.sos = dev.sos; vit.fall = dev.fall; vit.tremor = dev.tremor;
    if (ayulink::lat_valid(m)) {
      vit.lat = (float)ayulink::lat_deg(m);
      vit.lng = (float)ayulink::lng_deg(m);
      vit.hasLiveSatFix = (m.flags & ayulink::FLAG_GPS_LIVE) != 0;
    } else {
      vit.hasLiveSatFix = false;
    }
    if (vit.hr > 0) {
      if (hrHistN < UI_HIST) hrHist[hrHistN++] = vit.hr;
      else { memmove(hrHist, hrHist + 1, (UI_HIST - 1) * sizeof(int16_t)); hrHist[UI_HIST - 1] = vit.hr; }
    }

    uint32_t fwd_ms = millis();
    StaticJsonDocument<384> doc;
    doc["type"]       = "vitals";
    doc["protocol"]   = m.version;
    doc["node"]       = String("D") + String(m.device_id);
    doc["device_id"]  = m.device_id;
    doc["seq"]        = m.seq;
    doc["uptime_s"]   = m.uptime_s;
    doc["rssi"]       = rssi;
    doc["sensor_status"] = (int)m.sensor_status;
    doc["worn"]       = vit.worn;
    doc["sos"]        = dev.sos;
    doc["fall"]       = dev.fall;
    doc["tremor"]     = dev.tremor;
    doc["fall_impact"] = m.event == ayulink::EV_FALL_IMPACT || (m.flags & ayulink::FLAG_FALL_IMPACT);
    doc["sensor_fault"] = ayulink::has_sensor_fault(m);
    doc["event"]      = m.event;
    doc["event_flags"] = m.flags & 0x1F;
    doc["tag_verified"] = true;

    // Latency & pipeline trace instrumentation (T3->T4->T5)
    doc["t_gw_rx_ms"] = rx_ms;
    doc["t_gw_proc_ms"] = proc_ms;
    doc["t_gw_fwd_ms"] = fwd_ms;
    doc["gw_queue_delay_ms"] = queue_delay;
    doc["prio"] = priority;

    if (ayulink::hr_valid(m))      doc["hr"]  = ayulink::hr_bpm(m);
    else                           doc["hr"]  = nullptr;
    if (ayulink::spo2_valid(m))    doc["spo2"] = ayulink::spo2_pct(m);
    else                           doc["spo2"] = nullptr;
    if (ayulink::temp_valid(m))    doc["temp"] = ayulink::temp_c(m);
    else                           doc["temp"] = nullptr;
    if (ayulink::lat_valid(m)) {
      doc["lat"] = ayulink::lat_deg(m);
      doc["lng"] = ayulink::lng_deg(m);
      doc["is_live_gps"] = (m.flags & ayulink::FLAG_GPS_LIVE) != 0;
    } else {
      doc["lat"] = nullptr; doc["lng"] = nullptr; doc["is_live_gps"] = false;
    }

    String out; serializeJson(doc, out);

    if (m.event == ayulink::EV_FALL_CANCEL || m.event == ayulink::EV_SOS_CANCEL) {
      StaticJsonDocument<256> cdoc;
      const char* evType = (m.event == ayulink::EV_SOS_CANCEL) ? "sos" : "fall";
      cdoc["type"] = (m.event == ayulink::EV_SOS_CANCEL) ? "sos_cancel" : "fall_cancel";
      cdoc["protocol"] = m.version;
      cdoc["node"] = String("D") + String(m.device_id);
      cdoc["device_id"] = m.device_id;
      cdoc["seq"] = m.seq;
      cdoc["event_type"] = evType;
      cdoc["event"] = (m.event == ayulink::EV_SOS_CANCEL) ? "sos_cancel" : "fall_cancel";
      cdoc["t_gw_rx_ms"] = rx_ms;
      cdoc["t_gw_proc_ms"] = proc_ms;
      cdoc["t_gw_fwd_ms"] = fwd_ms;
      cdoc["gw_queue_delay_ms"] = queue_delay;
      cdoc["prio"] = 1;
      String cOut;
      serializeJson(cdoc, cOut);
      if (wsConnected) ws.sendTXT(cOut);
      else queueEmergencyWs(cOut);
    }

    bool isEmergencyFrame = dev.sos || dev.fall || dev.tremor || priority <= 1;
    if (isEmergencyFrame) {
      Serial.printf("[G5-FORWARD-ATTEMPT] Forwarding seq=%u ev=%u to backend WS (connected=%d)\n",
                    m.seq, m.event, wsConnected);
    }
    if (wsConnected) {
      ws.sendTXT(out);
      if (isEmergencyFrame) {
        Serial.printf("[G6-FORWARD-RESULT] Dispatched to WS directly (seq=%u)\n", m.seq);
      }
    } else {
      if (isEmergencyFrame) {
        queueEmergencyWs(out);
        Serial.printf("[G6-FORWARD-RESULT] Buffered to WS RAM emergency queue (seq=%u, depth=%u)\n",
                      m.seq, (gwEmergencyWsHead - gwEmergencyWsTail + GW_EMERGENCY_WS_SIZE) % GW_EMERGENCY_WS_SIZE);
      } else {
        queueTelemetry(out);
      }
    }
    Serial.printf("[GW TRACE] prio=%u ev=%u seq=%u q_delay=%lums fwd=%s\n",
                  priority, m.event, m.seq, queue_delay, wsConnected ? "WS_DIRECT" : (isEmergencyFrame ? "WS_RAM_QUEUE" : "LITTLEFS"));

    uint8_t ackType = (m.event == ayulink::EV_FALL_CANCEL) ? ayulink::ACK_FALL_CANCEL
                    : (m.event == ayulink::EV_SOS_CANCEL)  ? ayulink::ACK_SOS_CANCEL
                    : ayulink::ACK_TELEMETRY_RX;
    scheduleBinaryAck(m.device_id, m.seq, ackType);
    return;
  }

  // v2 patient 108 requires authenticated binary frames; legacy JSON must not
  // be able to raise/clear an incident or inject telemetry into the dashboard.
  dev.dropped++;
}

// ── Inbound WebSocket Command Processor & Closed-Loop Handshake ──────────
void processWsMessage(const String &msg) {
  JsonDocument doc;
  if (deserializeJson(doc, msg)) return;

  const char *type = doc["type"] | "";
  const char *cmd  = doc["cmd"] | "";

  if (strcmp(cmd, "notification") == 0) {
    const char *id = doc["notification_id"] | "";
    const char *body = doc["notif"] | "";
    const char *title = doc["title"] | "";
    // The pre-ID hub alert feed uses cmd=notification with severity/type.
    // Keep it separate from the operator contract and log any radio failure.
    if (!id[0] && doc["severity"].is<const char*>() && doc["type"].is<const char*>()) {
      if (ayulink::printable_ascii(title, sizeof(notif.title) - 1) &&
          ayulink::printable_ascii(body, ayulink::kNoticeTextMax)) {
        if (scheduleNotice(body)) showNotif(title, body, 9000);
        else {
          Serial.println(F("[NOTICE] hub echo not queued"));
          showNotif("NOTICE FAILED", "Hub downlink not queued", 9000);
        }
      } else Serial.println(F("[NOTICE] hub echo rejected: non-ASCII/oversize"));
      return;
    }
    if (!ayulink::printable_ascii(id, 64)) {
      Serial.println(F("[NOTICE] invalid/missing notification_id; rejected"));
      // An oversized ID cannot be held in the bounded mapping. Report once
      // while connected; this exceptional failure cannot survive disconnect.
      if (id[0] && wsConnected) {
        JsonDocument failed;
        failed["type"] = "notification_status";
        failed["notification_id"] = id;
        failed["device_id"] = 108;
        failed["status"] = "failed";
        failed["radio_seq"] = 0;
        String out; serializeJson(failed, out);
        if (!ws.sendTXT(out)) Serial.println(F("[NOTICE] invalid-ID failure report not sent"));
      }
      return;
    }
    ayulink::NoticeRecord* previous = noticeRegistry.find(id, millis());
    if (previous) {
      noticeRegistry.replay(*previous); // duplicate ID, never repeat radio TX
      flushNoticeStatuses();
      return;
    }
    const uint32_t received_ms = millis();
    bool valid = doc["device_id"].is<int>() && doc["device_id"].as<int>() == 108 &&
                 doc["ttl_ms"].is<int>() && doc["ttl_ms"].as<int>() > 0 &&
                 doc["ttl_ms"].as<int>() <= 15000 &&
                 doc["expires_at"].is<const char*>() &&
                 (doc["expires_at"] | "")[0] &&
                 ayulink::printable_ascii(title, sizeof(notif.title) - 1) &&
                 ayulink::printable_ascii(body, ayulink::kNoticeTextMax);
    if (!noticeRegistry.has_slot(received_ms)) {
      Serial.printf("[NOTICE] registry full, rejecting id=%s\n", id);
      JsonDocument failed;
      failed["type"] = "notification_status";
      failed["notification_id"] = id;
      failed["device_id"] = 108;
      failed["status"] = "failed";
      failed["radio_seq"] = 0;
      String out; serializeJson(failed, out);
      if (!wsConnected || !ws.sendTXT(out))
        Serial.println(F("[NOTICE] registry-full failure report not sent"));
      return;
    }
    uint16_t radioSeq = 0;
    uint32_t ttl = valid ? (uint32_t)doc["ttl_ms"].as<int>() : 0;
    bool queued = valid && scheduleNotice(body, 6, ttl, false, &radioSeq, received_ms);
    ayulink::NoticeRecord* record = noticeRegistry.add(id, radioSeq, received_ms,
                                                        ttl, queued);
    if (!record) {
      Serial.println(F("[NOTICE] registry insert failed after queue attempt"));
      return;
    }
    if (queued) showNotif(title, body, ttl < 9000 ? (int)ttl : 9000);
    else Serial.printf("[NOTICE] id=%s failed validation/sign/queue\n", id);
    flushNoticeStatuses();
    return;
  }

  // The backend sends this whenever a device-derived emergency reaches the
  // dashboard. It had no handler at all, so the gateway OLED stayed silent and
  // the wristband was never told a responder had seen the alert.
  if (strcmp(cmd, "emergency") == 0) {
    const char *title = doc["title"] | "EMERGENCY";
    const char *body  = doc["notif"] | "Check dashboard";
    if (ayulink::printable_ascii(title, sizeof(notif.title) - 1) && scheduleNotice(body))
      showNotif(title, body, EMERGENCY_LOCK_MS);
    else {
      Serial.println(F("[NOTICE] emergency echo rejected/not queued"));
      showNotif("NOTICE FAILED", "Emergency downlink failed", EMERGENCY_LOCK_MS);
    }
    beepAsync(4, 150, 50);
    return;
  }

  // Backend-side incident acknowledgement (resolve / acknowledge from the
  // dashboard). Also previously unhandled.
  if (strcmp(cmd, "incident_ack") == 0) {
    uint16_t targetPatient = doc["device_id"] | dev.device_id;
    uint8_t  ackCode       = doc["ack_type"] | 0x03;   // ACK_CLEAR
    if (dev.seen && targetPatient == dev.device_id && ackCode >= ayulink::ACK_TELEMETRY_RX &&
        ackCode <= ayulink::ACK_FAULT) {
      scheduleBinaryAck(targetPatient, dev.last_seq, ackCode);
      Serial.printf("[HANDSHAKE] incident ACK 0x%02X -> device %u seq %u (queued)\n",
                    ackCode, targetPatient, dev.last_seq);
      if (ackCode == ayulink::ACK_CLEAR || ackCode == ayulink::ACK_SOS_CANCEL || ackCode == ayulink::ACK_FALL_CANCEL) {
        dev.sos = dev.fall = dev.tremor = false;
        dev.emergencySince = 0;
        dev.acknowledged = false;
        notif.active = false;
        vit.sos = vit.fall = vit.tremor = false;
      }
    }
    return;
  }

  if (strcmp(cmd, "dispatch_ack") == 0 || strcmp(type, "dispatch_ack") == 0) {
    uint16_t targetPatient = doc["device_id"] | dev.device_id;
    uint8_t  ackCode       = doc["ack_type"] | 0x02;
    if (!dev.seen || targetPatient != dev.device_id ||
        ackCode != ayulink::ACK_DISPATCH) return;

    dev.acknowledged = true;
    showNotif("DISPATCH CONFIRMED", "Emergency Team En Route", EMERGENCY_LOCK_MS);
    beepAsync(5, 100, 40);

    scheduleBinaryAck(targetPatient, dev.last_seq, ackCode);
    Serial.printf("[HANDSHAKE] dispatch ACK 0x%02X -> device %u seq %u (queued)\n",
                  ackCode, targetPatient, dev.last_seq);
    return;
  }

  if (strcmp(type, "hub") == 0 || doc["hub_data"]) {
    hub.temp = doc["hub_temp"] | hub.temp;
    hub.humidity = doc["hub_humidity"] | hub.humidity;
    hub.airPpm = doc["hub_air_ppm"] | hub.airPpm;
    bool wasFlame = hub.flame;
    if (doc.containsKey("hub_flame")) {
      hub.flame = doc["hub_flame"].as<bool>();
    }
    hub.received = true;
    const char *aq = doc["hub_aqi"] | hub.aqi;
    strncpy(hub.aqi, aq, sizeof(hub.aqi) - 1);
    const char *rt = doc["rtc_time"] | hub.rtcTime;
    if (rt) strncpy(hub.rtcTime, rt, sizeof(hub.rtcTime) - 1);

    for (int i = 0; i < 4; i++) {
      char key[16];
      snprintf(key, sizeof(key), "hub_slot%d", i + 1);
      hub.slot[i] = doc[key] | hub.slot[i];
    }

    if (hub.flame && !wasFlame) {
      totalAlerts++;
      showNotif("!! FIRE ALERT !!", "Flame at Dispenser!", EMERGENCY_LOCK_MS);
      beepAsync(8, 150, 50);
      if (!scheduleNotice("Fire at hub!")) Serial.println(F("[NOTICE] fire echo not queued"));
    }

    // ── Relay hub environment to the WRISTBAND ─────────────────────────────
    // The band already parses a compact "h" frame (see wristband.ino checkLoRaRX)
    // and renders a CARE HUB page from it, but until now nothing ever sent one,
    // so that page sat on "WAITING FOR HUB..." permanently. Single-letter keys
    // keep the frame inside the LoRa payload budget.
    //
    // Throttled: the backend republishes hub state on every hub_data frame, and
    // relaying each one would burn the downlink queue for no benefit. This is
    // ambient room telemetry, not an alert - alerts travel the notification path
    // above, which is immediate and prioritised.
    unsigned long nowMs = millis();
    if (nowMs - lastHubForwardMs >= HUB_FORWARD_INTERVAL_MS) {
      lastHubForwardMs = nowMs;
      char frame[120];
      int n = snprintf(frame, sizeof(frame),
        "{\"type\":\"h\",\"t\":%.1f,\"h\":%.0f,\"a\":%d,\"f\":%d,\"q\":\"%.8s\","
        "\"s1\":%d,\"s2\":%d,\"s3\":%d,\"s4\":%d}",
        hub.temp, hub.humidity, hub.airPpm, hub.flame ? 1 : 0, hub.aqi,
        hub.slot[0] ? 1 : 0, hub.slot[1] ? 1 : 0, hub.slot[2] ? 1 : 0, hub.slot[3] ? 1 : 0);
      if (n > 0 && n < (int)sizeof(frame)) {
        // Ambient data must never evict a notification/dispatch/clear.
        scheduleTextDownlink(frame, 1, false);
      }
    }
    return;
  }

  if (strcmp(cmd, "clear") == 0) {
    notif.active = false; vit.sos = false; vit.fall = false; vit.tremor = false;
    bz.total = 0; bz.buzzing = false; digitalWrite(PIN_BUZZER, LOW);
    alertClearTime = millis(); sosTime = 0; fallTime = 0;

    dev.sos = dev.fall = dev.tremor = false;
    dev.emergencySince = 0;
    dev.acknowledged = false;
    if (dev.seen) scheduleBinaryAck(dev.device_id, dev.last_seq, ayulink::ACK_CLEAR);
    Serial.println(F("[CLEAR] incident cleared; clear ACK queued"));
  }
}

// ── NOTE ON "FHIR" ──────────────────────────────────────────────────────
// Output is a plain internal telemetry envelope, NOT HL7 FHIR R4. If real
// FHIR is needed: Bundle with entry.request = POST Observation, RTC-synced
// instant, validated with a FHIR validator.

// ── Offline Store-and-Forward Engine via LittleFS ─────────────────────────
void setupLittleFS() {
  if (!LittleFS.begin(true)) {
    Serial.println(F("[FS-WARN] LittleFS initial mount failed; formatting LittleFS partition..."));
    LittleFS.format();
    if (!LittleFS.begin(true)) {
      Serial.println(F("[FS-ERR] LittleFS unavailable; store-and-forward DISABLED"));
      fsAvailable = false;
      return;
    }
  }
  fsAvailable = true;

  if (LittleFS.exists(QUEUE_FILE_PATH)) {
    File f = LittleFS.open(QUEUE_FILE_PATH, "r");
    offlineCachedCount = 0;
    while (f.available()) {
      f.readStringUntil('\n');
      offlineCachedCount++;
    }
    f.close();
    Serial.printf("[FS] Mounted. Found %d cached offline telemetry records.\n", offlineCachedCount);
  } else {
    Serial.println(F("[FS] Mounted. Offline queue file initialized empty."));
  }
}

void queueTelemetry(const String &payload) {
  if (!fsAvailable) { droppedNoFs++; return; }
  if (offlineCachedCount >= MAX_OFFLINE_RECORDS) {
    if (!trimTo(MAX_OFFLINE_RECORDS - 1)) {
      droppedAtCap++;
      Serial.printf("[FS-WARN] queue full (%d), dropping NEWEST record. dropped=%u\n",
                    MAX_OFFLINE_RECORDS, droppedAtCap);
      return;
    }
  }

  File f = LittleFS.open(QUEUE_FILE_PATH, "a");
  if (f) {
    f.println(payload);
    f.close();
    offlineCachedCount++;
    Serial.printf("[FS-STORE] Telemetry cached offline (Queue depth: %d)\n", offlineCachedCount);
  } else {
    Serial.println(F("[FS-ERR] Failed to write telemetry to LittleFS file queue!"));
  }
}

bool trimTo(int keep) {
  File f = LittleFS.open(QUEUE_FILE_PATH, "r");
  if (!f) return false;
  String tmp = "/queue.tmp";
  File o = LittleFS.open(tmp, "w");
  if (!o) { f.close(); return false; }
  int total = 0;
  while (f.available()) { f.readStringUntil('\n'); total++; }
  f.close();
  int skip = total - keep;
  f = LittleFS.open(QUEUE_FILE_PATH, "r");
  int i = 0;
  while (f.available()) {
    String line = f.readStringUntil('\n');
    line.trim();
    if (i++ >= skip) o.println(line);
  }
  f.close();
  o.close();
  LittleFS.remove(QUEUE_FILE_PATH);
  LittleFS.rename(tmp, QUEUE_FILE_PATH);
  offlineCachedCount = keep < 0 ? 0 : keep;
  Serial.printf("[FS] trimmed queue to %d records\n", offlineCachedCount);
  return true;
}

void flushOfflineQueue() {
  if (!fsAvailable || !LittleFS.exists(QUEUE_FILE_PATH) || offlineCachedCount == 0) return;

  Serial.printf("[FS-FORWARD] replaying %d offline records\n", offlineCachedCount);
  File f = LittleFS.open(QUEUE_FILE_PATH, "r");
  if (!f) return;

  int sent = 0;
  int lineNo = 0;
  while (f.available() && wsConnected && sent < 4) {
    if (lineNo++ < flushOffsetLines) { f.readStringUntil('\n'); continue; }
    String line = f.readStringUntil('\n');
    line.trim();
    if (line.length() == 0) continue;
    ws.sendTXT(line);
    sent++;
    flushOffsetLines = lineNo;
    esp_task_wdt_reset();
  }
  bool complete = !f.available();
  f.close();

  if (complete) {
    LittleFS.remove(QUEUE_FILE_PATH);
    offlineCachedCount = 0;
    flushOffsetLines = 0;
    Serial.println(F("[FS-FORWARD] queue drained"));
  } else {
    offlineCachedCount -= sent;
    Serial.printf("[FS-FORWARD] partial: %d sent, %d remaining (resumes at line %d)\n",
                  sent, offlineCachedCount, flushOffsetLines);
  }
}

// ── Fast ESP-NOW downlink scheduler (priority queue backed) ───────────────
// On ESP-NOW, frames transmit in <1ms without half-duplex LoRa turnaround delays.
#define DL_RETRY_MS     350  // Fast ESP-NOW retry turnaround
#define DL_TTL_MS     30000
#define DL_TX_TIMEOUT_MS 1000
#define DL_RESPONSE_GAP_MS 20 // Fast ESP-NOW response gap (was 500ms for LoRa)

static uint8_t dlPriorityForAck(uint8_t ackType) {
  switch (ackType) {
    case ayulink::ACK_DISPATCH:    return ayulink::DL_CRITICAL_COMMAND;
    case ayulink::ACK_CLEAR:       return ayulink::DL_CRITICAL_COMMAND;
    case ayulink::ACK_FALL_CANCEL:
    case ayulink::ACK_FAULT:       return ayulink::DL_EMERGENCY_ACK;
    default:                       return (dev.sos || dev.fall || dev.tremor) ?
                                          ayulink::DL_CRITICAL_COMMAND : ayulink::DL_TELEMETRY_ACK;
  }
}
// Note: the dispatch / clear / emergency ladders below are the closed loop the
// patient depends on and must NOT be shortened - see downlink_queue.h. Only the
// trailing routine telemetry ack was trimmed.
static uint8_t dlRetriesForAck(uint8_t ackType) {
  switch (ackType) {
    case ayulink::ACK_DISPATCH:    return 6;
    case ayulink::ACK_CLEAR:       return 5;
    case ayulink::ACK_FALL_CANCEL:
    case ayulink::ACK_FAULT:       return 4;
    // Routine telemetry-received confirmation. 1 is enough: a dropped one only
    // costs the patient's OLED link indicator, never a message.
    default:                       return 1;
  }
}

void scheduleBinaryAck(uint16_t device_id, uint16_t seq, uint8_t ack_type) {
  if (!device_id) return;
  uint8_t frame[ayulink::kAckSize];
  if (!ayulink::encode_ack(device_id, seq, ack_type, 0, frame,
                           ayulink::kDevicePsk, sizeof(ayulink::kDevicePsk),
                           ayulink::device_hmac_cb)) {
    Serial.println(F("[DL] ack encode failed"));
    return;
  }
  bool ok = dlq.enqueue(frame, sizeof(frame), dlPriorityForAck(ack_type),
                        device_id, seq, ack_type, millis(),
                        DL_RETRY_MS, dlRetriesForAck(ack_type), DL_TTL_MS);
  Serial.printf("[DL] enqueue type=0x%02X seq=%u prio=%u depth=%u %s\n",
                ack_type, seq, dlPriorityForAck(ack_type), dlq.depth(),
                ok ? "ok" : "REJECTED");
}

bool scheduleNotice(const char* text, uint8_t retries, uint32_t ttl_ms,
                    bool dedup_text, uint16_t* radio_seq, uint32_t received_ms) {
  if (radio_seq) *radio_seq = 0;
  if (!ayulink::printable_ascii(text, ayulink::kNoticeTextMax) ||
      !noticeStoreOk || !ttl_ms || ttl_ms > DL_TTL_MS) {
    Serial.println(F("[NOTICE] rejected: non-ASCII/oversize/invalid TTL or NVS unavailable"));
    return false;
  }
  const size_t n = strlen(text);
  const uint32_t start_ms = dedup_text ? millis() : received_ms;
  if (millis() - start_ms >= ttl_ms) {
    Serial.println(F("[NOTICE] TTL elapsed before enqueue"));
    return false;
  }
  // Backend hub emergencies can repeat every 2 s. One message keeps its
  // retries/ACK correlation instead of wearing NVS and saturating the radio.
  // Operator messages bypass text dedup: notification_id is their identity.
  if (dedup_text && lastEchoQueuedMs && millis() - lastEchoQueuedMs < DL_TTL_MS &&
      strcmp(text, lastEchoBody) == 0) {
    Serial.println(F("[NOTICE] duplicate emergency echo suppressed"));
    return true;
  }
  uint8_t frame[ayulink::kNoticeFrameMax];
  uint16_t seq = noticeSeq + 1;
  if (noticeStore.putUShort("seq", seq) != sizeof(uint16_t)) return false;
  noticeSeq = seq;
  size_t size = ayulink::encode_notice(108, seq, (const uint8_t*)text, n, frame,
                                       ayulink::kDevicePsk, sizeof(ayulink::kDevicePsk),
                                       ayulink::device_hmac_cb);
  const uint32_t elapsed = millis() - start_ms;
  if (elapsed >= ttl_ms) {
    Serial.println(F("[NOTICE] TTL elapsed during sign/enqueue"));
    return false;
  }
  bool ok = size && dlq.enqueue(frame, (uint8_t)size, ayulink::DL_CRITICAL_COMMAND,
                                  108, seq, ayulink::ACK_NOTIFICATION, millis(),
                                  DL_RETRY_MS, retries, ttl_ms - elapsed);
  if (ok) {
    lastNoticeQueued = seq; lastNoticeQueuedMs = millis();
    if (dedup_text) {
      memcpy(lastEchoBody, text, n + 1);
      lastEchoQueuedMs = lastNoticeQueuedMs;
    }
    if (radio_seq) *radio_seq = seq;
  }
  Serial.printf("[NOTICE] seq=%u bytes=%u queue=%s (delivery pending wrist ACK)\n",
                seq, (unsigned)size, ok ? "ok" : "FULL");
  return ok;
}

void flushNoticeStatuses() {
  if (!wsConnected || millis() - lastNoticeStatusSendMs < 100) return;
  lastNoticeStatusSendMs = millis();
  for (int i = 0; i < 2; ++i) {
    bool queued = false;
    ayulink::NoticeRecord* record = noticeRegistry.pending(&queued);
    if (!record) return;
    JsonDocument doc;
    doc["type"] = "notification_status";
    doc["notification_id"] = record->id;
    doc["device_id"] = 108;
    doc["status"] = queued ? "queued" : ayulink::notice_status_name(record->status);
    doc["radio_seq"] = record->radio_seq;
    String payload; serializeJson(doc, payload);
    if (!ws.sendTXT(payload)) return; // leave pending until reconnect/retry
    noticeRegistry.sent(*record, queued);
  }
}

void scheduleTextDownlink(const char* pkt, int retries, bool force) {
  if (!force && dlq.depth() > 0 && dlq.highest_priority() > ayulink::DL_TELEMETRY_ACK) return;
  size_t len = strlen(pkt);
  if (len == 0 || len > sizeof(ayulink::DlEntry::buf)) return;
  uint8_t frame[sizeof(ayulink::DlEntry::buf)];
  memcpy(frame, pkt, len);
  dlq.enqueue(frame, (uint8_t)len, force ? ayulink::DL_CRITICAL_COMMAND : ayulink::DL_TELEMETRY_ACK,
              0, 0, 0, millis(), DL_RETRY_MS, (uint8_t)retries, 5000);
}

void tickLoRaRetry() {
  if (!loraOk) return;
  if (loraTxActive) {
    if (!loraTxDone) {
      if (millis() - loraTxStartMs <= DL_TX_TIMEOUT_MS) return;
      Serial.println(F("[WIRELESS] TX timeout"));
      loraTxActive = false;
      loraTxDone = false;
      return;
    }
    loraTxDone = false;
    loraTxActive = false;
    loraRxReadyMs = millis();
    return;
  }
  if (loraRxReadyMs && millis() - loraRxReadyMs < DL_RESPONSE_GAP_MS) return;
  const ayulink::DlEntry* e = dlq.peek(millis());
  if (!e) return;
  loraTxDone = false;
  loraTxActive = true;
  loraTxStartMs = millis();
  esp_err_t err = esp_now_send(AYULINK_WRISTBAND_MAC, e->buf, e->len);
  if (err != ESP_OK) {
    loraTxDone = true;
    Serial.printf("[DL] esp_now_send error: %d\n", err);
  }
  dlq.on_transmit(millis(), DL_RETRY_MS);
}

void onLoRaTxDone() { loraTxDone = true; }

// ── Asynchronous Buzzer State Machine ────────────────────────────────────
void buzzerTick() {
  if (bz.total <= 0) {
    digitalWrite(PIN_BUZZER, LOW);
    return;
  }
  if (millis() < bz.nextMs) return;

  if (!bz.buzzing) {
    digitalWrite(PIN_BUZZER, HIGH);
    bz.buzzing = true;
    bz.nextMs = millis() + bz.onMs;
  } else {
    digitalWrite(PIN_BUZZER, LOW);
    bz.buzzing = false;
    bz.total--;
    bz.nextMs = millis() + (bz.total > 0 ? bz.offMs : 0);
  }
}

void beepAsync(int n, int onMs, int offMs) {
  bz.total = n; bz.onMs = onMs; bz.offMs = offMs;
  bz.buzzing = false; bz.nextMs = 0;
}

// ===========================================================================
//                              DISPLAY  (UI v2)
//   Screen 128x64 mono.
//   y 0..9   status bar        y 10  hairline
//   y 12..59 page content      y 61..62 page pager
// ===========================================================================

// ── Boot / setup ─────────────────────────────────────────────────────────
void setupOLED() {
  Wire.begin(21, 22);
  Wire.setTimeOut(30);
  delay(50);
  u8g2.begin();
  u8g2.setBusClock(100000);          // standard 100 kHz I2C clock avoids line noise & lockup
  u8g2.setContrast(CONTRAST_ACTIVE);
  curContrast = CONTRAST_ACTIVE;
  bootStep("DISPLAY", 10);
}

void bootStep(const char *label, int pct) {
  u8g2.clearBuffer();
  u8g2.setDrawColor(1);
  // ECG trace
  static const int8_t pts[][2] = {{0,9},{44,9},{49,1},{55,16},{60,5},{64,9},{127,9}};
  for (int i = 0; i < 6; i++) u8g2.drawLine(pts[i][0], pts[i][1], pts[i+1][0], pts[i+1][1]);
  // wordmark
  u8g2.setFont(u8g2_font_logisoso16_tr);
  const char *name = "AYULINK";
  u8g2.drawStr((128 - u8g2.getStrWidth(name)) / 2, 38, name);
  u8g2.setFont(u8g2_font_5x7_tr);
  const char *sub = "PHC GATEWAY";
  u8g2.drawStr((128 - u8g2.getStrWidth(sub)) / 2, 48, sub);
  // progress
  u8g2.drawRFrame(14, 51, 100, 6, 2);
  int w = constrain(pct, 0, 100) * 96 / 100;
  if (w > 0) u8g2.drawRBox(16, 53, w, 2, 0);
  u8g2.setFont(u8g2_font_4x6_tr);
  u8g2.drawStr((128 - u8g2.getStrWidth(label)) / 2, 63, label);
  u8g2.sendBuffer();
  esp_task_wdt_reset();
}

// ── Small helpers ────────────────────────────────────────────────────────
static void uiWake() { lastActivity = millis(); }

void gotoPage(int p) {
  p = ((p % PAGES) + PAGES) % PAGES;
  if (p == page) return;
  prevPage = page;
  page = p;
  slideStart = millis();
  sliding = true;
}

static void drawStrR(int xr, int y, const char *s) {
  u8g2.drawStr(xr - u8g2.getStrWidth(s), y, s);
}
static void drawStrC(int y, const char *s) {
  u8g2.drawStr((128 - u8g2.getStrWidth(s)) / 2, y, s);
}
// Draw string clipped to maxPx wide (font must be set).
static void drawStrClip(int x, int y, const char *s, int maxPx) {
  char b[40];
  int n = 0;
  for (; s[n] && n < (int)sizeof(b) - 1; n++) {
    b[n] = s[n]; b[n + 1] = 0;
    if (u8g2.getStrWidth(b) > maxPx) { b[n] = 0; break; }
  }
  u8g2.drawStr(x, y, b);
}
// Right-aligned pill, 5x7 text. yb = text baseline.
static void drawPill(int xr, int yb, const char *t, bool filled) {
  u8g2.setFont(u8g2_font_5x7_tr);
  int w = u8g2.getStrWidth(t) + 6;
  int x = xr - w;
  if (filled) {
    u8g2.setDrawColor(1); u8g2.drawRBox(x, yb - 8, w, 10, 2);
    u8g2.setDrawColor(0); u8g2.drawStr(x + 3, yb - 1, t);
    u8g2.setDrawColor(1);
  } else {
    u8g2.drawRFrame(x, yb - 8, w, 10, 2);
    u8g2.drawStr(x + 3, yb - 1, t);
  }
}
// Left-anchored chip (filled, inverted text), 5x7.
static void drawChip(int x, int yb, const char *t) {
  u8g2.setFont(u8g2_font_5x7_tr);
  int w = u8g2.getStrWidth(t) + 6;
  u8g2.setDrawColor(1); u8g2.drawRBox(x, yb - 8, w, 10, 2);
  u8g2.setDrawColor(0); u8g2.drawStr(x + 3, yb - 1, t);
  u8g2.setDrawColor(1);
}

static int wifiLevel() {
  if (WiFi.status() != WL_CONNECTED) return 0;
  int r = WiFi.RSSI();
  return r > -55 ? 4 : r > -65 ? 3 : r > -75 ? 2 : 1;
}
static int loraLevel() {          // SF10 sensitivity is ~-132 dBm
  if (!vit.lastRx || millis() - vit.lastRx > 60000UL) return 0;
  int r = vit.loraRssi;
  return r > -90 ? 4 : r > -105 ? 3 : r > -118 ? 2 : 1;
}

// ── Status bar icons ─────────────────────────────────────────────────────
static void drawWifiIcon(int x, int y, int lvl) {
  int cx = x + 6, cy = y + 8;
  if (lvl == 0) {
    u8g2.drawFrame(cx - 1, cy - 1, 3, 3);
    u8g2.drawLine(x + 1, y + 1, x + 11, y + 9);
    return;
  }
  u8g2.drawBox(cx - 1, cy - 1, 2, 2);
  int arcs = lvl > 3 ? 3 : lvl;
  for (int i = 0; i < arcs; i++)
    u8g2.drawCircle(cx, cy, 3 + i * 2, U8G2_DRAW_UPPER_LEFT | U8G2_DRAW_UPPER_RIGHT);
}
static void drawServerIcon(int x, int y, bool up) {
  if (up) {
    u8g2.drawBox(x, y, 9, 3);
    u8g2.drawBox(x, y + 4, 9, 3);
    u8g2.setDrawColor(0);
    u8g2.drawPixel(x + 6, y + 1); u8g2.drawPixel(x + 6, y + 5);
    u8g2.setDrawColor(1);
  } else {
    u8g2.drawFrame(x, y, 9, 3);
    u8g2.drawFrame(x, y + 4, 9, 3);
  }
}
static void drawAntenna(int x, int y) {
  u8g2.drawVLine(x + 3, y + 3, 5);
  u8g2.drawLine(x, y, x + 3, y + 3);
  u8g2.drawLine(x + 6, y, x + 3, y + 3);
}
static void drawBars4(int x, int y, int lvl) {
  for (int i = 0; i < 4; i++) {
    int h = 2 + i * 2;
    if (i < lvl) u8g2.drawBox(x + i * 3, y + 8 - h, 2, h);
    else         u8g2.drawBox(x + i * 3, y + 7, 2, 1);
  }
}

static void drawStatusBar(const char *title) {
  u8g2.setDrawColor(1);
  drawWifiIcon(1, 0, wifiLevel());
  drawServerIcon(16, 1, wsConnected);
  drawAntenna(29, 1);
  drawBars4(37, 1, loraOk ? loraLevel() : 0);

  u8g2.setFont(u8g2_font_5x7_tr);
  if (offlineCachedCount > 0) {
    char q[10]; snprintf(q, sizeof(q), "Q%d", offlineCachedCount);
    u8g2.drawStr(52, 8, q);
  }
  const char *t = title;
  if (!loraOk) t = ((millis() / 500) & 1) ? "RADIO FAIL" : "";
  drawStrR(127, 8, t);
  u8g2.drawHLine(0, 10, 128);
}

static void drawPager() {
  int x = 48;
  for (int i = 0; i < PAGES; i++) {
    if (i == page) { u8g2.drawBox(x, 61, 8, 2); x += 12; }
    else           { u8g2.drawBox(x, 61, 2, 2); x += 6; }
  }
}

// ── Icons ────────────────────────────────────────────────────────────────
static void drawHeart(int x, int y, bool big) {
  if (big) {
    u8g2.drawDisc(x + 3, y + 3, 3);
    u8g2.drawDisc(x + 8, y + 3, 3);
    u8g2.drawTriangle(x, y + 4, x + 11, y + 4, x + 5, y + 10);
  } else {
    u8g2.drawDisc(x + 4, y + 4, 2);
    u8g2.drawDisc(x + 7, y + 4, 2);
    u8g2.drawTriangle(x + 2, y + 5, x + 9, y + 5, x + 5, y + 9);
  }
}

static void drawSpark(int x0, int y0, int w, int h, const int16_t *a, uint8_t n, int lo, int hi) {
  if (n < 2) return;
  int vmin = lo, vmax = hi;
  for (uint8_t i = 0; i < n; i++) { if (a[i] < vmin) vmin = a[i]; if (a[i] > vmax) vmax = a[i]; }
  if (vmax <= vmin) vmax = vmin + 1;
  int px = 0, py = 0;
  for (uint8_t i = 0; i < n; i++) {
    int x = x0 + w - 1 - (int)(n - 1 - i) * (w - 1) / (UI_HIST - 1);
    int y = y0 + h - 1 - (a[i] - vmin) * (h - 1) / (vmax - vmin);
    if (i) u8g2.drawLine(px, py, x, y);
    px = x; py = y;
  }
  u8g2.drawBox(px - 1, py - 1, 2, 2);   // live dot
}

// ── Page 0: Vitals ───────────────────────────────────────────────────────
static void drawPage0_Vitals(int dx) {
  unsigned long now = millis();
  bool seen  = vit.lastRx > 0;
  bool fresh = seen && (now - vit.lastRx < STALE_MS);
  bool hrOk  = fresh && vit.hr > 0;
  bool spOk  = fresh && vit.spo2 > 0;
  bool tOk   = fresh && vit.temp > 1.0f;

  bool big = false;
  if (hrOk) { unsigned long per = 60000UL / (unsigned)vit.hr; big = (now % per) < 140; }
  drawHeart(dx + 1, 12, big);

  u8g2.setFont(u8g2_font_4x6_tr);
  u8g2.drawStr(dx + 15, 19, "BPM");
  if (vit.tremor && fresh) drawChip(dx + 36, 21, "SEIZURE");

  u8g2.setFont(u8g2_font_5x7_tr);
  u8g2.drawStr(dx + 68, 19, "SPO2");
  u8g2.setFont(u8g2_font_4x6_tr);
  drawStrR(dx + 126, 19, vit.node);
  u8g2.drawVLine(dx + 64, 13, 29);

  char b[16];
  u8g2.setFont(u8g2_font_logisoso16_tr);
  if (hrOk) snprintf(b, sizeof(b), "%d", vit.hr); else snprintf(b, sizeof(b), "--");
  u8g2.drawStr(dx + 4, 42, b);
  if (spOk) snprintf(b, sizeof(b), "%d", vit.spo2); else snprintf(b, sizeof(b), "--");
  u8g2.drawStr(dx + 68, 42, b);
  int w = u8g2.getStrWidth(b);
  u8g2.setFont(u8g2_font_6x10_tr);
  u8g2.drawStr(dx + 68 + w + 2, 42, "%");

  // sparkline
  u8g2.drawHLine(dx, 58, 88);
  drawSpark(dx + 1, 46, 86, 11, hrHist, hrHistN, 50, 110);

  // temp + age
  u8g2.setFont(u8g2_font_4x6_tr);
  u8g2.drawStr(dx + 92, 50, "TEMP");
  if (seen) {
    unsigned long age = (now - vit.lastRx) / 1000;
    if (age < 100) snprintf(b, sizeof(b), "%lus", age);
    else snprintf(b, sizeof(b), "%lum", age / 60);
    drawStrR(dx + 126, 50, b);
  }
  u8g2.setFont(u8g2_font_5x7_tr);
  if (tOk) {
    snprintf(b, sizeof(b), "%.1f", vit.temp);
    u8g2.drawStr(dx + 92, 58, b);
    int tw = u8g2.getStrWidth(b);
    u8g2.drawPixel(dx + 92 + tw + 2, 52);           // degree dot
    u8g2.drawStr(dx + 92 + tw + 4, 58, "C");
  } else {
    u8g2.drawStr(dx + 92, 58, "--");
  }

  // stale / waiting chip over the sparkline
  if (!fresh) {
    if ((now / 600) & 1 || !seen) {
      u8g2.setFont(u8g2_font_5x7_tr);
      const char *txt = seen ? "NO SIGNAL" : "WAITING FOR BAND";
      int cw = u8g2.getStrWidth(txt) + 8;
      int cx = dx + (88 - cw) / 2;
      u8g2.setDrawColor(0); u8g2.drawBox(cx - 1, 46, cw + 2, 12);
      u8g2.setDrawColor(1); u8g2.drawRFrame(cx, 47, cw, 10, 2);
      u8g2.drawStr(cx + 4, 55, txt);
    }
  }
}

// ── Page 1: Network ──────────────────────────────────────────────────────
static void drawPage1_Gateway(int dx) {
  char b[40];
  bool wifiUp = WiFi.status() == WL_CONNECTED;

  // WIFI row
  u8g2.setFont(u8g2_font_4x6_tr);
  u8g2.drawStr(dx + 2, 18, "WIFI");
  u8g2.setFont(u8g2_font_6x10_tr);
  if (wifiUp) {
    drawStrClip(dx + 2, 27, WIFI_SSID, 80);
    snprintf(b, sizeof(b), "%ddBm", WiFi.RSSI());
    drawPill(dx + 126, 27, b, false);
  } else {
    snprintf(b, sizeof(b), "SEARCHING%.*s", (int)((millis() / 400) % 4), "...");
    u8g2.drawStr(dx + 2, 27, b);
  }

  // SERVER row
  u8g2.setFont(u8g2_font_4x6_tr);
  u8g2.drawStr(dx + 2, 33, "SERVER");
  u8g2.setFont(u8g2_font_6x10_tr);
  drawStrClip(dx + 2, 42, WS_HOST, 74);
  drawPill(dx + 126, 42, wsConnected ? "LIVE" : "OFFLINE", wsConnected);

  // STORE & FORWARD row
  u8g2.setFont(u8g2_font_4x6_tr);
  u8g2.drawStr(dx + 2, 48, "STORE+FWD");
  uint32_t lost = droppedAtCap + droppedNoFs;
  if (!fsAvailable)      drawStrR(dx + 126, 48, "NO FS!");
  else if (lost > 0)     { snprintf(b, sizeof(b), "LOST %lu", (unsigned long)lost); drawStrR(dx + 126, 48, b); }
  u8g2.drawRFrame(dx + 2, 50, 88, 7, 2);
  int fw = offlineCachedCount * 84 / MAX_OFFLINE_RECORDS;
  if (offlineCachedCount > 0 && fw < 2) fw = 2;
  if (fw > 0) u8g2.drawBox(dx + 4, 52, fw, 3);
  u8g2.setFont(u8g2_font_5x7_tr);
  snprintf(b, sizeof(b), "%d/%d", offlineCachedCount, MAX_OFFLINE_RECORDS);
  drawStrR(dx + 126, 57, b);
}

// ── Page 2: Radio ────────────────────────────────────────────────────────
static void drawPage2_LoRa(int dx) {
  char b[24];
  bool have = vit.lastRx > 0;

  u8g2.setFont(u8g2_font_4x6_tr);
  u8g2.drawStr(dx + 2, 19, "RSSI");
  u8g2.setFont(u8g2_font_logisoso16_tr);
  if (have) snprintf(b, sizeof(b), "%d", vit.loraRssi); else snprintf(b, sizeof(b), "--");
  u8g2.drawStr(dx + 2, 38, b);
  int w = u8g2.getStrWidth(b);
  u8g2.setFont(u8g2_font_5x7_tr);
  u8g2.drawStr(dx + 2 + w + 3, 38, "dBm");
  u8g2.setFont(u8g2_font_4x6_tr);
  if (lastNoticeQueuedMs) {
    const char *state = lastNoticeQueued == lastNoticeAcked ? "MSG ACKED" :
                        millis() - lastNoticeQueuedMs < DL_TTL_MS ? "MSG PENDING" : "MSG UNCONFIRMED";
    u8g2.drawStr(dx + 2, 47, state);
  } else u8g2.drawStr(dx + 2, 47, "433MHz SF10 BW125");

  u8g2.drawVLine(dx + 64, 13, 35);
  u8g2.setFont(u8g2_font_5x7_tr);
  const char *lbl[4] = {"PKT", "ALERT", "REJECT", "SEQ"};
  for (int i = 0; i < 4; i++) {
    int y = 21 + i * 9;
    u8g2.drawStr(dx + 69, y, lbl[i]);
    switch (i) {
      case 0: snprintf(b, sizeof(b), "%d", totalPkts); break;
      case 1: snprintf(b, sizeof(b), "%d", totalAlerts); break;
      case 2: snprintf(b, sizeof(b), "%lu", (unsigned long)dev.dropped); break;
      default: if (dev.seen) snprintf(b, sizeof(b), "%u", dev.last_seq); else snprintf(b, sizeof(b), "--"); break;
    }
    drawStrR(dx + 126, y, b);
  }

  // signal meter  -125 .. -45 dBm
  u8g2.drawRFrame(dx + 2, 50, 124, 8, 2);
  if (have) {
    int fill = constrain(map(vit.loraRssi, -125, -45, 0, 120), 0, 120);
    if (fill > 0) u8g2.drawBox(dx + 4, 52, fill, 4);
  }
}

// ── Page 3: Care Hub ─────────────────────────────────────────────────────
static void drawPage3_Dispenser(int dx) {
  char b[32];
  if (!hub.received) {
    u8g2.setFont(u8g2_font_6x10_tr);
    snprintf(b, sizeof(b), "WAITING FOR HUB%.*s", (int)((millis() / 400) % 4), "...");
    u8g2.drawStr(dx + 12, 38, b);
    return;
  }

  u8g2.setFont(u8g2_font_4x6_tr);
  u8g2.drawStr(dx + 2, 19, "ROOM");
  u8g2.drawStr(dx + 68, 19, "AIR");
  u8g2.drawVLine(dx + 62, 13, 31);

  u8g2.setFont(u8g2_font_logisoso16_tr);
  snprintf(b, sizeof(b), "%.1f", hub.temp);
  u8g2.drawStr(dx + 2, 37, b);
  int w = u8g2.getStrWidth(b);
  u8g2.setFont(u8g2_font_5x7_tr);
  u8g2.drawPixel(dx + 2 + w + 3, 22);
  u8g2.drawStr(dx + 2 + w + 5, 37, "C");
  snprintf(b, sizeof(b), "HUM %.0f%%", hub.humidity);
  u8g2.drawStr(dx + 2, 44, b);

  u8g2.setFont(u8g2_font_6x10_tr);
  drawStrClip(dx + 68, 31, hub.aqi, 58);
  u8g2.setFont(u8g2_font_5x7_tr);
  snprintf(b, sizeof(b), "%d ppm", hub.airPpm);
  u8g2.drawStr(dx + 68, 41, b);
  u8g2.setFont(u8g2_font_4x6_tr);
  drawStrR(dx + 126, 19, hub.rtcTime);

  // 4 dispenser slots
  u8g2.setFont(u8g2_font_5x7_tr);
  for (int i = 0; i < 4; i++) {
    int x = dx + 2 + i * 32;
    char s[4]; snprintf(s, sizeof(s), "S%d", i + 1);
    if (hub.slot[i]) {
      u8g2.setDrawColor(1); u8g2.drawRBox(x, 47, 28, 11, 3);
      u8g2.setDrawColor(0); u8g2.drawStr(x + 9, 55, s);
      u8g2.setDrawColor(1);
    } else {
      u8g2.drawRFrame(x, 47, 28, 11, 3);
      u8g2.drawStr(x + 9, 55, s);
    }
  }

  if (hub.flame && ((millis() / 250) & 1)) drawPill(dx + 126, 29 - 8 + 7, "FIRE", true);
}

// ── Page 4: Location ─────────────────────────────────────────────────────
static void drawPage4_GPS(int dx) {
  char b[24];
  unsigned long now = millis();
  int cx = dx + 17, cy = 29;

  // radar rings
  u8g2.drawCircle(cx, cy, 14);
  u8g2.drawCircle(cx, cy, 8);
  if (vit.hasLiveSatFix) {                       // ping only on a real fix
    int r = 3 + (now / 90) % 12;
    u8g2.drawCircle(cx, cy, r);
  }
  u8g2.drawDisc(cx, cy, 3);

  u8g2.setFont(u8g2_font_4x6_tr);
  u8g2.drawStr(dx + 40, 19, "LATITUDE");
  u8g2.drawStr(dx + 40, 38, "LONGITUDE");
  u8g2.setFont(u8g2_font_6x10_tr);
  snprintf(b, sizeof(b), "%.5f", vit.lat);
  u8g2.drawStr(dx + 40, 29, b);
  snprintf(b, sizeof(b), "%.5f", vit.lng);
  u8g2.drawStr(dx + 40, 48, b);

  if (vit.hasLiveSatFix) drawChip(dx + 2, 58, "SAT FIX");
  else {
    u8g2.setFont(u8g2_font_5x7_tr);
    const char *t = "PHC ANCHOR (NO FIX)";
    int cw = u8g2.getStrWidth(t) + 6;
    u8g2.drawRFrame(dx + 2, 50, cw, 10, 2);
    u8g2.drawStr(dx + 5, 58, t);
  }
}

static void drawPageBody(int p, int dx) {
  switch (p) {
    case 0: drawPage0_Vitals(dx); break;
    case 1: drawPage1_Gateway(dx); break;
    case 2: drawPage2_LoRa(dx); break;
    case 3: drawPage3_Dispenser(dx); break;
    case 4: drawPage4_GPS(dx); break;
  }
}

static void drawDashboard() {
  unsigned long now = millis();
  bool drawn = false;
  if (sliding) {
    float t = (now - slideStart) / (float)SLIDE_MS;
    if (t >= 1.0f) {
      sliding = false;
    } else {
      t = 1.0f - (1.0f - t) * (1.0f - t);        // ease-out
      int off = (int)(128 * t);
      drawPageBody(prevPage, -off);
      drawPageBody(page, 128 - off);
      drawn = true;
    }
  }
  if (!drawn) drawPageBody(page, 0);
  drawStatusBar(PAGE_TITLES[page]);
  drawPager();
}

// ── Emergency screen ─────────────────────────────────────────────────────
static void drawEmergency() {
  unsigned long now = millis();
  bool acked = dev.acknowledged;
  bool inv = !acked && ((now / 400) & 1);        // flash until someone answers
  int fg = inv ? 0 : 1;

  u8g2.setDrawColor(1);
  if (inv) u8g2.drawBox(0, 0, 128, 64);
  else { u8g2.drawFrame(0, 0, 128, 64); u8g2.drawFrame(1, 1, 126, 62); }
  u8g2.setDrawColor(fg);

  const char *label = dev.tremor ? "SEIZURE" : (dev.fall ? "FALL" : "SOS");
  u8g2.setFont(dev.tremor ? u8g2_font_logisoso16_tr : u8g2_font_logisoso20_tr);
  int lw = u8g2.getStrWidth(label);
  u8g2.drawStr((128 - lw) / 2, 28, label);

  // left icon: warning triangle (waiting) or check (acked)
  if (!acked) {
    u8g2.drawTriangle(5, 26, 25, 26, 15, 8);
    u8g2.setDrawColor(1 - fg);
    u8g2.drawBox(14, 14, 2, 6); u8g2.drawBox(14, 22, 2, 2);
    u8g2.setDrawColor(fg);
    u8g2.drawTriangle(123, 26, 103, 26, 113, 8);
    u8g2.setDrawColor(1 - fg);
    u8g2.drawBox(112, 14, 2, 6); u8g2.drawBox(112, 22, 2, 2);
    u8g2.setDrawColor(fg);
  } else {
    u8g2.drawCircle(15, 17, 10);
    u8g2.drawLine(10, 17, 14, 21); u8g2.drawLine(14, 21, 21, 12);
    u8g2.drawLine(10, 18, 14, 22); u8g2.drawLine(14, 22, 21, 13);
    u8g2.drawCircle(113, 17, 10);
    u8g2.drawLine(108, 17, 112, 21); u8g2.drawLine(112, 21, 119, 12);
    u8g2.drawLine(108, 18, 112, 22); u8g2.drawLine(112, 22, 119, 13);
  }

  u8g2.drawHLine(6, 32, 116);

  u8g2.setFont(u8g2_font_6x10_tr);
  drawStrC(44, acked ? "RESPONDER EN ROUTE" : "AWAITING RESPONDER");

  unsigned long el = dev.emergencySince ? (now - dev.emergencySince) / 1000 : 0;
  char b[32];
  snprintf(b, sizeof(b), "%s   T+%02lu:%02lu", vit.node, el / 60 % 100, el % 60);
  u8g2.setFont(u8g2_font_5x7_tr);
  drawStrC(54, b);

  // bottom bar: solid when acked, sweeping while waiting
  u8g2.drawHLine(12, 59, 104);
  if (acked) u8g2.drawBox(12, 57, 104, 5);
  else {
    int t = (now / 10) % 160;
    int pos = t < 80 ? t : 160 - t;
    u8g2.drawBox(12 + pos, 57, 24, 5);
  }
  u8g2.setDrawColor(1);
}

// ── Toast notification ───────────────────────────────────────────────────
static int wrapText(const char *s, char out[][22], int maxLines) {
  int n = 0;
  const char *p = s;
  while (*p && n < maxLines) {
    while (*p == ' ') p++;
    if (!*p) break;
    int len = strlen(p);
    int take = len > 21 ? 21 : len;
    if (len > 21) {
      int br = take;
      while (br > 0 && p[br] != ' ') br--;
      if (br > 0) take = br;
    }
    memcpy(out[n], p, take);
    out[n][take] = 0;
    p += take;
    n++;
  }
  return n;
}

static void drawNotification() {
  u8g2.setDrawColor(1);
  u8g2.drawBox(0, 0, 128, 13);
  u8g2.setDrawColor(0);
  u8g2.setFont(u8g2_font_6x10_tr);
  drawStrClip(4, 10, notif.title, 120);
  u8g2.setDrawColor(1);
  u8g2.drawFrame(0, 12, 128, 52);

  char lines[3][22];
  int n = wrapText(notif.msg, lines, 3);
  u8g2.setFont(u8g2_font_6x10_tr);
  int y0 = (n == 1) ? 34 : (n == 2 ? 29 : 25);
  for (int i = 0; i < n; i++) u8g2.drawStr(4, y0 + i * 11, lines[i]);

  long rem = (long)(notif.expiry - millis());
  if (rem > 0 && notif.dur > 0) {
    int barW = (int)((long long)constrain(rem, 0L, (long)notif.dur) * 120 / (long)notif.dur);
    u8g2.drawFrame(3, 56, 122, 5);
    if (barW > 0) u8g2.drawBox(4, 57, barW, 3);
  }
}

// ── Render root ──────────────────────────────────────────────────────────
void showNotif(const char *title, const char *msg, int durationMs) {
  strncpy(notif.title, title, sizeof(notif.title) - 1);
  strncpy(notif.msg, msg, sizeof(notif.msg) - 1);
  notif.title[sizeof(notif.title) - 1] = '\0';
  notif.msg[sizeof(notif.msg) - 1] = '\0';
  notif.active = true;
  notif.dur = durationMs;
  notif.expiry = millis() + durationMs;
  uiWake();
  updateDisplay();
}

void updateDisplay() {
  u8g2.clearBuffer();
  u8g2.setDrawColor(1);
  if (dev.sos || dev.fall || dev.tremor) {
    uiWake();
    drawEmergency();
  } else if (notif.active && millis() < notif.expiry) {
    drawNotification();
  } else {
    drawDashboard();
  }
  u8g2.sendBuffer();
}

// ── Built-in Wireless Radio Initialization ───────────────────────────────
void setupLoRa() {
  WiFi.mode(WIFI_STA);
  if (esp_now_init() != ESP_OK) {
    loraOk = false;
    Serial.println(F("[WIRELESS-ERR] Built-in Radio Initialization Failed!"));
    return;
  }
  esp_now_register_recv_cb(onWirelessDataRecv);
  esp_now_register_send_cb(onWirelessDataSent);

  esp_now_peer_info_t peerInfo = {};
  memcpy(peerInfo.peer_addr, AYULINK_WRISTBAND_MAC, 6);
  peerInfo.channel = 0; // Use current interface channel
  peerInfo.ifidx = WIFI_IF_STA;
  peerInfo.encrypt = false;

  if (esp_now_is_peer_exist(AYULINK_WRISTBAND_MAC)) {
    esp_now_del_peer(AYULINK_WRISTBAND_MAC);
  }
  if (esp_now_add_peer(&peerInfo) != ESP_OK) {
    loraOk = false;
    Serial.println(F("[WIRELESS-ERR] Failed to register Wristband peer!"));
    return;
  }
  loraOk = true;
  Serial.printf("[WIRELESS] Online — Built-in ESP32 Radio. WiFi Channel: %u | Wristband MAC: %02X:%02X:%02X:%02X:%02X:%02X\n",
                WiFi.channel(),
                AYULINK_WRISTBAND_MAC[0], AYULINK_WRISTBAND_MAC[1], AYULINK_WRISTBAND_MAC[2],
                AYULINK_WRISTBAND_MAC[3], AYULINK_WRISTBAND_MAC[4], AYULINK_WRISTBAND_MAC[5]);
}

void setLED(bool r, bool g, bool b) {
  digitalWrite(PIN_LED_R, r ? HIGH : LOW);
  digitalWrite(PIN_LED_G, g ? HIGH : LOW);
  digitalWrite(PIN_LED_B, b ? HIGH : LOW);
}

String uptimeStr() {
  unsigned long s = (millis() - bootMs) / 1000;
  char buf[16];
  if (s < 60) snprintf(buf, sizeof(buf), "%lus", s);
  else if (s < 3600) snprintf(buf, sizeof(buf), "%lum%lus", s / 60, s % 60);
  else snprintf(buf, sizeof(buf), "%luh%lum", s / 3600, (s % 3600) / 60);
  return String(buf);
}
