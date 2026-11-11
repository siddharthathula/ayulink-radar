/*
 * AyuLink rhythm-screening demo — ESP32 DevKit V1 + SH1106 128x64 OLED.
 *
 * MODE_SAMPLE (default): replays four RR windows derived from the public
 *   PhysioNet MIT-BIH Atrial Fibrillation Database and runs the exported C
 *   model. The OLED says "Replay: public ECG sample" — it is not a live
 *   reading and must not be mistaken for one.
 *
 * MODE_SENSOR: collects 30 beat-to-beat intervals from an analog pulse sensor
 *   on GPIO 34 and runs the same model, with a signal-quality gate. The OLED
 *   says "Live sensor (unvalidated)". This path has not been validated against
 *   ECG on the band.
 *
 * Build both modes with arduino-cli or PlatformIO. See firmware/README.md.
 * This is a screening demo, not a medical device.
 */

#include <Arduino.h>
#include <Wire.h>
#include <U8g2lib.h>

#include "rhythm_infer.h"
#include "rhythm_model.h"
#include "rhythm_samples.h"

#ifndef MODE_SAMPLE
#define MODE_SAMPLE 1
#endif
#ifndef MODE_SENSOR
#define MODE_SENSOR 0
#endif

#if (MODE_SAMPLE + MODE_SENSOR) != 1
#error "Select exactly one of MODE_SAMPLE or MODE_SENSOR"
#endif

U8G2_SH1106_128X64_NONAME_F_HW_I2C oled(U8G2_R0, U8X8_PIN_NONE);

static void show_lines(const char *l1, const char *l2, const char *l3,
                       const char *l4, const char *l5, bool replay) {
  oled.clearBuffer();
  oled.setFont(u8g2_font_5x7_tf);
  oled.drawStr(0, 8, replay ? "Replay: public ECG sample"
                            : "Live sensor (unvalidated)");
  oled.setFont(u8g2_font_6x10_tf);
  if (l1) oled.drawStr(0, 22, l1);
  if (l2) oled.drawStr(0, 34, l2);
  if (l3) oled.drawStr(0, 46, l3);
  if (l4) oled.drawStr(0, 58, l4);
  if (l5) {
    oled.setFont(u8g2_font_5x7_tf);
    oled.drawStr(0, 66, l5);
  }
  oled.sendBuffer();
}

#if MODE_SAMPLE

static void run_sample(int index) {
  const uint16_t *rr = AYU_DEMO_RR[index];
  float probability = ayu_rhythm_prob(rr, AYU_WINDOW_BEATS);
  bool irregular = probability >= AYU_THRESHOLD;

  char line1[32];
  char line2[32];
  char line3[32];
  snprintf(line1, sizeof(line1), "Sample %s  true: %s", AYU_DEMO_ID[index],
           AYU_DEMO_LABEL[index] ? "AF" : "normal");
  snprintf(line2, sizeof(line2), "p = %.3f  threshold %.2f", probability,
           AYU_THRESHOLD);
  snprintf(line3, sizeof(line3), "screen: %s",
           irregular ? "IRREGULAR" : "regular");

  show_lines(line1, line2, line3, "Not a diagnosis", nullptr, true);
  Serial.println("--- replay (public ECG-derived RR) ---");
  Serial.println(line1);
  Serial.println(line2);
  Serial.println(line3);
}

void setup() {
  Serial.begin(115200);
  Wire.begin(21, 22);
  oled.begin();
  oled.setI2CAddress(0x3C << 1);
  Serial.println("AyuLink rhythm demo: MODE_SAMPLE");
  Serial.println("host-tested; not yet validated on-device");
}

void loop() {
  static int index = 0;
  static unsigned long last = 0;
  if (millis() - last > 4000 || last == 0) {
    last = millis();
    run_sample(index);
    index = (index + 1) % AYU_DEMO_SAMPLE_COUNT;
  }
}

#endif  // MODE_SAMPLE

#if MODE_SENSOR

static const int PULSE_PIN = 34;
static uint16_t rr[AYU_WINDOW_BEATS];
static int rrCount = 0;
static unsigned long lastBeatMs = 0;
static unsigned long lastSampleMs = 0;
static int signalPeak = 0;
static int signalTrough = 4095;

static void reset_collection() {
  rrCount = 0;
  lastBeatMs = 0;
}

static void handle_window() {
  if (!ayu_rr_quality_ok(rr, rrCount)) {
    show_lines("Signal not usable", "No screening result", "Check sensor contact",
               "Not a diagnosis", nullptr, false);
    Serial.println("Signal not usable — no screening result");
    reset_collection();
    return;
  }
  float probability = ayu_rhythm_prob(rr, AYU_WINDOW_BEATS);
  bool irregular = probability >= AYU_THRESHOLD;
  char line1[32];
  char line2[32];
  snprintf(line1, sizeof(line1), "p = %.3f  thresh %.2f", probability,
           AYU_THRESHOLD);
  snprintf(line2, sizeof(line2), "screen: %s",
           irregular ? "IRREGULAR" : "regular");
  show_lines(line1, line2, "Optical pulse input", "Not a diagnosis", nullptr,
             false);
  Serial.println(line1);
  Serial.println(line2);
  reset_collection();
}

void setup() {
  Serial.begin(115200);
  Wire.begin(21, 22);
  oled.begin();
  oled.setI2CAddress(0x3C << 1);
  pinMode(PULSE_PIN, INPUT);
  Serial.println("AyuLink rhythm demo: MODE_SENSOR");
  Serial.println("Live sensor (unvalidated) — not a medical device");
  show_lines("Collecting 30 beats", "Place finger on sensor", nullptr,
             "Not a diagnosis", nullptr, false);
}

void loop() {
  unsigned long now = millis();
  if (now - lastSampleMs < 10) return;
  lastSampleMs = now;

  int value = analogRead(PULSE_PIN);
  if (value > signalPeak) signalPeak = value; else if (signalPeak > 0) signalPeak--;
  if (value < signalTrough) signalTrough = value; else if (signalTrough < 4095) signalTrough++;

  if (now < 3000) return;  // let the envelope settle

  int amplitude = signalPeak - signalTrough;
  int threshold = signalTrough + (amplitude * 6) / 10;

  if (amplitude > 200 && value > threshold && now - lastBeatMs > 300) {
    if (lastBeatMs > 0) {
      unsigned long interval = now - lastBeatMs;
      if (rrCount < AYU_WINDOW_BEATS) {
        rr[rrCount++] = (uint16_t)min(interval, (unsigned long)65535);
      }
      if (rrCount == AYU_WINDOW_BEATS) {
        handle_window();
      } else {
        char line[32];
        snprintf(line, sizeof(line), "Collecting %d/%d beats", rrCount,
                 AYU_WINDOW_BEATS);
        show_lines(line, "Live sensor (unvalidated)", nullptr, "Not a diagnosis",
                   nullptr, false);
      }
    }
    lastBeatMs = now;
  }

  if (lastBeatMs > 0 && now - lastBeatMs > 4000) {
    show_lines("Signal not usable", "No beat detected", "Check sensor contact",
               "Not a diagnosis", nullptr, false);
    reset_collection();
    signalPeak = 0;
    signalTrough = 4095;
  }
}

#endif  // MODE_SENSOR
