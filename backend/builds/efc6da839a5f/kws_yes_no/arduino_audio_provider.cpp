/*
 * TinyBioML — Configurable Audio Provider
 *
 * Reads sensor protocol and pin config from pin_config.h.
 * Always outputs int16_t audio samples — the ML pipeline doesn't care
 * how the data was captured.
 *
 * Protocol 0 (PDM Microphone):
 *   - TBML_USE_DEFAULT=1 → Arduino PDM library (board's onboard mic)
 *   - TBML_USE_DEFAULT=0 → Raw nRF52840 PDM peripheral with custom CLK/DATA pins
 *
 * Protocol 1 (Analog):
 *   - analogRead() at configured sample rate, scaled to int16_t
 *
 * Protocol 2 (I2C):
 *   - Wire.read() from configured address/register, outputs int16_t
 */

#if defined(ARDUINO) && !defined(ARDUINO_ARDUINO_NANO33BLE)
#define ARDUINO_EXCLUDE_CODE
#endif

#ifndef ARDUINO_EXCLUDE_CODE

#include "audio_provider.h"
#include "pin_config.h"
#include "micro_features_micro_model_settings.h"

// ================================================================
// Protocol 0: PDM Microphone
// ================================================================
#if TBML_SENSOR_PROTOCOL == 0

// ----------------------------------------
// Path A: Default PDM (Arduino PDM library)
// ----------------------------------------
#if TBML_USE_DEFAULT

#include "PDM.h"

namespace {
bool g_is_audio_initialized = false;
constexpr int kAudioCaptureBufferSize = DEFAULT_PDM_BUFFER_SIZE * 16;
int16_t g_audio_capture_buffer[kAudioCaptureBufferSize];
int16_t g_audio_output_buffer[kMaxAudioSampleSize];
volatile int32_t g_latest_audio_timestamp = 0;
}

void CaptureSamples() {
  const int number_of_samples = DEFAULT_PDM_BUFFER_SIZE / 2;
  const int32_t time_in_ms =
      g_latest_audio_timestamp +
      (number_of_samples / (kAudioSampleFrequency / 1000));
  const int32_t start_sample_offset =
      g_latest_audio_timestamp * (kAudioSampleFrequency / 1000);
  const int capture_index = start_sample_offset % kAudioCaptureBufferSize;
  PDM.read(g_audio_capture_buffer + capture_index, DEFAULT_PDM_BUFFER_SIZE);
  g_latest_audio_timestamp = time_in_ms;
}

TfLiteStatus InitAudioRecording(tflite::ErrorReporter* error_reporter) {
  PDM.onReceive(CaptureSamples);
  PDM.begin(TBML_MIC_CHANNELS, kAudioSampleFrequency);
  PDM.setGain(TBML_MIC_GAIN);
  while (!g_latest_audio_timestamp) {}
  return kTfLiteOk;
}

TfLiteStatus GetAudioSamples(tflite::ErrorReporter* error_reporter,
                             int start_ms, int duration_ms,
                             int* audio_samples_size, int16_t** audio_samples) {
  if (!g_is_audio_initialized) {
    TfLiteStatus init_status = InitAudioRecording(error_reporter);
    if (init_status != kTfLiteOk) return init_status;
    g_is_audio_initialized = true;
  }
  const int start_offset = start_ms * (kAudioSampleFrequency / 1000);
  const int duration_sample_count = duration_ms * (kAudioSampleFrequency / 1000);
  for (int i = 0; i < duration_sample_count; ++i) {
    const int capture_index = (start_offset + i) % kAudioCaptureBufferSize;
    g_audio_output_buffer[i] = g_audio_capture_buffer[capture_index];
  }
  *audio_samples_size = kMaxAudioSampleSize;
  *audio_samples = g_audio_output_buffer;
  return kTfLiteOk;
}

int32_t LatestAudioTimestamp() { return g_latest_audio_timestamp; }

// ----------------------------------------
// Path B: Custom PDM pins (raw nRF52840 PDM peripheral)
//
// Uses the nRF52840 hardware PDM decoder directly.
// Works with ANY GPIO pin for CLK and DATA.
// Set TBML_PDM_CLK_PIN and TBML_PDM_DATA_PIN in pin_config.h
// as nRF GPIO numbers (P0.06 = 6, P1.00 = 32, etc.)
// ----------------------------------------
#else  // TBML_USE_DEFAULT == 0

