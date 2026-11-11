// AyuLink LoRa link settings, shared by wristband (TX) and gateway (RX).
//
// Regulatory target (India): The Use of Low Power Radio Frequency Devices in
// the frequency band 433.05 to 434.79 MHz (Exemption from License) Rules, 2022
// (G.S.R. 347(E), 9 May 2022), row 1: 10 mW e.r.p., 10% duty cycle.
//
//   * Frequency 433.5 MHz: a 125 kHz LoRa channel spans 433.4375-433.5625 MHz,
//     inside 433.05-434.79 MHz.
//   * Conducted power 10 dBm. ERP = conducted + antenna gain (dBi) - 2.15 dB.
//     With the stock ~2 dBi spring/SMA antenna, ERP is about 10 dBm = 10 mW.
//     A higher-gain antenna needs a matching power cut (see kLoraTxDbm).
//   * Duty cycle is enforced on the band by LoraDutyLimiter: at most 9.5% on
//     air in any rolling hour (limit 10%).
//
// Commercial deployment still needs WPC Equipment Type Approval. This file
// keeps the prototype inside the technical limits; it is not a certificate.

#ifndef AYULINK_LORA_H
#define AYULINK_LORA_H

#include <stdint.h>
#include <math.h>

namespace ayulink {

static const long     kLoraFreqHz      = 433500000L;
static const int      kLoraSf          = 9;
static const long     kLoraBwHz        = 125000L;
static const int      kLoraCrDenom     = 5;      // coding rate 4/5
static const int      kLoraPreamble    = 8;
static const uint8_t  kLoraSyncWord    = 0xA5;   // private network (not LoRaWAN 0x34)
static const int      kLoraTxDbm       = 10;     // conducted; ~10 mW ERP with <=2.15 dBi antenna

// Uplink cadence. A 32-byte frame at SF9/125 kHz is ~247 ms on air, so
// 15 s routine = ~1.6% duty and 3 s emergency = ~8.2% duty.
static const uint32_t kLoraIntervalNormalMs    = 15000;
static const uint32_t kLoraIntervalEmergencyMs = 3000;

// Token bucket sized so that ANY rolling hour stays under 10% on air:
// refill 8% of elapsed time + at most 1.5% of an hour saved as burst
// => worst case 9.5% in any 60-minute window. The burst (54 s, ~218 frames)
// covers an emergency right after boot or after a quiet period.
static const float    kLoraDutyLimit   = 0.08f;
static const uint32_t kLoraDutyWindowMs = 3600000UL;
static const uint32_t kLoraBurstMs     = 54000UL;   // 1.5% of an hour

// Semtech SX127x time-on-air (AN1200.13), explicit header, CRC on.
inline uint32_t lora_airtime_ms(uint8_t payload_len,
                                int sf = kLoraSf, long bw = kLoraBwHz,
                                int cr_denom = kLoraCrDenom, int preamble = kLoraPreamble) {
  const double tsym = (double)(1L << sf) / (double)bw * 1000.0;  // ms
  const int de = (sf >= 11 && bw == 125000L) ? 1 : 0;            // low data rate optimise
  const int ih = 0, crc = 1;
  const double num = 8.0 * payload_len - 4.0 * sf + 28.0 + 16.0 * crc - 20.0 * ih;
  const double den = 4.0 * (sf - 2 * de);
  double n = ceil(num / den) * (cr_denom);
  if (n < 0) n = 0;
  const double symbols = (preamble + 4.25) + 8.0 + n;
  return (uint32_t)ceil(symbols * tsym);
}

// Token bucket: refills at kLoraDutyLimit of wall time, holds at most
// kLoraBurstMs. Starts full so the first emergency after boot is never blocked.
class LoraDutyLimiter {
 public:
  LoraDutyLimiter() : budget_ms_(kLoraBurstMs), last_ms_(0), started_(false) {}

  void refill(uint32_t now_ms) {
    if (!started_) { last_ms_ = now_ms; started_ = true; return; }
    const uint32_t dt = now_ms - last_ms_;
    last_ms_ = now_ms;
    budget_ms_ += kLoraDutyLimit * (double)dt;
    if (budget_ms_ > (double)kLoraBurstMs) budget_ms_ = (double)kLoraBurstMs;
  }

  bool allow(uint32_t now_ms, uint32_t airtime_ms) {
    refill(now_ms);
    return budget_ms_ >= (double)airtime_ms;
  }

  void spend(uint32_t airtime_ms) { budget_ms_ -= (double)airtime_ms; }
  double budget_ms() const { return budget_ms_; }

 private:
  double budget_ms_;
  uint32_t last_ms_;
  bool started_;
};

}  // namespace ayulink

#endif  // AYULINK_LORA_H
