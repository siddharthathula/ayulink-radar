// Focused host regressions for the release downlink frame and queue.
// g++ -std=c++14 -O2 test_release_transport.cpp -lcrypto -o /tmp/ayulink_release_test && /tmp/ayulink_release_test
#include "../common/ayulink_protocol.h"
#include "../common/downlink_queue.h"
#include "../common/fall_detector.h"
#include "../common/notice_delivery.h"
#include <openssl/hmac.h>
#include <cassert>
#include <cstdio>
#include <cstring>

static bool hmac(const uint8_t* key, size_t key_len, const uint8_t* msg,
                 size_t len, uint8_t* tag) {
  unsigned char digest[32]; unsigned int n = 0;
  HMAC(EVP_sha256(), key, (int)key_len, msg, len, digest, &n);
  memcpy(tag, digest, ayulink::kTagBytes);
  return true;
}

static bool failed_hmac(const uint8_t*, size_t, const uint8_t*, size_t, uint8_t* tag) {
  memset(tag, 0, ayulink::kTagBytes);
  return false;
}

int main() {
  const uint8_t key[] = {1, 2, 3, 4};
  const uint8_t other[] = {4, 3, 2, 1};
  uint8_t frame[ayulink::kNoticeFrameMax] = {};
  uint8_t text[ayulink::kNoticeTextMax]; memset(text, 'A', sizeof(text));
  size_t n = ayulink::encode_notice(108, 65535, text, sizeof(text), frame,
                                    key, sizeof(key), hmac);
  assert(n == ayulink::kNoticeFrameMax);
  assert(ayulink::verify_notice(frame, n, key, sizeof(key), hmac));
  assert(!ayulink::verify_notice(frame, n, other, sizeof(other), hmac));
  assert(!ayulink::verify_notice(frame, n, key, sizeof(key), failed_hmac));
  assert(!ayulink::encode_notice(108, 10, text, sizeof(text), frame,
                                  key, sizeof(key), failed_hmac));
  n = ayulink::encode_notice(108, 65535, text, sizeof(text), frame, key, sizeof(key), hmac);
  ayulink::TelemetryV2 telemetry = {};
  telemetry.magic = ayulink::kProtoMagic;
  uint8_t uplink[ayulink::kTelemetrySize] = {};
  assert(!ayulink::encode_telemetry(telemetry, uplink, key, sizeof(key), failed_hmac));
  assert(ayulink::encode_telemetry(telemetry, uplink, key, sizeof(key), hmac));
  assert(!ayulink::verify_telemetry(uplink, sizeof(uplink), key, sizeof(key), failed_hmac));
  uint8_t ack[ayulink::kAckSize] = {};
  assert(!ayulink::encode_ack(108, 42, ayulink::ACK_NOTIFICATION, 0,
                              ack, key, sizeof(key), failed_hmac));
  assert(ayulink::encode_ack(108, 42, ayulink::ACK_NOTIFICATION, 0,
                              ack, key, sizeof(key), hmac));
  assert(!ayulink::verify_ack(ack, sizeof(ack), key, sizeof(key), failed_hmac));
  assert(!ayulink::verify_notice(frame, n - 1, key, sizeof(key), hmac));
  frame[7] ^= 1;
  assert(!ayulink::verify_notice(frame, n, key, sizeof(key), hmac));
  frame[7] ^= 1;
  assert(!ayulink::encode_notice(108, 2, text, sizeof(text) + 1, frame,
                                  key, sizeof(key), hmac));
  assert(ayulink::SeqWindow::newer(0, 65535));
  assert(ayulink::SeqWindow::newer((uint16_t)(65500 + 256), 65500));

  ayulink::DownlinkQueue q(32);
  assert(q.capacity() == 16);
  assert(q.enqueue(frame, (uint8_t)n, ayulink::DL_CRITICAL_COMMAND,
                   108, 65535, ayulink::ACK_NOTIFICATION, 100, 2400, 2, 8000));
  assert(q.enqueue(frame, (uint8_t)n, ayulink::DL_CRITICAL_COMMAND,
                   108, 65535, ayulink::ACK_NOTIFICATION, 101, 2400, 2, 8000));
  assert(q.depth() == 1); // duplicate never restarts retry/TTL
  assert(!q.on_ack(108, 65535, ayulink::ACK_CLEAR, 100));
  assert(q.peek(100)); q.on_transmit(100, 2400);
  assert(q.peek(2500)); q.on_transmit(2500, 2400);
  assert(!q.peek(2501)); // no unbounded resend after final attempt
  assert(q.on_ack(108, 65535, ayulink::ACK_NOTIFICATION, 3000));
  assert(q.stats().retired_by_ack == 1 && q.depth() == 0);

  ayulink::DownlinkQueue full(2);
  assert(full.enqueue(frame, (uint8_t)n, ayulink::DL_TELEMETRY_ACK,
                      108, 1, ayulink::ACK_TELEMETRY_RX, 1, 100, 1, 10000));
  assert(full.enqueue(frame, (uint8_t)n, ayulink::DL_TELEMETRY_ACK,
                      108, 2, ayulink::ACK_TELEMETRY_RX, 1, 100, 1, 10000));
  assert(full.enqueue(frame, (uint8_t)n, ayulink::DL_CRITICAL_COMMAND,
                      108, 3, ayulink::ACK_NOTIFICATION, 1, 100, 3, 10000));
  assert(full.peek(1)->ack_type == ayulink::ACK_NOTIFICATION);

  assert(ayulink::printable_ascii("Responder arrived", 63));
  assert(!ayulink::printable_ascii("", 63));
  assert(!ayulink::printable_ascii("bad\nline", 63));
  assert(!ayulink::printable_ascii("\xc3\xa9", 63));
  char long_notice[65]; memset(long_notice, 'x', 64); long_notice[64] = 0;
  assert(!ayulink::printable_ascii(long_notice, 63));
  long_notice[63] = 0;
  assert(ayulink::printable_ascii(long_notice, 63));

  ayulink::NoticeRegistry registry;
  auto* first = registry.add("operator-1", 88, 1000, 15000, true);
  assert(first && first->status == ayulink::NOTICE_QUEUED);
  assert(!registry.add("operator-1", 89, 1001, 15000, true)); // ID is idempotency key
  bool queued = false;
  assert(registry.pending(&queued) == first && queued);
  registry.sent(*first, queued);
  assert(!registry.displayed(89, 1100));  // wrong radio sequence
  assert(registry.displayed(88, 1100));
  assert(!registry.displayed(88, 1101));  // duplicate ACK cannot re-display
  assert(registry.pending(&queued) == first && !queued &&
         first->status == ayulink::NOTICE_DISPLAYED);
  registry.sent(*first, false);
  registry.replay(*first); // reconnect can resend terminal state without radio TX
  assert(registry.pending(&queued) == first && !queued);
  registry.sent(*first, false);
  assert(registry.find("operator-1", 31101) == nullptr);
  assert(registry.add("operator-1", 91, 31101, 15000, true));

  auto* expiring = registry.add("operator-2", 90, 2000, 2500, true);
  assert(expiring);
  registry.expire(4500);
  assert(expiring->status == ayulink::NOTICE_EXPIRED);
  assert(!registry.displayed(90, 4501)); // late authentic ACK is not on-time delivery
  auto* rejected = registry.add("operator-3", 0, 2000, 0, false);
  assert(rejected && rejected->status == ayulink::NOTICE_FAILED &&
         rejected->radio_seq == 0 && rejected->final_pending);
  assert(registry.add("different-id-same-body", 92, 2100, 15000, true));
  ayulink::NoticeRegistry wrap;
  auto* crossing = wrap.add("wrap", 93, 0xFFFFFF00u, 2000, true);
  assert(crossing);
  wrap.expire(0x00000100u);
  assert(crossing->status == ayulink::NOTICE_QUEUED);
  wrap.expire(0x00000700u);
  assert(crossing->status == ayulink::NOTICE_EXPIRED);

  ayulink::NoticeRegistry bounded;
  for (int i = 0; i < ayulink::NoticeRegistry::kCapacity; ++i) {
    char id[16]; snprintf(id, sizeof(id), "id-%d", i);
    assert(bounded.add(id, i, 100, 15000, true));
  }
  assert(!bounded.has_slot(101));
  bounded.expire(15100);
  assert(!bounded.has_slot(50000)); // unsent final status cannot be evicted
  bounded.replay_all(50000);
  while (auto* item = bounded.pending(&queued)) bounded.sent(*item, queued);
  assert(bounded.has_slot(50000)); // terminal state retained for bounded window

  // 20 ms free fall is shorter than configured 30 ms: a subsequent impact
  // cannot bypass the confirmation state machine.
  ayulink::FallConfig cfg; cfg.freefall_ms = 30;
  ayulink::FallDetector detector(cfg);
  for (int i = 0; i < 80; ++i) detector.update(0, 0, 1, 20);
  assert(detector.rest_valid());
  detector.update(0.1f, 0, 0.1f, 20);
  detector.update(0, 0, 3.5f, 20);
  assert(detector.state() == ayulink::FS_NORMAL);
}
