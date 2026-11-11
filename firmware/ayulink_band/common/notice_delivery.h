// Bounded gateway bookkeeping for operator notifications. No Arduino dependency.
#ifndef AYULINK_NOTICE_DELIVERY_H
#define AYULINK_NOTICE_DELIVERY_H

#include <stdint.h>
#include <stddef.h>
#include <string.h>

namespace ayulink {

inline bool printable_ascii(const char* s, size_t max_len) {
  if (!s || !*s) return false;
  size_t n = 0;
  for (; s[n]; ++n) {
    if (n >= max_len || (uint8_t)s[n] < 0x20 || (uint8_t)s[n] > 0x7e) return false;
  }
  return true;
}

enum NoticeStatus : uint8_t { NOTICE_QUEUED, NOTICE_DISPLAYED, NOTICE_FAILED, NOTICE_EXPIRED };

inline const char* notice_status_name(NoticeStatus s) {
  switch (s) {
    case NOTICE_QUEUED: return "queued";
    case NOTICE_DISPLAYED: return "displayed";
    case NOTICE_FAILED: return "failed";
    case NOTICE_EXPIRED: return "expired";
  }
  return "failed";
}

struct NoticeRecord {
  char id[65];
  uint16_t radio_seq;
  uint32_t expires_ms;
  uint32_t retain_until_ms;
  NoticeStatus status;
  bool used;
  bool queued_pending;
  bool final_pending;
};

class NoticeRegistry {
 public:
  static const uint8_t kCapacity = 8;
  static const uint32_t kRetentionMs = 30000;

  NoticeRegistry() { memset(records_, 0, sizeof(records_)); }

  NoticeRecord* find(const char* id, uint32_t now) {
    if (!id || !*id) return nullptr;
    for (uint8_t i = 0; i < kCapacity; ++i) {
      NoticeRecord& r = records_[i];
      if (!r.used || strcmp(r.id, id) != 0) continue;
      if (r.status != NOTICE_QUEUED && !r.queued_pending &&
          !r.final_pending && (int32_t)(now - r.retain_until_ms) >= 0) {
        r.used = false;
        return nullptr;
      }
      return &r;
    }
    return nullptr;
  }

  bool has_slot(uint32_t now) const {
    for (uint8_t i = 0; i < kCapacity; ++i)
      if (!records_[i].used || (records_[i].status != NOTICE_QUEUED &&
          !records_[i].queued_pending && !records_[i].final_pending &&
          (int32_t)(now - records_[i].retain_until_ms) >= 0)) return true;
    return false;
  }

  NoticeRecord* add(const char* id, uint16_t seq, uint32_t now, uint32_t ttl_ms,
                    bool accepted) {
    size_t len = id ? strlen(id) : 0;
    if (!len || len >= sizeof(records_[0].id) || !has_slot(now) || find(id, now)) return nullptr;
    for (uint8_t i = 0; i < kCapacity; ++i) {
      NoticeRecord& r = records_[i];
      if (r.used && (r.status == NOTICE_QUEUED || r.queued_pending || r.final_pending ||
          (int32_t)(now - r.retain_until_ms) < 0)) continue;
      memset(&r, 0, sizeof(r));
      memcpy(r.id, id, len + 1);
      r.radio_seq = accepted ? seq : 0;
      r.expires_ms = now + ttl_ms;
      r.status = accepted ? NOTICE_QUEUED : NOTICE_FAILED;
      r.queued_pending = accepted;
      r.final_pending = !accepted;
      r.retain_until_ms = now + kRetentionMs;
      r.used = true;
      return &r;
    }
    return nullptr;
  }

  bool displayed(uint16_t seq, uint32_t now) {
    expire(now);
    for (uint8_t i = 0; i < kCapacity; ++i) {
      NoticeRecord& r = records_[i];
      if (r.used && r.status == NOTICE_QUEUED && r.radio_seq == seq) {
        finish(r, NOTICE_DISPLAYED, now);
        return true;
      }
    }
    return false;
  }

  void expire(uint32_t now) {
    for (uint8_t i = 0; i < kCapacity; ++i) {
      NoticeRecord& r = records_[i];
      if (r.used && r.status == NOTICE_QUEUED &&
          (int32_t)(now - r.expires_ms) >= 0) finish(r, NOTICE_EXPIRED, now);
    }
  }

  // Reconnects and repeated operator IDs re-announce the current state;
  // receiving the same ID never creates another LoRa frame.
  void replay(NoticeRecord& r) {
    if (r.status == NOTICE_QUEUED) r.queued_pending = true;
    else r.final_pending = true;
  }

  void replay_all(uint32_t now) {
    for (uint8_t i = 0; i < kCapacity; ++i)
      if (records_[i].used && (records_[i].status == NOTICE_QUEUED ||
          records_[i].queued_pending || records_[i].final_pending ||
          (int32_t)(now - records_[i].retain_until_ms) < 0)) replay(records_[i]);
  }

  NoticeRecord* pending(bool* queued) {
    for (uint8_t i = 0; i < kCapacity; ++i) {
      NoticeRecord& r = records_[i];
      if (!r.used) continue;
      if (r.queued_pending) { *queued = true; return &r; }
      if (r.final_pending) { *queued = false; return &r; }
    }
    return nullptr;
  }

  void sent(NoticeRecord& r, bool queued) {
    if (queued) r.queued_pending = false;
    else r.final_pending = false;
  }

 private:
  static void finish(NoticeRecord& r, NoticeStatus status, uint32_t now) {
    r.status = status;
    r.final_pending = true;
    r.retain_until_ms = now + kRetentionMs;
  }
  NoticeRecord records_[kCapacity];
};

}  // namespace ayulink
#endif
