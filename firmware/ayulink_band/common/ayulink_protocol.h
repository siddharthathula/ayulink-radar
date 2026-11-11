// AyuLink LoRa Telemetry Protocol v2 — shared, dependency-free, host-testable.
//
// DESIGN INTENT (v2 replaces the v1 14-byte struct):
//   v1 had no device identity beyond an 8-bit patient_id, no sequence number,
//   no authentication (1-byte XOR, trivially forgeable), and used a
//   lat/lng *offset from a hard-coded origin*, which capped precision to ~110 m
//   and range to a ~64 degree box around Telangana.
//
//   v2 adds exactly what the audit found missing:
//     - explicit protocol version (so a v1 device is rejected, not misparsed)
//     - 16-bit device_id   (up to 65535 nodes, not 255)
//     - 16-bit seq          (duplicate detection + ACK correlation)
//     - 16-bit uptime_s     (monotonic ordering + staleness detection)
//     - 48-bit HMAC-SHA256 tag (pre-shared key; replay + forgery resistance)
//     - int32 lat/lng at 1e-7 degrees (~1.1 cm) with a true INVALID sentinel
//     - explicit INVALID sentinels for hr/spo2/temp so a dead sensor can never
//       be reported as a healthy value
//
// This header has NO Arduino/ESP dependencies on purpose: the exact same code
// is compiled on the device and on the host test runner, so protocol bugs are
// caught by `pio test -e native` / g++ rather than on a patient.
//
// Byte layout is little-endian and packed. Total size 32 bytes.
//   SF10/BW125/CR4/5 airtime for 32 B is roughly 450 ms. Emergency delivery
//   therefore uses one immediate frame plus bounded retries, not an endless
//   2 Hz stream that would occupy the channel and collide with downlink ACKs.

#ifndef AYULINK_PROTOCOL_H
#define AYULINK_PROTOCOL_H

#include <stdint.h>
#include <stddef.h>
#include <string.h>

