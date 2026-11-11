# AyuLink Wrist Band — Complete Circuit & Wiring Guide

Board: **ESP32 DevKit V1** (`esp32dev`) · Firmware: `src/wristband/wristband.ino`

Every pin below is read directly from the firmware. Nothing here is generic.

---

## 📦 Hardware List

| Component | Model | Qty | Notes |
|-----------|-------|-----|-------|
| MCU | ESP32 DevKit V1 | 1 | 38-pin, dual-core, 3.3 V logic |
| PPG sensor | MAX30102 | 1 | **or** MAX30100 — auto-detected, no code change |
| IMU | MPU6050 (GY-521) | 1 | I²C `0x68` |
| Display | SH1106 OLED 128×64 | 1 | I²C `0x3C` |
| Radio | RFM95W / RA-02 (SX1278) | 1 | **433 MHz only** |
| Antenna | 433 MHz SMA or spring | 1 | **Must be fitted before power-on** |
| GPS | u-blox NEO-6M | 1 | UART2, 9600 baud |
| Body temperature | LM35 | 1 | Analog output, GPIO34 ADC, 10 mV/°C |
| Buzzer | Piezo, passive | 1 | **Needs transistor driver — see §4.4** |
| Push button | Tactile, momentary | 1 | SOS, active LOW |
| LED | 5 mm or onboard | 1 | Status, GPIO2 onboard |
| Resistors | 330 Ω, 10 kΩ | 2 each | LED, optional button |
| Capacitors | 470 µF electrolytic | 1 | **LoRa VCC — mandatory** |
| Capacitors | 100 nF ceramic | 4 | One per module, at VCC pin |
| Capacitors | 10 µF electrolytic | 1 | Bulk on 3V3 rail |
| Power | USB 5 V / battery | 1 | See §5 |

---

## 🔌 Complete Wiring Diagram

```
                         USB / 5 V IN
                              │
                    ┌─────────┴─────────┐
                    │  ESP32 DevKit V1  │
                    │                   │
   3V3 ●────────────┼──┬─────────────────┼─────── 3.3 V RAIL  (~150 mA)
       │             │  │                 │
       │             │  │ SPI bus         │   I²C bus
       │             │  │                 │
    GND ●────────────┼──┴─────────────────┼─────── COMMON GROUND
       │             │                   │
       │        ┌────┴─────┐        ┌────┴─────┐        ┌─────────┐
       │        │  LoRa    │        │  MPU6050 │        │SH1106   │
       │        │ RFM95W   │        │  GY-521  │        │ OLED     │
       │        │ 433 MHz  │        │          │        │         │
       │        └──────────┘        └──────────┘        └─────────┘
       │             ▲                  ▲                 ▲
       │             │                  └───── 3V3 ───────┤
       │   SDA=21 ───┼─────── I²C SDA ───┴────────────────┤
       │   SCL=22 ───┼─────── I²C SCL ───┴────────────────┘
       │             ▲                  ▲                 ▲
       │             │                  └───── 3V3 ───────┤
       │             │                                     │
       │             │        ┌──────────┐                 │
       │             └────────┤ NEO-6M   │                 │
       │              RX=16◄──┤ GPS      │                 │
       │              TX=17──►┤ UART2    │                 │
       │                     └─────┬────┘                 │
       │                           │  VIN 5 V             │
       │                           │                      │
       └─── GND ───────────────────┴──────────────────────┘
                              
                          ESP32 GPIOs
          ┌──────────────────────────────────────────┐
          │ GPIO2  → status LED (+330 Ω → GND)      │
          │ GPIO27 → base of NPN transistor ──┐      │
          │ GPIO33 → SOS button → GND         │      │
          │                                    ▼      │
          │                            piezo buzzer ──┘
          │                             (+ flyback)    │
          └──────────────────────────────────────────┘
```

### SPI bus — LoRa only

```
  ESP32              RFM95W (SX1278)
  ─────              ──────────────
  GPIO18  SCK   ───▶ SCK
  GPIO19  MISO  ◀─── MISO
  GPIO23  MOSI  ───▶ MOSI
  GPIO5   NSS   ───▶ NSS      (chip select)
  GPIO14  RST   ───▶ RESET
  GPIO26  DIO0  ◀─── DIO0     (interrupt)
  3V3     VCC   ───▶ VCC      ⚠ 3.3 V ONLY — 5 V DESTROYS IT
  GND     GND   ───▶ GND
                      ANT ───▶ 433 MHz antenna (mandatory)
```

