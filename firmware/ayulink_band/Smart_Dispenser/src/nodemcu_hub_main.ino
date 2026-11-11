/*
 * AyuLink NodeMCU Smart Dispenser Hub
 * =====================================
 * Hardware:
 *   - NodeMCU ESP8266
 *   - MQ-135   → Air quality (A0)
 *   - DHT11    → Room temperature + humidity (D4)
 *   - NTP      → UTC clock, Asia/Kolkata schedule/display (no RTC required)
 *   - ESP8266 flash EEPROM → persisted schedule and dispense-day guard
 *   - Flame    → Flame sensor (D5, digital)
 *   - SG90     → 9g servo (D6, PWM)
 *   - OLED     → 0.96" SH1106 128x64 I2C display (D1/D2)
 *   - Wristband sync → Receives schedule updates from backend WS
 *
 * WiFi Connection: Connects to home WiFi → WebSocket to AyuLink backend (port
 * 8000)
 *
 * JSON sent to backend:
 *   {
 *     "type":       "hub_data",
 *     "device_id":  "NODEMCU-HUB-01",
 *     "rssi":       -60,
 *     "uptime":     120,
 *     "air_ppm":    85,
 *     "air_aqi":    "Good",
 *     "env_temp":   26.4,
 *     "humidity":   63.2,
 *     "rtc_time":   "13:45:22",
 *     "rtc_date":   "2026-05-02",
 *     "flame":      false,
 *     "pill_slot1": false,
 *     "pill_slot2": false,
 *     "pill_slot3": false,
 *     "pill_slot4": false
 *   }
 *
 * JSON received from backend (schedule sync from wristband dashboard):
 *   {"cmd":"dispense","slot":2}
 *   {"cmd":"set_schedule","slot":1,"time":"08:00"}
 *   {"cmd":"reset_all"}
 *   {"cmd":"notification","msg":"Take meds","sub":"Slot 1 - Morning"}
 */

#ifdef ESP8266
#include <ESP8266WiFi.h>
#include <Servo.h>
#include <WebSocketsClient.h>
#include <EEPROM.h>
#include <time.h>
// UDP is needed for the backend discovery probe. WiFi.h does not pull it in
// transitively on either core, so it must be requested explicitly.
#include <WiFiUdp.h>
#include "../../common/ayulink_discovery.h"
#include "../../common/servo_angles.h"
#else
#include <ESP32Servo.h>
#include <WebSocketsClient.h>
#include <WiFi.h>
#endif

#include <Arduino.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <U8g2lib.h> // SH1106 OLED library
#include <Wire.h>

// ================================================================
// PIN DEFINITIONS (NodeMCU / ESP8266 GPIO map)
// ================================================================
#define PIN_DHT D4    // DHT11 data
#define PIN_FLAME D5  // Flame sensor digital out (LOW = flame)
#define PIN_SERVO D6  // SG90 servo PWM
#define PIN_AIR A0    // MQ-135 analog (0-1023 on NodeMCU)
#define PIN_BUZZER D7 // Passive buzzer (requires tone/PWM)
#define PIN_LED D0    // Status LED (built-in or external)

// I2C: D1 = SCL, D2 = SDA (default Wire on NodeMCU)

// ================================================================
// OLED CONFIG
// ================================================================
// u8g2.begin() returns void: it cannot report failure, so this used to print
// "[OLED] ✓ SH1106 ready" whether or not a display was attached. An I2C scan on
// real hardware returned ZERO devices on D1/D2, yet the log claimed success.
// This is the same "assert success you never verified" failure the wristband
// had with the MAX30102, and it is the exact thing this project exists to
// avoid. Presence is now probed on the bus before the claim is made.
//
// 0x3C is the normal address; 0x3D is used when the module's SDA is tied high.
U8G2_SH1106_128X64_NONAME_F_HW_I2C u8g2(U8G2_R0, U8X8_PIN_NONE);
static const uint8_t OLED_ADDR_PRIMARY  = 0x3C;
static const uint8_t OLED_ADDR_SECONDARY = 0x3D;
static bool oledPresent = false;
static uint8_t oledAddr = OLED_ADDR_PRIMARY;

// ================================================================
// DHT11 SENSOR
// ================================================================
#define DHT_TYPE DHT11
DHT dht(PIN_DHT, DHT_TYPE);

// ================================================================
// NTP: UTC is authoritative; fixed UTC+05:30 is for schedule/display only.
// A fresh NTP callback is required after every boot. millis() advances the
// snapshot between syncs without trusting a stale system clock on restart.
// ================================================================
static const int32_t KOLKATA_OFFSET_SEC = 5 * 3600 + 30 * 60;
static const uint32_t NTP_MAX_AGE_MS = 12UL * 60UL * 60UL * 1000UL;
static const uint32_t NTP_RETRY_MS = 60UL * 1000UL;
static volatile bool ntpSyncPending = false;
static bool timeValid = false;
static time_t syncUtc = 0;
static uint32_t syncAtMs = 0;
static int64_t previousMinute = -1;
static int32_t displayedDay = -1;

// ================================================================
// SERVO CONFIG
// ================================================================
Servo pillServo;
// 1 servo, 4 slots in 180 degrees divided by 5:
// 36° is ideal (home/idle position)
// Slot 1 = 72° (36° + 36°)
// Slot 2 = 108° (72° + 36°)
// Slot 3 = 144° (108° + 36°)
// Slot 4 = 180° (144° + 36°)
const int HOME_ANGLE = 36;
const int SLOT_ANGLES[4] = {36, 72, 108, 144};

// Per-slot calibrated target angles. A dispense moves the servo to
// slotAngles[idx] - changing this NEVER moves the servo on its own.
int slotAngles[4] = {36, 72, 108, 144};

// Resolved once when a dispense starts; the motion state machine only reads it.
int dispenseTargetAngle = 36;
const char *SLOT_LABELS[4] = {"Morning", "Afternoon", "Evening", "Night"};
char slotTimes[4][6] = {"08:00", "13:00", "18:00", "22:00"};
bool slotTaken[4] = {false, false, false, false};
bool dispensing = false;
int  dispenseSlot = 0;          // slot being dispensed (1..4)
int  dispenseStep = 0;          // 0=idle 1=open 2=close
unsigned long dispenseTimer = 0;
#define DISPENSE_HOLD_MS 1500

