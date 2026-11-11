# NodeMCU Smart Dispenser hub

Build: `pio run -e nodemcuv2` in this directory. Do not flash from a build check.

| Device | NodeMCU pin | Notes |
| --- | --- | --- |
| SH1106 128×64 OLED | D1 SCL, D2 SDA | I²C address 0x3C or 0x3D; display is probed before use. |
| DHT11 | D4 | Temperature and humidity. |
| Flame sensor | D5 | Digital input; confirm idle/trigger polarity on the actual module. |
| SG90 servo | D6 | Use a suitable external servo supply and a common ground. |
| Passive buzzer | D7 | PWM/tone output. |
| MQ-135 module | A0 | Check the NodeMCU board's analog input voltage limit before wiring. |
| Status LED | D0 | Output. |

There is **no DS3231/AT24C32 requirement**. The hub obtains UTC from NTP over
Wi-Fi and presents/schedules in Asia/Kolkata (UTC+05:30). On boot, or after 12
hours without a successful time sync, time is invalid: the display says `SYNC`,
telemetry sends empty legacy `rtc_time`/`rtc_date` plus `time_valid:false`, and
both scheduled and remote dispensing are suspended. Wi-Fi alone does not prove
time validity. If NTP is unavailable at the site, dispensing requires restored
NTP connectivity; missed doses are not caught up automatically.

Slot times and calibrated angles remain in ESP8266 flash EEPROM. A per-slot
local-day guard is also committed **before** servo movement to prevent a
restart or clock correction from repeating a dose that may already have moved.
The guard prioritizes avoiding duplicate motion; it cannot prove a pill reached
the cup. `reset_slot`/`reset_all` update displayed slot flags but do not remove
the same-day dispense guard. EEPROM wear, actual motor position, mechanical
release, and timing across power loss require bench verification.

The hub connects to `/ws/hub`, sends the configured `AYULINK_HUB_TOKEN` in the
first `auth` frame, and then sends `hub_data` every three seconds while the
transport is up. The backend defines authoritative online state from recent
authenticated telemetry. The OLED's `Net:OK` means a backend command arrived
within 30 seconds after the auth gate; `WAIT` means a WebSocket transport exists
but recent authenticated backend data has not been observed. An OLED
notification is shown for ten seconds (flame and dispensing screens take
precedence). The backend sends `cmd:notification` with `title` and `msg`/`notif`.
