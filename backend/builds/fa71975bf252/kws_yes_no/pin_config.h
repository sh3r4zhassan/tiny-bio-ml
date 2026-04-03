/*
 * TinyBioML — Hardware Configuration
 * Board: Custom nRF52840 Board
 * MCU: nRF52840 (Cortex-M4F)
 * Model: Keyword Spotting (Yes/No)
 * Generated: 2026-04-03T12:59:54.204996
 *
 * AUTO-GENERATED — redeploy from TinyBioML to change.
 */

#ifndef TINYBIOML_PIN_CONFIG_H
#define TINYBIOML_PIN_CONFIG_H

// =============================================================
// Identity
// =============================================================
#define TBML_BOARD         "Custom nRF52840 Board"
#define TBML_MCU           "nRF52840 (Cortex-M4F)"
#define TBML_MODEL         "Keyword Spotting (Yes/No)"

// =============================================================
// Serial
// =============================================================
#define TBML_BAUD          115200
#define TBML_JSON          1

// =============================================================
// Sensor Input Configuration
// =============================================================
// Protocol: how the sensor communicates
//   0 = PDM (digital microphone, uses PDM library)
//   1 = ANALOG (analogRead on a pin)
//   2 = I2C (read bytes from an I2C address)
//   3 = SPI (read from SPI device)

#define TBML_SENSOR_PROTOCOL    0

// Use board's default hardware for this sensor?
// 1 = yes (e.g., Nano 33 BLE's onboard PDM mic on default pins)
// 0 = no (custom pins specified below)
#define TBML_USE_DEFAULT        0


// --- PDM Microphone ---
#define TBML_MIC_CHANNELS       1
#define TBML_MIC_SAMPLE_RATE    16000
#define TBML_MIC_GAIN           20

#define TBML_PDM_CLK_PIN        P0.25
#define TBML_PDM_DATA_PIN       P0.26









// =============================================================
// Output LEDs
// =============================================================
#define TBML_LED_BUILTIN        LED_BUILTIN

// Defaults for Nano 33 BLE
#define TBML_LED_CLASS_0        LEDR
#define TBML_LED_CLASS_1        LEDG
#define TBML_LED_CLASS_2        LEDB


#endif  // TINYBIOML_PIN_CONFIG_H