// ================================================================
// WIFI & WEBSOCKET CONFIG  ← UPDATE BEFORE FLASH
// ================================================================
#ifndef AYULINK_WIFI_SSID
#define AYULINK_WIFI_SSID "WiFi"
#endif
#ifndef AYULINK_WIFI_PASS
#define AYULINK_WIFI_PASS "wordpass"
#endif
#ifndef AYULINK_WS_HOST
#define AYULINK_WS_HOST "ayulink.local"
#endif
#ifndef AYULINK_HUB_TOKEN
#define AYULINK_HUB_TOKEN "ayulink-demo-hub-v1"
#endif
const char* WIFI_SSID = AYULINK_WIFI_SSID;
const char* WIFI_PASS = AYULINK_WIFI_PASS;
const char *WS_HOST = AYULINK_WS_HOST;
const uint16_t WS_PORT = 8000;
const char *WS_PATH = "/ws/hub";
const char *HUB_TOKEN = AYULINK_HUB_TOKEN;

WebSocketsClient webSocket;
static ayulink::DiscoveryCache hubDiscovery;
bool wifiConnected = false;
bool wsConnected = false;
static bool backendDataSeen = false;
static uint32_t backendDataAtMs = 0;
static const uint32_t BACKEND_DATA_FRESH_MS = 30000;
static uint32_t wsOfflineSinceMs = 0;

// ================================================================
// TIMING - Reduced delays for fastest responsiveness
// ================================================================
unsigned long lastSensorRead = 0;
unsigned long lastHeartbeat = 0;
unsigned long lastOLEDUpdate = 0;
#define WIFI_RETRY_MS 10000
#define EEPROM_BYTES 64
#define EEPROM_MAGIC 0xA7
// Slot times occupy bytes 1..24 (4 slots x 6 bytes). Calibrated angles go in
// 25..28, leaving the layout intact for units flashed before this change.
#define EEPROM_ANGLE_BASE 25
#define EEPROM_DAY_BASE 29  // four uint32 local-day numbers, 0xFFFFFFFF=never
#define SENSOR_INTERVAL_MS 2500     // DHT11 cannot be sampled continuously
#define HEARTBEAT_INTERVAL_MS 3000  // Heartbeat every 3s
#define OLED_UPDATE_MS 500          // OLED refresh every 500ms

// ================================================================
// LIVE SENSOR DATA
// ================================================================
float g_envTemp = 0.0f;
float g_humidity = 0.0f;
int g_airPpm = 0;
bool g_flame = false;
static int flameIdleLevel = HIGH;
String g_rtcTime = "--:--:--";
String g_rtcDate = "----/--/--";
uint32_t lastDispenseDay[4] = {UINT32_MAX, UINT32_MAX, UINT32_MAX, UINT32_MAX};
char notificationTitle[22] = "";
char notificationMessage[81] = "";
uint32_t notificationAtMs = 0;
bool notificationActive = false;
char g_aqiStr[20] = "Unknown";
bool envWarning = false;

struct BuzzerState {
  int remaining = 0;
  int onMs = 80;
  bool on = false;
  unsigned long nextMs = 0;
} buzzerState;

// ================================================================
// FORWARD DECLARATIONS
// ================================================================
void setupWiFi();
void setupWebSocket();
void setupOLED();
void updateClock();
void checkSchedule();
bool currentUtc(time_t *utc);
bool markDispenseDay(int slot, uint32_t day);
void readSensors();
void checkFlameFast();
void dispensePill(int slot, int angle_deg = -1);
void sendStatus();
void processCommand(const char *json);
void updateOLED();
void buzz(int beeps, int ms = 80);
void buzzerTick();
void webSocketEvent(WStype_t type, uint8_t *payload, size_t length);
const char *classifyAQI(int ppm);
void loadSchedules();
void loadSlotAngles();
bool saveSchedule(int slot, const char *timeStr);
bool validTime(const char *timeStr);

// ================================================================
// SETUP
// ================================================================
void setup() {
  Serial.begin(115200);
  delay(1500);

  Serial.println(F("\n\n===================================="));
  Serial.println(F("  AyuLink P108 Pill Dispenser"));
  Serial.println(F("  MQ135 + DHT11 + NTP + Flame"));
  Serial.println(F("  9g Servo + OLED + WiFi WebSocket"));
  Serial.println(F("====================================\n"));

  // GPIO
  pinMode(PIN_FLAME, INPUT_PULLUP);
  pinMode(PIN_BUZZER, OUTPUT);
  pinMode(PIN_LED, OUTPUT);
  noTone(PIN_BUZZER); // ensure passive buzzer is silent at boot
  digitalWrite(PIN_LED, LOW);
  delay(100);
  int hiCount = 0;
  for (int i = 0; i < 5; i++) {
    if (digitalRead(PIN_FLAME) == HIGH) hiCount++;
    delay(10);
  }
  flameIdleLevel = (hiCount >= 3) ? HIGH : LOW;
  Serial.printf("[FLAME] Sensor initialized on D5 (GPIO14). Idle level: %d (Active trigger: %d)\n",
                flameIdleLevel, 1 - flameIdleLevel);

  // I2C (D1=SCL, D2=SDA on NodeMCU)
  Wire.begin(D2, D1);

  // OLED
  setupOLED();
  if (oledPresent) {
    u8g2.clearBuffer();
    u8g2.setFont(u8g2_font_6x10_tf);
    u8g2.drawStr(0, 10, "AyuLink P108 Hub");
    u8g2.drawStr(0, 22, "Initializing...");
    u8g2.sendBuffer();
  }

  // DHT11
  dht.begin();
  Serial.println(F("[DHT11] Sensor initialized"));

  loadSchedules();
  loadSlotAngles();
  // Do not infer valid time from firmware build date or a missing RTC.
#ifdef ESP8266
  settimeofday_cb([]() { ntpSyncPending = true; });
#endif
  configTime(0, 0, "pool.ntp.org", "time.google.com");

  // Servo
  pillServo.attach(PIN_SERVO);
  pillServo.write(HOME_ANGLE); // 36° Ideal Home position
  delay(400);
  Serial.printf("[SERVO] Initialized at ideal home %d°\n", HOME_ANGLE);

  // WiFi + WS
  setupWiFi();

  // Boot beep
  buzz(2);

  Serial.println(F("\n[READY] NodeMCU Hub operational!"));
  Serial.println(
      F("Slots: Ideal(36°) 1=Morning(72°) 2=Afternoon(108°) 3=Evening(144°) 4=Night(180°)"));
}