namespace ayulink {

static const uint8_t kProtoMagic     = 0xA7;
static const uint8_t kProtoVersion   = 0x02;
static const size_t  kTelemetrySize  = 32;
static const size_t  kAckSize        = 14;
static const size_t  kTelemetryBody  = 26;  // bytes covered by the tag
static const size_t  kAckBody        = 8;   // bytes covered by the tag
static const size_t  kTagBytes       = 6;   // 48-bit truncated HMAC-SHA256
// Authenticated display downlink: A9 02 device:u16 seq:u16 length:u8
// UTF-8 text (up to 63 bytes) HMAC:6. At most 76 bytes on air.
static const uint8_t kNoticeMagic = 0xA9;
static const size_t kNoticeHeader = 7;
static const size_t kNoticeTextMax = 63;
static const size_t kNoticeFrameMax = kNoticeHeader + kNoticeTextMax + kTagBytes;

// ── Explicit INVALID sentinels ─────────────────────────────────────────────
// Chosen so a valid reading can never collide with the sentinel.
static const uint16_t kHrInvalid   = 0xFFFF;  // bpm*2
static const uint16_t kSpo2Invalid = 0xFFFF;  // %*2
static const int16_t  kTempInvalid = 0x7FFF;  // degC*10
static const int32_t  kLatInvalid  = 0x7FFFFFFF;
static const int32_t  kLngInvalid  = 0x7FFFFFFF;

// ── Event types ───────────────────────────────────────────────────────────
enum EventType : uint8_t {
  EV_NORMAL        = 0,
  EV_SOS           = 1,  // patient pressed the button
  EV_FALL_IMPACT   = 2,  // impact seen, awaiting confirmation
  EV_FALL_CONFIRM  = 3,  // full fall state machine completed
  EV_FALL_CANCEL   = 4,  // patient cancelled a pending/active fall
  EV_TREMOR        = 5,  // experimental, NOT clinically validated
  EV_SENSOR_FAULT  = 6,  // a sensor failed — vitals are INVALID
  EV_DEVICE_OFFLINE= 7,  // periodic heartbeat gap detected
  EV_SOS_CANCEL    = 8,  // patient cancelled active SOS
};

// ── Sensor status ─────────────────────────────────────────────────────────
enum SensorStatus : uint8_t {
  SS_UNKNOWN  = 0,  // sensor never initialised / not yet probed
  SS_OK       = 1,
  SS_LEAD_OFF = 2,  // IR below threshold => device not on skin
  SS_FAULT    = 3,  // I2C init or read failure
};

// ── Flags ─────────────────────────────────────────────────────────────────
enum Flags : uint8_t {
  FLAG_GPS_LIVE  = 1 << 5,  // lat/lng is a real fix, not the fallback anchor
  FLAG_CHARGING  = 1 << 6,
  FLAG_LOW_BATT  = 1 << 7,
};

// ── ACK types ─────────────────────────────────────────────────────────────
enum AckType : uint8_t {
  ACK_TELEMETRY_RX = 1,  // low priority
  ACK_DISPATCH     = 2,  // responder accepted; show patient "help is coming"
  ACK_CLEAR        = 3,  // responder cleared the incident
  ACK_FALL_CANCEL  = 4,
  ACK_FAULT        = 5,
  ACK_NOTIFICATION = 6, // wristband rendered a verified message
  ACK_SOS_CANCEL   = 7, // SOS cancellation acknowledged
};

// HMAC callback writes kTagBytes and reports success. A failed signer must
// never produce a valid all-zero tag (nor allow a zero-tag frame to verify).
typedef bool (*HmacFn)(const uint8_t* key, size_t key_len,
                       const uint8_t* msg, size_t msg_len,
                       uint8_t* out_tag);

#pragma pack(push, 1)
struct TelemetryV2 {
  uint8_t  magic;      // 0  kProtoMagic
  uint8_t  version;    // 1  kProtoVersion
  uint16_t device_id;  // 2
  uint16_t seq;        // 4
  uint8_t  event;      // 6
  uint8_t  flags;      // 7
  uint16_t hr_bpm_x2;  // 8
  uint16_t spo2_pct_x2;// 10
  int16_t  temp_c_x10; // 12
  uint8_t  sensor_status; // 14
  uint8_t  batt_pct;   // 15  255 = unknown
  int32_t  lat_e7;     // 16
  int32_t  lng_e7;     // 20
  uint16_t uptime_s;   // 24
  // bytes 26..31 = auth tag
};
static_assert(sizeof(TelemetryV2) + kTagBytes == kTelemetrySize, "telemetry size drift");

struct AckV2 {
  uint8_t  magic;     // 0  0xA8
  uint8_t  version;   // 1
  uint16_t device_id; // 2
  uint16_t seq;       // 4  the seq being acknowledged
  uint8_t  ack_type;  // 6
  uint8_t  status;    // 7
  // bytes 8..13 = auth tag
};
static_assert(sizeof(AckV2) + kTagBytes == kAckSize, "ack size drift");
#pragma pack(pop)

// ── Encode ────────────────────────────────────────────────────────────────
// Returns kTelemetrySize on success, 0 on bad input. Refuses to encode a
// reading that is not explicitly marked INVALID when the sensor is faulty.
inline size_t encode_telemetry(const TelemetryV2& in, uint8_t* out,
                               const uint8_t* key, size_t key_len, HmacFn hmac) {
  if (!out || !hmac) return 0;
  if (in.magic != kProtoMagic) return 0;

  TelemetryV2 body = in;
  body.version = kProtoVersion;

  // Safety invariant: a faulty/unknown sensor may NOT carry a numeric vital.
  // This is the firmware-side guarantee behind Phase 3.
  if (body.sensor_status == SS_FAULT || body.sensor_status == SS_UNKNOWN) {
    body.hr_bpm_x2  = kHrInvalid;
    body.spo2_pct_x2= kSpo2Invalid;
    body.temp_c_x10 = kTempInvalid;
    if (body.batt_pct == 0) body.batt_pct = 255;
  }

  memcpy(out, &body, kTelemetryBody);
  if (!hmac(key, key_len, out, kTelemetryBody, out + kTelemetryBody)) return 0;
  return kTelemetrySize;
}

// ── Verify tag (constant-time compare) ────────────────────────────────────
inline bool verify_telemetry(const uint8_t* buf, size_t len,
                             const uint8_t* key, size_t key_len, HmacFn hmac) {
  if (!buf || !hmac) return false;
  if (len != kTelemetrySize) return false;
  if (buf[0] != kProtoMagic) return false;
  if (buf[1] != kProtoVersion) return false;   // reject v1 / future unknown

  uint8_t want[kTagBytes];
  if (!hmac(key, key_len, buf, kTelemetryBody, want)) return false;
  uint8_t diff = 0;
  for (size_t i = 0; i < kTagBytes; ++i) diff |= (uint8_t)(want[i] ^ buf[kTelemetryBody + i]);
  return diff == 0;
}

// ── Decode (only call after verify_telemetry) ─────────────────────────────
inline void decode_telemetry(const uint8_t* buf, TelemetryV2* out) {
  if (!out || !buf) return;
  memcpy(out, buf, kTelemetryBody);
}

// ── Sentinel helpers ──────────────────────────────────────────────────────
inline bool hr_valid(const TelemetryV2& t)      { return t.hr_bpm_x2   != kHrInvalid; }
inline bool spo2_valid(const TelemetryV2& t)    { return t.spo2_pct_x2 != kSpo2Invalid; }
inline bool temp_valid(const TelemetryV2& t)    { return t.temp_c_x10  != kTempInvalid; }
inline bool lat_valid(const TelemetryV2& t)     { return t.lat_e7 != kLatInvalid && t.lng_e7 != kLngInvalid; }

inline float hr_bpm(const TelemetryV2& t)   { return hr_valid(t)   ? t.hr_bpm_x2 / 2.0f   : -1.0f; }
inline float spo2_pct(const TelemetryV2& t) { return spo2_valid(t) ? t.spo2_pct_x2 / 2.0f : -1.0f; }
inline float temp_c(const TelemetryV2& t)   { return temp_valid(t) ? t.temp_c_x10 / 10.0f : -1.0f; }
inline double lat_deg(const TelemetryV2& t) { return lat_valid(t)  ? t.lat_e7 / 1e7 : -999.0; }
inline double lng_deg(const TelemetryV2& t) { return lat_valid(t)  ? t.lng_e7 / 1e7 : -999.0; }

inline bool is_emergency_event(uint8_t ev) {
  return ev == EV_SOS || ev == EV_FALL_IMPACT || ev == EV_FALL_CONFIRM || ev == EV_TREMOR;
}

// ── Concurrent event bits (TelemetryV2.flags) ─────────────────────────────
// WHY THIS EXISTS
//   `event` can only carry ONE value, and the wristband used to pick a single
//   winner with a priority chain (sos > fall > tremor). So a patient who pressed
//   SOS and then fell transmitted only SOS, and the dashboard was told the fall
//   never happened. Every event is therefore ALSO published as a bit in `flags`,
//   so one packet can describe everything that is true at that instant.
//
//   `event` is still populated with the highest-priority condition so any
//   existing v2 receiver that only reads `event` keeps working unchanged.
enum EventBits : uint8_t {
  FLAG_SOS          = 0x01,
  FLAG_FALL         = 0x02,
  FLAG_FALL_IMPACT  = 0x04,
  FLAG_TREMOR       = 0x08,
  FLAG_SENSOR_FAULT = 0x10,
  // These upper bits are transport flags, not event bits. Keeping the spaces
  // separate prevents a live-GPS packet from looking like a fall/SOS packet.
  // Use the transport values above; aliases make packet construction clear.
}; 

// Read every event, never just the primary one.
inline bool has_sos(const TelemetryV2& t) {
  return (t.flags & FLAG_SOS) || t.event == EV_SOS;
}
inline bool has_fall(const TelemetryV2& t) {
  return (t.flags & FLAG_FALL) || t.event == EV_FALL_CONFIRM;
}
inline bool has_tremor(const TelemetryV2& t) {
  return (t.flags & FLAG_TREMOR) || t.event == EV_TREMOR;
}
inline bool has_sensor_fault(const TelemetryV2& t) {
  return (t.flags & FLAG_SENSOR_FAULT) || t.event == EV_SENSOR_FAULT;
}

// ── Sequence / replay window ──────────────────────────────────────────────
// Monotonic 16-bit sequence with wraparound-safe comparison. Rejects anything
// at or below the highest accepted seq within the window.
class SeqWindow {
 public:
  // The replay bitmap must cover the 16-bit sequence space, so it is fixed at
  // 256 slots. It was previously declared as `bool seen_[256]` but indexed by
  // `seq % capacity_` with a caller-chosen capacity of 64: that wasted 768 bytes
  // of the ESP32's ~320 KB heap to protect 64 slots, and any `capacity > 256`
  // would have indexed straight off the end of the arrays.
  static const size_t kSlots = 256;

