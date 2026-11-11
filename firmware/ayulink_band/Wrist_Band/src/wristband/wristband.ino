#include <SoftwareSerial.h>

// NodeMCU ESP8266 pins
// SoftwareSerial(RX, TX)
SoftwareSerial gpsSerial(D1, D2);

void setup() {
  Serial.begin(115200);

  // GPS default baud rate is commonly 9600.
  gpsSerial.begin(9600);

  Serial.println();
  Serial.println("================================");
  Serial.println(" SKYLAB SKG13BL GPS TEST");
  Serial.println(" NodeMCU ESP8266");
  Serial.println("================================");
  Serial.println("Waiting for GPS data...");
  Serial.println();
}

void loop() {
  while (gpsSerial.available()) {
    char c = gpsSerial.read();
    Serial.write(c);
  }
}