// ================================================================
// MAIN LOOP
// ================================================================
void loop() {
  webSocket.loop();
  buzzerTick();

  unsigned long now = millis();

  bool connected = WiFi.status() == WL_CONNECTED;
  if (connected != wifiConnected) {
    wifiConnected = connected;
    if (connected) {
      Serial.printf("[WiFi] IP: %s\n", WiFi.localIP().toString().c_str());
      configTime(0, 0, "pool.ntp.org", "time.google.com");
      wsOfflineSinceMs = now;
      setupWebSocket();
    } else {
      wsConnected = false;
      backendDataSeen = false;
      webSocket.disconnect();
      hubDiscovery.clear(); // Hotspot DHCP may choose a different backend IP.
      Serial.println(F("[WiFi] Lost connection"));
    }
  }
  if (!connected) {
    static uint32_t lastRetry = 0;
    if (now - lastRetry >= WIFI_RETRY_MS) {
      lastRetry = now;
      setupWiFi();
    }
  } else if (!wsConnected && (uint32_t)(now - wsOfflineSinceMs) >= 60000) {
    // WebSocket's short reconnect retry can otherwise pin a stale hotspot IP.
    wsOfflineSinceMs = now;
    hubDiscovery.clear();
    webSocket.disconnect();
    setupWebSocket();
  }
  updateClock();

  // Run dispenser state machine — non-blocking
  runDispenser();

  // Rapid flame scan (runs continuously with zero delay)
  checkFlameFast();

  // Read all sensors at interval
  if (now - lastSensorRead >= SENSOR_INTERVAL_MS) {
    lastSensorRead = now;
    readSensors();
  }

  // Heartbeat
  if (wsConnected && (now - lastHeartbeat >= HEARTBEAT_INTERVAL_MS)) {
    lastHeartbeat = now;
    sendStatus();
  }

  // OLED refresh
  if (now - lastOLEDUpdate >= OLED_UPDATE_MS) {
    lastOLEDUpdate = now;
    updateOLED();
  }

  checkSchedule();

  yield(); // ESP8266 watchdog
}

// ================================================================
// CONTINUOUS FAST FLAME MONITORING (runs every 40ms)
// ================================================================
void checkFlameFast() {
  static unsigned long lastFlameCheck = 0;
  static unsigned long flameTriggerTime = 0;
  static bool prevFlame = false;
  unsigned long now = millis();
  if (now - lastFlameCheck < 40) return;
  lastFlameCheck = now;

  int raw = digitalRead(PIN_FLAME);
  // Auto-calibrated: detects flame on both Active-LOW (LM393 default) and Active-HIGH modules
  bool detected = (flameIdleLevel == HIGH) ? (raw == LOW) : (raw == HIGH);

  if (detected) {
    flameTriggerTime = now;
    g_flame = true;
  } else if (g_flame && (now - flameTriggerTime >= 3500)) {
    // Hold flame active for 3.5s so brief lighter clicks are reliably captured, displayed, and sent
    g_flame = false;
  }

  if (g_flame && !prevFlame) {
    prevFlame = true;
    Serial.printf("\n[FIRE] 🔥🔥🔥 FLAME DETECTED ON D5! Raw=%d, Idle=%d 🔥🔥🔥\n", raw, flameIdleLevel);
    buzz(5, 140);
    digitalWrite(PIN_LED, HIGH);
    if (oledPresent) updateOLED();
    sendStatus(); // Send alert immediately with zero delay
  } else if (!g_flame && prevFlame) {
    prevFlame = false;
    Serial.println(F("[FIRE] Flame cleared. Returning to normal."));
    digitalWrite(PIN_LED, LOW);
    if (oledPresent) updateOLED();
    sendStatus();
  }
}

// ================================================================
// READ ALL SENSORS
// ================================================================
void readSensors() {
  // ── DHT11 ─────────────────────────────────────────────────
  float h = dht.readHumidity();
  float t = dht.readTemperature();
  if (!isnan(h) && !isnan(t)) {
    g_humidity = h;
    g_envTemp = t;
    Serial.printf("[DHT11] Temp: %.1f°C  Humidity: %.1f%%\n", t, h);
  } else {
    Serial.println(F("[DHT11] Read failed — check wiring"));
  }

  // ── MQ-135 ─────────────────────────────────────────────────
  int raw = analogRead(PIN_AIR);
  g_airPpm = map(raw, 0, 1023, 0, 1000); // Linear approximation
  strncpy(g_aqiStr, classifyAQI(g_airPpm), sizeof(g_aqiStr) - 1);
  Serial.printf("[MQ135] Raw: %d  PPM: %d  AQI: %s\n", raw, g_airPpm, g_aqiStr);

  // ── Flame Sensor Status Log ─────────────────────────────────
  int rawFlame = digitalRead(PIN_FLAME);
  Serial.printf("[FLAME] D5 raw: %d | IdleLevel: %d | State: %s\n",
                rawFlame, flameIdleLevel, g_flame ? "FIRE!" : "OK");

  // ── Environmental Conditions Alert (Decoupled from Flame) ────────────────
  const bool nextEmergency = g_envTemp >= 42.0f;
  const bool nextWarning = g_airPpm >= 300 || g_envTemp >= 38.0f || g_humidity >= 80.0f;
  if (nextEmergency && !envWarning) {
    Serial.println(F("[ENV] EMERGENCY: Extreme High Room Temperature (>=42°C)!"));
    buzz(4, 120);
    envWarning = true;
    sendStatus();
  } else if (nextWarning && !envWarning) {
    Serial.println(F("[ENV] Warning threshold reached (Air/Temp/Humidity)"));
    buzz(2, 100);
    envWarning = true;
    sendStatus();
  } else if (!nextWarning && !nextEmergency) {
    envWarning = false;
  }
  if (g_flame || nextEmergency || nextWarning) {
    digitalWrite(PIN_LED, HIGH);
  } else {
    digitalWrite(PIN_LED, LOW);
  }

}

bool currentUtc(time_t *utc) {
  if (!timeValid) return false;
  if ((uint32_t)(millis() - syncAtMs) > NTP_MAX_AGE_MS) return false;
  *utc = syncUtc + (uint32_t)(millis() - syncAtMs) / 1000;
  return true;
}