  explicit SeqWindow(size_t capacity = 64)
      : capacity_(capacity > kSlots ? kSlots : (capacity < 1 ? 1 : capacity)) {
    reset();
  }

  void reset() {
    highest_ = 0;
    has_highest_ = false;
    for (size_t i = 0; i < kSlots; ++i) {
      seen_[i] = 0;
      seen_seq_[i] = 0;
    }
  }

  // Newer-than (wraparound safe): (int16_t)(a-b) > 0
  static bool newer(uint16_t a, uint16_t b) { return (int16_t)(a - b) > 0; }

  enum Result { kAccept, kRejectDuplicate, kRejectStale };
  Result accept(uint16_t seq) {
    if (has_highest_ && seq == highest_) return kRejectDuplicate;
    if (has_highest_ && !newer(seq, highest_)) return kRejectStale;
    // duplicate check inside the recent window
    const size_t slot = static_cast<size_t>(seq) % kSlots;
    if (seen_[slot] && seen_seq_[slot] == seq) return kRejectDuplicate;
    seen_[slot] = 1;
    seen_seq_[slot] = seq;
    if (!has_highest_ || newer(seq, highest_)) { highest_ = seq; has_highest_ = true; }
    return kAccept;
  }

  uint16_t highest() const { return highest_; }
  size_t capacity() const { return capacity_; }
  // Bytes of static state this object occupies on the device.
  static constexpr size_t footprint() {
    return sizeof(bool) * kSlots + sizeof(uint16_t) * kSlots + sizeof(uint16_t) + 1;
  }

