// PPG read stabiliser for the MAX30102 wristband.
//
// WHY THIS EXISTS
//   The raw MAX30102 HR was reported straight from the SparkFun beat detector
//   with no sanity filtering, and the symptom was readings that "suddenly drop to
//   very low values". The mechanism is well understood and is NOT a sensor fault:
//
//   The detector infers heart rate from the interval between detected beats:
//
//       HR = 60000 / (t_now - t_prev)
//
//   A single MISSED beat doubles that interval, so the computed rate instantly
//   HALVES — a 78 bpm pulse reported as 39. A single spurious beat does the
//   mirror image and reports an impossible tachycardia. Both are artefacts of
//   one bad sample, not physiology, and on a wristband the detector sees them
//   constantly: the strap shifts, ambient light changes, and the pulse
//   amplitude at the photodiode moves with every wrist rotation.
//
//   So the fix is not "sample harder". It is to stop trusting single intervals.
//
// THE STRATEGY, in order of how much it removes each artefact
//   1. CONFIDENCE GATE. Pulse amplitude (AC) is checked against a floor before
//      any beat is accepted. A faint, noisy signal is not used to update HR at
//      all, and the previous good value is HELD rather than replaced by noise.
//   2. MEDIAN OF N. Beat intervals are not averaged, because one doubled
//      interval poisons an average. The median discards it outright.
//   3. RATE-OF-CHANGE REJECTION. Consecutive accepted rates may not jump beyond
//      a plausible fraction. This catches the residual artefacts the median
//      cannot.
//   4. WARM-UP. Nothing is reported until the window has filled, so the display
//      never shows a number derived from one or two intervals.
//
// Every threshold is expressed in terms a clinician would recognise, and no
// value leaves here that is not physiologically possible.
//
// HOST-SAFE: no Arduino/ESP dependency, so it is compiled and tested by
// firmware/test/run_tests.sh on the same host runner as the protocol.

#ifndef AYULINK_PPG_FILTER_H
#define AYULINK_PPG_FILTER_H

#include <stdint.h>
#include <stddef.h>

namespace ayulink {

// ── Tunables ───────────────────────────────────────────────────────────────
static const uint8_t  kMedianWindow = 5;    // beat intervals kept for the median
static const float    kMinHr = 35.0f;       // bpm. Below this is not a living adult pulse.
static const float    kMaxHr = 200.0f;      // bpm. Above this is not a sustained human rate.
static const float    kMaxRelativeJump = 0.30f;  // reject >30% change between accepted rates
static const float    kMaxAbsoluteJump = 25.0f;   // ...but always allow 25 bpm of real change

// ESCAPE HATCH. A rate-of-change filter that compares only against the last
// ACCEPTED value can latch: if the patient's real rate steps outside the allowed
// window, every subsequent beat is rejected, `last_bpm_` never moves, and the
// reported value stays frozen at the old rate indefinitely. A frozen vital sign
// is more dangerous than a noisy one, so after this many consecutive rejections
// the window is discarded and the new rate is adopted. At ~75 bpm this is about
// six seconds of sustained disagreement, so a single artefact can never trip it,
// but a genuine sustained change always gets through.
static const uint8_t  kMaxConsecutiveReject = 6;

// A beat interval outside this window cannot come from a human pulse. 35 bpm ->
// 1714 ms, 200 bpm -> 300 ms.
static const uint32_t kMinIntervalMs = 280;
static const uint32_t kMaxIntervalMs = 1800;

struct PpgReading {
  float bpm;        // filtered, or the held previous value
  bool  valid;      // false until the window has filled
  bool  held;       // true when the newest sample was rejected and bpm is held
  uint8_t confidence; // 0..100, derived from AC amplitude
};

class PpgStabiliser {
 public:
  PpgStabiliser() { reset(); }

  void reset() {
    window_[0] = window_[1] = window_[2] = window_[3] = window_[4] = 0.0f;
    fill_ = 0;
    last_bpm_ = 0.0f;
    have_last_ = false;
    rejected_ = 0;
    accepted_ = 0;
    consecutive_reject_ = 0;
  }

