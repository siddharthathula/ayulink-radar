// AyuLink servo slot angles — shared, dependency-free, host-testable.
//
// WHY THIS IS A SEPARATE HEADER
//   The 1-servo / 4-slot rotary magazine needs ONE rule in two places: the ESP8266
//   dispenser firmware, and the FastAPI backend that forwards commands. If the
//   clamp lives in only one of them, a crafted or buggy command can drive a servo
//   past its mechanical limit.
//
// WHY THE CLAMP MATTERS ON THIS HARDWARE
//   An SG90 is a hobby servo rated for roughly 0-180 deg. Commanding beyond that
//   does not stop it cleanly: it stalls against the end stop, the horn keeps
//   loading up, the motor draws current and the case gets hot. On a medicine
//   hopper the failure is also a physical one - a jammed magazine, or a pill
//   dropped in the wrong place.
//
// DESIGN RULE: TARGET-ONLY, NEVER LIVE
//   A slot angle is a TARGET that the firmware uses the next time that slot is
//   dispensed. Setting an angle never moves the servo by itself. A responder
//   adjusting calibration must not be able to jog the hopper and drop a dose by
//   brushing a slider.

#ifndef AYULINK_SERVO_ANGLES_H
#define AYULINK_SERVO_ANGLES_H

#include <stdint.h>

namespace ayulink {

// ONE SERVO, FOUR POCKETS - THE GEOMETRY
//   The magazine travel is 180 degrees, divided into 5 equal segments of 36
//   degrees. Four segments carry the four pockets; the fifth is deliberately
//   left unused as end-stop margin.
//
//     segment 1  0  .. 36   slot 1 (Morning)   -> 36 deg
//     segment 2 36  .. 72   slot 2 (Afternoon) -> 72 deg
//     segment 3 72  .. 108  slot 3 (Evening)   -> 108 deg
//     segment 4 108 .. 144  slot 4 (Night)     -> 144 deg
//     segment 5 144 .. 180  UNUSED - end-stop margin
//
//   WHY 36 AND NOT 60: the previous table was 0/60/120/180, which put slot 4 at
//   exactly 180 deg. An SG90 commanded to its full travel does not stop cleanly -
//   it stalls against the end stop, the horn keeps loading up, the motor draws
//   current and the case gets hot. Keeping the last segment free means the
//   furthest pocket is still 36 deg clear of the mechanical stop.
//
//   These are factory defaults, not a guarantee that they suit any particular
//   hopper, which is exactly why per-unit calibration exists.
static const int kServoSlotCount   = 4;
static const int kServoAngleMin    = 0;    // degrees
static const int kServoAngleMax    = 180;  // degrees
static const int kServoSegments    = 5;    // 180 / 36
static const int kServoSegmentDeg  = 36;   // 180 / 5
static const int kServoHomeAngle   = 36;   // 36 deg is ideal home position
static const int kServoDefaultAngles[kServoSlotCount] = { 36, 72, 108, 144 };

// Sentinel meaning "no override given, use the slot's stored angle".
static const int kServoNoAngleOverride = -1;

inline bool servo_slot_valid(int slot) {
  return slot >= 1 && slot <= kServoSlotCount;
}

// Clamp any integer into the servo's safe travel. Non-finite/absurd values
// collapse to the minimum rather than to something plausible-looking, because a
// wrong angle here moves real medicine and there is no safe guess.
inline int servo_clamp_angle(int angle) {
  if (angle < kServoAngleMin) return kServoAngleMin;
  if (angle > kServoAngleMax) return kServoAngleMax;
  return angle;
}

// Resolve the angle a dispense should actually use.
//   slot           1..4
//   override_deg   kServoNoAngleOverride, or an already-validated angle
//   stored_deg     the calibrated angle for that slot
// The override is clamped again on the way through: a value that arrived over the
// wire has not necessarily been through the backend's validation.
inline int servo_resolve_angle(int slot, int override_deg, int stored_deg) {
  if (!servo_slot_valid(slot)) return kServoAngleMin;
  if (override_deg != kServoNoAngleOverride) return servo_clamp_angle(override_deg);
  return servo_clamp_angle(stored_deg);
}

}  // namespace ayulink

#endif  // AYULINK_SERVO_ANGLES_H
