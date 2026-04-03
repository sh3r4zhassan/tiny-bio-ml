/*
 * TinyBioML — Configurable Audio Provider
 *
 * Reads sensor protocol and pin assignments from pin_config.h.
 * Regardless of HOW the audio is captured (PDM, analog, I2C),
 * this module always outputs int16_t audio samples at the expected
 * sample rate for the feature pipeline.
 *
 * The rest of the ML pipeline (feature extraction, inference,
 * command response) stays exactly the same.
 */

#if defined(ARDUINO) && !defined(ARDUINO_ARDUINO_NANO33BLE)
#define ARDUINO_EXCLUDE_CODE
#endif

#ifndef ARDUINO_EXCLUDE_CODE

#include "audio_provider.h"
#include "pin_config.h"
#include "micro_features_micro_model_settings.h"

// ============================================================
// Protocol 0: PDM Microphone
// ============================================================
#if TBML_SENSOR_PROTOCOL == 0

#include "PDM.h"

namespace {
bool g_is_audio_initialized = false;
constexpr int kAudioCaptureBufferSize = DEFAULT_PDM_BUFFER_SIZE * 16;
int16_t g_audio_capture_buffer[kAudioCaptureBufferSize];
int16_t g_audio_output_buffer[kMaxAudioSampleSize];
volatile int32_t g_latest_audio_timestamp = 0;
}  // namespace

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

  #if TBML_USE_DEFAULT
    // Use board's default PDM pins (e.g., Nano 33 BLE onboard mic)
    PDM.begin(TBML_MIC_CHANNELS, kAudioSampleFrequency);
  #else
    // Custom PDM pins specified in pin_config.h
    // Note: Not all boards support custom PDM pins.
    // The PDM library on mbed boards uses default pins regardless.
    // For true custom pin support, you may need a different PDM driver.
    PDM.begin(TBML_MIC_CHANNELS, kAudioSampleFrequency);
  #endif

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
  const int duration_sample_count =
      duration_ms * (kAudioSampleFrequency / 1000);
  for (int i = 0; i < duration_sample_count; ++i) {
    const int capture_index = (start_offset + i) % kAudioCaptureBufferSize;
    g_audio_output_buffer[i] = g_audio_capture_buffer[capture_index];
  }

  *audio_samples_size = kMaxAudioSampleSize;
  *audio_samples = g_audio_output_buffer;
  return kTfLiteOk;
}

int32_t LatestAudioTimestamp() { return g_latest_audio_timestamp; }

// ============================================================
// Protocol 1: Analog Microphone / Sensor
// ============================================================
#elif TBML_SENSOR_PROTOCOL == 1

namespace {
bool g_is_audio_initialized = false;
int16_t g_audio_output_buffer[kMaxAudioSampleSize];
volatile int32_t g_latest_audio_timestamp = 0;

// Circular buffer for analog samples
constexpr int kAnalogBufferSize = kAudioSampleFrequency;  // 1 second
int16_t g_analog_buffer[kAnalogBufferSize];
volatile int g_analog_write_index = 0;
}  // namespace

// Timer-based sampling (uses millis-based polling in this version)
void pollAnalogSamples() {
  static unsigned long last_sample_us = 0;
  unsigned long now = micros();
  unsigned long interval_us = 1000000UL / TBML_ANALOG_SAMPLE_HZ;

  while (now - last_sample_us >= interval_us) {
    int raw = analogRead(TBML_ANALOG_PIN);
    // Convert to int16_t range: analog 0-1023 → -32768 to 32767
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
  // Take a few dummy reads to stabilize ADC
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

  // Poll to fill buffer
  pollAnalogSamples();

  // Copy most recent samples to output buffer
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

// ============================================================
// Protocol 2: I2C Sensor
// ============================================================
#elif TBML_SENSOR_PROTOCOL == 2

#include <Wire.h>

namespace {
bool g_is_audio_initialized = false;
int16_t g_audio_output_buffer[kMaxAudioSampleSize];
volatile int32_t g_latest_audio_timestamp = 0;
int16_t g_i2c_buffer[kAudioSampleFrequency];
volatile int g_i2c_write_index = 0;
}  // namespace

TfLiteStatus InitAudioRecording(tflite::ErrorReporter* error_reporter) {
  #if TBML_USE_DEFAULT
    Wire.begin();
  #else
    Wire.begin();
    // Note: Custom SDA/SCL pins require board-specific Wire configuration
    // On mbed boards, use Wire1 or modify pins in variants.h
  #endif
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

    g_i2c_buffer[g_i2c_write_index % kAudioSampleFrequency] = sample;
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
    g_audio_output_buffer[i] = g_i2c_buffer[(start_idx + i) % kAudioSampleFrequency];
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
