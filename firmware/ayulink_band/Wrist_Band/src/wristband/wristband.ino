/*
 * AyuLink Wristband Firmware  —  v2
 * =============================================================
 * Target: ESP32 DevKit V1
 * Hardware:
 *   - MAX30102 optical PPG (I2C 0x57) with lead-off detection
 *   - MPU6050 6-DoF IMU (I2C 0x68)
 *   - LoRa SX1278 433 MHz
 *   - SH1106 128x64 OLED (I2C 0x3C)
 *   - Tactile SOS button (GPIO33, active-low)
 *   - LM35 analog temperature (GPIO34)
 *   - Buzzer (GPIO27) / LED (GPIO2)
 *   - u-blox NEO-6M GPS on UART2 (GPIO16/17)
 *
 * TelemetryV2 layout remains compatible. The authenticated notice/ACK path
 * and radio scheduling are release fixes; UI v2 remains in place.
 *
 * UI v2
 *   - Boot splash, slide-transition pages, status bar (link, GPS, wear, IMU)
 *   - Vitals page: beating heart, sparkline, SpO2, temp, guidance chips
 *   - Care Hub page, System health page
 *   - SOS hold ring: SOS fires WHILE held (no release needed); ring shows progress
 *   - Emergency screen: flashes until a responder accepts, then calm.
 *     Tells the patient if the gateway actually HEARD the alert.
 *   - Burn-in / power dimming, tap to wake
 *   - Incremental OLED flush: 2 tile rows per loop (~6 ms) so a frame push
 *     never stalls the 50 Hz IMU
 *
 * HONEST LIMITATIONS
 *   - Fall + tremor detection NOT clinically validated.
 *   - SpO2 from a wrist is experimental. Not validated against an oximeter.
 *   - LM35 on skin reads SKIN temperature, not core. Needs a calibration offset.
 *   - Battery % is UNKNOWN (no fuel gauge).
 *   - Legacy JSON hub downlinks are unauthenticated; only authenticated
 *     binary notice frames may display dashboard/paramedic messages.
 *   - No OTA.
 */

#include <Arduino.h>
#include <Wire.h>
#include <SPI.h>
#include <LoRa.h>
#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>
#include <U8g2lib.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <ArduinoJson.h>
#include <TinyGPS++.h>
#include <Preferences.h>
#include "MAX30105.h"
#include "heartRate.h"
#include "spo2_algorithm.h"
#include <esp_task_wdt.h>
#include "../../../common/ayulink_protocol.h"
#include "../../../common/fall_detector.h"
#include "../../../common/tremor_detector.h"
#include "../../../common/ayulink_device_crypto.h"

// ── Hotspot & Station MAC Configuration ──────────────────────────────────
#ifndef AYULINK_WIFI_SSID
#define AYULINK_WIFI_SSID "WiFi"
#endif
#ifndef AYULINK_WIFI_PASS
#define AYULINK_WIFI_PASS "wordpass"
#endif
static const char* WB_WIFI_SSID = AYULINK_WIFI_SSID;
static const char* WB_WIFI_PASS = AYULINK_WIFI_PASS;

static const uint8_t AYULINK_GATEWAY_MAC[6]  = {0x88, 0x13, 0xBF, 0x61, 0xF7, 0x64};
static const uint8_t AYULINK_WRISTBAND_MAC[6] = {0xCC, 0x7B, 0x5C, 0x1E, 0xBA, 0xAC};

// ── Built-in Wireless Non-blocking RX Queue ──────────────────────────────
struct WristbandRxPacket {
  uint8_t data[250];
  size_t len;
  int rssi;
};
static const size_t WB_RX_QUEUE_SIZE = 8;
static WristbandRxPacket wbRxQueue[WB_RX_QUEUE_SIZE];
static volatile size_t wbRxHead = 0;
static volatile size_t wbRxTail = 0;
static unsigned long lastWifiCheckMs = 0;

static void onWirelessDataRecv(const uint8_t *mac_addr, const uint8_t *data, int data_len) {
  if (!data || data_len <= 0 || data_len > 250) return;
  if (memcmp(mac_addr, AYULINK_GATEWAY_MAC, 6) != 0) return; // Verify sender is Gateway
  size_t nextHead = (wbRxHead + 1) % WB_RX_QUEUE_SIZE;
  if (nextHead != wbRxTail) {
    memcpy(wbRxQueue[wbRxHead].data, data, (size_t)data_len);
    wbRxQueue[wbRxHead].len = (size_t)data_len;
    wbRxQueue[wbRxHead].rssi = -55;
    wbRxHead = nextHead;
  }
}


// ── Pins ───────────────────────────────────────────────────────────────────
#define LORA_SCK       18
#define LORA_MISO      19
#define LORA_MOSI      23
#define LORA_NSS        5
#define LORA_RST       14
#define LORA_DIO0      26

#define PIN_SOS        33
#define PIN_LM35       34
#define PIN_ANALOG_PULSE 35
#define PIN_BUZZ       27
#define PIN_LED         2

#define GPS_RX_PIN     16
#define GPS_TX_PIN     17
#define GPS_BAUD       9600

// ── Identity ───────────────────────────────────────────────────────────────
// FIX: patient name removed from firmware (PII baked into a binary, serial
// logs and the screen). The band identifies itself by device ID only.
#define DEVICE_ID      108

#define ANCHOR_LAT     17.162860
#define ANCHOR_LNG     78.658591

// ── Tunables ───────────────────────────────────────────────────────────────
#define ALERT_SHOW_MS              20000
#define FALL_UNACKED_HOLD_MS      120000UL // FIX: fall no longer self-clears at 20 s if nobody answered
#define TX_INTERVAL_NORMAL_MS       2000
#define TX_INTERVAL_EMERGENCY_MS    1200
#define LEAD_OFF_IR_THRESHOLD      15000
#define IMU_SAMPLE_MS                  20
#define SOS_HOLD_MS                 1500
#define SOS_CANCEL_HOLD_MS          2000
#define TREMOR_GYRO_DPS              90.0f
#define TREMOR_WINDOW_MS            1000
#define TREMOR_CROSSINGS_REQUIRED      8   // >= ~4 Hz oscillation
#define VITAL_STALE_MS              8000
#define LINK_OK_MS                 12000   // verified ACK freshness
#define LM35_OFFSET_C               0.0f   // calibrate against a reference thermometer
#define PAGE_CYCLE_MS               4000
#define SLIDE_MS                     220
#define DIM_AFTER_MS               20000UL
#define CONTRAST_ACTIVE              190
#define CONTRAST_DIM                  20
#define CONTRAST_ALERT               255
#define UI_HIST                       48
#define PAGES                          3

#ifndef AYULINK_ANALOG_PULSE
#define AYULINK_ANALOG_PULSE 0
#endif

#ifndef SPO2_WINDOW
#ifdef BUFFER_SIZE
#define SPO2_WINDOW BUFFER_SIZE
#else
#define SPO2_WINDOW 100
#endif
#endif

// ── Hardware handles ───────────────────────────────────────────────────────
U8G2_SH1106_128X64_NONAME_F_HW_I2C u8g2(U8G2_R0, U8X8_PIN_NONE);
Adafruit_MPU6050 mpu;
MAX30105 maxSensor;
HardwareSerial gpsSerial(2);
TinyGPSPlus gps;

// ── State ──────────────────────────────────────────────────────────────────
static char devLabel[8];
bool mpuOk = false;
bool maxSensorOk = false;
bool loraOk = false;

// FIX: double precision. float lat*1e7 lost ~1 m of resolution.
static double gLat = ANCHOR_LAT, gLng = ANCHOR_LNG;
bool isLiveGpsFix = false;
static unsigned long gpsLastCharMs = 0;

float bpm = -1.0f, spo2 = -1.0f, bodyTemp = -1.0f;
bool  worn = false;
long  lastIrValue = 0;
uint8_t sensorStatus = ayulink::SS_UNKNOWN;
uint16_t txSeq = 0;
static uint16_t seqBlockEnd = 0;
static Preferences seqStore;
static bool seqStoreOk = false;

bool sosActive = false, fallActive = false, tremorActive = false;
unsigned long sosTime = 0, fallTime = 0, tremorTime = 0;

bool ambulanceDispatched = false;       // responder ACCEPTED
unsigned long dispatchAckMs = 0;
static bool incidentOn = false;
static unsigned long incidentSince = 0;
static bool incidentHeard = false;      // gateway ACKed after incident began
static uint16_t incidentStartSeq = 0;   // first transmitted alert in this incident
static bool incidentSeqSent = false;

// Link
static unsigned long lastAckMs = 0;
static int linkRssi = -140;
static uint16_t lastAckedSeq = 0;
static uint32_t txCount = 0;
static bool txBusy = false, txPending = false;
static volatile bool txDone = false;
static unsigned long rxSinceMs = 0;
static unsigned long txStartMs = 0, lastTxMs = 0, lastLoraRetryMs = 0;
static const unsigned long TX_TIMEOUT_MS = 3000;
static const unsigned long ACK_WINDOW_MS = 30000; // delayed dispatch/clear still correlates
// On ESP-NOW delivery is instantaneous; 50 ms guard avoids any race with inbound ACKs.
static const unsigned long RX_WINDOW_MS = 50;
static const unsigned long NOTICE_ACK_GUARD_MS = 80;
static uint8_t noticeAck[ayulink::kAckSize];
static bool noticeAckPending = false;
static unsigned long noticeAckAt = 0;
static uint16_t lastNoticeSeq = 0;
static bool noticeSeen = false;
static Preferences noticeStore;
static bool noticeStoreOk = false;
static const uint8_t TX_HISTORY = 16;
static uint16_t sentSeq[TX_HISTORY] = {};
static unsigned long sentAt[TX_HISTORY] = {};
static uint8_t sentHead = 0;