#include <nrf.h>

namespace {
bool g_is_audio_initialized = false;

// Double-buffer for PDM DMA
constexpr int kPdmBufSamples = 256;
int16_t g_pdm_buf_0[kPdmBufSamples];
int16_t g_pdm_buf_1[kPdmBufSamples];
volatile uint8_t g_pdm_current_buf = 0;  // which buffer is being filled (0 or 1)

// Circular capture buffer — same interface as default PDM path
constexpr int kAudioCaptureBufferSize = 16384;
int16_t g_audio_capture_buffer[kAudioCaptureBufferSize];
volatile int32_t g_capture_write_idx = 0;

int16_t g_audio_output_buffer[kMaxAudioSampleSize];
volatile int32_t g_latest_audio_timestamp = 0;
}

// PDM interrupt — called when a DMA buffer is full
extern "C" {
  void tbml_pdm_irq_handler(void) {
    // END event: current buffer is full
    if (NRF_PDM->EVENTS_END) {
      NRF_PDM->EVENTS_END = 0;

      // Get pointer to the buffer that just completed
      int16_t* completed_buf = (g_pdm_current_buf == 0) ? g_pdm_buf_0 : g_pdm_buf_1;

      // Swap to the other buffer for the next DMA transfer
      g_pdm_current_buf ^= 1;
      NRF_PDM->SAMPLE.PTR = (uint32_t)((g_pdm_current_buf == 0) ? g_pdm_buf_0 : g_pdm_buf_1);

      // Copy completed buffer into the circular capture buffer
      for (int i = 0; i < kPdmBufSamples; i++) {
        int32_t idx = g_capture_write_idx % kAudioCaptureBufferSize;
        g_audio_capture_buffer[idx] = completed_buf[i];
        g_capture_write_idx++;
      }

      g_latest_audio_timestamp = millis();
    }

    // Clear other events
    if (NRF_PDM->EVENTS_STARTED) {
      NRF_PDM->EVENTS_STARTED = 0;
    }
    if (NRF_PDM->EVENTS_STOPPED) {
      NRF_PDM->EVENTS_STOPPED = 0;
    }
  }
}

TfLiteStatus InitAudioRecording(tflite::ErrorReporter* error_reporter) {
  uint32_t clk_pin = TBML_PDM_CLK_PIN;
  uint32_t data_pin = TBML_PDM_DATA_PIN;

  TF_LITE_REPORT_ERROR(error_reporter,
    "TinyBioML: Custom PDM init — CLK=GPIO%d, DATA=GPIO%d, Gain=%d",
    clk_pin, data_pin, TBML_MIC_GAIN);

  // === 1. Fully disable PDM peripheral ===
  NRF_PDM->TASKS_STOP = 1;
  delay(10);
  NRF_PDM->ENABLE = 0;
  NVIC_DisableIRQ(PDM_IRQn);

  // Clear all pending events
  NRF_PDM->EVENTS_END = 0;
  NRF_PDM->EVENTS_STARTED = 0;
  NRF_PDM->EVENTS_STOPPED = 0;

  // === 2. Configure pins ===
  // The PDM peripheral configures GPIO automatically via PSEL,
  // but we set direction hints for clarity
  NRF_PDM->PSEL.CLK = (clk_pin & 0x1F) | ((clk_pin >= 32 ? 1 : 0) << 5);
  NRF_PDM->PSEL.DIN = (data_pin & 0x1F) | ((data_pin >= 32 ? 1 : 0) << 5);

  // === 3. Configure PDM mode ===
  // Mono, left-falling edge (standard for most PDM mics)
  NRF_PDM->MODE = (PDM_MODE_OPERATION_Mono << PDM_MODE_OPERATION_Pos) |
                  (PDM_MODE_EDGE_LeftFalling << PDM_MODE_EDGE_Pos);

  // === 4. Set PDM clock ===
  // PDM clock frequency determines sample rate:
  //   1.000 MHz / 64 = 15.625 kHz
  //   1.032 MHz / 64 = 16.125 kHz ≈ 16 kHz (best match)
  //   1.067 MHz / 64 = 16.667 kHz
  // nRF register value: freq = (PDMCLKCTRL * 16MHz) / 2^25
  // For 1.032 MHz: 0x06400000
  NRF_PDM->PDMCLKCTRL = 0x06400000UL;

  // === 5. Set gain ===
  // Range: 0x00 (min) to 0x50 (max), 0x28 = default ≈ 20dB
  uint32_t gain = TBML_MIC_GAIN;
  if (gain > 0x50) gain = 0x50;
  NRF_PDM->GAINL = gain;
  NRF_PDM->GAINR = gain;

  // === 6. Set up initial DMA buffer ===
  g_pdm_current_buf = 0;
  memset(g_pdm_buf_0, 0, sizeof(g_pdm_buf_0));
  memset(g_pdm_buf_1, 0, sizeof(g_pdm_buf_1));
  NRF_PDM->SAMPLE.PTR = (uint32_t)g_pdm_buf_0;
  NRF_PDM->SAMPLE.MAXCNT = kPdmBufSamples;

  // === 7. Set up interrupt ===
  NRF_PDM->INTENCLR = 0xFFFFFFFF;  // Clear all interrupt enables
  NRF_PDM->INTENSET = (PDM_INTENSET_END_Msk);  // Only END event

  // Register our handler
  NVIC_SetVector(PDM_IRQn, (uint32_t)tbml_pdm_irq_handler);
  NVIC_SetPriority(PDM_IRQn, 7);  // Low priority (7 = lowest on Cortex-M4)
  NVIC_ClearPendingIRQ(PDM_IRQn);
  NVIC_EnableIRQ(PDM_IRQn);

  // === 8. Enable and start ===
  NRF_PDM->ENABLE = PDM_ENABLE_ENABLE_Enabled;
  NRF_PDM->TASKS_START = 1;

  // Wait for first audio data
  unsigned long timeout = millis() + 2000;
  while (!g_latest_audio_timestamp) {
    if (millis() > timeout) {
      TF_LITE_REPORT_ERROR(error_reporter,
        "PDM timeout — no data after 2s. Check CLK=%d DATA=%d wiring.",
        clk_pin, data_pin);
      return kTfLiteError;
    }
    delay(1);
  }

  TF_LITE_REPORT_ERROR(error_reporter, "PDM active — receiving audio data");
  return kTfLiteOk;
}

