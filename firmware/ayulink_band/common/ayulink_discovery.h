// AyuLink backend discovery — resilient across changing hotspot IP addresses.
//
// WHY THIS EXISTS
//   Firmware used to reach the backend only as "ayulink.local" over mDNS, with a
//   fallback of ws.begin("ayulink.local", ...). That fallback was dead code:
//   ".local" is an mDNS name, not a DNS one, so a plain DNS lookup for it can
//   never succeed. When mDNS missed — which it does constantly on a phone or
//   laptop hotspot, because hotspots routinely mishandle multicast — there was
//   no recovery path at all and the device simply never connected.
//
//   The demo topology makes this the single most likely failure: both teams run
//   on the SAME hotspot (SSID/PASS never change), but the laptop is handed a
//   DIFFERENT IP every time. Hard-coding one IP is therefore always wrong, and
//   mDNS alone is not reliable enough to carry the demo.
//
// RESOLUTION ORDER (cheapest and most likely to succeed first)
//   1. Cached address from the previous successful connection. Reconnects after
//      a brief outage without any network traffic at all.
//   2. The DHCP gateway. When the laptop runs the hotspot itself this IS the
//      backend host, so it needs no discovery at all. Windows Mobile Hotspot
//      always uses 192.168.137.0/24.
//   3. mDNS, if the platform has it and multicast works.
//   4. UDP broadcast probe. No multicast required, works on hotspots, and is
//      unaffected by the laptop's IP changing.
//
// The result is cached so a running link is never re-probed.
//
// HOST-SAFE: no Arduino/ESP dependency, so it compiles in firmware/test too.

#ifndef AYULINK_DISCOVERY_H
#define AYULINK_DISCOVERY_H

#include <stdint.h>
#include <stddef.h>
#include <string.h>
#include <stdio.h>   // sscanf, used by parseDiscoveryReply

namespace ayulink {

static const uint16_t kDiscoveryPort = 45678;
static const char kDiscoveryMagic[] = "AYULINK_DISCOVER_V1";

// How a discovery attempt succeeded. Useful for the serial log: a bench
// engineer needs to know WHICH path resolved, otherwise every failure looks the
// same.
enum DiscoverySource : uint8_t {
  kDiscoveryNone = 0,       // nothing answered
  kDiscoveryCache,          // reused the last known-good address
  kDiscoveryGateway,        // DHCP gateway answered the probe (laptop-hosted hotspot)
  kDiscoveryMdns,           // resolved via mDNS
  kDiscoveryBroadcast,      // answered a subnet-wide UDP broadcast probe
};

#if defined(ARDUINO) || defined(ESP_PLATFORM) || defined(ESP8266)
#include <IPAddress.h>
#endif

struct DiscoveryResult {
  uint32_t ip_be;          // host byte order (MSB=octet0), ready for WiFiClient/begin()
  uint16_t port;
  DiscoverySource source;
  bool ok() const { return source != kDiscoveryNone && ip_be != 0u; }
  static DiscoveryResult none() { return DiscoveryResult{0u, 0u, kDiscoveryNone}; }

#if defined(ARDUINO) || defined(ESP_PLATFORM) || defined(ESP8266)
  IPAddress toIP() const {
    return IPAddress(
      (uint8_t)((ip_be >> 24) & 0xFF),
      (uint8_t)((ip_be >> 16) & 0xFF),
      (uint8_t)((ip_be >> 8) & 0xFF),
      (uint8_t)(ip_be & 0xFF)
    );
  }
#endif
};

#if defined(ARDUINO) || defined(ESP_PLATFORM) || defined(ESP8266)
inline uint32_t ipAddressToBE(const IPAddress& ip) {
  return ((uint32_t)ip[0] << 24) | ((uint32_t)ip[1] << 16) | ((uint32_t)ip[2] << 8) | (uint32_t)ip[3];
}
#endif

// ── Parsing ───────────────────────────────────────────────────────────────
// The backend replies with a single space-separated line:
//   AYULINK_DISCOVER_V1 <dotted-ip> <port> gateway=/ws/gateway hub=/ws/hub
// Parsed here (rather than in each firmware) so the two boards cannot drift.
inline bool parseDiscoveryReply(const char* reply, size_t len,
                                DiscoveryResult* out) {
  if (!out || !reply || len == 0) return false;
  // Bounded copy: the reply is a fixed shape and must never overrun a buffer.
  char buf[96];
  const size_t n = (len < sizeof(buf) - 1) ? len : sizeof(buf) - 1;
  memcpy(buf, reply, n);
  buf[n] = '\0';

  char* save = nullptr;
  char* magic = strtok_r(buf, " ", &save);
  if (!magic || strcmp(magic, kDiscoveryMagic) != 0) return false;
  char* ip   = strtok_r(nullptr, " ", &save);
  char* port = strtok_r(nullptr, " ", &save);
  if (!ip || !port) return false;

  uint32_t a, b, c, d;
  unsigned int p;
  // Validate strictly. A malformed reply must be rejected, not half-applied.
  if (sscanf(ip, "%u.%u.%u.%u", &a, &b, &c, &d) != 4) return false;
  if (a > 255 || b > 255 || c > 255 || d > 255) return false;
  if (a == 0) return false;  // 0.x.x.x is never a usable peer
  if (sscanf(port, "%u", &p) != 1 || p == 0 || p > 65535) return false;

  out->ip_be = (uint32_t)((a << 24) | (b << 16) | (c << 8) | d);
  out->port = (uint16_t)p;
  out->source = kDiscoveryBroadcast;
  return true;
}

// ── Cache ─────────────────────────────────────────────────────────────────
// Held in RAM only. Re-flashing clears it, which is correct: after a reflash the
// laptop's IP may well have changed, and a stale cache would be worse than none.
class DiscoveryCache {
 public:
  void remember(const DiscoveryResult& r) {
    if (!r.ok()) return;
    ip_be_ = r.ip_be;
    port_ = r.port;
    valid_ = true;
  }
  // Returns a cache hit only when the cached port matches what we are asking
  // for, so a gateway aimed at :8000 never reuses a :8100 answer.
  DiscoveryResult get(uint16_t want_port) const {
    if (valid_ && port_ == want_port) {
      return DiscoveryResult{ip_be_, port_, kDiscoveryCache};
    }
    return DiscoveryResult::none();
  }
  void clear() { valid_ = false; ip_be_ = 0u; port_ = 0u; }
  bool valid() const { return valid_; }

 private:
  uint32_t ip_be_ = 0u;
  uint16_t port_ = 0;
  bool valid_ = false;
};

}  // namespace ayulink

#endif  // AYULINK_DISCOVERY_H