void updateClock() {
  uint32_t nowMs = millis();
  if (ntpSyncPending) {
    ntpSyncPending = false;
    time_t received = time(nullptr);  // configTime(0, 0) keeps system time in UTC
    if (WiFi.status() == WL_CONNECTED && received >= 1704067200) { // 2024-01-01 UTC
      syncUtc = received;
      syncAtMs = nowMs;
      timeValid = true;
      previousMinute = -1; // A sync or clock correction cannot replay this minute.
      Serial.println(F("[NTP] Valid UTC sync; local display is Asia/Kolkata"));
    }
  }
  if (timeValid && (uint32_t)(nowMs - syncAtMs) > NTP_MAX_AGE_MS) {
    timeValid = false;
    previousMinute = -1;
    g_rtcTime = "--:--:--";
    g_rtcDate = "----/--/--";
    Serial.println(F("[NTP] Time stale; automatic dispensing suspended"));
  }
  static uint32_t lastRetry = 0;
  if (WiFi.status() == WL_CONNECTED && !timeValid &&
      (uint32_t)(nowMs - lastRetry) >= NTP_RETRY_MS) {
    lastRetry = nowMs;
    configTime(0, 0, "pool.ntp.org", "time.google.com");
  }
  static uint32_t lastDisplay = 0;
  if ((uint32_t)(nowMs - lastDisplay) < 1000) return;
  lastDisplay = nowMs;
  time_t utc;
  if (!currentUtc(&utc)) return;
  time_t local = utc + KOLKATA_OFFSET_SEC;
  struct tm parts;
  gmtime_r(&local, &parts);
  char buf[16];
  strftime(buf, sizeof(buf), "%H:%M:%S", &parts);
  g_rtcTime = buf;  // legacy backend field names, containing NTP-backed IST
  strftime(buf, sizeof(buf), "%Y-%m-%d", &parts);
  g_rtcDate = buf;
}

// Process only a naturally elapsed local-minute boundary. On boot, reconnect,
// NTP correction or missed minute, skip rather than catch up a potentially
// already-dispensed dose. A per-slot day is committed before servo motion.
void checkSchedule() {
  time_t utc;
  if (!currentUtc(&utc)) return;
  int64_t local = (int64_t)utc + KOLKATA_OFFSET_SEC;
  int64_t minute = local / 60;
  uint32_t day = (uint32_t)(local / 86400);
  if (displayedDay != (int32_t)day) {
    displayedDay = (int32_t)day;
    for (int i = 0; i < 4; ++i) slotTaken[i] = lastDispenseDay[i] == day;
    sendStatus();
  }
  if (minute == previousMinute) return;
  bool normalBoundary = previousMinute >= 0 && minute == previousMinute + 1;
  previousMinute = minute;
  if (!normalBoundary || dispensing) return;
  int hour = (minute % 1440) / 60;
  int min = minute % 60;
  for (int i = 0; i < 4; ++i) {
    int schedH = (slotTimes[i][0] - '0') * 10 + slotTimes[i][1] - '0';
    int schedM = (slotTimes[i][3] - '0') * 10 + slotTimes[i][4] - '0';
    if (hour == schedH && min == schedM && lastDispenseDay[i] != day) {
      Serial.printf("[NTP] Scheduled dispense: slot %d\n", i + 1);
      dispensePill(i + 1);
      break; // single servo; no deferred catch-up into a different minute
    }
  }
}

// ================================================================
// DISPENSE PILL — NON-BLOCKING state machine
// slot = 1..4
// Called from loop() once started; runDispenser() does the work
// ================================================================
void dispensePill(int slot, int angle_deg) {
  if (slot < 1 || slot > 4) return;
  if (dispensing) {
    Serial.println(F("[DISPENSE] Blocked — already running"));
    return;
  }
  time_t utc;
  if (!currentUtc(&utc)) {
    Serial.println(F("[DISPENSE] Blocked — NTP time not valid"));
    return;
  }
  uint32_t day = (uint32_t)(((int64_t)utc + KOLKATA_OFFSET_SEC) / 86400);
  if (lastDispenseDay[slot - 1] == day || !markDispenseDay(slot, day)) {
    Serial.println(F("[DISPENSE] Blocked — already dispensed or day guard unavailable"));
    return;
  }
  // Resolve the target through the shared rule so firmware and backend clamp
  // identically. Resolved once here, not in the step machine below.
  dispenseTargetAngle = ayulink::servo_resolve_angle(
      slot, angle_deg == 0 ? ayulink::kServoNoAngleOverride : angle_deg, slotAngles[slot - 1]);
  dispenseSlot = slot;
  dispensing   = true;
  dispenseStep = 1;  // start state machine

  int idx = slot - 1;
  Serial.printf("[DISPENSE] Starting Slot %d (%s) -> %d deg\n",
                slot, SLOT_LABELS[idx], dispenseTargetAngle);

  // OLED feedback immediately (non-blocking)
  if (!oledPresent) return;
  u8g2.clearBuffer();
  u8g2.setFont(u8g2_font_7x14_tf);
  char buf[32]; snprintf(buf, sizeof(buf), "Slot %d", slot);
  u8g2.drawStr(0, 15, buf);
  u8g2.setFont(u8g2_font_6x10_tf);
  u8g2.drawStr(0, 32, SLOT_LABELS[idx]);
  u8g2.drawStr(0, 44, "Dispensing...");
  u8g2.sendBuffer();
}

// Call this every loop() iteration to advance dispenser state machine
void runDispenser() {
  if (!dispensing) return;
  int idx = dispenseSlot - 1;

  if (dispenseStep == 1) {
    // Step 1: move servo to slot angle
    pillServo.write(dispenseTargetAngle);
    dispenseTimer = millis();
    dispenseStep  = 2;

  } else if (dispenseStep == 2 && millis() - dispenseTimer >= 800 + DISPENSE_HOLD_MS) {
    // Step 2: return servo to ideal home position (36°) after hold time
    pillServo.write(HOME_ANGLE);
    dispenseTimer = millis();
    dispenseStep  = 3;

  } else if (dispenseStep == 3 && millis() - dispenseTimer >= 500) {
    // Step 3: all done
    slotTaken[idx] = true;
    dispensing     = false;
    dispenseStep   = 0;
    buzz(2, 60);
    Serial.printf("[DISPENSE] Done Slot %d -> returned to home %d°\n", dispenseSlot, HOME_ANGLE);
    sendStatus();
    updateOLED();
  }
}

