/**
 * MAX30100 pulse oximeter / heart-rate sensor driver.
 *
 * WHY THIS EXISTS
 *   The wristband was built against the MAX30102, whose register map the
 *   SparkFun MAX3010x library implements. That library explicitly supports the
 *   MAX30105 and MAX30102 — NOT the MAX30100. The two parts share the same I2C
 *   address (0x57) and the same 7-bit part-ID register, which makes a wrong part
 *   look plausible rather than obviously absent. Their register maps are
 *   genuinely different:
 *
 *     MAX30102  FIFO_DATA = 3 bytes/sample : RED, IR, GREEN
 *     MAX30100  FIFO_DATA = 4 bytes/sample : IR hi, IR lo, RED hi, RED lo
 *
 *   So a #define swap would have produced a sensor that acknowledged I2C
 *   traffic and returned garbage. This is a real driver.
 *
 * REGISTER MAP (Maxim MAX30100 datasheet, Table 1)
 *   0x00  Interrupt Status
 *   0x01  Interrupt Enable
 *   0x02  FIFO Write Pointer      [3:0]
 *   0x03  Overflow Counter        [3:0]
 *   0x04  FIFO Read Pointer       [3:0]
 *   0x05  FIFO Data               4 bytes per sample, left-justified
 *   0x06  Mode Configuration      [7]=SHDN [6]=RESET [5]=TEMP_EN [4:2]=SR [1:0]=MODE
 *   0x07  LED Configuration       [7:5]=unused [6:5]=LED_PW [4:2]=LED current [1:0]=mode
 *   0xFE  Part ID                 0x11 for MAX30100 (0x15 for MAX30102)
 *
 * The API mirrors the SparkFun class the sketch already calls, so both parts
 * can sit behind one interface and the sketch selects at boot by part ID.
 */

#ifndef MAX30100_H
#define MAX30100_H

#include <Arduino.h>
#include <Wire.h>

#define MAX30100_I2C_ADDRESS 0x57
#define MAX30100_PART_ID     0x11
#define MAX30102_PART_ID     0x15

// THE TWO ID REGISTERS ARE SWAPPED BETWEEN THE TWO PARTS. This is the single
// most common reason a MAX30102 is reported as "not found" on a MAX30100 driver:
//
//   register   MAX30100        MAX30102
//   0xFE       PART_ID (0x11)  REV_ID  (typically 0x03)
//   0xFF       REV_ID          PART_ID (0x15)
//
// So reading only 0xFE on a MAX30102 returns 0x03, which matches neither part
// and leaves the sensor permanently uninitialised (LEDs at their power-on
// minimum current, no AGC, no usable samples). probePartId() reads both.
#define MAX30100_REG_PART_ID 0xFE
#define MAX30100_REG_REV_ID  0xFF

// Mode Configuration, register 0x06, bits [1:0].
#define MAX30100_MODE_HR     0x02   // Red only
#define MAX30100_MODE_SPO2   0x03   // Red + IR

// Sample rate, register 0x06 bits [4:2].
#define MAX30100_SR_50HZ     0
#define MAX30100_SR_100HZ    1
#define MAX30100_SR_167HZ    2
#define MAX30100_SR_200HZ    3
#define MAX30100_SR_400HZ    4
#define MAX30100_SR_600HZ    5
#define MAX30100_SR_800HZ    6
#define MAX30100_SR_1000HZ   7

// ADC pulse width, register 0x06 bits [6:5]. Wider = more bits of resolution.
#define MAX30100_PW_200US    0   // 13-bit
#define MAX30100_PW_400US    1   // 14-bit
#define MAX30100_PW_800US    2   // 15-bit
#define MAX30100_PW_1600US   3   // 16-bit

// LED pulse width, register 0x07 bits [6:5]. 0 is 200us (13-bit, matches ADC).
#define MAX30100_LED_PW_200US  0
#define MAX30100_LED_PW_400US  1
#define MAX30100_LED_PW_800US  2
#define MAX30100_LED_PW_1600US 3