### I²C bus — three devices share two wires

```
  ESP32            MAX30102/30100    MPU6050        SH1106
  ─────            ──────────────    ───────        ──────
  GPIO21 SDA  ───▶ SDA              SDA            SDA
  GPIO22 SCL  ───▶ SCL              SCL            SCL
  3V3         ───▶ VCC              VCC            VCC
  GND         ───▶ GND              GND            GND
                    0x57             0x68           0x3C
```

Addresses do not clash, so all three share the same pair of wires.
Confirm your OLED is **SH1106**. Many "SSD1306" listings are mislabelled;
the wrong driver gives a garbled or blank screen, not a wiring fault.

### UART2 — GPS

```
  ESP32              NEO-6M
  ─────              ──────
  GPIO16 RX    ◀──── TX          (ESP32 receives)
  GPIO17 TX    ────▶ RX          (ESP32 sends, 9600 8N1)
  VIN  5 V     ────▶ VCC         ⚠ 5 V OK — internal regulator
  GND           ────▶ GND
```

Cross the wires: **TX to RX.** GPS supplies the data, so GPS TX goes to ESP32 RX.

---

## 📋 Detailed Pin Connections

### 4.1 LoRa radio (SPI)

| ESP32 | Module | Level | Notes |
|-------|--------|-------|-------|
| GPIO 18 | SCK | — | SPI clock, VSPI default |
| GPIO 19 | MISO | — | |
| GPIO 23 | MOSI | — | |
| GPIO 5 | NSS | — | Chip select |
| GPIO 14 | RST | — | |
| GPIO 26 | DIO0 | — | Packet-done interrupt |
| 3V3 | VCC | 3.3 V | **Never 5 V** |
| GND | GND | — | |
| — | ANT | — | 433 MHz, **fit before power** |

Operating mode is **433 MHz SF10, asynchronous**. The antenna is not optional —
transmitting into a terminated 50 Ω load without one damages the PA.

### 4.2 I²C devices

| Device | SDA | SCL | VCC | Addr |
|--------|-----|-----|-----|------|
| MAX30102 / MAX30100 | GPIO 21 | GPIO 22 | 3V3 | `0x57` |
| MPU6050 | GPIO 21 | GPIO 22 | 3V3 | `0x68` |
| SH1106 OLED | GPIO 21 | GPIO 22 | 3V3 | `0x3C` |

I²C needs pull-up resistors on both lines (typically 4.7 kΩ each to 3V3).
Most breakout boards already carry them — **check before adding your own**,
because parallel pull-ups in parallel drop the equivalent resistance and can
over-drive the bus. Symptom of missing pull-ups: works when the board is bare,
fails once the display is added, and is sensitive to touching the wires.

IMU ranges are set by firmware: accelerometer ±4 g, gyro ±500 °/s, filter 21 Hz.

### 4.3 GPS

| ESP32 | Module | Notes |
|-------|--------|-------|
| GPIO 16 | TX | Receives NMEA sentences |
| GPIO 17 | RX | Firmware sends config at 9600 |
| VIN | VCC | 5 V — module regulates down internally |
| GND | GND | |

First fix needs a clear view of the sky; indoors it will not lock. Allow up to a
minute outdoors.

### 4.4 SOS button and status LED

| ESP32 | Part | Detail |
|-------|------|--------|
| GPIO 33 | SOS button | `INPUT_PULLUP`, pressed = LOW, to GND |
| GPIO 2 | Status LED | `OUTPUT`. Onboard LED, or external via 330 Ω |

Debounce is 20 ms in firmware. A double-tap within 450 ms or an 800 ms hold
raises SOS; a 2 s hold while an alert is active cancels it locally.
The internal pull-up is enabled, so **no external resistor is required** for the
button.

### 4.5 LM35 body temperature

| LM35 | ESP32 | Detail |
|------|------|--------|
| VCC | 3V3 | Use the sensor's rated supply range |
| GND | GND | Common ground |
| VOUT | GPIO 34 | ADC1 input-only pin; 10 mV per °C |