// ================================================================
// SEND STATUS JSON TO BACKEND
// ================================================================
void sendStatus() {
  if (!wsConnected)
    return;

  JsonDocument doc;
  doc["type"] = "hub_data";
  doc["device_id"] = "NODEMCU-HUB-01";
  doc["rssi"] = WiFi.RSSI();
  doc["uptime"] = millis() / 1000;

  // MQ-135
  doc["air_ppm"] = g_airPpm;
  doc["air_aqi"] = g_aqiStr;

  // DHT11
  doc["env_temp"] = g_envTemp;
  doc["humidity"] = g_humidity;

  // Keep backend's legacy field names, but never send an invented RTC reading.
  doc["rtc_time"] = timeValid ? g_rtcTime : "";
  doc["rtc_date"] = timeValid ? g_rtcDate : "";
  doc["time_valid"] = timeValid;

  // Flame
  doc["flame"] = g_flame;

  // Pill slots
  doc["pill_slot1"] = slotTaken[0];
  doc["pill_slot2"] = slotTaken[1];
  doc["pill_slot3"] = slotTaken[2];
  doc["pill_slot4"] = slotTaken[3];
  for (int i = 0; i < 4; i++) {
    char key[16];
    snprintf(key, sizeof(key), "slot_time%d", i + 1);
    doc[key] = slotTimes[i];
  }
  // Calibrated angles: what this unit will actually drive the servo to.
  for (int i = 0; i < 4; i++) {
    char key[16];
    snprintf(key, sizeof(key), "slot_angle%d", i + 1);
    doc[key] = slotAngles[i];
  }

  String payload;
  serializeJson(doc, payload);
  webSocket.sendTXT(payload);

  Serial.printf("[TX] hub_data sent: T=%.1f°C H=%.1f%% AQI=%s Flame=%s\n",
                g_envTemp, g_humidity, g_aqiStr, g_flame ? "YES!" : "No");
}

// ================================================================
// PROCESS COMMAND FROM DASHBOARD (via WebSocket)
// ================================================================
void processCommand(const char *json) {
  JsonDocument doc;
  if (deserializeJson(doc, json))
    return;

  const char *cmd = doc["cmd"] | "";
  Serial.printf("[CMD] Received: %s\n", cmd);

  if (strcmp(cmd, "dispense") == 0) {
    int slot = doc["slot"] | 0;
    if (slot >= 1 && slot <= 4) {
      // Optional per-command target. Absent means "use this slot's calibrated
      // angle", which is the normal case from the dashboard.
      int req = doc["angle"] | 0;
      int override = req > 0 ? req : ayulink::kServoNoAngleOverride;
      dispensePill(slot, override);
    } else {
      Serial.printf("[CMD] Invalid slot %d (must be 1-4)\n", slot);
      buzz(3, 50);
    }

  } else if (strcmp(cmd, "set_angle") == 0) {
    // Calibration: store a target angle. This must NOT move the servo - the
    // hopper only turns on a dispense.
    int slot = doc["slot"] | 0;
    if (slot < 1 || slot > 4) {
      Serial.printf("[CMD] set_angle: invalid slot %d (must be 1-4)\n", slot);
      buzz(3, 50);
    } else {
      int requested = doc["angle"] | -1;
      int applied = ayulink::servo_clamp_angle(requested);
      if (saveSlotAngle(slot, applied)) {
        Serial.printf("[SERVO] Slot %d target = %d deg (requested %d)%s\n",
                      slot, applied, requested,
                      applied == requested ? "" : "  [CLAMPED]");
        if (applied != requested) buzz(2, 60);   // tell the operator it was refused
        else buzz(1, 100);
        sendStatus();
      } else {
        buzz(3, 50);
      }
    }

  } else if (strcmp(cmd, "set_schedule") == 0 || strcmp(cmd, "program_slot") == 0) {
    int slot = doc["slot"] | 0;
    const char *time_str = doc["time"] | "";
    if (saveSchedule(slot, time_str)) {
      Serial.printf("[SCHEDULE] Slot %d set to %s and persisted\n", slot, time_str);
      buzz(1, 100);
      sendStatus();
    } else {
      Serial.printf("[SCHEDULE] Invalid slot/time: %d / %s\n", slot, time_str);
      buzz(3, 50);
    }

  } else if (strcmp(cmd, "reset_all") == 0) {
    for (int i = 0; i < 4; i++)
      slotTaken[i] = false;
    Serial.println(F("[CMD] All slots reset to full (0 emptied)"));
    buzz(2, 100);
    sendStatus();
    updateOLED();

  } else if (strcmp(cmd, "reset_slot") == 0) {
    int slot = doc["slot"] | 0;
    if (slot >= 1 && slot <= 4) {
      slotTaken[slot - 1] = false;
      Serial.printf("[CMD] Slot %d reset to full\n", slot);
      buzz(1, 100);
      sendStatus();
      updateOLED();
    }

  } else if (strcmp(cmd, "status") == 0) {
    sendStatus();

  } else if (strcmp(cmd, "buzz") == 0) {
    buzz(doc["count"] | 1);

  } else if (strcmp(cmd, "notification") == 0) {
    // Store bounded display text: periodic OLED refresh must not erase a toast.
    const char *msg = doc["msg"] | (doc["notif"] | "Alert!");
    const char *title = doc["title"] | (doc["sub"] | "AyuLink Alert");
    snprintf(notificationTitle, sizeof(notificationTitle), "%s", title);
    snprintf(notificationMessage, sizeof(notificationMessage), "%s", msg);
    notificationAtMs = millis();
    notificationActive = true;
    updateOLED();
    buzz(4, 50);
    Serial.println(F("[NOTIFY] OLED notification received"));

  } else {
    Serial.printf("[CMD] Unknown: '%s'\n", cmd);
  }
}

