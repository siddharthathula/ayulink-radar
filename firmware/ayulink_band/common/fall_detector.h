// AyuLink Fall Detection State Machine v2 — shared, dependency-free, host-testable.
//
// WHY THIS REPLACES THE v1 CHECK
//   v1 (wristband.ino):  if (totalG > 1.8f) -> FALL
//   That is a single unvalidated magnitude threshold. It fires when the band is
//   dropped onto a table, when the wearer claps, and when the band is set down
//   hard. It MISSES slow collapses, fainting, and falls where the wrist is
//   pinned so impact is attenuated below 1.8 g at the wrist. It had no posture
//   check, no immobility check, and no patient cancel window.
//
// WHAT v2 DOES
//   NORMAL -> FREE_FALL -> IMPACT -> ORIENTATION_CHANGE -> IMMOBILITY -> CONFIRMED
//   Each transition requires its own condition to hold for a minimum dwell
//   time, so a single noisy sample cannot advance the machine. A high-g event
//   that is NOT preceded by free-fall is classified as a non-fall impulse
//   (drop / clap / set-down) and is explicitly NOT escalated.
//
//   REST ORIENTATION CALIBRATION (v3 fix)
//   v2 measured tilt against a HARDCODED +Z "up" axis. A wristband is normally
//   worn on a roughly horizontal forearm, so gravity sits on X or Y and the
//   tilt read ~90 deg permanently. With inertial_enabled that meant a stationary,
//   correctly-worn band confirmed a fall about every 23 seconds, forever.
//
//   v3 learns the wearer's actual rest gravity vector from a still window at
//   power-on and measures tilt relative to THAT. "Tilted" now means "rotated
//   away from how this band is actually being worn", which is what a fall does.
//   Until a valid rest orientation exists the detector refuses to confirm
//   anything rather than guessing - a boot-time false alert is worse than a
//   slightly delayed first one.
//
//   RE-ARM GATE
//   v2 also left the state machine re-armed immediately after its cooldown
//   expired (FS_COOLDOWN -> FS_NORMAL bypassed enter(), so t_state_ms_ was
//   stale and the inertial timer was already satisfied). v3 requires the band to
//   return within tilt_deg of rest before it can detect again, so one real fall
//   produces one alert instead of an endless stream.
//
//   IMPORTANT HONESTY NOTE
//   This is a defensible algorithm, NOT a clinically validated device. No
//   accuracy figure may be published from synthetic traces. See
//   firmware/test/fall_harness.cpp for what IS measurable offline and
//   docs/VALIDATION.md for the protocol required before any clinical claim.

#ifndef AYULINK_FALL_DETECTOR_H
#define AYULINK_FALL_DETECTOR_H

#include <stdint.h>
#include <math.h>

namespace ayulink {

enum FallState : uint8_t {
  FS_NORMAL = 0,
  FS_FREE_FALL,        // g dropped toward zero — device is in the air
  FS_IMPACT,           // g spiked — waiting to see if it was a landing
  FS_ORIENTATION,      // gravity vector moved — body is no longer upright
  FS_IMMOBILITY,       // body is down and not moving; cancel window open
  FS_INERTIAL,         // sustained horizontal + no impact (slow collapse)
  FS_COOLDOWN,         // recently confirmed; ignore briefly
};

struct FallConfig {
  // free-fall
  float    freefall_g       = 0.50f;  // g below this counts as free-fall (was 0.65)
  uint32_t freefall_ms      = 50;     // must persist this long
  // impact
  float    impact_g         = 3.20f;  // g above this counts as impact (decreased sensitivity from 2.60 to avoid false bumps)
  uint32_t impact_window_ms = 700;    // must land within this of free-fall
  // orientation
  float    tilt_deg         = 65.0f;  // tilt from CALIBRATED rest axis (was 55)
  uint32_t tilt_ms          = 300;    // tilt must persist this long
  // immobility
  float    still_g          = 0.16f;  // |g-1.0| below this = still
  uint32_t immobility_ms     = 3000;   // still period before escalation (was 2000)
  // confirmation
  uint32_t cancel_window_ms = 4000;   // patient may abort during immobility
  uint32_t cooldown_ms      = 45000;  // ignore after a confirm
  uint32_t rearm_ms         = 2000;   // must sit within tilt_deg of rest to re-arm
  // inertial collapse (slow collapse / fainting: body goes horizontal WITHOUT a
  // high-g impact, so the free-fall+impact signature never fires).
  bool     inertial_enabled = true;
  uint32_t inertial_ms      = 6000;   // sustained tilt + stillness (was 5000)
  // rest-orientation calibration
  uint32_t calib_ms         = 1500;   // still window that defines the rest axis
  float    calib_still_g    = 0.25f;  // must be within this of 1 g to calibrate
  // safety
  float    axis_tol         = 0.08f;  // accel magnitude noise floor
};

struct FallVerdict {
  bool     is_fall;
  uint8_t  state;
  float    peak_g;
  float    min_g;
  float    max_tilt;
  uint32_t duration_ms;
};

// Feed accel in g at the caller's sample rate. dt_ms should be the real elapsed
// time between samples — v1's error was using an unnormalised delta while the
// loop period was dominated by OLED I2C traffic.
class FallDetector {
 public:
  explicit FallDetector(const FallConfig& c = FallConfig()) : cfg_(c) { reset(); }

