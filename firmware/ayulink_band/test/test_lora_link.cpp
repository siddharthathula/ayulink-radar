// Host test for common/ayulink_lora.h: LoRa time-on-air and the duty-cycle
// limiter that keeps the band inside India's 433 MHz rule (10% duty cycle).
#include <cassert>
#include <cstdio>
#include <vector>
#include "ayulink_lora.h"
#include "ayulink_protocol.h"

using namespace ayulink;

int main() {
  const uint32_t air = lora_airtime_ms(kTelemetrySize);
  std::printf("time on air, 32-byte frame at SF%d/125 kHz: %u ms\n", kLoraSf, air);
  assert(air >= 240 && air <= 255);                    // Semtech calculator: ~247 ms
  assert(lora_airtime_ms(32, 7) < lora_airtime_ms(32, 12));

  // Adversarial: request a frame every 100 ms for 4 hours.
  LoraDutyLimiter spam;
  std::vector<uint32_t> tx;
  for (uint32_t t = 1; t < 4u * 3600000u; t += 100) {
    if (spam.allow(t, air)) { spam.spend(air); tx.push_back(t); }
  }
  double worst = 0;
  size_t j = 0;
  for (size_t i = 0; i < tx.size(); i++) {
    while (tx[i] - tx[j] >= 3600000u) j++;
    const double pct = (i - j + 1) * (double)air / 3600000.0 * 100.0;
    if (pct > worst) worst = pct;
  }
  std::printf("worst rolling-hour duty under spam: %.2f%%\n", worst);
  assert(worst <= 10.0);

  // Realistic hour: routine every 15 s, a 20-minute emergency at 3 s.
  LoraDutyLimiter real;
  unsigned blocked = 0;
  for (uint32_t t = 1; t < 3600000u;) {
    const bool em = t > 1200000u && t < 2400000u;
    if (real.allow(t, air)) real.spend(air); else blocked++;
    t += em ? kLoraIntervalEmergencyMs : kLoraIntervalNormalMs;
  }
  std::printf("realistic hour, frames blocked: %u\n", blocked);
  assert(blocked == 0);

  std::puts("lora link tests: OK");
  return 0;
}