// LED current, register 0x07 bits [4:2]. 0 is 0mA (off), 7 is 50mA.
#define MAX30100_LED_CURRENT_0MA  0
#define MAX30100_LED_CURRENT_6MA  1
#define MAX30100_LED_CURRENT_12MA 2
#define MAX30100_LED_CURRENT_18MA 3
#define MAX30100_LED_CURRENT_24MA 4
#define MAX30100_LED_CURRENT_30MA 5
#define MAX30100_LED_CURRENT_36MA 6
#define MAX30100_LED_CURRENT_50MA 7

#define MAX30100_FIFO_DEPTH   16
#define MAX30100_BYTES_PER_SAMPLE 4

class MAX30100 {
public:
    MAX30100();

    /**
     * Identify the part without configuring it.
     *
     * Deprecated in favour of probePartId(): this returns the RAW 0xFE value,
     * which is only the part ID on a MAX30100. On a MAX30102 it returns the
     * revision byte instead.
     */
    int readPartId(TwoWire &wirePort = Wire, uint8_t i2caddr = MAX30100_I2C_ADDRESS);

    /**
     * Identify the part correctly on BOTH silicon variants.
     *
     * Reads 0xFE and 0xFF and resolves which one is the part ID:
     *   0xFF == 0x15  -> MAX30102, return MAX30102_PART_ID
     *   0xFE == 0x11  -> MAX30100, return MAX30100_PART_ID
     *
     * Returns one of the two *_PART_ID values on success, otherwise -1 (no I2C
     * response) or the raw 0xFE value if the device answers but matches
     * neither, so the caller can log something diagnostic.
     */
    static int probePartId(TwoWire &wirePort = Wire, uint8_t i2caddr = MAX30100_I2C_ADDRESS);

    /** Read one raw register. Returns -1 on I2C failure. */
    static int readReg(TwoWire &wirePort, uint8_t i2caddr, uint8_t reg);

    /** Verify the part ID is a MAX30100. */
    bool begin(TwoWire &wirePort = Wire,
               uint32_t i2cSpeed = 400000,
               uint8_t i2caddr = MAX30100_I2C_ADDRESS);

    /**
     * Configure and start sampling.
     *
     * The parameter list mirrors SparkFun's MAX30105::setup() so the sketch can
     * call either driver with the same arguments. MAX30100 has no green LED, so
     * ledPc is accepted and ignored, and adcRange is ignored because the part
     * has no ADC-range bits — only pulse width, which sets the resolution.
     */
    void setup(uint8_t ledPa, uint8_t ledPb, uint8_t ledPc,
               uint8_t sampleRate, uint8_t pulseWidth, uint8_t adcRange);

    void setPulseAmplitudeRed(uint8_t amplitude);
    void setPulseAmplitudeIR(uint8_t amplitude);
    /** No-op. The MAX30100 has no green LED. */
    void setPulseAmplitudeGreen(uint8_t amplitude);

    /** Samples waiting in the FIFO, 0..16. */
    uint8_t available();

    /** Pop the oldest sample. Returns false when the FIFO is empty. */
    bool nextSample();

    uint32_t getIR() const  { return _ir; }
    uint32_t getRed() const { return _red; }
    /** The MAX30100 has no green LED; always 0. */
    uint32_t getGreen() const { return 0; }

    void shutdown();
    void resume();

    /** Number of samples the FIFO has dropped because it overflowed. */
    uint8_t overflowCount();

private:
    uint8_t _readRegister(uint8_t reg, uint8_t i2caddr);
    void _writeRegister(uint8_t reg, uint8_t value, uint8_t i2caddr);
    void _readFifo(uint8_t *buf, uint8_t bytes, uint8_t i2caddr);

    uint8_t  _address = MAX30100_I2C_ADDRESS;
    uint8_t  _sampleRate = MAX30100_SR_100HZ;
    uint8_t  _pulseWidth = MAX30100_PW_400US;
    uint8_t  _redCurrent = MAX30100_LED_CURRENT_12MA;
    uint8_t  _irCurrent  = MAX30100_LED_CURRENT_12MA;
    uint32_t _ir = 0;
    uint32_t _red = 0;
};

#endif // MAX30100_H
