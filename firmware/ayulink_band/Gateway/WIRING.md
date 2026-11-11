# VitaLink Gateway - Complete Wiring Guide

## 📦 Hardware List

| Component | Model | Qty |
|-----------|-------|-----|
| ESP32 | DevKit V1 | 1 |
| LoRa Module | RA-02 (SX1278 433MHz) | 1 |
| Antenna | 433MHz External | 1 |
| OLED Display | SSD1306 128x64 I2C | 1 |
| GSM Module | SIM800L | 1 |
| RTC | DS3231 | 1 |
| SD Card | Module with SD slot | 1 |
| Temp/Humidity | DHT22 | 1 |
| Buzzer | Active 5V | 1 |
| LEDs | Green + Red (5mm) | 2 |
| Resistors | 220Ω (for LEDs) | 2 |
| Power | 12V 2A Adapter | 1 |
| Regulator | LM2596 Buck Converter | 1 |

---

## 🔌 Complete Wiring Diagram

```
                    ┌─────────────────────────────────────────────────────────┐
                    │                   12V POWER ADAPTER                      │
                    │                      ┌─────┐                             │
                    │                      │ 12V │                             │
                    │                      └──┬──┘                             │
                    │                         │                                │
                    │                    ┌────┴────┐                           │
                    │                    │ LM2596  │                           │
                    │                    │  Buck   │                           │
                    │                    │Converter│                           │
                    │                    └────┬────┘                           │
                    │               5V ───────┼─────── 4V (for SIM800L)        │
                    │                         │                                │
                    └─────────────────────────┼────────────────────────────────┘
                                              │
    ┌─────────────────────────────────────────┴─────────────────────────────────┐
    │                                                                            │
    │                              ESP32 DevKit V1                               │
    │                                                                            │
    │   ┌──────────────────────────────────────────────────────────────────┐    │
    │   │                                                                  │    │
    │   │  3V3 ●───────┬───────────────────────────────────────────● VIN   │    │
    │   │              │                                                   │    │
    │   │  GND ●───────┼──────────── COMMON GROUND ────────────────● GND   │    │
    │   │              │                                                   │    │
    │   │  D15 ●───────┼──► DHT22 DATA                                     │    │
    │   │              │                                                   │    │
    │   │   D2 ●───────┼──► LoRa DIO0                              ● D14 ──┼──► LoRa RST
    │   │              │                                                   │    │
    │   │   D4 ●───────┼──► SD Card CS                                     │    │
    │   │              │                                                   │    │
    │   │   D5 ●───────┼──► LoRa NSS (CS)                                  │    │
    │   │              │                                                   │    │
    │   │  D18 ●───────┼──► LoRa SCK + SD SCK (shared)                     │    │
    │   │              │                                                   │    │
    │   │  D19 ●───────┼──► LoRa MISO + SD MISO (shared)                   │    │
    │   │              │                                                   │    │
    │   │  D21 ●───────┼──► I2C SDA (OLED + RTC)                           │    │
    │   │              │                                                   │    │
    │   │  D22 ●───────┼──► I2C SCL (OLED + RTC)                           │    │
    │   │              │                                                   │    │
    │   │  D23 ●───────┼──► LoRa MOSI + SD MOSI (shared)                   │    │
    │   │              │                                                   │    │
    │   │  D16 ●───────┼──► SIM800L TX (ESP RX)                            │    │
    │   │              │                                                   │    │
    │   │  D17 ●───────┼──► SIM800L RX (ESP TX)                            │    │
    │   │              │                                                   │    │
    │   │  D25 ●───────┼──► Buzzer (+)                                     │    │
    │   │              │                                                   │    │
    │   │  D26 ●───────┼──► Green LED (+) via 220Ω                         │    │
    │   │              │                                                   │    │
    │   │  D27 ●───────┼──► Red LED (+) via 220Ω                           │    │
    │   │              │                                                   │    │
    │   └──────────────┴───────────────────────────────────────────────────┘    │
    │                                                                            │
    └────────────────────────────────────────────────────────────────────────────┘
```

---

## 📋 Detailed Pin Connections

### LoRa RA-02 Module
```
RA-02          ESP32
─────          ─────
VCC    ───►    3.3V
GND    ───►    GND
NSS    ───►    GPIO5
SCK    ───►    GPIO18
MISO   ───►    GPIO19
MOSI   ───►    GPIO23
RST    ───►    GPIO14
DIO0   ───►    GPIO2
ANT    ───►    433MHz External Antenna
```

