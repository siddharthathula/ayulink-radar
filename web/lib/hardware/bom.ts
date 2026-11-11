/**
 * Prototype bill of materials, priced from public single-unit Indian retail
 * listings (GST included) checked on 12 Nov 2026. One listing per part, cited.
 * These are hobby-retail prices for a hand-built prototype, not a production
 * quote. Parts we did not price are listed separately, never guessed.
 */
export interface BomLine {
  part: string;
  inBand: boolean;
  inGateway: boolean;
  /** Only in the GPS variant of the band. */
  gpsOnly?: boolean;
  priceInr: number;
  retailer: string;
  url: string;
}

export const BOM_CHECKED_ON = "12 Nov 2026";

export const BOM: BomLine[] = [
  { part: "ESP32 DevKit V1 (WROOM-32)", inBand: true, inGateway: true, priceInr: 385, retailer: "techiesms", url: "https://techiesms.com/product/esp32-development-board-doit-devkit-v1/" },
  { part: "MAX30102 pulse / SpO₂ module", inBand: true, inGateway: false, priceInr: 130, retailer: "Hubtronics", url: "https://hubtronics.in/max30102-heart-rate-sensor" },
  { part: "MPU6050 accelerometer + gyro", inBand: true, inGateway: false, priceInr: 165, retailer: "Robu.in", url: "https://robu.in/?p=2846" },
  { part: "Ra-02 SX1278 LoRa 433 MHz", inBand: true, inGateway: true, priceInr: 383, retailer: "Hubtronics", url: "https://hubtronics.in/ra-02-lora-module" },
  { part: "SH1106 1.3″ OLED (I²C)", inBand: true, inGateway: true, priceInr: 315, retailer: "Hubtronics", url: "https://hubtronics.in/1-3-inch-oled-sh1106-i2c" },
  { part: "TP4056 Type-C charger + protection", inBand: true, inGateway: false, priceInr: 40, retailer: "Hubtronics", url: "https://hubtronics.in/super-mini-type-c-lithium-charger" },
  { part: "Li-Po 3.7 V 2000 mAh", inBand: true, inGateway: false, priceInr: 399, retailer: "Zbotic", url: "https://zbotic.in/product/kp-original-903948-2000mah-3-7vsingle-cell-rechargeable-lipo-battery/" },
  { part: "u-blox NEO-6M GPS (optional)", inBand: true, inGateway: false, gpsOnly: true, priceInr: 265, retailer: "Hubtronics", url: "https://hubtronics.in/neo-6m-gps-module" },
];

export const NOT_PRICED = ["LM35 skin-temperature sensor", "433 MHz antenna", "SOS button, buzzer, LED", "perfboard, wires, strap / enclosure"];

const sum = (lines: BomLine[]) => lines.reduce((total, line) => total + line.priceInr, 0);

export const BAND_BASE_INR = sum(BOM.filter((l) => l.inBand && !l.gpsOnly));
export const BAND_GPS_INR = sum(BOM.filter((l) => l.inBand));
export const GATEWAY_INR = sum(BOM.filter((l) => l.inGateway));

export function inr(value: number): string {
  return `₹${value.toLocaleString("en-IN")}`;
}
