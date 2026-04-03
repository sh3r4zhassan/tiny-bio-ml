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
// ----------------------------------------
#else  // TBML_USE_DEFAULT == 0

#include <nrf.h>
#include <hal/nrf_pdm.h>
#include <hal/nrf_gpio.h>

namespace {
bool g_is_audio_initialized = false;

// Double-buffer for DMA
constexpr int kPdmBufferSize = 256;  // samples per DMA transfer
int16_t g_pdm_buf_a[kPdmBufferSize];
int16_t g_pdm_buf_b[kPdmBufferSize];
volatile bool g_pdm_buf_a_ready = false;
volatile bool g_pdm_buf_b_ready = false;
volatile int16_t* g_pdm_active_buf = g_pdm_buf_a;

// Circular capture buffer (same interface as default PDM)
constexpr int kAudioCaptureBufferSize = 16384;  // ~1 second at 16kHz
int16_t g_audio_capture_buffer[kAudioCaptureBufferSize];
volatile int g_capture_write_idx = 0;

int16_t g_audio_output_buffer[kMaxAudioSampleSize];
volatile int32_t g_latest_audio_timestamp = 0;
}

// Convert Arduino pin number to nRF52840 GPIO pin number
static uint32_t arduinoPinToNrf(int arduinoPin) {
  // Use the Arduino variant's pin mapping
  return (uint32_t)digitalPinToPinName(arduinoPin);
}

// PDM interrupt handler — copies DMA buffer to circular capture buffer
extern "C" void PDM_IRQHandler(void) {
  if (NRF_PDM->EVENTS_END) {
    NRF_PDM->EVENTS_END = 0;

    // Determine which buffer just finished
    volatile int16_t* finished_buf;
    if (NRF_PDM->SAMPLE.PTR == (uint32_t)g_pdm_buf_a) {
      finished_buf = g_pdm_buf_b;  // B just finished, A is now active
    } else {
      finished_buf = g_pdm_buf_a;  // A just finished, B is now active
    }

    // Copy to circular capture buffer
    for (int i = 0; i < kPdmBufferSize; i++) {
      g_audio_capture_buffer[g_capture_write_idx % kAudioCaptureBufferSize] = finished_buf[i];
      g_capture_write_idx++;
    }

    // Update timestamp
    g_latest_audio_timestamp = millis();

    // Set up next DMA buffer (double buffering)
    if (NRF_PDM->SAMPLE.PTR == (uint32_t)g_pdm_buf_a) {
      NRF_PDM->SAMPLE.PTR = (uint32_t)g_pdm_buf_b;
    } else {
      NRF_PDM->SAMPLE.PTR = (uint32_t)g_pdm_buf_a;
    }
  }

  if (NRF_PDM->EVENTS_STARTED) {
    NRF_PDM->EVENTS_STARTED = 0;
  }
}

TfLiteStatus InitAudioRecording(tflite::ErrorReporter* error_reporter) {
  // Configure PDM peripheral with custom pins from pin_config.h
  uint32_t clk_pin = TBML_PDM_CLK_PIN;
  uint32_t data_pin = TBML_PDM_DATA_PIN;

  // Configure GPIO
  nrf_gpio_cfg_output(clk_pin);
  nrf_gpio_cfg_input(data_pin, NRF_GPIO_PIN_NOPULL);

  // Stop PDM if it was running
  NRF_PDM->TASKS_STOP = 1;
  delay(10);

  // Set custom pins
  NRF_PDM->PSEL.CLK = clk_pin;
  NRF_PDM->PSEL.DIN = data_pin;

  // Configure PDM: mono, falling edge, 16kHz
  NRF_PDM->MODE = (PDM_MODE_OPERATION_Mono << PDM_MODE_OPERATION_Pos) |
                  (PDM_MODE_EDGE_LeftFalling << PDM_MODE_EDGE_Pos);

  // Clock: 1.032 MHz → 16kHz sample rate (1.032MHz / 64 = 16.125kHz ≈ 16kHz)
  NRF_PDM->PDMCLKCTRL = 0x06400000UL;

  // Gain (0x28 = default ~20dB, range 0x00-0x50)
  NRF_PDM->GAINL = TBML_MIC_GAIN;
  NRF_PDM->GAINR = TBML_MIC_GAIN;

  // Set up DMA buffer
  NRF_PDM->SAMPLE.PTR = (uint32_t)g_pdm_buf_a;
  NRF_PDM->SAMPLE.MAXCNT = kPdmBufferSize;

  // Enable interrupt on buffer full
  NRF_PDM->INTENSET = PDM_INTENSET_END_Msk | PDM_INTENSET_STARTED_Msk;
  NVIC_SetPriority(PDM_IRQn, 7);
  NVIC_EnableIRQ(PDM_IRQn);

  // Enable and start
  NRF_PDM->ENABLE = PDM_ENABLE_ENABLE_Enabled;
  NRF_PDM->TASKS_START = 1;

  // Wait for first samples
  while (!g_latest_audio_timestamp) { delay(1); }

  TF_LITE_REPORT_ERROR(error_reporter,
    "Custom PDM: CLK=%d DATA=%d gain=%d",
    clk_pin, data_pin, TBML_MIC_GAIN);

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

  // Copy from circular buffer — same interface as default PDM path
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