TfLiteStatus GetAudioSamples(tflite::ErrorReporter* error_reporter,
                             int start_ms, int duration_ms,
                             int* audio_samples_size, int16_t** audio_samples) {
  if (!g_is_audio_initialized) {
    TfLiteStatus init_status = InitAudioRecording(error_reporter);
    if (init_status != kTfLiteOk) return init_status;
    g_is_audio_initialized = true;
  }

  // Copy from circular buffer — identical interface to default PDM path
  const int start_offset = start_ms * (kAudioSampleFrequency / 1000);
  const int duration_sample_count = duration_ms * (kAudioSampleFrequency / 1000);
  for (int i = 0; i < duration_sample_count; ++i) {
    const int capture_index = (start_offset + i) % kAudioCaptureBufferSize;
    g_audio_output_buffer[i] = g_audio_capture_buffer[capture_index];
  }

  *audio_samples_size = kMaxAudioSampleSize;
  *audio_samples = g_audio_output_buffer;
  return kTfLiteOk;
}

int32_t LatestAudioTimestamp() { return g_latest_audio_timestamp; }

#endif  // TBML_USE_DEFAULT

// ================================================================
// Protocol 1: Analog Microphone / Sensor
// ================================================================
#elif TBML_SENSOR_PROTOCOL == 1

namespace {
bool g_is_audio_initialized = false;
int16_t g_audio_output_buffer[kMaxAudioSampleSize];
volatile int32_t g_latest_audio_timestamp = 0;
constexpr int kAnalogBufferSize = 16384;
int16_t g_analog_buffer[kAnalogBufferSize];
volatile int g_analog_write_index = 0;
}

void pollAnalogSamples() {
  static unsigned long last_sample_us = 0;
  unsigned long now = micros();
  unsigned long interval_us = 1000000UL / TBML_ANALOG_SAMPLE_HZ;

  while (now - last_sample_us >= interval_us) {
    int raw = analogRead(TBML_ANALOG_PIN);
    int16_t sample = (int16_t)((raw - (TBML_ANALOG_RESOLUTION / 2)) *
                               (32767 / (TBML_ANALOG_RESOLUTION / 2)));
    g_analog_buffer[g_analog_write_index % kAnalogBufferSize] = sample;
    g_analog_write_index++;
    last_sample_us += interval_us;
    g_latest_audio_timestamp = millis();
  }
}