### OLED Display (I2C)
```
OLED           ESP32
────           ─────
VCC    ───►    3.3V
GND    ───►    GND
SDA    ───►    GPIO21
SCL    ───►    GPIO22
```

### DS3231 RTC (I2C - same bus as OLED)
```
DS3231         ESP32
──────         ─────
VCC    ───►    3.3V
GND    ───►    GND
SDA    ───►    GPIO21 (shared with OLED)
SCL    ───►    GPIO22 (shared with OLED)
```

### SD Card Module (SPI - shares with LoRa)
```
SD Card        ESP32
───────        ─────
VCC    ───►    5V (or 3.3V if module has regulator)
GND    ───►    GND
CS     ───►    GPIO4
MOSI   ───►    GPIO23 (shared with LoRa)
MISO   ───►    GPIO19 (shared with LoRa)
SCK    ───►    GPIO18 (shared with LoRa)
```

### SIM800L (UART) ⚠️ CRITICAL: NEEDS 4V POWER!
```
SIM800L        ESP32 / Power
───────        ─────────────
VCC    ───►    4V from LM2596 (NOT 3.3V or 5V!)
GND    ───►    GND
TXD    ───►    GPIO16 (ESP RX)
RXD    ───►    GPIO17 (ESP TX)

### SIM800L Audio (For Voice Calls)
```
SIM800L        Component
───────        ─────────
MIC +   ───►   Microphone (+)
MIC -   ───►   Microphone (-)
SPK +   ───►   Speaker (+) (8Ω 1W)
SPK -   ───►   Speaker (-)
```
```

### DHT22
```
DHT22          ESP32
─────          ─────
VCC    ───►    3.3V
GND    ───►    GND
DATA   ───►    GPIO15 (with 10kΩ pull-up recommended)
```

### LEDs & Buzzer
```
Component      ESP32
─────────      ─────
Green LED (+)  ───► GPIO26 via 220Ω resistor
Green LED (-)  ───► GND

Red LED (+)    ───► GPIO27 via 220Ω resistor
Red LED (-)    ───► GND

Buzzer (+)     ───► GPIO25
Buzzer (-)     ───► GND
```

---

## ⚡ Power Distribution

```
                    12V Adapter
                         │
                         ▼
                  ┌──────────────┐
                  │   LM2596     │
                  │  Buck Conv   │
                  └──────┬───────┘
                         │
          ┌──────────────┼──────────────┐
          │              │              │
          ▼              ▼              ▼
       ┌─────┐       ┌─────┐       ┌─────┐
       │ 5V  │       │ 4V  │       │3.3V │
       └──┬──┘       └──┬──┘       └──┬──┘
          │             │             │
          ▼             ▼             ▼
     ┌────────┐   ┌──────────┐   ┌────────┐
     │  ESP32 │   │  SIM800L │   │  LoRa  │
     │(via VIN)│  │          │   │  OLED  │
     │ SD Card│   │          │   │  RTC   │
     │ Buzzer │   │          │   │ DHT22  │
     └────────┘   └──────────┘   └────────┘
```

---

## ⚠️ Important Warnings

1. **SIM800L Power**: Needs 3.7V-4.2V @ 2A peak. Use separate regulator!
2. **LoRa 3.3V Only**: Never connect RA-02 to 5V!
3. **Antenna First**: Always attach antenna before powering LoRa!
4. **I2C Addresses**: OLED=0x3C, RTC=0x68 (no conflict)
5. **SPI Sharing**: LoRa and SD share SPI bus, different CS pins

---

## 🔧 Flashing Instructions

```bash
# Navigate to Gateway folder
cd firmware/Gateway

# Build and upload
pio run --target upload

# Monitor serial output
pio device monitor -b 115200
```

---

## ✅ Expected Serial Output

```
╔═══════════════════════════════════════╗
║     VitaLink Gateway v2.0 FULL        ║
╚═══════════════════════════════════════╝

[OLED] Initializing... OK
[RTC] Initializing... OK - 2026-02-08 17:10:36
[DHT22] Initializing... OK - 28.5°C
[LoRa] Initializing... OK @ 433 MHz
[SD] Initializing... OK - 7456.0 MB
[SIM800] Initializing... OK
[WiFi] AP: VitaLink_Gateway @ 192.168.4.1

[READY] Gateway listening...
```

---

## 📊 OLED Display Pages

The display cycles through 3 pages every 3 seconds:

| Page | Shows |
|------|-------|
| **Stats** | Packet count, SOS count, last device, RSSI |
| **Environment** | Temperature, humidity, current time |
| **Network** | WiFi SSID, IP address, WebSocket clients |
