#include <Arduino.h>
#include <ArduinoJson.h>
#include <ESP32Servo.h>
#include <LoRa.h>
#include <SPI.h>

// --- HARDWARE CONFIGURATION (ESP32-C3 SuperMini) ---
// Button & LED
#define PIN_BUTTON 9 // BOOT Button
#define PIN_LED 8    // Built-in LED

// Servo
#define PIN_SERVO 2

// LoRa RA-02 (SX1278)
#define LORA_SCK 4
#define LORA_MISO 5
#define LORA_MOSI 6
#define LORA_NSS 7
#define LORA_RST 10
#define LORA_DIO0 3

// Constants
#define BAND 433E6
#define NODE_ID "P_01" // Patient 01

// Global Objects
Servo dispenserServo;

// --- STATE MANAGEMENT ---
unsigned long lastSendTime = 0;
const int SEND_INTERVAL = 2000; // Send vitals every 2s

// Vitals Simulation
int heartRate = 72;
int spo2 = 98;
bool isEmergency = false;
bool isCardiacEvent = false;

// Button Logic
unsigned long buttonPressTime = 0;
bool buttonHeld = false;
bool lastButtonState = HIGH;

void setup() {
  Serial.begin(115200);
  delay(2000); // Give time for Serial to start

  // 1. Setup GPIO
  pinMode(PIN_LED, OUTPUT);
  pinMode(PIN_BUTTON, INPUT_PULLUP);
  digitalWrite(PIN_LED, HIGH); // OFF (Active Low usually)

  // 2. Setup Servo
  dispenserServo.attach(PIN_SERVO);
  dispenserServo.write(0); // Initial position (Closed)

  // 3. Setup LoRa
  Serial.println("[LoRa] Initializing...");
  SPI.begin(LORA_SCK, LORA_MISO, LORA_MOSI, LORA_NSS);
  LoRa.setPins(LORA_NSS, LORA_RST, LORA_DIO0);

  if (!LoRa.begin(BAND)) {
    Serial.println("[LoRa] Failed to start!");
    while (1) {
      digitalWrite(PIN_LED, LOW);
      delay(100);
      digitalWrite(PIN_LED, HIGH);
      delay(100);
    }
  }
  Serial.println("[LoRa] Initialized OK!");

  // Blink to indicate ready
  for (int i = 0; i < 3; i++) {
    digitalWrite(PIN_LED, LOW);
    delay(200);
    digitalWrite(PIN_LED, HIGH);
    delay(200);
  }
}

void dispenseMedicine() {
  Serial.println("[Servo] Dispensing...");

  // Visual indicator
  digitalWrite(PIN_LED, LOW);

  // Rotate Servo
  dispenserServo.write(180); // Open
  delay(1000);               // Wait (simulating dispense)
  dispenserServo.write(0);   // Close

  digitalWrite(PIN_LED, HIGH);
  Serial.println("[Servo] Dispensed!");
}

void sendVitals() {
  // 1. Simulate Vitals
  if (isEmergency) {
    // SOS Mode (Manual Trigger)
    heartRate = 0; // Sensor fail / Critical
    spo2 = 0;
  } else if (isCardiacEvent) {
    // High Stress / Cardiac Arrest
    heartRate = random(135, 160);
    spo2 = random(80, 88);
  } else {
    // Normal Resting
    heartRate = random(70, 80);
    spo2 = random(97, 100);
  }

  // 2. Create JSON Packet
  JsonDocument doc;
  doc["node"] = NODE_ID;
  doc["hr"] = heartRate;
  doc["oxy"] = spo2;
  doc["sos"] = isEmergency;
  doc["fall"] = false; // Fall detection not simulated yet

  String jsonString;
  serializeJson(doc, jsonString);

  // 3. Send via LoRa
  LoRa.beginPacket();
  LoRa.print(jsonString);
  LoRa.endPacket();

  Serial.print("[TX] ");
  Serial.println(jsonString);
}

void checkButton() {
  int buttonState = digitalRead(PIN_BUTTON);

  // Button Pressed (LOW for Pullup)
  if (buttonState == LOW && lastButtonState == HIGH) {
    buttonPressTime = millis();
    buttonHeld = true;
    Serial.println("[Button] Pressed...");
  }

  // Button Released
  if (buttonState == HIGH && lastButtonState == LOW) {
    unsigned long duration = millis() - buttonPressTime;
    buttonHeld = false;

    Serial.print("[Button] Released after ");
    Serial.print(duration);
    Serial.println("ms");

    if (duration > 2000) {
      // Long Press -> Toggle SOS
      isEmergency = !isEmergency;
      isCardiacEvent = false; // Override cardiac
      Serial.println(isEmergency ? ">>> SOS ACTIVATED <<<"
                                 : ">>> SOS CLEARED <<<");

      // Rapid Blink Confirmation
      for (int i = 0; i < 5; i++) {
        digitalWrite(PIN_LED, LOW);
        delay(50);
        digitalWrite(PIN_LED, HIGH);
        delay(50);
      }

      sendVitals(); // Send immediately

    } else if (duration > 50) {
      // Short Press -> Toggle Cardiac Simulation
      isCardiacEvent = !isCardiacEvent;
      isEmergency = false; // Clear SOS
      Serial.println(isCardiacEvent ? ">>> CARDIAC EVENT SIMULATED <<<"
                                    : ">>> NORMAL VITALS RESTORED <<<");

      // Single Blink Confirmation
      digitalWrite(PIN_LED, LOW);
      delay(200);
      digitalWrite(PIN_LED, HIGH);

      sendVitals(); // Send immediately
    }
  }

  lastButtonState = buttonState;
}

void loop() {
  // 1. Handle Inputs
  checkButton();

  // 2. Check LoRa Reception (Dispense Command)
  int packetSize = LoRa.parsePacket();
  if (packetSize) {
    String incoming = "";
    while (LoRa.available()) {
      incoming += (char)LoRa.read();
    }
    Serial.print("[RX] ");
    Serial.println(incoming);

    // Check for "DISPENSE"
    // Simple string check is usually enough, but let's be robust
    if (incoming.indexOf("DISPENSE") >= 0 ||
        incoming.indexOf("dispense") >= 0) {
      dispenseMedicine();
    }
  }

  // 3. Send Telemetry Periodic
  if (millis() - lastSendTime > SEND_INTERVAL) {
    sendVitals();
    lastSendTime = millis();
  }
}