TfLiteStatus InitAudioRecording(tflite::ErrorReporter* error_reporter) {
  pinMode(TBML_ANALOG_PIN, INPUT);
  for (int i = 0; i < 10; i++) analogRead(TBML_ANALOG_PIN);
  g_latest_audio_timestamp = millis();
  return kTfLiteOk;
}

TfLiteStatus GetAudioSamples(tflite::ErrorReporter* error_reporter,
                             int start_ms, int duration_ms,
                             int* audio_samples_size, int16_t** audio_samples) {
  if (!g_is_audio_initialized) {
    TfLiteStatus init_status = InitAudioRecording(error_reporter);
    if (init_status != kTfLiteOk) return init_status;
    g_is_audio_initialized = true;
  }
  pollAnalogSamples();
  int available = g_analog_write_index;
  int copy_count = min((int)kMaxAudioSampleSize, available);
  int start_idx = max(0, available - copy_count);
  for (int i = 0; i < copy_count; i++) {
    g_audio_output_buffer[i] = g_analog_buffer[(start_idx + i) % kAnalogBufferSize];
  }
  *audio_samples_size = kMaxAudioSampleSize;
  *audio_samples = g_audio_output_buffer;
  return kTfLiteOk;
}

int32_t LatestAudioTimestamp() {
  pollAnalogSamples();
  return g_latest_audio_timestamp;
}

// ================================================================
// Protocol 2: I2C Sensor (e.g., INMP441, SPH0645 via I2S-to-I2C)
// ================================================================
#elif TBML_SENSOR_PROTOCOL == 2

#include <Wire.h>

namespace {
bool g_is_audio_initialized = false;
int16_t g_audio_output_buffer[kMaxAudioSampleSize];
volatile int32_t g_latest_audio_timestamp = 0;
constexpr int kI2CBufferSize = 16384;
int16_t g_i2c_buffer[kI2CBufferSize];
volatile int g_i2c_write_index = 0;
}

TfLiteStatus InitAudioRecording(tflite::ErrorReporter* error_reporter) {
  Wire.begin();
  Wire.setClock(400000);  // Fast mode
  g_latest_audio_timestamp = millis();
  return kTfLiteOk;
}

void pollI2CSamples() {
  static unsigned long last_sample_us = 0;
  unsigned long now = micros();
  unsigned long interval_us = 1000000UL / kAudioSampleFrequency;

  while (now - last_sample_us >= interval_us) {
    Wire.beginTransmission(TBML_I2C_ADDR);
    Wire.write(TBML_I2C_REG);
    Wire.endTransmission(false);
    Wire.requestFrom((int)TBML_I2C_ADDR, (int)TBML_I2C_BYTES);
    int16_t sample = 0;
    if (Wire.available() >= 2) {
      sample = (Wire.read() << 8) | Wire.read();
    }
    g_i2c_buffer[g_i2c_write_index % kI2CBufferSize] = sample;
    g_i2c_write_index++;
    last_sample_us += interval_us;
    g_latest_audio_timestamp = millis();
  }
}

TfLiteStatus GetAudioSamples(tflite::ErrorReporter* error_reporter,
                             int start_ms, int duration_ms,
                             int* audio_samples_size, int16_t** audio_samples) {
  if (!g_is_audio_initialized) {
    TfLiteStatus init_status = InitAudioRecording(error_reporter);
    if (init_status != kTfLiteOk) return init_status;
    g_is_audio_initialized = true;
  }
  pollI2CSamples();
  int available = g_i2c_write_index;
  int copy_count = min((int)kMaxAudioSampleSize, available);
  int start_idx = max(0, available - copy_count);
  for (int i = 0; i < copy_count; i++) {
    g_audio_output_buffer[i] = g_i2c_buffer[(start_idx + i) % kI2CBufferSize];
  }
  *audio_samples_size = kMaxAudioSampleSize;
  *audio_samples = g_audio_output_buffer;
  return kTfLiteOk;
}

int32_t LatestAudioTimestamp() {
  pollI2CSamples();
  return g_latest_audio_timestamp;
}

#endif  // TBML_SENSOR_PROTOCOL

#endif  // ARDUINO_EXCLUDE_CODE