The firmware averages four samples and accepts only 20–45 °C. An open, floating,
or implausible input is transmitted as INVALID instead of being displayed as a
patient temperature.

### 4.5 ⚠️ Buzzer — needs a transistor driver

Firmware calls `tone(GPIO27, 1000)`, which drives that pin as a PWM output.
An ESP32 GPIO is rated for roughly **12–15 mA**. A bare piezo buzzer commonly
draws **20–30 mA**. Driving one directly risks the pin, and the behaviour is
subtle: it may work from USB and fail on battery.

Add a low-side NPN switch:

```
        3V3
         │
     ┌───┴───┐
     │  1kΩ  │      base resistor
     └───┬───┘
         │
 GPIO27 ─┤
         ├── B  BC547 / 2N3904 / MMBT3904
     C ──┤
         ├──── E  GND
         │
     ┌───┴───┐
     │ buzzer│      piezo, + to 3V3, – to collector
     └───────┘
```

Optional: a **1N4148** diode across the buzzer, cathode to +3V3, protects the
transistor from the inductive spike when the buzzer switches off.

Firmware logic is unchanged — GPIO 27 still the trigger, LOW still off.

---

## ⚡ Power Distribution

The DevKitV1's **3V3 pin is an AMS1117 LDO output, not a 3 A rail.** This is the
single most important section of this guide.

| Rail | Feeds | Load |
|------|-------|------|
| **3V3 pin** | ESP32, MPU6050, MAX30102, OLED, LoRa, transistor | ~150 mA typ, ~300 mA peak |
| **VIN (5 V)** | NEO-6M GPS only | ~45 mA |
| **GND** | everything | one common reference |

### Current budget

| Module | Typ | Peak |
|--------|-----|------|
| ESP32 (LoRa only, no WiFi) | 80–120 mA | ~200 mA |
| MPU6050 | 3 mA | 5 mA |
| MAX30102 / MAX30100, LEDs on | 20 mA | 30 mA |
| SH1106 OLED, white pixels | 20 mA | 30 mA |
| LoRa R02 (SX1278) | 25 mA | 120 mA |
| NEO-6M GPS | 45 mA | 100 mA |
| **Total on 3V3** | **~150 mA** | **~300–400 mA** |

The GPS is moved to VIN so the AMS1117 does not carry it. That is what keeps
the rail inside the LDO's comfort zone.

### Decoupling — do not skip

| Where | Value | Why |
|-------|-------|-----|
| LoRa VCC ↔ GND | **470 µF** + 100 nF | Tx is bursty (120 mA); the bulk cap holds the rail up. Most important cap in the build. |
| Each I²C module VCC | 100 nF | Local decoupling |
| 3V3 rail near DevKit | 10 µF | Absorbs switching transients |
| Buzzer supply | 100 nF | Motor-ish load, inductive kick |

### Do NOT

- **Never put the LoRa on 5 V.** The SX1278 is a 3.3 V part; 5 V destroys it.
- Do not power all five modules from 3V3 — worst case ~400 mA peak makes the
  AMS1117 overheat, and the board brownouts. Classic symptom: *"works on the
  bench, reboots the moment it transmits."*
- Never feed 5 V into the 3V3 pin.
- Do not leave GPIOs floating on unused headers.

---

## ⚠️ Strapping Pins

The ESP32 samples several pins at reset to configure boot mode and flash
voltage. Getting these wrong can brick the chip.

| Pin | Rule | Status here |
|-----|------|-------------|
| **GPIO 12** | Must be **LOW** at boot. HIGH selects 1.8 V flash → permanent damage | Unused. **Leave it unconnected.** |
| **GPIO 0** | Must be LOW to enter bootloader | Unused |
| **GPIO 2** | Sampled at boot — this is the status LED | High at boot, so the LED flickers on briefly at power-up. Harmless. |
| **GPIO 15** | Must be HIGH at boot | Unused — do not pull low |
| **GPIO 6–11** | SPI flash | **Never use** |
| **GPIO 1 / 3** | UART0 — the USB serial link you use for logs | Avoid |
| **GPIO 34–39** | Input only, no internal pull-ups | Unused |

---

## 🔧 Build Order

Wire and verify **one module at a time**. Open the serial monitor at **115200
baud**. Adding everything at once and then debugging is how bench days are lost.