// Hub mirror + toast
char notifMsg[64] = "";
unsigned long notifUntil = 0, notifDur = 9000;
float hubTemp = 0, hubHumidity = 0;
int hubAirPpm = 0;
bool hubFlame = false;
char hubAqi[12] = "---";
bool hubSlot[4] = {false, false, false, false};
bool hubReceived = false;

// PPG pipeline
static uint32_t ppgIrBuf[SPO2_WINDOW], ppgRedBuf[SPO2_WINDOW];
static uint8_t  spoFill = 0, spoSince = 0, decimCnt = 0, offCnt = 0;
static uint32_t decIr = 0, decRed = 0;
static unsigned long lastBeatMs = 0, lastSpo2Ms = 0, lastPpgSampleMs = 0, lastTempMs = 0;
static unsigned long ibi[4]; static uint8_t ibiCnt = 0, ibiIdx = 0;

// IMU
static unsigned long lastImuMs = 0;
static float prevRaw[3] = {0, 0, 0};
static uint16_t sameCnt = 0;
static unsigned long lastMpuRetryMs = 0;
static unsigned long tremWindow = 0;
static uint8_t tremCross[3] = {0, 0, 0};
static int8_t  tremSign[3]  = {0, 0, 0};
static unsigned long lastTremorOscMs = 0;
static float prevMagnitudeG = 1.0f;
static unsigned long lastRapidFallMs = 0;

// Robust fall detection configuration:
// Requires genuine free-fall (<0.50g for >=50ms), impact (>=3.0g within 800ms),
// posture deviation (>65 deg from calibrated rest orientation), and immobility (>=2500ms).
// Eliminates false triggers from clapping, vigorous shaking, desk drops, and normal walking.
static ayulink::FallConfig fallCfg = [] {
  ayulink::FallConfig c;
  c.freefall_g = 0.50f;
  c.freefall_ms = 50;
  c.impact_g = 3.00f;
  c.impact_window_ms = 800;
  c.tilt_deg = 65.0f;
  c.tilt_ms = 250;
  c.immobility_ms = 2500;
  c.cancel_window_ms = 4000;
  c.inertial_ms = 6000;
  return c;
}();
static ayulink::FallDetector fallDetector(fallCfg);
static ayulink::TremorDetector tremorDetector;

// Button / UI
static unsigned long uiHoldMs = 0;       // >0 while a hold is in progress
static bool uiHoldCancel = false;
static unsigned long lastActivity = 0;
static int curContrast = -1;
static uint8_t page = 0, prevPage = 0;
static bool sliding = false;
static unsigned long slideStart = 0, lastPageMs = 0, lastDraw = 0;
static int flushRow = 8;                 // 8 = idle
static int16_t hrHist[UI_HIST]; static uint8_t hrHistN = 0;
static unsigned long lastHistMs = 0;
static const char *PAGE_TITLES[PAGES] = {"VITALS", "CARE HUB", "SYSTEM"};

// ── Buzzer ─────────────────────────────────────────────────────────────────
struct BuzzerNB {
  int remaining = 0, onMs = 100, offMs = 60;
  bool buzzing = false;
  unsigned long nextMs = 0;
} bzNB;

