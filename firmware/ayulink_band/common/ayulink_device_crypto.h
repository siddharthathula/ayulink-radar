// AyuLink device-side HMAC-SHA256, backed by mbedTLS (ESP32 Arduino core 2.x,
// which ships mbedTLS 2.x — the 3.x `mbedtls_hmac()` convenience call does not
// exist there, so this uses the md context API with hmac mode enabled).
//
// Provides the HmacFn callback expected by ayulink_protocol.h.
//
// The tag is truncated to 6 bytes (48-bit). That is sufficient here because the
// authenticated payload also carries a 16-bit sequence number enforced inside a
// sliding replay window, which bounds how many guesses an attacker gets per
// fresh sequence value.
//
// SECURITY WARNING: kDevicePsk below is a COMPILE-TIME PLACEHOLDER. A shared,
// published key provides no authentication at all. Every real device must be
// provisioned with a unique key, and the gateway must hold the matching value.
// Until that provisioning exists, the protocol is replay/forgery *tested* but
// not *enforced*, because every device shares one published constant.

#ifndef AYULINK_DEVICE_CRYPTO_H
#define AYULINK_DEVICE_CRYPTO_H

#include <stdint.h>
#include <string.h>
#include "mbedtls/sha256.h"
#include "mbedtls/md.h"

namespace ayulink {

// ── REPLACE PER DEVICE BEFORE ANY DEPLOYMENT ────────────────────────────
static const uint8_t kDevicePsk[] = {
  0x44,0x45,0x56,0x2d,0x4f,0x4e,0x4c,0x59,0x2d,0x50,0x53,0x4b,0x30,0x31,0x30,0x32
};  // ascii "DEV-ONLY-PSK0102" — PLACEHOLDER, NOT A SECRET

inline bool device_hmac(const uint8_t* key, size_t key_len,
                        const uint8_t* msg, size_t msg_len,
                        uint8_t* out_tag, size_t tag_len) {
  if (tag_len > 32) tag_len = 32;
  const mbedtls_md_info_t* md = mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);
  if (!md) { memset(out_tag, 0, tag_len); return false; }

  mbedtls_md_context_t ctx;
  mbedtls_md_init(&ctx);
  if (mbedtls_md_setup(&ctx, md, /*hmac=*/1) != 0) {
    memset(out_tag, 0, tag_len);
    mbedtls_md_free(&ctx);
    return false;
  }
  // md_starts()/md_update()/md_finish() performs a plain SHA-256 hash.
  // The protocol contract is HMAC-SHA256, so use the HMAC-specific API here.
  // The old callback omitted hmac_starts(), which made the tag independent of
  // the PSK and silently weakened the shared device/gateway contract.
  // mbedtls_md_hmac_finish() always writes the full 32-byte digest. The
  // wire protocol carries only the first six bytes, so finish into a full
  // local digest and copy the truncated tag. Passing out_tag directly here
  // overwrites the telemetry frame tail and the caller's stack canary.
  uint8_t full_tag[32];
  if (mbedtls_md_hmac_starts(&ctx, key, key_len) != 0 ||
      mbedtls_md_hmac_update(&ctx, msg, msg_len) != 0 ||
      mbedtls_md_hmac_finish(&ctx, full_tag) != 0) {
    memset(out_tag, 0, tag_len);
    mbedtls_md_free(&ctx);
    return false;
  }
  memcpy(out_tag, full_tag, tag_len);
  mbedtls_md_free(&ctx);
  return true;
}

// Adapter matching ayulink::HmacFn. Signature-compatible with the OpenSSL-backed
// implementation used by the host test runner, so the same vectors verify in
// both places.
inline bool device_hmac_cb(const uint8_t* key, size_t key_len,
                           const uint8_t* msg, size_t msg_len,
                           uint8_t* out_tag) {
  return device_hmac(key, key_len, msg, msg_len, out_tag, 6);
}

}  // namespace ayulink

#endif  // AYULINK_DEVICE_CRYPTO_H