// ================================================================
// WEBSOCKET EVENT HANDLER
// ================================================================
void webSocketEvent(WStype_t type, uint8_t *payload, size_t length) {
  switch (type) {
  case WStype_CONNECTED:
    wsConnected = true;
    wsOfflineSinceMs = millis();
    backendDataSeen = false;
    Serial.println(F("[WS] Transport connected; authentication pending"));
    {
      JsonDocument authDoc;
      authDoc["type"] = "auth";
      authDoc["token"] = HUB_TOKEN;
      String auth;
      serializeJson(authDoc, auth);
      webSocket.sendTXT(auth);
    }
    sendStatus();
    break;

  case WStype_DISCONNECTED:
    wsConnected = false;
    wsOfflineSinceMs = millis();
    backendDataSeen = false;
    Serial.println(F("[WS] Disconnected — will retry..."));
    break;

  case WStype_TEXT: {
    if (length >= 512) {
      Serial.println(F("[WS] Oversized command discarded"));
      break;
    }
    char buf[512];
    memcpy(buf, payload, length);
    buf[length] = '\0';
    JsonDocument incoming;
    if (deserializeJson(incoming, buf) || !incoming["cmd"].is<const char *>()) break;
    // The backend only emits commands after /ws/hub's auth gate.
    backendDataSeen = true;
    backendDataAtMs = millis();
    processCommand(buf);
    break;
  }

  default:
    break;
  }
}

// ================================================================
// WIFI SETUP — one non-blocking attempt; core handles reconnects.
// ================================================================
void setupWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.persistent(false);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.println(F("[WiFi] Connection requested"));
}

// ================================================================
// WEBSOCKET SETUP
// ================================================================
// Backend resolution, mirroring the gateway (see common/ayulink_discovery.h).
// The hub previously tried mDNS and then fell back to a PLAIN DNS lookup for an
// ".local" name, which cannot succeed by definition. On a phone hotspot, where
// multicast is often mishandled, that left the hub with no working path and it
// never appeared connected - the most likely reason the hub "still didn't" work
// on the bench.
void setupWebSocket() {
  if (!WS_HOST[0]) {
    Serial.println(F("[WS] AYULINK_WS_HOST is not configured"));
    return;
  }

  // 1. Remembered address from a previous successful probe.
  ayulink::DiscoveryResult found = hubDiscovery.get(WS_PORT);
  if (found.ok()) {
    IPAddress ip = found.toIP();
    Serial.printf("[DISC] cache -> %s:%u\n", ip.toString().c_str(), (unsigned)found.port);
    webSocket.begin(ip, found.port, WS_PATH);
    webSocket.onEvent(webSocketEvent);
    webSocket.setReconnectInterval(3000);
    webSocket.enableHeartbeat(15000, 3000, 2);
    return;
  }

  // 2. DHCP gateway probe (covers Windows/phone mobile hotspot where backend is on host).
  IPAddress gw = WiFi.gatewayIP();
  if (gw != IPAddress((uint32_t)0) && gw != IPAddress(255, 255, 255, 255)) {
    WiFiUDP gudp;
    if (gudp.begin(0) == 1) {
      gudp.beginPacket(gw, ayulink::kDiscoveryPort);
      gudp.write((const uint8_t*)ayulink::kDiscoveryMagic, strlen(ayulink::kDiscoveryMagic));
      gudp.endPacket();
      const uint32_t started = millis();
      while ((uint32_t)(millis() - started) < 250) {
        if (gudp.parsePacket() > 0) {
          char probe[96];
          int n = gudp.read((uint8_t*)probe, sizeof(probe) - 1);
          if (n > 0) {
            probe[n] = '\0';
            ayulink::DiscoveryResult r = ayulink::DiscoveryResult::none();
            if (ayulink::parseDiscoveryReply(probe, (size_t)n, &r)) {
              r.source = ayulink::kDiscoveryGateway;
              hubDiscovery.remember(r);
              IPAddress ip = r.toIP();
              Serial.printf("[DISC] DHCP gateway -> %s:%u\n", ip.toString().c_str(), (unsigned)r.port);
              webSocket.begin(ip, r.port, WS_PATH);
              webSocket.onEvent(webSocketEvent);
              webSocket.setReconnectInterval(3000);
              webSocket.enableHeartbeat(15000, 3000, 2);
              gudp.stop();
              return;
            }
          }
        }
        delay(5);
      }
      gudp.stop();
    }
  }

  // 3. mDNS, when multicast happens to work.
  IPAddress resolved;
  if (String(WS_HOST).endsWith(".local") && WiFi.hostByName(WS_HOST, resolved, 250) == 1) {
    Serial.printf("[mDNS] %s -> %s\n", WS_HOST, resolved.toString().c_str());
    ayulink::DiscoveryResult r;
    r.ip_be = ayulink::ipAddressToBE(resolved);
    r.port = WS_PORT;
    r.source = ayulink::kDiscoveryMdns;
    hubDiscovery.remember(r);
    webSocket.begin(resolved, WS_PORT, WS_PATH);
    webSocket.onEvent(webSocketEvent);
    webSocket.setReconnectInterval(3000);
    webSocket.enableHeartbeat(15000, 3000, 2);
    return;
  }

  // 4. UDP broadcast probe (global 255.255.255.255 + subnet broadcast).
  WiFiUDP udp;
  if (udp.begin(0) == 1) {
    const IPAddress kBroadcast(255, 255, 255, 255);
    IPAddress localIp = WiFi.localIP();
    IPAddress subnet = WiFi.subnetMask();
    IPAddress subnetBcast((uint32_t)localIp | ~(uint32_t)subnet);

    for (int attempt = 0; attempt < 2; ++attempt) {
      udp.beginPacket(kBroadcast, ayulink::kDiscoveryPort);
      udp.write((const uint8_t*)ayulink::kDiscoveryMagic, strlen(ayulink::kDiscoveryMagic));
      udp.endPacket();

      if (subnetBcast != kBroadcast && subnetBcast != IPAddress((uint32_t)0)) {
        udp.beginPacket(subnetBcast, ayulink::kDiscoveryPort);
        udp.write((const uint8_t*)ayulink::kDiscoveryMagic, strlen(ayulink::kDiscoveryMagic));
        udp.endPacket();
      }

      const uint32_t started = millis();
      while ((uint32_t)(millis() - started) < 350) {
        if (udp.parsePacket() > 0) {
          char buf[96];
          int n = udp.read((uint8_t*)buf, sizeof(buf) - 1);
          if (n > 0) {
            buf[n] = '\0';
            ayulink::DiscoveryResult r = ayulink::DiscoveryResult::none();
            if (ayulink::parseDiscoveryReply(buf, (size_t)n, &r)) {
              hubDiscovery.remember(r);
              IPAddress ip = r.toIP();
              Serial.printf("[DISC] UDP -> %s:%u\n", ip.toString().c_str(), (unsigned)r.port);
              webSocket.begin(ip, r.port, WS_PATH);
              webSocket.onEvent(webSocketEvent);
              webSocket.setReconnectInterval(3000);
              webSocket.enableHeartbeat(15000, 3000, 2);
              udp.stop();
              return;
            }
          }
        }
        delay(5);
      }
    }
    udp.stop();
  }

  // 5. Last resort: the configured name, unchanged.
  Serial.printf("[WS] fallback → ws://%s:%d%s\n", WS_HOST, WS_PORT, WS_PATH);
  webSocket.begin(WS_HOST, WS_PORT, WS_PATH);
  webSocket.onEvent(webSocketEvent);
  webSocket.setReconnectInterval(3000);
  webSocket.enableHeartbeat(15000, 3000, 2);
}

