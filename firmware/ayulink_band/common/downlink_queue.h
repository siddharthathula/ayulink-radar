// AyuLink Priority Downlink Queue v2 — replaces the v1 single-slot retry buffer.
//
// THE v1 BUG THIS FIXES
//   gateway_main.ino v3.5 had exactly ONE `LoRaRetry` struct. Every received
//   telemetry packet called scheduleBinaryAck(..., 0x01, 1) which
//   UNCONDITIONALLY overwrote it. Because the wristband transmits every 2 s
//   (800 ms in alert), a dispatch ACK (5 retries @ 1100 ms) and a clear ACK
//   (3 retries) were overwritten before they could complete. The "closed-loop"
//   ACK the patient depends on was architecturally unable to finish, and the
//   clear command that resets the patient's emergency screen was the least
//   likely message to arrive.
//
//   v2: bounded priority queue. Telemetry ACKs can NEVER displace a dispatch or
//   clear command. Entries carry the seq they acknowledge so an arriving ACK
//   retires exactly the right entry.
//
// PRIORITY (highest first, per remediation spec)
//   3 CRITICAL_COMMAND  dispatch / responder-accepted
//   2 EMERGENCY_ACK     sensor-fault ack, fall-confirmed ack
//   1 CLEAR_COMMAND     clear / reset emergency state
//   0 TELEMETRY_ACK     routine rx confirmation (droppable)

#ifndef AYULINK_DOWNLINK_QUEUE_H
#define AYULINK_DOWNLINK_QUEUE_H

#include <stdint.h>
#include <stddef.h>
#include <string.h>
#include "ayulink_protocol.h"

namespace ayulink {

enum DlPriority : uint8_t {
  DL_TELEMETRY_ACK = 0,
  DL_CLEAR_COMMAND = 1,
  DL_EMERGENCY_ACK = 2,
  DL_CRITICAL_COMMAND = 3,
};

struct DlEntry {
  uint8_t  buf[96];
  uint8_t  len;
  uint8_t  priority;
  uint8_t  device_id;
  uint8_t  seq;        // truncated to 8 bits for the queue key; full seq is in buf
  uint8_t  ack_type;
  uint8_t  retries_left;
  uint8_t  max_retries;
  uint32_t next_send_ms;
  uint32_t expires_ms;
  uint16_t key_device;   // full device id for correlation
  uint16_t key_seq;      // full seq for correlation
  bool     used;
};

struct DlStats {
  uint32_t enqueued = 0;
  uint32_t sent = 0;
  uint32_t retired_by_ack = 0;
  uint32_t expired = 0;
  uint32_t dropped_full = 0;   // rejected on arrival (lower than everything queued)
  uint32_t evicted = 0;        // kicked a lower-priority entry to make room
  uint32_t gave_up = 0;        // exhausted retries
};

class DownlinkQueue {
 public:
  explicit DownlinkQueue(uint8_t capacity = 8) : cap_(capacity > 16 ? 16 : (capacity ? capacity : 1)) {
    for (uint8_t i = 0; i < cap_; ++i) items_[i].used = false;
  }

  uint8_t capacity() const { return cap_; }
  uint8_t depth() const { return count_; }
  const DlStats& stats() const { return stats_; }

