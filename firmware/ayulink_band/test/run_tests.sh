#!/usr/bin/env bash
# AyuLink firmware host test runner.
#
# Compiles the SAME headers that are compiled into the ESP32 firmware, so
# protocol / state-machine / queue bugs fail on the host instead of on a patient.
set -euo pipefail
cd "$(dirname "$0")"

OUT="${TMPDIR:-/tmp}/ayulink_fwtest"
echo "building host test runner..."
g++ -std=c++14 -O2 -Wall -Wextra -I../common test_firmware.cpp -lcrypto -o "$OUT"
echo "running..."
"$OUT"

echo "building LoRa link test..."
g++ -std=c++14 -O2 -Wall -Wextra -I../common test_lora_link.cpp -o "${OUT}_lora"
"${OUT}_lora"
