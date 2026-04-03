/*
 * TinyBioML — Command Responder
 * Reads pin assignments from pin_config.h
 * Outputs JSON with inference timing for the web platform
 */

#if defined(ARDUINO) && !defined(ARDUINO_ARDUINO_NANO33BLE)
#define ARDUINO_EXCLUDE_CODE
#endif

#ifndef ARDUINO_EXCLUDE_CODE

#include "command_responder.h"
#include "pin_config.h"
#include "Arduino.h"

// Inference timing set by the main loop
extern volatile unsigned long g_last_inference_us;

void RespondToCommand(tflite::ErrorReporter* error_reporter,
                      int32_t current_time, const char* found_command,
                      uint8_t score, bool is_new_command) {
  static bool is_initialized = false;
  if (!is_initialized) {
    pinMode(TBML_LED_BUILTIN, OUTPUT);
    pinMode(TBML_LED_CLASS_0, OUTPUT);
    pinMode(TBML_LED_CLASS_1, OUTPUT);
    pinMode(TBML_LED_CLASS_2, OUTPUT);
    digitalWrite(TBML_LED_CLASS_0, HIGH);
    digitalWrite(TBML_LED_CLASS_1, HIGH);
    digitalWrite(TBML_LED_CLASS_2, HIGH);

    Serial.begin(TBML_BAUD);
    delay(300);
    Serial.print("{\"status\":\"ready\",\"board\":\"");
    Serial.print(TBML_BOARD);
    Serial.print("\",\"model\":\"");
    Serial.print(TBML_MODEL);
    Serial.println("\"}");
    is_initialized = true;
  }

  static int32_t last_command_time = 0;
  static int count = 0;

  if (is_new_command) {
    #if TBML_JSON
    Serial.print("{\"t\":");
    Serial.print(current_time);
    Serial.print(",\"label\":\"");
    Serial.print(found_command);
    Serial.print("\",\"confidence\":");
    Serial.print(score / 255.0, 4);
    Serial.print(",\"raw_score\":");
    Serial.print(score);
    Serial.print(",\"infer_us\":");
    Serial.print(g_last_inference_us);
    Serial.println("}");
    #else
    TF_LITE_REPORT_ERROR(error_reporter, "Heard %s (%d) @%dms",
                         found_command, score, current_time);
    #endif

    last_command_time = current_time;
    digitalWrite(TBML_LED_CLASS_0, HIGH);
    digitalWrite(TBML_LED_CLASS_1, HIGH);
    digitalWrite(TBML_LED_CLASS_2, HIGH);

    if (found_command[0] == 'y') {
      digitalWrite(TBML_LED_CLASS_1, LOW);
    } else if (found_command[0] == 'n') {
      digitalWrite(TBML_LED_CLASS_0, LOW);
    } else if (found_command[0] == 'u') {
      digitalWrite(TBML_LED_CLASS_2, LOW);
    }
  }

  if (last_command_time != 0) {
    if (last_command_time < (current_time - 3000)) {
      last_command_time = 0;
      digitalWrite(TBML_LED_BUILTIN, LOW);
      digitalWrite(TBML_LED_CLASS_0, HIGH);
      digitalWrite(TBML_LED_CLASS_1, HIGH);
      digitalWrite(TBML_LED_CLASS_2, HIGH);
    }
    return;
  }

  ++count;
  digitalWrite(TBML_LED_BUILTIN, (count & 1) ? HIGH : LOW);
}

#endif