  // Returns true if the entry was stored. On a full queue, an entry lower than
  // every queued entry is REJECTED (telemetry must never displace a command).
  bool enqueue(const uint8_t* payload, uint8_t len, uint8_t priority,
               uint16_t device_id, uint16_t seq, uint8_t ack_type,
               uint32_t now_ms, uint32_t retry_ms, uint8_t retries,
               uint32_t ttl_ms) {
    if (!payload || len == 0 || len > sizeof(DlEntry::buf)) return false;

    reap_expired(now_ms);
    // Repeated backend commands and telemetry ACKs for the same frame are one
    // attempt. Never restart its TTL/retries or evict another command.
    for (uint8_t i = 0; i < cap_; ++i) {
      const DlEntry& e = items_[i];
      if (e.used && e.key_device == device_id && e.key_seq == seq &&
          e.ack_type == ack_type && e.len == len && !memcmp(e.buf, payload, len))
        return true;
    }

    int8_t slot = -1;
    int8_t victim = -1;
    uint8_t lowest = 255;

    for (uint8_t i = 0; i < cap_; ++i) {
      if (!items_[i].used) { if (slot < 0) slot = i; continue; }
      if (items_[i].priority < lowest) { lowest = items_[i].priority; victim = i; }
    }

    if (slot < 0) {
      if (priority <= lowest) { stats_.dropped_full++; return false; }
      items_[victim].used = false; count_--;
      stats_.evicted++;
      slot = victim;
    }

    DlEntry& e = items_[slot];
    memset(&e, 0, sizeof(e));
    memcpy(e.buf, payload, len);
    e.len = len;
    e.priority = priority;
    e.key_device = device_id;
    e.key_seq = seq;
    e.device_id = (uint8_t)(device_id & 0xFF);
    e.seq = (uint8_t)(seq & 0xFF);
    e.ack_type = ack_type;
    e.max_retries = retries ? retries : 1;
    e.retries_left = e.max_retries;
    e.next_send_ms = now_ms;
    e.expires_ms = now_ms + ttl_ms;
    e.used = true;
    count_++;
    stats_.enqueued++;
    return true;
  }

  // Returns the entry to transmit this tick, or nullptr.
  // Picks the highest priority that is due and unexpired; ties break FIFO.
  const DlEntry* peek(uint32_t now_ms) {
    reap_expired(now_ms);
    const DlEntry* best = nullptr;
    for (uint8_t i = 0; i < cap_; ++i) {
      DlEntry& e = items_[i];
       if (!e.used) continue;
       if (e.retries_left == 0) continue; // awaiting final ACK until TTL
       if ((int32_t)(now_ms - e.next_send_ms) < 0) continue;
       if ((int32_t)(now_ms - e.expires_ms) >= 0) continue;
      if (!best || e.priority > best->priority) best = &e;
    }
    return best;
  }

  // Mark a peeked entry as transmitted. Returns false if it had no retries left.
  bool on_transmit(uint32_t now_ms, uint32_t retry_ms) {
    const DlEntry* e = peek(now_ms);
    if (!e) return false;
    // locate the same slot to mutate
    for (uint8_t i = 0; i < cap_; ++i) {
      if (&items_[i] != e) continue;
      if (items_[i].retries_left > 0) items_[i].retries_left--;
      stats_.sent++;
       if (items_[i].retries_left == 0) {
         if (items_[i].ack_type == ACK_NOTIFICATION) {
           // Keep final send correlated until TTL; last ACK may still be in air.
           items_[i].next_send_ms = items_[i].expires_ms;
         } else {
           items_[i].used = false; count_--; stats_.gave_up++;
         }
       } else {
        items_[i].next_send_ms = now_ms + retry_ms;
      }
      return true;
    }
    return false;
  }

  // Retire the entry matching an inbound ACK.
  bool on_ack(uint16_t device_id, uint16_t seq, uint8_t ack_type, uint32_t now_ms) {
    reap_expired(now_ms);
    for (uint8_t i = 0; i < cap_; ++i) {
      DlEntry& e = items_[i];
      if (!e.used) continue;
      if (e.key_device != device_id || e.key_seq != seq) continue;
      if (ack_type && e.ack_type != ack_type) continue;
      e.used = false; count_--;
      stats_.retired_by_ack++;
      return true;
    }
    return false;
  }

  void clear() { for (uint8_t i = 0; i < cap_; ++i) items_[i].used = false; count_ = 0; }

  // Highest priority currently queued (255 = empty).
  uint8_t highest_priority() const {
    uint8_t best = 255;
    for (uint8_t i = 0; i < cap_; ++i) if (items_[i].used && (best == 255 || items_[i].priority > best)) best = items_[i].priority;
    return best;
  }

 private:
  void reap_expired(uint32_t now_ms) {
    for (uint8_t i = 0; i < cap_; ++i) {
       if (items_[i].used && (int32_t)(now_ms - items_[i].expires_ms) >= 0) {
         if (items_[i].retries_left == 0) stats_.gave_up++;
        items_[i].used = false; count_--; stats_.expired++;
      }
    }
  }
  DlEntry items_[16];
  uint8_t cap_;
  uint8_t count_ = 0;
  DlStats stats_;
};

}  // namespace ayulink

#endif  // AYULINK_DOWNLINK_QUEUE_H