1. **ESP32 alone** — confirm it boots and prints the banner.
2. **MPU6050** — expect `[MPU6050] Init... OK (Fall/Tremor Engine Online)`.
3. **SH1106 OLED** — expect a live framebuffer.
4. **MAX30102** — expect `[PPG] part id 0x15`, then `[MAX30102] Init... OK`.
5. **NEO-6M GPS** — needs open sky for first fix.
6. **LoRa last** — its burst current exposes weak power wiring that steps 1–5 hide.

### Verifying the PPG sensor

MAX30102 counterfeits are extremely common. Most acknowledge I²C and return
plausible-looking but meaningless samples, so they pass a naive smoke test and
then feed junk into a clinical record.

1. **Part ID.** Firmware prints it at boot: `0x15` = MAX30102, `0x11` = MAX30100.
2. **Live signal.** Cover the sensor with your fingertip and watch the IR value
   in the serial log. It must climb well above the lead-off threshold and pulse
   in time with your heartbeat. A counterfeit sits near the floor or drifts.

Firmware validates the part ID strictly at boot, so a mis-identified module is
rejected outright rather than half-working.

Fitted optical placement: sensor against the skin, LED and photodiode aligned,
held by a strap tight enough to keep optical coupling but not to occlude
peripheral perfusion. Optical SpO₂ on a wrist is **not** validated here — the
algorithm reports a number, not a diagnosis.

---

## 🔧 Flashing

```bash
cd firmware/Wrist_Band
pio run                     # build
pio run -t upload           # flash over USB
pio device monitor          # serial, 115200 baud
```

Host-side unit tests (no hardware needed):

```bash
./firmware/test/run_tests.sh
```

---

## ✅ Expected Serial Output

A healthy boot looks like this:

```
==================================================
   AyuLink Edge Wristband Node v6.0 Starting
   Patient 108 — Ramulu Goud | Hanamkonda PHC
   14-Byte Binary Struct + Closed-Loop LoRa Return
===================================================
[PPG] part id 0x15
[MAX30102] Init... OK (Fast 400kHz, Optical Lead-Off Active)
[MPU6050] Init... OK (Fall/Tremor Engine Online)
[LoRa] Init... OK — 433MHz SF10 (Asynchronous Mode)
[GPS] Init NEO-6M UART2... OK (RX:16, TX:17, 9600 baud)
[SYSTEM READY] AyuLink Edge Node active.
```

With a MAX30100 fitted, two lines change and nothing else does — the firmware
selects the driver automatically:

```
[PPG] part id 0x11
[MAX30100] Init... OK (100Hz, 14-bit, Red+IR, no green LED)
```

### Failure messages and what they mean

| Message | Cause | Fix |
|---------|-------|-----|
| `-- no device at 0x57` | No I²C response from PPG | Check SDA/SCL, VCC, address; confirm the sensor is seated |
| `[MAX3010x] FAIL - identified but not responding` | Part ID read OK, register writes fail | Bad solder joint, weak 3V3 under load, or wrong breakout |
| `[MPU6050] FAIL` | Not answering at `0x68` | Swap SDA/SCL if wired backwards — a common error |
| `[LoRa] Init... FAILED` | SPI radio not responding | Check SCK/MOSI/MISO/NSS/RST, and **is the antenna fitted?** |
| `[GPS] FAIL` | No UART2 response | TX/RX not crossed, or module needs open sky |
| Blank OLED | Wrong display driver | Confirm it is **SH1106**, not SSD1306 |
| Buzzer silent / weak | Direct GPIO drive | Add the transistor from §4.5 |
| Reboots on transmit | 3V3 rail sagging | Add the 470 µF cap; move GPS to VIN |
| Garbled OLED text | I²C signal integrity | Check pull-ups and wire length; keep SDA/SCL short |

---

## 🔐 Safety notes

- This is an engineering prototype. It is **not a medical device**, the vital
  signs are not clinically validated, and it must not be used to make clinical
  decisions.
- Never power the LoRa module without its antenna.
- Li-ion batteries need a proper charger and protection circuit; never wire a
  bare cell into `VIN`.
- If powering from a battery, see §5 of the power section — a 3.3 V cell must
  not go straight into `3V3` or `VIN`.