void buzzerTick() {
  if (bzNB.remaining <= 0) { noTone(PIN_BUZZ); digitalWrite(PIN_BUZZ, LOW); return; }
  if (millis() < bzNB.nextMs) return;
  if (!bzNB.buzzing) {
    tone(PIN_BUZZ, 1000);
    bzNB.buzzing = true;
    bzNB.nextMs = millis() + bzNB.onMs;
  } else {
    noTone(PIN_BUZZ); digitalWrite(PIN_BUZZ, LOW);
    bzNB.buzzing = false;
    bzNB.remaining--;
    bzNB.nextMs = millis() + (bzNB.remaining > 0 ? bzNB.offMs : 0);
  }
}
void beepNB(int n, int onMs = 100, int offMs = 60) {
  bzNB.remaining = n; bzNB.onMs = onMs; bzNB.offMs = offMs;
  bzNB.buzzing = false; bzNB.nextMs = 0;
}
void beepBlocking(int n, int ms = 100) {
  for (int i = 0; i < n; i++) {
    tone(PIN_BUZZ, 1000); delay(ms);
    noTone(PIN_BUZZ); digitalWrite(PIN_BUZZ, LOW);
    if (i < n - 1) delay(60);
    esp_task_wdt_reset();
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────
static inline bool anyAlert() { return sosActive || fallActive || tremorActive; }
static void uiWake() { lastActivity = millis(); }
static bool toastActive() { return notifMsg[0] && millis() < notifUntil; }

static void showToast(const char *msg, unsigned long ms) {
  strncpy(notifMsg, msg, sizeof(notifMsg) - 1);
  notifMsg[sizeof(notifMsg) - 1] = '\0';
  notifDur = ms;
  notifUntil = millis() + ms;
  uiWake();
}

static void gotoPage(uint8_t p) {
  p %= PAGES;
  if (p == page) return;
  prevPage = page; page = p;
  slideStart = millis(); sliding = true;
}

static bool cancelPending = false;
static uint8_t cancelEventType = ayulink::EV_FALL_CANCEL;

static void cancelAll(const char *why) {
  uint8_t ev = ayulink::EV_FALL_CANCEL;
  if (sosActive) {
    ev = ayulink::EV_SOS_CANCEL;
    sosActive = false;
  } else if (fallActive) {
    ev = ayulink::EV_FALL_CANCEL;
    fallActive = false;
    fallDetector.cancel();
  } else if (tremorActive) {
    tremorActive = false;
    tremorDetector.reset();
  }
  if (!sosActive && !fallActive && !tremorActive) {
    ambulanceDispatched = false;
  }
  cancelPending = true;
  cancelEventType = ev;
  beepNB(1, 50);
  sendVitals();
  Serial.printf("[ALERT] cancelled (%s, ev=%d)\n", why, ev);
}

static void triggerSOS(const char *src) {
  if (sosActive) return;
  sosActive = true; sosTime = millis();
  beepNB(3, 200);
  Serial.printf("[W1-SOS-DETECTED] SOS triggered via %s at t=%lu ms\n", src, sosTime);
  sendVitals();
  Serial.printf("[SOS] *** EMERGENCY ACTIVATED (%s) ***\n", src);
}

// ── PPG ────────────────────────────────────────────────────────────────────
#if !AYULINK_ANALOG_PULSE
static inline void ppgPoll() {
  // FIX: SparkFun's FIFO is only filled by check(). The old code never called
  // it directly and relied on getIR()'s blocking safeCheck (up to 250 ms stall
  // per call), which tied the whole loop to the PPG rate.
  maxSensor.check();
}
static inline bool ppgPop(uint32_t &ir, uint32_t &red) {
  if (!maxSensor.available()) return false;
  ir  = maxSensor.getFIFOIR();     // FIX: oldest sample (tail), not newest (head)
  red = maxSensor.getFIFORed();
  maxSensor.nextSample();
  return true;
}
#endif

static void ppgResetAlgo() {
  spoFill = spoSince = decimCnt = 0;
  decIr = decRed = 0;
  ibiCnt = ibiIdx = 0;
  lastBeatMs = 0;
  bpm = -1.0f; spo2 = -1.0f; bodyTemp = -1.0f;
}

static void registerBeat(unsigned long now) {
  if (lastBeatMs) {
    unsigned long d = now - lastBeatMs;
    if (d <= 300) return;                       // double detection
    if (d < 1500) {                             // 40..200 bpm
      ibi[ibiIdx] = d; ibiIdx = (ibiIdx + 1) & 3;
      if (ibiCnt < 4) ibiCnt++;
      if (ibiCnt >= 3) {
        unsigned long s = 0;
        for (uint8_t i = 0; i < ibiCnt; i++) s += ibi[i];
        bpm = 60000.0f / ((float)s / ibiCnt);
      }
    } else {
      ibiCnt = 0; ibiIdx = 0;                   // long gap: restart averaging
    }
  }
  lastBeatMs = now;
}

#if !AYULINK_ANALOG_PULSE
static void ppgProcessSample(uint32_t ir, uint32_t red, unsigned long now) {
  lastPpgSampleMs = now;
  lastIrValue = (long)ir;

  if (ir < LEAD_OFF_IR_THRESHOLD) { if (offCnt < 255) offCnt++; } else offCnt = 0;
  bool nowWorn = offCnt < 25;                   // 250 ms @100 sps hysteresis
  if (!nowWorn) {
    if (worn) ppgResetAlgo();                   // lost contact: drop all history
    worn = false;
    return;
  }
  worn = true;
  if (offCnt > 0) return;                       // momentary dip: do not feed algorithms

  // FIX: beat detection was called every LOOP with the same cached sample.
  // It must see each sample exactly once, at the sensor rate (100 sps).
  if (checkForBeat((long)ir)) registerBeat(now);

  // SpO2: decimate 100 sps -> 25 sps by averaging 4, sliding 4 s window.
  decIr += ir; decRed += red;
  if (++decimCnt >= 4) {
    uint32_t i4 = decIr / 4, r4 = decRed / 4;
    decIr = decRed = 0; decimCnt = 0;
    if (spoFill < SPO2_WINDOW) {
      ppgIrBuf[spoFill] = i4; ppgRedBuf[spoFill] = r4; spoFill++;
    } else {
      memmove(ppgIrBuf,  ppgIrBuf  + 1, (SPO2_WINDOW - 1) * sizeof(uint32_t));
      memmove(ppgRedBuf, ppgRedBuf + 1, (SPO2_WINDOW - 1) * sizeof(uint32_t));
      ppgIrBuf[SPO2_WINDOW - 1] = i4; ppgRedBuf[SPO2_WINDOW - 1] = r4;
    }
    if (spoFill >= SPO2_WINDOW && ++spoSince >= 25) {   // recompute ~1 Hz
      spoSince = 0;
      int32_t s = 0, h = 0; int8_t sv = 0, hv = 0;
      maxim_heart_rate_and_oxygen_saturation(ppgIrBuf, SPO2_WINDOW, ppgRedBuf,
                                             &s, &sv, &h, &hv);
      if (sv && s > 50 && s <= 100) {
        spo2 = (spo2 < 0.0f) ? (float)s : spo2 + ((float)s - spo2) * 0.3f;
        lastSpo2Ms = now;
      }
      if (hv && h >= 40 && h <= 200 && bpm < 0.0f) {
        bpm = (float)h;
      }
    }
  }
}
#endif

#if AYULINK_ANALOG_PULSE
// FIX: the old analog profile hard-coded bpm=72, spo2=98 "worn=true". That is
// exactly the fake-healthy-vitals failure the header says the firmware never
// commits. Replaced with a real (experimental) beat detector. SpO2 = INVALID.
static void analogPulseService(unsigned long now) {
  static unsigned long lastS = 0;
  static float base = 2000, amp = 0;
  static bool high = false;
  if (now - lastS < 10) return;
  lastS = now;
  int v = analogRead(PIN_ANALOG_PULSE);
  base += ((float)v - base) * 0.02f;
  float d = (float)v - base;
  amp += (fabsf(d) - amp) * 0.02f;
  lastPpgSampleMs = now;
  bool contact = amp > 25.0f;
  if (!contact) { if (worn) ppgResetAlgo(); worn = false; return; }
  worn = true;
  if (!high && d > 0.6f * amp + 15.0f) { high = true; registerBeat(now); }
  if (d < 0) high = false;
}
#endif

static void tempTick(unsigned long now) {
  if (now - lastTempMs < 500) return;
  lastTempMs = now;
  if (!worn) { bodyTemp = -1.0f; return; }
  uint32_t mv = 0;
  for (int i = 0; i < 8; i++) mv += (uint32_t)analogReadMilliVolts(PIN_LM35);
  float t = (mv / 8.0f) / 10.0f + LM35_OFFSET_C;    // 10 mV / degC
  if (t >= 20.0f && t <= 45.0f) {
    bodyTemp = (bodyTemp < 0.0f) ? t : bodyTemp * 0.8f + t * 0.2f;
  } else {
#if !AYULINK_ANALOG_PULSE
    if (maxSensorOk) {
      float mt = maxSensor.readTemperature();
      if (mt >= 20.0f && mt <= 45.0f) {
        bodyTemp = (bodyTemp < 0.0f) ? mt : bodyTemp * 0.8f + mt * 0.2f;
        return;
      }
    }
#endif
    bodyTemp = -1.0f;
  }
}

static void vitalsService(unsigned long now) {
#if AYULINK_ANALOG_PULSE
  analogPulseService(now);
  sensorStatus = worn ? ayulink::SS_OK : ayulink::SS_LEAD_OFF;
#else
  if (!maxSensorOk) {
    worn = false; bpm = spo2 = bodyTemp = -1.0f;
    sensorStatus = ayulink::SS_FAULT;
    return;
  }
  ppgPoll();
  uint32_t ir, red;
  int guard = 0;
  while (guard++ < 32 && ppgPop(ir, red)) ppgProcessSample(ir, red, now);

  if (now - lastPpgSampleMs > 1500) {           // sensor stopped producing samples
    if (worn) ppgResetAlgo();
    worn = false;
    sensorStatus = ayulink::SS_FAULT;
  } else if (!worn) sensorStatus = ayulink::SS_LEAD_OFF;
  else              sensorStatus = ayulink::SS_OK;
#endif
  // FIX: stale values used to linger or flicker. Age them out explicitly.
  if (bpm  > 0.0f && now - lastBeatMs  > VITAL_STALE_MS) bpm  = -1.0f;
  if (spo2 > 0.0f && now - lastSpo2Ms  > VITAL_STALE_MS) spo2 = -1.0f;
  tempTick(now);

  if (bpm > 0.0f && now - lastHistMs >= 1000) {
    lastHistMs = now;
    if (hrHistN < UI_HIST) hrHist[hrHistN++] = (int16_t)bpm;
    else { memmove(hrHist, hrHist + 1, (UI_HIST - 1) * sizeof(int16_t)); hrHist[UI_HIST - 1] = (int16_t)bpm; }
  }
}

// ── IMU: fall + tremor ─────────────────────────────────────────────────────
static void tremorFeed(float gx, float gy, float gz, unsigned long now) {
  bool confirmed = tremorDetector.update(gx, gy, gz, (uint32_t)now);
  if (confirmed && !tremorActive) {
    tremorActive = true;
    tremorTime = now;
    beepNB(3, 120, 60);
    sendVitals();
    Serial.println(F("[TREMOR] rhythmic oscillation confirmed (>=4 Hz)"));
  } else if (tremorActive && !tremorDetector.active()) {
    tremorActive = false;
    sendVitals();
    Serial.println(F("[TREMOR] oscillation subsided — alert cleared"));
  }
}

static void imuService(unsigned long now) {
  if (!mpuOk) return;
  // FIX: IMU was read on every loop pass while the state machine was told dt
  // was a fixed 20 ms. Real dt varied with OLED/LoRa time. Now: fixed cadence
  // gate, and the measured dt is what the detector receives.
  if (now - lastImuMs < IMU_SAMPLE_MS) return;
  uint32_t dt = lastImuMs ? (uint32_t)(now - lastImuMs) : IMU_SAMPLE_MS;
  lastImuMs = now;
  if (dt > 100) dt = IMU_SAMPLE_MS;               // after a long stall, do not integrate it

  sensors_event_t a_, g_, t_;
  if (!mpu.getEvent(&a_, &g_, &t_)) { mpuOk = false; return; }

  float ax = a_.acceleration.x / 9.80665f;
  float ay = a_.acceleration.y / 9.80665f;
  float az = a_.acceleration.z / 9.80665f;

  // FIX: a dead I2C bus returns frozen data and fall detection silently dies.
  if (isnan(ax) || (ax == prevRaw[0] && ay == prevRaw[1] && az == prevRaw[2])) {
    if (++sameCnt >= 150) {                       // 3 s of bit-identical samples
      mpuOk = false; sameCnt = 0;
      Serial.println(F("[MPU6050] frozen data -> marked FAULT, will retry"));
      return;
    }
  } else sameCnt = 0;
  prevRaw[0] = ax; prevRaw[1] = ay; prevRaw[2] = az;

  const float R2D = 57.29578f;
  tremorFeed(g_.gyro.x * R2D, g_.gyro.y * R2D, g_.gyro.z * R2D, now);

  const float totalG = sqrtf(ax * ax + ay * ay + az * az);
  const float magnitudeJump = fabsf(totalG - prevMagnitudeG);
  prevMagnitudeG = totalG;

  bool confirmedFall = fallDetector.update(ax, ay, az, dt);
  // A high-g sample alone is not a fall. The calibrated state machine requires
  // a 30 ms free-fall below 0.65 g followed by >2.2 g within 900 ms, >55 deg
  // posture change for 180 ms and 1200 ms stillness, or a 3 s inertial path.
  // A single 2.2 g wrist bump is not a confirmed fall. Confirmation stays
  // behind calibrated orientation + immobility (see FallConfig above).
  if (confirmedFall) {
    lastRapidFallMs = now;
    fallActive = true; fallTime = now;
    beepNB(4, 150);
    sendVitals();
    Serial.printf("[FALL] state machine CONFIRMED g=%.2f jump=%.2f\n", totalG, magnitudeJump);
  }
}

static void mpuRecover(unsigned long now) {
  if (mpuOk || now - lastMpuRetryMs < 10000) return;
  lastMpuRetryMs = now;
  if (mpu.begin()) {
    mpuOk = true;
    fallDetector.reset(); fallDetector.recalibrate();
    mpu.setAccelerometerRange(MPU6050_RANGE_4_G);
    mpu.setGyroRange(MPU6050_RANGE_500_DEG);
    mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);
    Serial.println(F("[MPU6050] RECOVERED"));
  }
}

// ── SOS button ─────────────────────────────────────────────────────────────
// Deliberate hold-to-activate: SOS requires a sustained 1500 ms hold with
// visual progress ring. Cancel requires a 2000 ms hold while alert is active.
// Short taps (<600 ms) cycle pages or wake display; no accidental emergency.
static void checkSOS(unsigned long now) {
  static int lastRead = HIGH, stable = HIGH;
  static unsigned long dbAt = 0, downAt = 0;
  static bool holdFired = false, activeAtPress = false, wasDim = false;

  // Boot transient guard: ignore button during first 1200 ms while GPIO pullups settle
  if (now < 1200) {
    lastRead = digitalRead(PIN_SOS);
    stable = lastRead;
    return;
  }

  int r = digitalRead(PIN_SOS);
  if (r != lastRead) { dbAt = now; lastRead = r; }
  if (now - dbAt > 35 && r != stable) {
    stable = r;
    if (stable == LOW) {                          // press
      downAt = now; holdFired = false;
      activeAtPress = anyAlert();
      wasDim = (now - lastActivity > DIM_AFTER_MS);
      uiWake();
    } else {                                      // release
      unsigned long held = now - downAt;
      uiHoldMs = 0;
      if (!holdFired && !activeAtPress && held >= 50 && held < 600) {
        if (!wasDim) gotoPage(page + 1);          // short tap: wake or next page
      }
      holdFired = false;
    }
  }

  if (stable == LOW && !holdFired) {
    unsigned long held = now - downAt;
    uiHoldMs = held;
    uiHoldCancel = activeAtPress;
    if (activeAtPress) {
      if (held >= SOS_CANCEL_HOLD_MS) {
        holdFired = true;
        uiHoldMs = 0;
        cancelAll("button hold");
      }
    } else if (held >= SOS_HOLD_MS) {
      holdFired = true;
      uiHoldMs = 0;
      Serial.printf("[W1-SOS-BUTTON] Physical button held >= %ums (held=%lums)\n", SOS_HOLD_MS, held);
      triggerSOS("hold");
    }
  } else if (stable == HIGH) {
    uiHoldMs = 0;
  }
}

// ── Alert lifecycle ────────────────────────────────────────────────────────
static void alertTick(unsigned long now) {
  bool any = anyAlert();
  if (any && !incidentOn) { incidentOn = true; incidentSince = now; incidentHeard = false; incidentSeqSent = false; uiWake(); }
  if (!any && incidentOn) { incidentOn = false; ambulanceDispatched = false; incidentHeard = false; incidentSeqSent = false; }
  if (any) uiWake();

  if (tremorActive && (!tremorDetector.active() || now - tremorTime > ALERT_SHOW_MS)) {
    tremorActive = false;
    tremorDetector.reset();
    sendVitals();
    Serial.println(F("[SEIZURE] episode subsided — alert cleared"));
  }
  if (fallActive) {
    // FIX: a fall alert silently vanished 20 s after the fall even if no
    // responder ever accepted. Hold it until accepted (+20 s) or 2 min.
    unsigned long limit = ambulanceDispatched ? dispatchAckMs + ALERT_SHOW_MS
                                              : fallTime + FALL_UNACKED_HOLD_MS;
    if (now > limit) { fallActive = false; Serial.println(F("[FALL] alert window elapsed")); }
  }
}

// ── GPS ────────────────────────────────────────────────────────────────────
static void processGpsStream(unsigned long now) {
  while (gpsSerial.available() > 0) { gps.encode(gpsSerial.read()); gpsLastCharMs = now; }
  if (gps.location.isValid() && gps.location.age() < 3500 &&
      gps.satellites.isValid() && gps.satellites.age() < 3500 && gps.satellites.value() >= 4) {
    gLat = gps.location.lat(); gLng = gps.location.lng();
    isLiveGpsFix = true;
  } else {
    gLat = ANCHOR_LAT; gLng = ANCHOR_LNG;
    isLiveGpsFix = false;
  }
}

// ── Built-in Wireless Radio ───────────────────────────────────────────────
static void onLoRaTxDone() { txDone = true; } // LoRa.onTxDone(onLoRaTxDone)
static void onWirelessDataSent(const uint8_t *mac_addr, esp_now_send_status_t status) {
  txDone = true;
  Serial.printf("[W4-ESPNOW-SENT] Status: %s (%d) | Peer: %02X:%02X:%02X:%02X:%02X:%02X | Channel: %u\n",
                (status == ESP_NOW_SEND_SUCCESS ? "SUCCESS" : "FAIL"), (int)status,
                mac_addr ? mac_addr[0] : 0, mac_addr ? mac_addr[1] : 0,
                mac_addr ? mac_addr[2] : 0, mac_addr ? mac_addr[3] : 0,
                mac_addr ? mac_addr[4] : 0, mac_addr ? mac_addr[5] : 0,
                WiFi.channel());
}

static bool loraInit() {
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.setSleep(false); // Disable modem sleep to prevent radio latency / deafness

  // Lock initial channel to Gateway channel (11) before association
  esp_wifi_set_channel(11, WIFI_SECOND_CHAN_NONE);

  if (esp_now_init() != ESP_OK) {
    Serial.println(F("[WIRELESS] Built-in radio init failed"));
    return false;
  }

  esp_now_register_recv_cb(onWirelessDataRecv);
  esp_now_register_send_cb(onWirelessDataSent);

  esp_now_peer_info_t peerInfo = {};
  memcpy(peerInfo.peer_addr, AYULINK_GATEWAY_MAC, 6);
  peerInfo.channel = 0; // Use current interface channel (aligned with hotspot)
  peerInfo.ifidx = WIFI_IF_STA;
  peerInfo.encrypt = false;

  if (esp_now_is_peer_exist(AYULINK_GATEWAY_MAC)) {
    esp_now_del_peer(AYULINK_GATEWAY_MAC);
  }
  if (esp_now_add_peer(&peerInfo) != ESP_OK) {
    Serial.println(F("[WIRELESS] Failed to register Gateway peer"));
    return false;
  }

  WiFi.begin(WB_WIFI_SSID, WB_WIFI_PASS);

  rxSinceMs = millis();
  Serial.printf("[WIRELESS] Online — Built-in ESP32 Radio. STA MAC: %s | Gateway MAC: %02X:%02X:%02X:%02X:%02X:%02X (Hotspot: %s, Ch: %u)\n",
                WiFi.macAddress().c_str(),
                AYULINK_GATEWAY_MAC[0], AYULINK_GATEWAY_MAC[1], AYULINK_GATEWAY_MAC[2],
                AYULINK_GATEWAY_MAC[3], AYULINK_GATEWAY_MAC[4], AYULINK_GATEWAY_MAC[5],
                WB_WIFI_SSID, WiFi.channel());
  return true;
}

static bool recentlySent(uint16_t seq, unsigned long now) {
  for (uint8_t i = 0; i < TX_HISTORY; i++) {
    if (sentAt[i] && sentSeq[i] == seq && now - sentAt[i] <= ACK_WINDOW_MS) return true;
  }
  return false;
}

static uint8_t emergencyTxCount = 0;

static unsigned long getEmergencyInterval() {
  if (incidentHeard) return 2000; // Gateway has acknowledged: relaxed cadence
  switch (emergencyTxCount) {
    case 0: return 0;
    case 1: return 200;
    case 2: return 400;
    case 3: return 700;
    case 4: return 1000;
    default: return 1200;
  }
}

void sendVitals() {
  if (!loraOk || !seqStoreOk) return;
  bool isEmergency = sosActive || fallActive || tremorActive || cancelPending;
  if (txBusy || noticeAckPending) { txPending = true; return; }
  // Never cut short the bounded downlink window, except for emergency or cancellation.
  if (!isEmergency && rxSinceMs && millis() - rxSinceMs < RX_WINDOW_MS) { txPending = true; return; }
  if (txSeq == seqBlockEnd) {
    // Reserve 256 sequence numbers atomically before use. A reboot skips the
    // unused tail rather than replaying seq=0, without an NVS write every 2 s.
    uint16_t next = (uint16_t)(seqBlockEnd + 256);
    if (seqStore.putUShort("next", next) != sizeof(uint16_t)) {
      Serial.println(F("[TX] sequence checkpoint failed; radio uplink paused"));
      return;
    }
    seqBlockEnd = next;
  }

  ayulink::TelemetryV2 m;
  memset(&m, 0, sizeof(m));
  m.magic     = ayulink::kProtoMagic;
  m.version   = ayulink::kProtoVersion;
  m.device_id = DEVICE_ID;
  m.seq       = txSeq++;
  m.event     = cancelPending ? cancelEventType
               : (sosActive ? ayulink::EV_SOS
               : (fallActive ? ayulink::EV_FALL_CONFIRM
               : (tremorActive ? ayulink::EV_TREMOR
               : (sensorStatus == ayulink::SS_FAULT ? ayulink::EV_SENSOR_FAULT : ayulink::EV_NORMAL))));
  cancelPending = false;
  m.flags     = (sosActive ? ayulink::FLAG_SOS : 0) |
                 (fallActive ? ayulink::FLAG_FALL : 0) |
                 (tremorActive ? ayulink::FLAG_TREMOR : 0) |
                 (sensorStatus == ayulink::SS_FAULT ? ayulink::FLAG_SENSOR_FAULT : 0);
  if (isLiveGpsFix) m.flags |= ayulink::FLAG_GPS_LIVE;
  m.batt_pct      = 255;
  m.sensor_status = sensorStatus;
  m.uptime_s      = (uint16_t)((millis() / 1000UL) & 0xFFFF);

  m.hr_bpm_x2   = (bpm  > 0.0f) ? (uint16_t)(bpm  * 2.0f) : ayulink::kHrInvalid;
  m.spo2_pct_x2 = (spo2 > 0.0f) ? (uint16_t)(spo2 * 2.0f) : ayulink::kSpo2Invalid;
  m.temp_c_x10  = (bodyTemp > 0.0f) ? (int16_t)(bodyTemp * 10.0f) : ayulink::kTempInvalid;

  // The configured anchor remains numeric in every non-GPS packet. GPS is
  // signalled only for a fresh location AND fresh satellite count above.
  m.lat_e7 = (int32_t)(gLat * 1e7);
  m.lng_e7 = (int32_t)(gLng * 1e7);

  uint8_t frame[ayulink::kTelemetrySize];
  if (!ayulink::encode_telemetry(m, frame, ayulink::kDevicePsk, sizeof(ayulink::kDevicePsk),
                                 ayulink::device_hmac_cb)) {
    Serial.println(F("[TX] encode failed"));
    return;
  }
  if (m.event != ayulink::EV_NORMAL) {
    Serial.printf("[W2-EVENT-CREATED] TelemetryV2 ev=%u seq=%u flags=0x%02X dev=%u\n",
                  m.event, m.seq, m.flags, m.device_id);
    Serial.printf("[W3-ESPNOW-SEND] Sending seq=%u ev=%u to GW %02X:%02X:%02X:%02X:%02X:%02X on Ch %u (WiFi status=%d)\n",
                  m.seq, m.event,
                  AYULINK_GATEWAY_MAC[0], AYULINK_GATEWAY_MAC[1], AYULINK_GATEWAY_MAC[2],
                  AYULINK_GATEWAY_MAC[3], AYULINK_GATEWAY_MAC[4], AYULINK_GATEWAY_MAC[5],
                  WiFi.channel(), WiFi.status());
  }
  txDone = false;
  txBusy = true;
  txPending = false;
  txStartMs = lastTxMs = millis();
  esp_err_t err = esp_now_send(AYULINK_GATEWAY_MAC, frame, sizeof(frame));
  if (err != ESP_OK) {
    txDone = true;
    Serial.printf("[TX] esp_now_send error: %d\n", err);
  }
  sentSeq[sentHead] = m.seq;
  sentAt[sentHead] = txStartMs;
  sentHead = (sentHead + 1) % TX_HISTORY;
  if (anyAlert() && !incidentOn) {
    incidentOn = true; incidentSince = txStartMs;
    incidentHeard = false; ambulanceDispatched = false;
    incidentSeqSent = false; uiWake();
  }
  if (anyAlert() && !incidentSeqSent) { incidentStartSeq = m.seq; incidentSeqSent = true; }
  txCount++;
  if (anyAlert()) emergencyTxCount++;
  else emergencyTxCount = 0;

  if (m.event != ayulink::EV_NORMAL)
    Serial.printf("[TX] ev=%u seq=%u ss=%u tx_cnt=%u heard=%d\n",
                  m.event, m.seq, m.sensor_status, emergencyTxCount, incidentHeard);
}

static void txService(unsigned long now) {
  if (txBusy) {
    if (txDone) {
      txDone = false;
      txBusy = false;
      rxSinceMs = millis();
    } else if (now - txStartMs > TX_TIMEOUT_MS) {
      txBusy = false; txDone = false; loraOk = false;
      Serial.println(F("[WIRELESS] TX timeout"));
    }
  }
  if (loraOk && !txBusy && noticeAckPending &&
      (int32_t)(millis() - noticeAckAt) >= 0) {
    txDone = false;
    txBusy = true;
    txStartMs = millis();
    noticeAckPending = false;
    esp_now_send(AYULINK_GATEWAY_MAC, noticeAck, sizeof(noticeAck));
    return;
  }
  if (!loraOk || txBusy || millis() - rxSinceMs < RX_WINDOW_MS) return;

  unsigned long iv;
  if (anyAlert()) {
    iv = getEmergencyInterval();
    // Multi-channel agility: if unacknowledged after 2 rapid transmits and WiFi not associated
    if (!incidentHeard && emergencyTxCount >= 2 && WiFi.status() != WL_CONNECTED && (now - lastTxMs >= iv)) {
      static const uint8_t CHANNELS[] = {1, 6, 11};
      static uint8_t chIdx = 0;
      chIdx = (chIdx + 1) % 3;
      esp_wifi_set_channel(CHANNELS[chIdx], WIFI_SECOND_CHAN_NONE);
      Serial.printf("[CHANNEL] Rotating WiFi channel to %u for unacknowledged emergency\n", CHANNELS[chIdx]);
    }
  } else {
    iv = TX_INTERVAL_NORMAL_MS;
    emergencyTxCount = 0;
  }

  if (txPending || now - lastTxMs >= iv) sendVitals();

  // Ensure hotspot connection is maintained without channel hopping
  if (WiFi.status() != WL_CONNECTED && (now - lastWifiCheckMs >= 10000)) {
    lastWifiCheckMs = now;
    WiFi.reconnect();
  }
}

static void checkLoRaRX(unsigned long now) {
  if (wbRxTail == wbRxHead) return;
  WristbandRxPacket pkt = wbRxQueue[wbRxTail];
  wbRxTail = (wbRxTail + 1) % WB_RX_QUEUE_SIZE;

  uint8_t *buf = pkt.data;
  size_t got = pkt.len;
  int rssi = pkt.rssi;

  if (got == ayulink::kAckSize) {
    if (ayulink::verify_ack(buf, got, ayulink::kDevicePsk, sizeof(ayulink::kDevicePsk),
                            ayulink::device_hmac_cb)) {
      ayulink::AckV2 a;
      ayulink::decode_ack(buf, &a);
      if (a.device_id != DEVICE_ID || !recentlySent(a.seq, now)) return;

      lastAckMs = now; linkRssi = rssi; lastAckedSeq = a.seq;
       // The backend may acknowledge a later alert frame; the first sequence
       // has aged out by then. Any recently sent frame carrying this still-
       // active incident is a valid correlation, but never a pre-incident frame.
       bool ackForIncident = anyAlert() && incidentOn && incidentSeqSent &&
                             (int16_t)(a.seq - incidentStartSeq) >= 0;
       if (ackForIncident && a.ack_type == ayulink::ACK_TELEMETRY_RX) {
         incidentHeard = true;
         emergencyTxCount = 0;
       }

       if (a.ack_type == ayulink::ACK_DISPATCH) {
         if (ackForIncident) {
           incidentHeard = true;
           emergencyTxCount = 0;
          ambulanceDispatched = true; dispatchAckMs = now;
          beepNB(3, 100, 40);
          uiWake();
          Serial.printf("[ACK] responder accepted seq=%u\n", a.seq);
        }
       } else if (a.ack_type == ayulink::ACK_CLEAR) {
        if (!ackForIncident) return;
        sosActive = fallActive = tremorActive = false;
        emergencyTxCount = 0;
        ambulanceDispatched = false;
        fallDetector.cancel();
        memset(tremCross, 0, sizeof(tremCross));
        notifMsg[0] = '\0'; notifUntil = 0;
        gotoPage(0);
        Serial.println(F("[ACK] incident cleared"));
      } else if (a.ack_type == ayulink::ACK_FALL_CANCEL) {
        if (ackForIncident) {
          fallActive = false;
          fallDetector.cancel();
          if (!sosActive && !tremorActive) ambulanceDispatched = false;
        }
      } else if (a.ack_type == ayulink::ACK_SOS_CANCEL) {
        if (ackForIncident) {
          sosActive = false;
          if (!fallActive && !tremorActive) ambulanceDispatched = false;
        }
      }
      return;
    }
    Serial.println(F("[ACK] tag invalid, dropped"));
    return;
  }

  if (got >= ayulink::kNoticeHeader + 1 + ayulink::kTagBytes &&
      buf[0] == ayulink::kNoticeMagic) {
    if (!ayulink::verify_notice(buf, got, ayulink::kDevicePsk,
                                 sizeof(ayulink::kDevicePsk), ayulink::device_hmac_cb)) return;
    uint16_t target = (uint16_t)buf[2] | (uint16_t)buf[3] << 8;
    uint16_t seq = (uint16_t)buf[4] | (uint16_t)buf[5] << 8;
    if (target != DEVICE_ID) return;
    // Retries are idempotent. Older delayed frames must never overwrite the
    // current notice. ACK a duplicate again if the first ACK was lost.
    if (!noticeSeen || ayulink::SeqWindow::newer(seq, lastNoticeSeq)) {
      // Persist the high-water mark before rendering. A captured authenticated
      // notice cannot be replayed after a wristband power cycle.
      if (!noticeStoreOk || noticeStore.putUShort("seq", seq) != sizeof(uint16_t)) return;
      char text[ayulink::kNoticeTextMax + 1];
      memcpy(text, buf + ayulink::kNoticeHeader, buf[6]); text[buf[6]] = '\0';
      showToast(text, 9000); beepNB(2, 120);
      lastNoticeSeq = seq; noticeSeen = true;
      Serial.printf("[NOTICE] displayed seq=%u\n", seq);
    } else if (seq != lastNoticeSeq) return;
    if (ayulink::encode_ack(DEVICE_ID, seq, ayulink::ACK_NOTIFICATION, 0,
                             noticeAck, ayulink::kDevicePsk, sizeof(ayulink::kDevicePsk),
                             ayulink::device_hmac_cb)) {
      noticeAckPending = true;
      noticeAckAt = millis() + NOTICE_ACK_GUARD_MS;
    }
    return;
  }

  // Legacy JSON downlink (UNAUTHENTICATED).
  if (got < 2 || buf[0] != '{' || got >= sizeof(buf)) return;
  buf[got] = '\0';

  StaticJsonDocument<192> doc;
  if (deserializeJson(doc, (const char *)buf)) return;
  const char *cmd  = doc["cmd"] | "";
  const char *type = doc["type"] | "";

  if (type[0] == 'h') {
    hubTemp = doc["t"] | hubTemp;
    hubHumidity = doc["h"] | hubHumidity;
    hubAirPpm = doc["a"] | hubAirPpm;
    bool wasFlame = hubFlame;
    hubFlame = doc["f"] | hubFlame;
    const char *aq = doc["q"] | hubAqi;
    strncpy(hubAqi, aq, sizeof(hubAqi) - 1);
    hubAqi[sizeof(hubAqi) - 1] = '\0';
    for (int i = 0; i < 4; i++) {
      char key[4]; snprintf(key, sizeof(key), "s%d", i + 1);
      if (doc[key].is<int>()) hubSlot[i] = (doc[key] == 1);
    }
    hubReceived = true;
    if (hubFlame && !wasFlame) {                  // FIX: re-beeped on every hub packet while flame stayed true
      beepNB(5, 150);
      showToast("!! FIRE AT HUB !!", 12000);
      gotoPage(1);
    }
    return;
  }

   // Legacy JSON is restricted to ambient hub data; alert display requires
   // the authenticated notice envelope above.
}

// ===========================================================================
//                              DISPLAY  (UI v2)
//   y 0..9 status bar | y 10 hairline | y 12..59 content | y 61..62 pager
// ===========================================================================
static void drawStrR(int xr, int y, const char *s) { u8g2.drawStr(xr - u8g2.getStrWidth(s), y, s); }
static void drawStrC(int y, const char *s) { u8g2.drawStr((128 - u8g2.getStrWidth(s)) / 2, y, s); }
static void drawStrClip(int x, int y, const char *s, int maxPx) {
  char b[40]; int n = 0;
  for (; s[n] && n < (int)sizeof(b) - 1; n++) {
    b[n] = s[n]; b[n + 1] = 0;
    if (u8g2.getStrWidth(b) > maxPx) { b[n] = 0; break; }
  }
  u8g2.drawStr(x, y, b);
}
static void drawPill(int xr, int yb, const char *t, bool filled) {
  u8g2.setFont(u8g2_font_5x7_tr);
  int w = u8g2.getStrWidth(t) + 6, x = xr - w;
  if (filled) {
    u8g2.setDrawColor(1); u8g2.drawRBox(x, yb - 8, w, 10, 2);
    u8g2.setDrawColor(0); u8g2.drawStr(x + 3, yb - 1, t);
    u8g2.setDrawColor(1);
  } else {
    u8g2.drawRFrame(x, yb - 8, w, 10, 2);
    u8g2.drawStr(x + 3, yb - 1, t);
  }
}
static void drawChipBox(int cx, int cw) {         // cleared, framed chip background
  u8g2.setDrawColor(0); u8g2.drawBox(cx - 1, 46, cw + 2, 12);
  u8g2.setDrawColor(1); u8g2.drawRFrame(cx, 47, cw, 10, 2);
}

static int linkLevel() {
  unsigned long now = millis();
  if (!loraOk || !lastAckMs || now - lastAckMs > LINK_OK_MS) return 0;
  return linkRssi > -90 ? 4 : linkRssi > -105 ? 3 : linkRssi > -118 ? 2 : 1;
}
static void drawBars4(int x, int y, int lvl) {
  for (int i = 0; i < 4; i++) {
    int h = 2 + i * 2;
    if (i < lvl) u8g2.drawBox(x + i * 3, y + 8 - h, 2, h);
    else         u8g2.drawBox(x + i * 3, y + 7, 2, 1);
  }
}
static void drawAntenna(int x, int y) {
  u8g2.drawVLine(x + 3, y + 3, 5);
  u8g2.drawLine(x, y, x + 3, y + 3);
  u8g2.drawLine(x + 6, y, x + 3, y + 3);
}
static void drawPin(int x, int y, bool filled) {
  if (filled) { u8g2.drawDisc(x + 3, y + 3, 3); u8g2.drawTriangle(x, y + 4, x + 6, y + 4, x + 3, y + 8); }
  else { u8g2.drawCircle(x + 3, y + 3, 3); u8g2.drawLine(x, y + 4, x + 3, y + 8); u8g2.drawLine(x + 6, y + 4, x + 3, y + 8); }
}
static void drawWearIcon(int x, int y, bool on) {
  if (on) u8g2.drawRBox(x, y + 1, 9, 6, 1);
  else { u8g2.drawRFrame(x, y + 1, 9, 6, 1); u8g2.drawLine(x, y + 8, x + 8, y); }
}
static void drawHeart(int x, int y, bool big) {
  if (big) { u8g2.drawDisc(x + 3, y + 3, 3); u8g2.drawDisc(x + 8, y + 3, 3); u8g2.drawTriangle(x, y + 4, x + 11, y + 4, x + 5, y + 10); }
  else { u8g2.drawDisc(x + 4, y + 4, 2); u8g2.drawDisc(x + 7, y + 4, 2); u8g2.drawTriangle(x + 2, y + 5, x + 9, y + 5, x + 5, y + 9); }
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
  u8g2.drawBox(px - 1, py - 1, 2, 2);
}

static void drawStatusBar(const char *title) {
  u8g2.setDrawColor(1);
  drawAntenna(1, 1);
  int lvl = linkLevel();
  drawBars4(10, 1, lvl);
  if (!loraOk || lvl == 0) u8g2.drawLine(0, 9, 22, 0);
  drawPin(27, 1, isLiveGpsFix);
  drawWearIcon(38, 0, worn);
  u8g2.setFont(u8g2_font_5x7_tr);
  if (!mpuOk && ((millis() / 500) & 1)) u8g2.drawStr(52, 8, "IMU!");
  const char *t = title;
  if (!loraOk) {
    t = ((millis() / 500) & 1) ? "RADIO OFF" : "";
  } else if (lvl == 0) {
    t = ((millis() / 500) & 1) ? "RADIO LOST" : "";
  } else {
    t = (title && strlen(title) > 0 && strcmp(title, "AYULINK") != 0) ? title : "OK RADIO";
  }
  drawStrR(127, 8, t);
  u8g2.drawHLine(0, 10, 128);
}
static void drawPager() {
  int x = 54;
  for (int i = 0; i < PAGES; i++) {
    if (i == page) { u8g2.drawBox(x, 61, 8, 2); x += 12; }
    else           { u8g2.drawBox(x, 61, 2, 2); x += 6; }
  }
}

// ── Page 0: vitals ─────────────────────────────────────────────────────────
static void drawPageVitals(int dx) {
  unsigned long now = millis();
  bool hrOk = worn && bpm > 0, spOk = worn && spo2 > 0, tOk = worn && bodyTemp > 0;

  bool big = false;
  if (hrOk) { unsigned long per = 60000UL / (unsigned)bpm; big = (now % per) < 140; }
  drawHeart(dx + 1, 12, big);
  u8g2.setFont(u8g2_font_4x6_tr);
  u8g2.drawStr(dx + 15, 19, "BPM");
  u8g2.setFont(u8g2_font_5x7_tr);
  u8g2.drawStr(dx + 68, 19, "SPO2");
  u8g2.setFont(u8g2_font_4x6_tr);
  drawStrR(dx + 126, 19, devLabel);
  u8g2.drawVLine(dx + 64, 13, 29);

  char b[16];
  u8g2.setFont(u8g2_font_logisoso16_tr);
  if (hrOk) snprintf(b, sizeof(b), "%d", (int)bpm); else snprintf(b, sizeof(b), "--");
  u8g2.drawStr(dx + 4, 42, b);
  if (spOk) snprintf(b, sizeof(b), "%d", (int)spo2); else snprintf(b, sizeof(b), "--");
  u8g2.drawStr(dx + 68, 42, b);
  int w = u8g2.getStrWidth(b);
  u8g2.setFont(u8g2_font_6x10_tr);
  u8g2.drawStr(dx + 68 + w + 2, 42, "%");

  u8g2.drawHLine(dx, 58, 88);
  drawSpark(dx + 1, 46, 86, 11, hrHist, hrHistN, 50, 110);

  u8g2.setFont(u8g2_font_4x6_tr);
  u8g2.drawStr(dx + 92, 50, "SKIN");
  u8g2.setFont(u8g2_font_5x7_tr);
  if (tOk) {
    snprintf(b, sizeof(b), "%.1f", bodyTemp);
    u8g2.drawStr(dx + 92, 58, b);
    int tw = u8g2.getStrWidth(b);
    u8g2.drawPixel(dx + 92 + tw + 2, 52);
    u8g2.drawStr(dx + 92 + tw + 4, 58, "C");
  } else u8g2.drawStr(dx + 92, 58, "--");

  // guidance chip: always tell the wearer WHY a number is missing
  const char *msg = nullptr;
  if (sensorStatus == ayulink::SS_FAULT)         msg = "SENSOR FAULT";
  else if (sensorStatus == ayulink::SS_LEAD_OFF) msg = "WEAR BAND SNUG";
  else if (!hrOk)                                msg = "MEASURING...";
  if (msg && (((now / 600) & 1) || sensorStatus == ayulink::SS_OK)) {
    u8g2.setFont(u8g2_font_5x7_tr);
    int cw = u8g2.getStrWidth(msg) + 8, cx = dx + (88 - cw) / 2;
    drawChipBox(cx, cw);
    u8g2.drawStr(cx + 4, 55, msg);
  }
}

// ── Page 1: care hub ───────────────────────────────────────────────────────
static void drawPageHub(int dx) {
  char b[32];
  if (!hubReceived) {
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
  snprintf(b, sizeof(b), "%.1f", hubTemp);
  u8g2.drawStr(dx + 2, 37, b);
  int w = u8g2.getStrWidth(b);
  u8g2.setFont(u8g2_font_5x7_tr);
  u8g2.drawPixel(dx + 2 + w + 3, 22);
  u8g2.drawStr(dx + 2 + w + 5, 37, "C");
  snprintf(b, sizeof(b), "HUM %.0f%%", hubHumidity);
  u8g2.drawStr(dx + 2, 44, b);
  u8g2.setFont(u8g2_font_6x10_tr);
  drawStrClip(dx + 68, 31, hubAqi, 58);
  u8g2.setFont(u8g2_font_5x7_tr);
  snprintf(b, sizeof(b), "%d ppm", hubAirPpm);
  u8g2.drawStr(dx + 68, 41, b);

  u8g2.setFont(u8g2_font_5x7_tr);
  for (int i = 0; i < 4; i++) {
    int x = dx + 2 + i * 32;
    char s[4]; snprintf(s, sizeof(s), "S%d", i + 1);
    if (hubSlot[i]) {
      u8g2.setDrawColor(1); u8g2.drawRBox(x, 47, 28, 11, 3);
      u8g2.setDrawColor(0); u8g2.drawStr(x + 9, 55, s);
      u8g2.setDrawColor(1);
    } else { u8g2.drawRFrame(x, 47, 28, 11, 3); u8g2.drawStr(x + 9, 55, s); }
  }
  if (hubFlame && ((millis() / 250) & 1)) drawPill(dx + 126, 28, "FIRE", true);
}

// ── Page 2: system health ──────────────────────────────────────────────────
static void drawPageSystem(int dx) {
  unsigned long now = millis();
  char b[40];

  u8g2.setFont(u8g2_font_4x6_tr);
  u8g2.drawStr(dx + 2, 18, "GATEWAY LINK");
  u8g2.setFont(u8g2_font_6x10_tr);
  bool linkUp = linkLevel() > 0;
  if (linkUp) snprintf(b, sizeof(b), "ACK %lus ago", (now - lastAckMs) / 1000);
  else        snprintf(b, sizeof(b), lastAckMs ? "NO ACK %lus" : "NO ACK YET", (now - lastAckMs) / 1000);
  u8g2.drawStr(dx + 2, 27, b);
  if (linkUp) { snprintf(b, sizeof(b), "%ddBm", linkRssi); drawPill(dx + 126, 27, "OK RADIO", false); }
  else if (!loraOk) drawPill(dx + 126, 27, "RADIO OFF", false);
  else drawPill(dx + 126, 27, "RADIO LOST", false);

  u8g2.setFont(u8g2_font_4x6_tr);
  u8g2.drawStr(dx + 2, 33, "LOCATION");
  u8g2.setFont(u8g2_font_6x10_tr);
  if (isLiveGpsFix) snprintf(b, sizeof(b), "%u SATS", (unsigned)gps.satellites.value());
  else snprintf(b, sizeof(b), "SEARCHING %u", (unsigned)gps.satellites.value());
  u8g2.drawStr(dx + 2, 42, b);
  drawPill(dx + 126, 42, isLiveGpsFix ? "SAT FIX" : "PHC ANCHOR", isLiveGpsFix);

  bool gpsAlive = gpsLastCharMs && now - gpsLastCharMs < 3000;
  drawPill(dx + 24, 57, "PPG", maxSensorOk && sensorStatus != ayulink::SS_FAULT);
  drawPill(dx + 48, 57, "IMU", mpuOk);
  drawPill(dx + 72, 57, "GPS", gpsAlive);
  u8g2.setFont(u8g2_font_4x6_tr);
  snprintf(b, sizeof(b), "TX %lu", (unsigned long)txCount);
  drawStrR(dx + 126, 56, b);
}

static void drawPageBody(int p, int dx) {
  switch (p) {
    case 0: drawPageVitals(dx); break;
    case 1: drawPageHub(dx); break;
    case 2: drawPageSystem(dx); break;
  }
}

static void drawDashboard() {
  unsigned long now = millis();
  bool drawn = false;
  if (sliding) {
    float t = (now - slideStart) / (float)SLIDE_MS;
    if (t >= 1.0f) sliding = false;
    else {
      t = 1.0f - (1.0f - t) * (1.0f - t);
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

// ── SOS hold ring ──────────────────────────────────────────────────────────
static void drawHoldOverlay(unsigned long held, bool cancel) {
  unsigned long need = cancel ? SOS_CANCEL_HOLD_MS : SOS_HOLD_MS;
  float p = held >= need ? 1.0f : (float)held / (float)need;
  const int cx = 64, cy = 30, r = 23;
  u8g2.drawCircle(cx, cy, r + 3);
  int steps = (int)(p * 48);
  for (int i = 0; i < steps; i++) {
    float a = i * 6.2831853f / 48.0f;
    u8g2.drawDisc(cx + (int)(r * sinf(a)), cy - (int)(r * cosf(a)), 2);
  }
  if (cancel) { u8g2.setFont(u8g2_font_6x10_tr); drawStrC(cy + 4, "CANCEL"); }
  else        { u8g2.setFont(u8g2_font_logisoso16_tr); drawStrC(cy + 8, "SOS"); }
  u8g2.setFont(u8g2_font_4x6_tr);
  drawStrC(63, cancel ? "KEEP HOLDING TO CANCEL" : "KEEP HOLDING FOR SOS");
}

// ── Emergency ──────────────────────────────────────────────────────────────
static void drawEmergency() {
  unsigned long now = millis();
  bool acked = ambulanceDispatched;
  bool inv = !acked && ((now / 400) & 1);
  int fg = inv ? 0 : 1;

  u8g2.setDrawColor(1);
  if (inv) u8g2.drawBox(0, 0, 128, 64);
  else { u8g2.drawFrame(0, 0, 128, 64); u8g2.drawFrame(1, 1, 126, 62); }
  u8g2.setDrawColor(fg);

  const char *label = tremorActive ? "SEIZURE" : (sosActive ? "SOS" : "FALL");
  u8g2.setFont(tremorActive ? u8g2_font_logisoso16_tr : u8g2_font_logisoso20_tr);
  u8g2.drawStr((128 - u8g2.getStrWidth(label)) / 2, 28, label);

  if (!acked) {
    u8g2.drawTriangle(5, 26, 25, 26, 15, 8);
    u8g2.setDrawColor(1 - fg); u8g2.drawBox(14, 14, 2, 6); u8g2.drawBox(14, 22, 2, 2); u8g2.setDrawColor(fg);
    u8g2.drawTriangle(123, 26, 103, 26, 113, 8);
    u8g2.setDrawColor(1 - fg); u8g2.drawBox(112, 14, 2, 6); u8g2.drawBox(112, 22, 2, 2); u8g2.setDrawColor(fg);
  } else {
    for (int k = 0; k < 2; k++) {
      int ox = k ? 113 : 15;
      u8g2.drawCircle(ox, 17, 10);
      u8g2.drawLine(ox - 5, 17, ox - 1, 21); u8g2.drawLine(ox - 1, 21, ox + 6, 12);
      u8g2.drawLine(ox - 5, 18, ox - 1, 22); u8g2.drawLine(ox - 1, 22, ox + 6, 13);
    }
  }
  u8g2.drawHLine(6, 32, 116);

  u8g2.setFont(u8g2_font_6x10_tr);
  if (toastActive()) {
    // A responder's broadcast remains readable during an active incident;
    // otherwise the emergency overlay hid the entire 9-second notice.
    size_t n = strlen(notifMsg);
    size_t start = n > 20 ? ((now / 2500) % ((n + 19) / 20)) * 20 : 0;
    char line[21];
    strncpy(line, notifMsg + start, 20); line[20] = '\0';
    drawStrC(44, line);
  } else drawStrC(44, acked ? "RESPONDER EN ROUTE" : "CALLING FOR HELP");

  // closed loop: tell the patient whether the gateway actually heard them
  unsigned long el = (now - incidentSince) / 1000;
  char b[32];
  snprintf(b, sizeof(b), "%s  %02lu:%02lu", incidentHeard ? "SIGNAL RECEIVED" : "SENDING...",
           (el / 60) % 100, el % 60);
  u8g2.setFont(u8g2_font_5x7_tr);
  drawStrC(54, b);

  u8g2.drawHLine(12, 59, 104);
  if (acked) u8g2.drawBox(12, 57, 104, 5);
  else {
    int t = (now / 10) % 160, pos = t < 80 ? t : 160 - t;
    u8g2.drawBox(12 + pos, 57, 24, 5);
  }
  u8g2.setDrawColor(1);
}

// ── Toast ──────────────────────────────────────────────────────────────────
static int wrapText(const char *s, char out[][22], int maxLines) {
  int n = 0; const char *p = s;
  while (*p && n < maxLines) {
    while (*p == ' ') p++;
    if (!*p) break;
    int len = strlen(p), take = len > 21 ? 21 : len;
    if (len > 21) { int br = take; while (br > 0 && p[br] != ' ') br--; if (br > 0) take = br; }
    memcpy(out[n], p, take); out[n][take] = 0; p += take; n++;
  }
  return n;
}
static void drawToast() {
  u8g2.setDrawColor(1);
  u8g2.drawBox(0, 0, 128, 13);
  u8g2.setDrawColor(0);
  u8g2.setFont(u8g2_font_6x10_tr);
  drawStrC(10, "NOTICE");
  u8g2.setDrawColor(1);
  u8g2.drawFrame(0, 12, 128, 52);
  char lines[3][22];
  int n = wrapText(notifMsg, lines, 3);
  int y0 = (n == 1) ? 34 : (n == 2 ? 29 : 25);
  for (int i = 0; i < n; i++) u8g2.drawStr(4, y0 + i * 11, lines[i]);
  long rem = (long)(notifUntil - millis());
  if (rem > 0 && notifDur > 0) {
    int bw = (int)((long long)constrain(rem, 0L, (long)notifDur) * 120 / (long)notifDur);
    u8g2.drawFrame(3, 56, 122, 5);
    if (bw > 0) u8g2.drawBox(4, 57, bw, 3);
  }
}

// ── Render root + incremental flush ────────────────────────────────────────
static void renderFrame() {
  u8g2.clearBuffer();
  u8g2.setDrawColor(1);
  bool holdShow = uiHoldMs >= 250;
  if (holdShow)               drawHoldOverlay(uiHoldMs, uiHoldCancel);
  else if (anyAlert())        drawEmergency();
  else if (toastActive())     drawToast();
  else                        drawDashboard();
  if (notifMsg[0] && millis() >= notifUntil) notifMsg[0] = '\0';
}

static void uiContrastTick(unsigned long now) {
  int target = (anyAlert() || toastActive() || hubFlame) ? CONTRAST_ALERT
             : (now - lastActivity > DIM_AFTER_MS ? CONTRAST_DIM : CONTRAST_ACTIVE);
  if (target != curContrast) { u8g2.setContrast(target); curContrast = target; }
}

// FIX: u8g2.sendBuffer() pushes 1 KB (~26 ms at 400 kHz) in one blocking call,
// which stalls IMU sampling. Push 2 of 8 tile rows per loop pass instead.
static void uiService(unsigned long now) {
  if (flushRow < 8) { u8g2.updateDisplayArea(0, flushRow, 16, 2); flushRow += 2; return; }
  bool anim = sliding || anyAlert() || uiHoldMs > 0 || toastActive();
  unsigned long frameMs = anim ? 60 : 120;
  if (now - lastDraw >= frameMs) {
    lastDraw = now;
    uiContrastTick(now);
    renderFrame();
    flushRow = 0;
  }
}

static void bootStep(const char *label, int pct) {
  u8g2.clearBuffer();
  u8g2.setDrawColor(1);
  static const int8_t pts[][2] = {{0,9},{44,9},{49,1},{55,16},{60,5},{64,9},{127,9}};
  for (int i = 0; i < 6; i++) u8g2.drawLine(pts[i][0], pts[i][1], pts[i+1][0], pts[i+1][1]);
  u8g2.setFont(u8g2_font_logisoso16_tr);
  drawStrC(38, "AYULINK");
  u8g2.setFont(u8g2_font_5x7_tr);
  drawStrC(48, "WRISTBAND");
  u8g2.drawRFrame(14, 51, 100, 6, 2);
  int w = constrain(pct, 0, 100) * 96 / 100;
  if (w > 0) u8g2.drawRBox(16, 53, w, 2, 0);
  u8g2.setFont(u8g2_font_4x6_tr);
  drawStrC(63, label);
  u8g2.sendBuffer();
  esp_task_wdt_reset();
}

static void ledTick(unsigned long now) {
  if (anyAlert()) digitalWrite(PIN_LED, (now / 125) & 1);
  else digitalWrite(PIN_LED, LOW);
}

// ── Setup ──────────────────────────────────────────────────────────────────
void setup() {
  // FIX: watchdog API differs on Arduino-ESP32 core 3.x
#if defined(ESP_ARDUINO_VERSION_MAJOR) && ESP_ARDUINO_VERSION_MAJOR >= 3
  esp_task_wdt_config_t twdt = {8000, 0, true};
  esp_task_wdt_reconfigure(&twdt);
#else
  esp_task_wdt_init(8, true);
#endif
  esp_task_wdt_add(NULL);

  Serial.begin(115200);
  delay(200);
  snprintf(devLabel, sizeof(devLabel), "D%u", (unsigned)DEVICE_ID);
  uint8_t baseMac[6];
  esp_read_mac(baseMac, ESP_MAC_WIFI_STA);
  Serial.printf("\n[AyuLink wristband v2] %s | STA MAC: %02X:%02X:%02X:%02X:%02X:%02X\n",
                devLabel, baseMac[0], baseMac[1], baseMac[2], baseMac[3], baseMac[4], baseMac[5]);
  noticeStoreOk = noticeStore.begin("ayu-notice", false);
  if (noticeStoreOk) {
    noticeSeen = noticeStore.isKey("seq");
    if (noticeSeen) lastNoticeSeq = noticeStore.getUShort("seq", 0);
  } else Serial.println(F("[NOTICE] nonvolatile replay guard unavailable; notices refused"));
  seqStoreOk = seqStore.begin("ayu-uplink", false);
  if (seqStoreOk) {
    txSeq = seqStore.getUShort("next", 0);
    seqBlockEnd = (uint16_t)(txSeq + 256);
    seqStoreOk = seqStore.putUShort("next", seqBlockEnd) == sizeof(uint16_t);
  }
  if (!seqStoreOk) Serial.println(F("[TX] nonvolatile sequence unavailable; uplink paused"));

  pinMode(PIN_BUZZ, OUTPUT);
  pinMode(PIN_LED, OUTPUT);
  pinMode(PIN_SOS, INPUT_PULLUP);
  pinMode(PIN_LM35, INPUT);
  analogReadResolution(12);
  analogSetPinAttenuation(PIN_LM35, ADC_11db);
#if AYULINK_ANALOG_PULSE
  pinMode(PIN_ANALOG_PULSE, INPUT);
  analogSetPinAttenuation(PIN_ANALOG_PULSE, ADC_11db);
#endif
  digitalWrite(PIN_BUZZ, LOW);
  digitalWrite(PIN_LED, LOW);

  Wire.begin(21, 22);                    // FIX: second Wire.begin() later in the old setup removed
  Wire.setClock(400000);
  u8g2.begin();
  u8g2.setBusClock(400000);
  u8g2.setContrast(CONTRAST_ACTIVE); curContrast = CONTRAST_ACTIVE;
  bootStep("DISPLAY", 10);

  // ── PPG identification ─────────────────────────────────────────────────
  maxSensorOk = false;
#if AYULINK_ANALOG_PULSE
  maxSensorOk = true;
  Serial.println(F("[PPG] analog pulse profile (experimental, SpO2 INVALID)"));
#else
  // MAX30105::begin performs the MAX30102 part-ID check (register 0xFF,
  // expected value 0x15). Only the installed MAX30102-compatible driver is used.
  if (maxSensor.begin(Wire, I2C_SPEED_FAST)) {
    // FIX: 100 sps raw, no hardware averaging. checkForBeat() is tuned for
    // ~100 sps; SpO2 is decimated to 25 sps in software.
    // Old config (avg 4 @ 200 sps = 50 sps) suited neither algorithm.
    maxSensor.setup(0x1F, 1, 2, 100, 411, 4096);
    maxSensor.setPulseAmplitudeRed(0x1F);
    maxSensor.setPulseAmplitudeIR(0x1F);
    maxSensor.setPulseAmplitudeGreen(0);
    maxSensorOk = true;
    Serial.println(F("[MAX30102] OK 100 sps"));
  }
  if (!maxSensorOk) Serial.println(F("[PPG] FAIL - vitals will report INVALID"));
#endif
  lastPpgSampleMs = millis();
  bootStep(maxSensorOk ? "SENSORS" : "SENSOR FAULT", 35);

  mpuOk = false;
  for (int attempt = 1; attempt <= 3 && !mpuOk; attempt++) {
    if (attempt > 1) delay(250);
    if (mpu.begin()) {
      mpuOk = true;
      fallDetector.reset();
      fallDetector.recalibrate();
      mpu.setAccelerometerRange(MPU6050_RANGE_4_G);
      mpu.setGyroRange(MPU6050_RANGE_500_DEG);
      mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);
    }
    esp_task_wdt_reset();
  }
  Serial.println(mpuOk ? F("[MPU6050] WHO_AM_I OK (0x68), ±4G 500dps calibrated") : F("[MPU6050] FAIL - will retry"));
  bootStep(mpuOk ? "MOTION" : "MOTION FAULT", 55);

  // FIX: a LoRa init failure used to brick the node in an infinite loop, which
  // also killed LOCAL fall/SOS indication. Now the band keeps running, shows
  // NO RADIO, and retries every 10 s.
  loraOk = loraInit();
  Serial.println(loraOk ? F("[WIRELESS] ESP-NOW Radio OK") : F("[WIRELESS] Radio init failed - retrying in loop"));
  bootStep(loraOk ? "OK RADIO" : "RADIO OFF", 75);

  gpsSerial.begin(GPS_BAUD, SERIAL_8N1, GPS_RX_PIN, GPS_TX_PIN);
  bootStep("GPS", 90);

  beepBlocking(2, 80);
  bootStep("READY", 100);
  delay(250);
  esp_task_wdt_reset();
  lastActivity = millis();
  lastPageMs = millis();
}

// ── Loop ───────────────────────────────────────────────────────────────────
void loop() {
  unsigned long now = millis();

  buzzerTick();
  ledTick(now);
  processGpsStream(now);
  vitalsService(now);
  imuService(now);
  checkSOS(now);
  alertTick(now);
  txService(now);
  if (loraOk && !txBusy) checkLoRaRX(now);
  mpuRecover(now);

  if (!loraOk && now - lastLoraRetryMs >= 10000) {
    lastLoraRetryMs = now;
    loraOk = loraInit();
    if (loraOk) Serial.println(F("[LoRa] RECOVERED"));
  }

  if (!anyAlert() && !toastActive() && !sliding && uiHoldMs == 0 &&
      now - lastPageMs >= PAGE_CYCLE_MS) {
    lastPageMs = now;
    gotoPage(page + 1);
  }

  uiService(now);
  esp_task_wdt_reset();
}
