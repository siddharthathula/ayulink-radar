// AyuLink Tremor Detection State Machine — shared, dependency-free, host-testable.
//
// Detects rhythmic involuntary tremor (3–8 Hz typical Parkinsonian / physiological)
// via angular velocity zero-crossings. Distinguishes intentional single-direction
// movements, typing, walking, and vigorous non-oscillatory shaking.
// Automatically de-asserts when oscillation ceases.

#ifndef AYULINK_TREMOR_DETECTOR_H
#define AYULINK_TREMOR_DETECTOR_H

#include <stdint.h>
#include <math.h>
#include <cstring>

namespace ayulink {

struct TremorConfig {
  float    gyro_threshold_dps      = 54.0f; // 90 dps * 0.6 = 54 deg/s significance threshold
  uint32_t window_ms               = 1000;  // 1-second evaluation window
  uint8_t  crossings_required      = 8;     // >= 4 Hz oscillation (8 sign reversals in 1s)
  uint32_t deassert_ms             = 3000;  // 3s without oscillation to de-assert
  uint32_t max_hold_ms             = 20000; // max alert hold
};

class TremorDetector {
 public:
  explicit TremorDetector(const TremorConfig& c = TremorConfig()) : cfg_(c) { reset(); }

  void reset() {
    active_ = false;
    t_window_ = 0;
    t_activated_ = 0;
    t_last_osc_ = 0;
    memset(crossings_, 0, sizeof(crossings_));
    memset(sign_, 0, sizeof(sign_));
  }

  // Feed angular velocity gx, gy, gz in degrees/second at sample timestamp now_ms.
  // Returns true on the rising edge of confirmed tremor.
  bool update(float gx_dps, float gy_dps, float gz_dps, uint32_t now_ms) {
    float g[3] = {gx_dps, gy_dps, gz_dps};

    if (t_window_ == 0 || now_ms - t_window_ > cfg_.window_ms) {
      t_window_ = now_ms;
      memset(crossings_, 0, sizeof(crossings_));
    }

    uint8_t mx = 0;
    for (int i = 0; i < 3; i++) {
      if (fabsf(g[i]) >= cfg_.gyro_threshold_dps) {
        int8_t s = g[i] > 0 ? 1 : -1;
        if (sign_[i] != 0 && s != sign_[i]) {
          crossings_[i]++;
        }
        sign_[i] = s;
      }
      if (crossings_[i] > mx) mx = crossings_[i];
    }

    if (mx >= 4) {
      t_last_osc_ = now_ms;
    }

    // Rising edge confirmation
    if (!active_ && mx >= cfg_.crossings_required) {
      active_ = true;
      t_activated_ = now_ms;
      t_last_osc_ = now_ms;
      return true;
    }

    // Automatic de-assertion when oscillation stops
    if (active_) {
      if ((now_ms - t_last_osc_ > cfg_.deassert_ms) || (now_ms - t_activated_ > cfg_.max_hold_ms)) {
        active_ = false;
        memset(crossings_, 0, sizeof(crossings_));
      }
    }

    return false;
  }

  bool active() const { return active_; }
  uint8_t max_crossings() const {
    uint8_t mx = 0;
    for (int i = 0; i < 3; i++) if (crossings_[i] > mx) mx = crossings_[i];
    return mx;
  }
  const TremorConfig& config() const { return cfg_; }

 private:
  TremorConfig cfg_;
  bool active_ = false;
  uint32_t t_window_ = 0;
  uint32_t t_activated_ = 0;
  uint32_t t_last_osc_ = 0;
  uint8_t crossings_[3] = {0, 0, 0};
  int8_t sign_[3] = {0, 0, 0};
};

} // namespace ayulink

#endif // AYULINK_TREMOR_DETECTOR_H
