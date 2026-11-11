#ifndef MAX30100_PULSEOXIMETER_H
#define MAX30100_PULSEOXIMETER_H

#include <Arduino.h>

typedef enum { MAX30100_LED_CURR_7_6MA } LEDCurrent;

class PulseOximeter {
public:
  PulseOximeter() {};
  bool begin() { return true; } // Mock success
  void update() {};             // Mock update
  void setIRLedCurrent(LEDCurrent current) {};
  void shutdown() {};
  void resume() {};
  uint32_t getIR() { return 8500; } // Mock value > 7000 (Worn)
};

#endif