// ================================================================
// Flash schedule and per-slot dispense-day persistence
// ================================================================
bool validTime(const char *timeStr) {
  if (!timeStr || strlen(timeStr) != 5 || timeStr[2] != ':') return false;
  if (timeStr[0] < '0' || timeStr[0] > '9' || timeStr[1] < '0' || timeStr[1] > '9' ||
      timeStr[3] < '0' || timeStr[3] > '9' || timeStr[4] < '0' || timeStr[4] > '9') return false;
  int h = (timeStr[0] - '0') * 10 + (timeStr[1] - '0');
  int m = (timeStr[3] - '0') * 10 + (timeStr[4] - '0');
  return h < 24 && m < 60;
}

void loadSchedules() {
#ifdef ESP8266
  EEPROM.begin(EEPROM_BYTES);
  if (EEPROM.read(0) == EEPROM_MAGIC) {
    for (int i = 0; i < 4; i++) {
      for (int j = 0; j < 5; j++) slotTimes[i][j] = (char)EEPROM.read(1 + i * 6 + j);
      slotTimes[i][5] = '\0';
      if (!validTime(slotTimes[i])) {
        static const char *defaults[4] = {"08:00", "13:00", "18:00", "22:00"};
        memcpy(slotTimes[i], defaults[i], 6);
      }
    }
    for (int i = 0; i < 4; ++i) {
      uint32_t day = 0;
      for (int j = 0; j < 4; ++j)
        day |= (uint32_t)EEPROM.read(EEPROM_DAY_BASE + i * 4 + j) << (j * 8);
      lastDispenseDay[i] = day;
    }
    Serial.println(F("[SCHEDULE] Loaded persisted slot times"));
  } else {
    // First boot: write the defaults before any angle/day write can set magic.
    EEPROM.write(0, EEPROM_MAGIC);
    for (int i = 0; i < 4; ++i) {
      for (int j = 0; j < 6; ++j) EEPROM.write(1 + i * 6 + j, slotTimes[i][j]);
      EEPROM.write(EEPROM_ANGLE_BASE + i, (uint8_t)SLOT_ANGLES[i]);
      for (int j = 0; j < 4; ++j) EEPROM.write(EEPROM_DAY_BASE + i * 4 + j, 0xFF);
    }
    if (!EEPROM.commit()) Serial.println(F("[EEPROM] Default schedule persistence failed"));
  }
#endif
}

// ── Calibrated slot angles ────────────────────────────────────────────────
// One byte per slot, clamped on both read and write. A unit flashed before this
// feature existed has EEPROM_MAGIC set but nothing at 25..28, so those bytes read
// as 0xFF; falling back to the factory default for an out-of-range read is what
// keeps an old unit from driving the servo to 180 on every dispense.
void loadSlotAngles() {
  for (int i = 0; i < 4; i++) slotAngles[i] = SLOT_ANGLES[i];
#ifdef ESP8266
  EEPROM.begin(EEPROM_BYTES);
  if (EEPROM.read(0) == EEPROM_MAGIC) {
    for (int i = 0; i < 4; i++) {
      int raw = EEPROM.read(EEPROM_ANGLE_BASE + i);
      if (raw < ayulink::kServoAngleMin || raw > ayulink::kServoAngleMax) continue;  // keep default
      slotAngles[i] = raw;
    }
    Serial.println(F("[SERVO] Loaded calibrated slot angles"));
  }
#endif
}

bool saveSlotAngle(int slot, int angle) {
  if (slot < 1 || slot > 4) return false;
  int clamped = ayulink::servo_clamp_angle(angle);
#ifdef ESP8266
  EEPROM.write(0, EEPROM_MAGIC);
  EEPROM.write(EEPROM_ANGLE_BASE + slot - 1, (uint8_t)clamped);
  if (!EEPROM.commit()) return false;
#endif
  slotAngles[slot - 1] = clamped;
  return true;
}

bool saveSchedule(int slot, const char *timeStr) {
  if (slot < 1 || slot > 4 || !validTime(timeStr)) return false;
#ifdef ESP8266
  EEPROM.write(0, EEPROM_MAGIC);
  for (int i = 0; i < 4; i++) {
    const char *value = (i == slot - 1) ? timeStr : slotTimes[i];
    for (int j = 0; j < 5; j++) EEPROM.write(1 + i * 6 + j, value[j]);
    EEPROM.write(1 + i * 6 + 5, '\0');
  }
  if (!EEPROM.commit()) return false;
#endif
  memcpy(slotTimes[slot - 1], timeStr, 5);
  slotTimes[slot - 1][5] = '\0';
  return true;
}

bool markDispenseDay(int slot, uint32_t day) {
#ifdef ESP8266
  EEPROM.write(0, EEPROM_MAGIC);
  for (int j = 0; j < 4; ++j)
    EEPROM.write(EEPROM_DAY_BASE + (slot - 1) * 4 + j, (day >> (j * 8)) & 0xFF);
  if (!EEPROM.commit()) return false;
#endif
  lastDispenseDay[slot - 1] = day;
  slotTaken[slot - 1] = true;
  return true;
}

// ================================================================
// OLED SETUP
// ================================================================
// Probe the bus for the display instead of assuming it. An I2C ACK is the only
// evidence available that the panel is actually attached and powered.
static bool oledAcks(uint8_t addr) {
  Wire.beginTransmission(addr);
  return Wire.endTransmission() == 0;
}