  void reset() {
    state_ = FS_NORMAL;
    t_state_ms_ = 0;
    t_ever_ = 0;
    peak_ = 0; min_ = 10.f; max_tilt_ = 0;
    t_freefall_ = 0; t_impact_ = 0; t_ever_mark_ = 0;
    cancel_window_open_ = false;
    freefall_confirmed_ = false;
    last_verdict_ = FallVerdict();
    armed_ = true;
    t_rearm_ = 0;
  }

  // Re-learn the rest orientation. The wristband calls this at power-on and
  // whenever the wearer asks for it, so a band that was put on in a different
  // posture does not carry a stale axis.
  void recalibrate() {
    rest_valid_ = false;
    calib_accum_ms_ = 0;
    calib_x_ = 0; calib_y_ = 0; calib_z_ = 0;
  }

  bool rest_valid() const { return rest_valid_; }
  bool armed() const { return armed_; }

  // ax, ay, az in g. Returns true exactly once per confirmed fall.
  bool update(float ax, float ay, float az, uint32_t dt_ms) {
    float g = sqrtf(ax*ax + ay*ay + az*az);
    t_ever_ += dt_ms;
    if (g > peak_) peak_ = g;
    if (g < min_) min_ = g;

    // reject physically impossible samples (bus fault / I2C glitch)
    if (g < 0.001f || g > 12.0f) { hard_reset(); return false; }

    // ── rest-orientation calibration ──────────────────────────────────────
    // Learn the gravity vector while the band is being worn and still. Any
    // movement restarts the window, so "still" really means still.
    if (!rest_valid_) {
      if (fabsf(g - 1.0f) < cfg_.calib_still_g) {
        calib_x_ += ax * dt_ms; calib_y_ += ay * dt_ms; calib_z_ += az * dt_ms;
        calib_accum_ms_ += dt_ms;
        if (calib_accum_ms_ >= cfg_.calib_ms) {
          float n = sqrtf(calib_x_*calib_x_ + calib_y_*calib_y_ + calib_z_*calib_z_);
          if (n > 0.001f) {
            rest_x_ = calib_x_ / n; rest_y_ = calib_y_ / n; rest_z_ = calib_z_ / n;
            rest_valid_ = true;
          } else {
            calib_accum_ms_ = 0; calib_x_ = 0; calib_y_ = 0; calib_z_ = 0;
          }
        }
      } else {
        calib_accum_ms_ = 0; calib_x_ = 0; calib_y_ = 0; calib_z_ = 0;
      }
      // No trustworthy rest axis yet, so "tilt" is unknowable. Refusing here is
      // deliberate: guessing is what produced the boot-time false alerts.
      return false;
    }

    // ── tilt relative to the calibrated rest axis ──────────────────────────
    float dot = (ax * rest_x_ + ay * rest_y_ + az * rest_z_) / g;
    if (dot > 1.f) dot = 1.f;
    if (dot < -1.f) dot = -1.f;
    float tilt = acosf(dot) * 57.29578f;   // deg away from how the band is worn
    if (tilt > max_tilt_) max_tilt_ = tilt;

    // ── re-arm gate ───────────────────────────────────────────────────────
    // After a confirm the band is disarmed until it comes back near rest. This
    // is what stops one real fall from generating an endless alert stream while
    // the wearer is still on the floor.
    if (!armed_) {
      if (tilt <= cfg_.tilt_deg) {
        if (t_ever_ - t_rearm_ >= cfg_.rearm_ms) armed_ = true;
      } else {
        t_rearm_ = t_ever_;
      }
      if (!armed_) return false;
    }

    switch (state_) {
      case FS_NORMAL:
      case FS_COOLDOWN:
        if (state_ == FS_COOLDOWN) {
          // enter(), not a bare assignment: v2 set state_ directly here, which
          // left t_state_ms_ stale so the inertial timer below was already
          // satisfied on the very next sample.
          if (t_ever_ - t_ever_mark_ > cfg_.cooldown_ms) enter(FS_NORMAL);
          else break;
        }
        if (g < cfg_.freefall_g) { enter(FS_FREE_FALL); t_freefall_ = t_ever_; break; }
        // Inertial path: body becomes horizontal and stays there with no
        // high-g impact at all (slow collapse, fainting, sliding down a wall).
        if (cfg_.inertial_enabled && tilt > cfg_.tilt_deg) {
          if (t_ever_ - t_state_ms_ >= cfg_.tilt_ms && fabsf(g - 1.0f) < cfg_.still_g) {
            enter(FS_INERTIAL);
            cancel_window_open_ = true;
          }
        } else if (tilt <= cfg_.tilt_deg) {
          t_state_ms_ = t_ever_;   // back upright: restart the tilt timer
        }
        break;

      case FS_INERTIAL:
        if (tilt <= cfg_.tilt_deg) { enter(FS_NORMAL); break; }   // stood back up
        if (fabsf(g - 1.0f) >= cfg_.still_g) {                    // moved => fine
          cancel_window_open_ = false; enter(FS_NORMAL); break;
        }
        if (t_ever_ - t_state_ms_ >= cfg_.inertial_ms) {
          cancel_window_open_ = false;
          t_ever_mark_ = t_ever_;
          last_verdict_ = FallVerdict();
          last_verdict_.is_fall = true;
          last_verdict_.state = FS_INERTIAL;
          last_verdict_.peak_g = peak_;
          last_verdict_.min_g = min_;
          last_verdict_.max_tilt = max_tilt_;
          last_verdict_.duration_ms = t_ever_ - t_state_ms_;
          armed_ = false;
          t_rearm_ = t_ever_;
          enter(FS_COOLDOWN);
          return true;
        }
        break;

      case FS_FREE_FALL:
        if (g < cfg_.freefall_g) {
          if (t_ever_ - t_state_ms_ >= cfg_.freefall_ms) {
            freefall_confirmed_ = true;
          }
        } else if (g > cfg_.impact_g) {
          // Sustained free-fall followed by impact spike within impact window
          if (freefall_confirmed_ && (t_ever_ - t_freefall_ <= cfg_.impact_window_ms)) {
            enter(FS_IMPACT);
            t_impact_ = t_ever_;
          } else {
            enter(FS_NORMAL);
          }
        } else {
          // g is between freefall_g and impact_g
          if (!freefall_confirmed_) {
            // Brief dip (< freefall_ms) — not a real free-fall (walking bob, step, arm swing)
            enter(FS_NORMAL);
          } else if (t_ever_ - t_freefall_ > cfg_.impact_window_ms) {
            // Impact window elapsed without reaching impact_g
            enter(FS_NORMAL);
          }
          // Otherwise: freefall confirmed and waiting for impact spike within window.
        }
        break;

      case FS_IMPACT:
        if (g < cfg_.freefall_g - 0.2f) {
          // bounced back into the air — probably dropped, not a landing
          enter(FS_NORMAL);
        } else if (tilt > cfg_.tilt_deg) {
          if (t_ever_ - t_impact_ > cfg_.impact_window_ms) {
            // impact settled, now rotated: this is a landing, not a bump
            enter(FS_ORIENTATION);
          }
        } else if (t_ever_ - t_impact_ > cfg_.impact_window_ms) {
          // impact but device stayed upright => put down / clap / bump
          enter(FS_NORMAL);
        }
        break;

      case FS_ORIENTATION:
        if (tilt > cfg_.tilt_deg) {
          // tilt must be SUSTAINED, not a transient during walking
          if (t_ever_ - t_state_ms_ >= cfg_.tilt_ms) {
            enter(FS_IMMOBILITY);
            cancel_window_open_ = true;
          }
        } else if (t_ever_ - t_impact_ > cfg_.impact_window_ms * 3) {
          // picked straight back up
          enter(FS_NORMAL);
        }
        break;

      case FS_IMMOBILITY:
        if (fabsf(g - 1.0f) >= cfg_.still_g) {
          // person moved => they are fine
          cancel_window_open_ = false;
          enter(FS_NORMAL);
          break;
        }
        if (t_ever_ - t_state_ms_ >= cfg_.immobility_ms) {
          // body down and motionless for the full window -> escalate
          cancel_window_open_ = false;
          t_ever_mark_ = t_ever_;
          last_verdict_ = FallVerdict();
          last_verdict_.is_fall = true;
          last_verdict_.state = FS_IMMOBILITY;
          last_verdict_.peak_g = peak_;
          last_verdict_.min_g = min_;
          last_verdict_.max_tilt = max_tilt_;
          last_verdict_.duration_ms = t_ever_ - t_freefall_;
          armed_ = false;
          t_rearm_ = t_ever_;
          enter(FS_COOLDOWN);
          return true;   // one-shot
        }
        break;
    }
    return false;
  }