  /**
   * Feed one detected beat.
   *
   * @param interval_ms  time since the previous detected beat
   * @param ac_amplitude  pulse AC component for this beat (0 when unknown). The
   *                      caller passes the peak-to-trough swing of the IR signal.
   * @param ac_floor      minimum AC amplitude to trust. Below this the beat is
   *                      ignored and the previous value is held.
   */
  PpgReading pushBeat(uint32_t interval_ms, float ac_amplitude = 0.0f,
                      float ac_floor = 0.0f) {
    PpgReading out = {0.0f, false, false, 0};
    // Latch guard: if the filter has disagreed with the sensor for long
    // enough, trust the sensor and start the window again rather than stay
    // frozen on a stale value.
    const bool force = have_last_ && (consecutive_reject_ >= kMaxConsecutiveReject);
    out.confidence = confidenceFrom(ac_amplitude, ac_floor);

    // 1. Physiological interval sanity. A doubled or halved interval is the
    //    exact failure mode this whole module exists to catch.
    if (!force && (interval_ms < kMinIntervalMs || interval_ms > kMaxIntervalMs)) {
      rejected_++; consecutive_reject_++;
      out.bpm = have_last_ ? last_bpm_ : 0.0f;
      out.valid = have_last_;
      out.held = true;
      return out;
    }

    const float raw = 60000.0f / (float)interval_ms;

    // 2. Confidence gate. Faint signal means the detector is guessing.
    if (!force && ac_floor > 0.0f && ac_amplitude > 0.0f &&
        ac_amplitude < ac_floor) {
      rejected_++; consecutive_reject_++;
      out.bpm = have_last_ ? last_bpm_ : 0.0f;
      out.valid = have_last_;
      out.held = true;
      return out;
    }

    // 3. Rate-of-change rejection against the last ACCEPTED rate, so a burst of
    //    bad intervals cannot walk the value gradually downhill.
    if (have_last_ && !force) {
      const float diff = raw - last_bpm_;
      const float allowed = (last_bpm_ * kMaxRelativeJump > kMaxAbsoluteJump)
                                ? last_bpm_ * kMaxRelativeJump
                                : kMaxAbsoluteJump;
      if (diff > allowed || -diff > allowed) {
        rejected_++; consecutive_reject_++;
        out.bpm = last_bpm_;
        out.valid = true;
        out.held = true;
        return out;
      }
    }

    if (!force && (raw < kMinHr || raw > kMaxHr)) {
      rejected_++; consecutive_reject_++;
      out.bpm = have_last_ ? last_bpm_ : 0.0f;
      out.valid = have_last_;
      out.held = true;
      return out;
    }

    // 4. Median of the window. Insertion sort over a 5-element array is cheaper
    //    than anything else and runs at beat rate, not loop rate.
    if (force) {
      // Discard the stale window: otherwise the median would be dragged back
      // toward the old rate and take several more beats to escape it.
      fill_ = 0;
      window_[0] = raw;
      fill_ = 1;
    } else if (fill_ < kMedianWindow) {
      window_[fill_++] = raw;
    } else {
      window_[kMedianWindow - 1] = raw;
    }
    accepted_++;
    consecutive_reject_ = 0;

    float med = median();
    last_bpm_ = med;
    have_last_ = true;

    out.bpm = med;
    out.valid = true;
    out.held = false;
    return out;
  }

  /** Current filtered value without feeding a beat. */
  float current() const { return have_last_ ? last_bpm_ : 0.0f; }
  bool   hasValue() const { return have_last_; }
  /** True once the median window is full — before this, `valid` stays false. */
  bool   warm() const { return fill_ >= kMedianWindow; }
  uint16_t accepted() const { return accepted_; }
  uint16_t rejected() const { return rejected_; }

  static uint8_t confidenceFrom(float ac_amplitude, float ac_floor) {
    if (ac_amplitude <= 0.0f) return 50;              // unknown: assume neutral
    if (ac_floor <= 0.0f) return 100;
    if (ac_amplitude < ac_floor) return 0;
    const float ratio = ac_amplitude / ac_floor;
    if (ratio >= 4.0f) return 100;
    if (ratio >= 2.0f) return 75;
    if (ratio >= 1.2f) return 50;   // passing, but only just
    return 25;
  }

 private:
  float median() const {
    float tmp[kMedianWindow];
    const uint8_t n = fill_ < kMedianWindow ? fill_ : kMedianWindow;
    for (uint8_t i = 0; i < n; i++) tmp[i] = window_[i];
    for (uint8_t i = 1; i < n; i++) {
      const float key = tmp[i];
      int8_t j = (int8_t)i - 1;
      while (j >= 0 && tmp[j] > key) { tmp[j + 1] = tmp[j]; j--; }
      tmp[j + 1] = key;
    }
    return tmp[n / 2];
  }

  float window_[kMedianWindow];
  uint8_t fill_ = 0;
  float last_bpm_ = 0.0f;
  bool have_last_ = false;
  uint16_t rejected_ = 0;
  uint16_t accepted_ = 0;
  uint8_t consecutive_reject_ = 0;
};

}  // namespace ayulink

#endif  // AYULINK_PPG_FILTER_H