void setupOLED() {
  if (oledAcks(OLED_ADDR_PRIMARY)) {
    oledAddr = OLED_ADDR_PRIMARY;
  } else if (oledAcks(OLED_ADDR_SECONDARY)) {
    oledAddr = OLED_ADDR_SECONDARY;
  } else {
    oledPresent = false;
    Serial.printf("[OLED] NOT DETECTED at 0x%02X or 0x%02X — "
                  "check VCC/GND and D1=SCL/D2=SDA. Continuing without a display.\n",
                  OLED_ADDR_PRIMARY, OLED_ADDR_SECONDARY);
    return;
  }
  u8g2.setI2CAddress(oledAddr * 2);
  u8g2.begin();
  oledPresent = true;
  Serial.printf("[OLED] ACK at 0x%02X (u8g2 initialised)\n", oledAddr);
}

void updateOLED() {
  // Called every OLED_UPDATE_MS for the life of the device. Without this guard
  // a missing panel means an I2C NACK and a full frame push every second,
  // forever — measurable wasted current and CPU on a node that runs on battery.
  if (!oledPresent) return;

  // ── FULL-SCREEN FLASHING EMERGENCY FIRE SCREEN ────────────
  if (g_flame) {
    u8g2.clearBuffer();
    bool flash = ((millis() / 250) % 2) == 0;
    if (flash) {
      u8g2.drawBox(0, 0, 128, 64);
      u8g2.setDrawColor(0); // Inverted text
    } else {
      u8g2.setDrawColor(1);
    }
    u8g2.setFont(u8g2_font_helvB14_tf);
    u8g2.drawStr(14, 22, "! FIRE !");
    u8g2.setFont(u8g2_font_7x14_tf);
    u8g2.drawStr(4, 42, "FLAME DETECTED");
    u8g2.setFont(u8g2_font_6x10_tf);
    u8g2.drawStr(6, 58, "DISPENSER HUB ALERT");
    u8g2.setDrawColor(1); // restore
    u8g2.sendBuffer();
    return;
  }

  if (dispensing) {
    u8g2.clearBuffer();
    u8g2.setFont(u8g2_font_7x14_tf);
    char label[24];
    snprintf(label, sizeof(label), "Slot %d", dispenseSlot);
    u8g2.drawStr(0, 16, label);
    u8g2.setFont(u8g2_font_6x10_tf);
    u8g2.drawStr(0, 32, SLOT_LABELS[dispenseSlot - 1]);
    u8g2.drawStr(0, 44, "Dispensing...");
    u8g2.sendBuffer();
    return;
  }

  if (notificationActive) {
    if ((uint32_t)(millis() - notificationAtMs) < 10000) {
      u8g2.clearBuffer();
      u8g2.setFont(u8g2_font_6x10_tf);
      u8g2.drawStr(0, 10, ">> NOTIFICATION <<");
      u8g2.drawStr(0, 23, notificationTitle);
      for (int line = 0; line < 3; ++line) {
        const size_t offset = line * 21;
        const size_t len = strlen(notificationMessage);
        if (offset >= len) break;
        char slice[22];
        snprintf(slice, sizeof(slice), "%.*s", 21, notificationMessage + offset);
        u8g2.drawStr(0, 36 + line * 10, slice);
      }
      u8g2.sendBuffer();
      return;
    }
    notificationActive = false;
  }

  u8g2.clearBuffer();
  u8g2.setFont(u8g2_font_6x10_tf);

  char buf[32];
  snprintf(buf, sizeof(buf), "P108 Hub  %s", g_rtcTime.c_str());
  u8g2.drawStr(0, 10, buf);

  if (g_envTemp >= 42.0f) {
    snprintf(buf, sizeof(buf), "T:%.1fC! H:%.0f%% [EMG]", g_envTemp, g_humidity);
  } else if (g_envTemp >= 38.0f) {
    snprintf(buf, sizeof(buf), "T:%.1fC! H:%.0f%% [WRN]", g_envTemp, g_humidity);
  } else {
    snprintf(buf, sizeof(buf), "T:%.1fC  H:%.0f%%", g_envTemp, g_humidity);
  }
  u8g2.drawStr(0, 22, buf);

  snprintf(buf, sizeof(buf), "Air:%dPPM %s", g_airPpm,
           g_flame ? "FIRE!" : g_aqiStr);
  u8g2.drawStr(0, 34, buf);

  int emptiedCount = 0;
  for (int i = 0; i < 4; i++) {
    if (slotTaken[i]) emptiedCount++;
  }
  snprintf(buf, sizeof(buf), "Pills  Emp: %d/4", emptiedCount);
  u8g2.drawStr(0, 46, buf);

  const bool backendFresh = wifiConnected && wsConnected && backendDataSeen &&
      (uint32_t)(millis() - backendDataAtMs) < BACKEND_DATA_FRESH_MS;
  snprintf(buf, sizeof(buf), "Net:%s Time:%s", backendFresh ? "OK" :
           (wsConnected ? "WAIT" : "OFF"), timeValid ? "IST" : "SYNC");
  u8g2.drawStr(0, 58, buf);

  u8g2.sendBuffer();
}

// ================================================================
// BUZZER HELPER — passive buzzer (uses tone/noTone for PWM)
// Frequency 1000 Hz = standard alert tone
// ================================================================
void buzz(int beeps, int ms) {
  if (buzzerState.on) noTone(PIN_BUZZER);
  buzzerState.remaining = beeps > 0 ? beeps : 0;
  buzzerState.onMs = ms > 0 ? ms : 1;
  buzzerState.on = false;
  buzzerState.nextMs = millis();
}

void buzzerTick() {
  if (buzzerState.remaining <= 0) {
    if (buzzerState.on) noTone(PIN_BUZZER);
    buzzerState.on = false;
    return;
  }
  if ((int32_t)(millis() - buzzerState.nextMs) < 0) return;
  if (!buzzerState.on) {
    tone(PIN_BUZZER, 1000);
    buzzerState.on = true;
    buzzerState.nextMs = millis() + buzzerState.onMs;
  } else {
    noTone(PIN_BUZZER);
    buzzerState.on = false;
    buzzerState.remaining--;
    buzzerState.nextMs = millis() + 60;
  }
}

// ================================================================
// AQI CLASSIFIER
// ================================================================
const char *classifyAQI(int ppm) {
  if (ppm < 50)
    return "Good";
  if (ppm < 100)
    return "Moderate";
  if (ppm < 150)
    return "Sensitive";
  if (ppm < 200)
    return "Unhealthy";
  if (ppm < 300)
    return "Very Poor";
  return "Hazardous";
}
