#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// ================= OLED CONFIGURATION =================
#define SCREEN_WIDTH  128
#define SCREEN_HEIGHT 64
#define OLED_RESET    -1
#define OLED_ADDRESS  0x3C

Adafruit_SSD1306 display(
  SCREEN_WIDTH,
  SCREEN_HEIGHT,
  &Wire,
  OLED_RESET
);

// ================= HC-SR04 PINS =================
#define TRIG_PIN 4
#define ECHO_PIN 35

// ================= SETTINGS =================
const float MIN_DISTANCE_CM = 2.0;
const float MAX_DISTANCE_CM = 400.0;

float distanceCM = 0.0;
bool validReading = false;

// ================= SETUP =================
void setup() {
  Serial.begin(115200);

  // Initialize HC-SR04
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);

  digitalWrite(TRIG_PIN, LOW);

  // Initialize I2C OLED
  Wire.begin(21, 22);

  if (!display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDRESS)) {
    Serial.println("OLED initialization failed!");

    while (true) {
      delay(1000);
    }
  }

  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);

  display.setTextSize(1);
  display.setCursor(20, 5);
  display.println("HC-SR04 SENSOR");

  display.drawLine(0, 18, 127, 18, SSD1306_WHITE);

  display.setCursor(10, 28);
  display.println("Initializing...");

  display.display();

  delay(1000);
}

// ================= READ DISTANCE =================
float readDistanceCM() {
  // Send a 10-microsecond trigger pulse
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(3);

  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);

  digitalWrite(TRIG_PIN, LOW);

  // Measure ECHO pulse duration
  // Timeout after 30 ms to avoid blocking
  unsigned long duration = pulseIn(ECHO_PIN, HIGH, 30000UL);

  if (duration == 0) {
    return -1.0;
  }

  // Sound travels to the object and back
  float distance = duration * 0.0343f / 2.0f;

  if (distance < MIN_DISTANCE_CM ||
      distance > MAX_DISTANCE_CM) {
    return -1.0;
  }

  return distance;
}

// ================= UPDATE OLED =================
void updateOLED() {
  display.clearDisplay();

  // Header
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.println("ULTRASONIC DISTANCE");

  display.drawLine(0, 12, 127, 12, SSD1306_WHITE);

  if (validReading) {
    // Large distance value
    display.setTextSize(3);
    display.setCursor(5, 22);

    display.print(distanceCM, 1);

    // Unit
    display.setTextSize(1);
    display.setCursor(95, 34);
    display.print("cm");

    // Status
    display.drawLine(0, 49, 127, 49, SSD1306_WHITE);

    display.setCursor(0, 54);

    if (distanceCM < 10.0) {
      display.print("WARNING: TOO CLOSE");
    } else {
      display.print("Status: Measuring");
    }
  } else {
    display.setTextSize(2);
    display.setCursor(10, 24);
    display.println("NO ECHO");

    display.setTextSize(1);
    display.setCursor(0, 50);
    display.print("Check sensor/object");
  }

  display.display();
}

// ================= MAIN LOOP =================
void loop() {
  distanceCM = readDistanceCM();

  validReading = (distanceCM >= 0.0);

  // Serial Monitor output
  Serial.print("Distance: ");

  if (validReading) {
    Serial.print(distanceCM, 1);
    Serial.println(" cm");
  } else {
    Serial.println("No valid reading");
  }

  updateOLED();

  delay(150);
}