 private:
  size_t capacity_;
  bool seen_[kSlots];
  uint16_t seen_seq_[kSlots];
  uint16_t highest_ = 0;
  bool has_highest_ = false;
};

// ── ACK encode / verify ───────────────────────────────────────────────────
inline size_t encode_ack(uint16_t device_id, uint16_t seq, uint8_t ack_type,
                         uint8_t status, uint8_t* out,
                         const uint8_t* key, size_t key_len, HmacFn hmac) {
  if (!out || !hmac) return 0;
  AckV2 a;
  a.magic     = 0xA8;
  a.version   = kProtoVersion;
  a.device_id = device_id;
  a.seq       = seq;
  a.ack_type  = ack_type;
  a.status    = status;
  memcpy(out, &a, kAckBody);
  if (!hmac(key, key_len, out, kAckBody, out + kAckBody)) return 0;
  return kAckSize;
}

inline bool verify_ack(const uint8_t* buf, size_t len,
                       const uint8_t* key, size_t key_len, HmacFn hmac) {
  if (!buf || !hmac) return false;
  if (len != kAckSize) return false;
  if (buf[0] != 0xA8 || buf[1] != kProtoVersion) return false;
  uint8_t want[kTagBytes];
  if (!hmac(key, key_len, buf, kAckBody, want)) return false;
  uint8_t diff = 0;
  for (size_t i = 0; i < kTagBytes; ++i) diff |= (uint8_t)(want[i] ^ buf[kAckBody + i]);
  return diff == 0;
}

inline bool decode_ack(const uint8_t* buf, AckV2* out) {
  if (!out || !buf) return false;
  memcpy(out, buf, kAckBody);
  return true;
}

inline size_t encode_notice(uint16_t device_id, uint16_t seq, const uint8_t* text,
                            size_t text_len, uint8_t* out, const uint8_t* key,
                            size_t key_len, HmacFn hmac) {
  if (!out || !text || !hmac || !text_len || text_len > kNoticeTextMax) return 0;
  out[0] = kNoticeMagic; out[1] = kProtoVersion;
  out[2] = (uint8_t)device_id; out[3] = (uint8_t)(device_id >> 8);
  out[4] = (uint8_t)seq; out[5] = (uint8_t)(seq >> 8);
  out[6] = (uint8_t)text_len;
  memcpy(out + kNoticeHeader, text, text_len);
  const size_t body = kNoticeHeader + text_len;
  if (!hmac(key, key_len, out, body, out + body)) return 0;
  return body + kTagBytes;
}

inline bool verify_notice(const uint8_t* buf, size_t len, const uint8_t* key,
                          size_t key_len, HmacFn hmac) {
  if (!buf || !hmac || len < kNoticeHeader + 1 + kTagBytes ||
      len > kNoticeFrameMax || buf[0] != kNoticeMagic ||
      buf[1] != kProtoVersion || !buf[6] || buf[6] > kNoticeTextMax ||
      len != kNoticeHeader + buf[6] + kTagBytes) return false;
  const size_t body = kNoticeHeader + buf[6];
  uint8_t tag[kTagBytes];
  if (!hmac(key, key_len, buf, body, tag)) return false;
  uint8_t diff = 0;
  for (size_t i = 0; i < kTagBytes; ++i) diff |= tag[i] ^ buf[body + i];
  return diff == 0;
}

}  // namespace ayulink

#endif  // AYULINK_PROTOCOL_H