  // Patient long-press / downlink cancel. Valid during the immobility window.
  bool cancel() {
    if (cancel_window_open_ && (state_ == FS_IMMOBILITY || state_ == FS_INERTIAL)) {
      cancel_window_open_ = false;
      armed_ = true;
      enter(FS_NORMAL);
      return true;
    }
    return false;
  }

  uint8_t state() const { return state_; }
  bool cancel_window_open() const { return cancel_window_open_; }
  const FallConfig& config() const { return cfg_; }

 private:
  void enter(FallState s) {
    state_ = (uint8_t)s;
    t_state_ms_ = t_ever_;
    if (s == FS_FREE_FALL) freefall_confirmed_ = false;
  }
  void hard_reset() { state_ = FS_NORMAL; cancel_window_open_ = false; freefall_confirmed_ = false; hard_reset_metrics(); }
  void hard_reset_metrics() { peak_ = 0; min_ = 10.f; max_tilt_ = 0; }

  FallConfig cfg_;
  uint8_t state_;
  uint32_t t_ever_ = 0, t_state_ms_ = 0, t_ever_mark_ = 0, t_freefall_ = 0, t_impact_ = 0;
  float peak_ = 0, min_ = 10.f, max_tilt_ = 0;
  bool cancel_window_open_ = false;
  bool freefall_confirmed_ = false;
  bool armed_ = true;
  uint32_t t_rearm_ = 0;
  // calibrated rest gravity direction (unit vector)
  bool rest_valid_ = false;
  float rest_x_ = 0.f, rest_y_ = 0.f, rest_z_ = 1.f;
  float calib_x_ = 0.f, calib_y_ = 0.f, calib_z_ = 0.f;
  uint32_t calib_accum_ms_ = 0;
  FallVerdict last_verdict_;
};

static const char* fall_state_name(uint8_t s) {
  switch (s) {
    case FS_NORMAL: return "NORMAL";
    case FS_FREE_FALL: return "FREE_FALL";
    case FS_IMPACT: return "IMPACT";
    case FS_ORIENTATION: return "ORIENTATION";
    case FS_IMMOBILITY: return "IMMOBILITY";
    case FS_INERTIAL: return "INERTIAL";
    case FS_COOLDOWN: return "COOLDOWN";
    default: return "?";
  }
}

}  // namespace ayulink

#endif  // AYULINK_FALL_DETECTOR_H
