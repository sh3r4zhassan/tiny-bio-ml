/* TinyBioML Command Responder
 * Outputs JSON over Serial for the web platform's serial monitor.
 * Also controls RGB LEDs on Nano 33 BLE Sense for visual feedback.
 */

#if defined(ARDUINO) && !defined(ARDUINO_ARDUINO_NANO33BLE)
#define ARDUINO_EXCLUDE_CODE
#endif

#ifndef ARDUINO_EXCLUDE_CODE

#include "command_responder.h"
#include "Arduino.h"

void RespondToCommand(tflite::ErrorReporter* error_reporter,
                      int32_t current_time, const char* found_command,
                      uint8_t score, bool is_new_command) {
  static bool is_initialized = false;
  if (!is_initialized) {
    pinMode(LED_BUILTIN, OUTPUT);
    pinMode(LEDR, OUTPUT);
    pinMode(LEDG, OUTPUT);
    pinMode(LEDB, OUTPUT);
    digitalWrite(LEDR, HIGH);
    digitalWrite(LEDG, HIGH);
    digitalWrite(LEDB, HIGH);

    Serial.begin(115200);
    delay(300);
    Serial.println("{\"status\":\"ready\",\"msg\":\"TinyBioML KWS Active\",\"classes\":[\"silence\",\"unknown\",\"yes\",\"no\"]}");
    is_initialized = true;
  }

  static int32_t last_command_time = 0;
  static int count = 0;

  if (is_new_command) {
    Serial.print("{\"t\":");
    Serial.print(current_time);
    Serial.print(",\"label\":\"");
    Serial.print(found_command);
    Serial.print("\",\"confidence\":");
    Serial.print(score / 255.0, 4);
    Serial.print(",\"raw_score\":");
    Serial.print(score);
    Serial.println("}");

    last_command_time = current_time;
    digitalWrite(LEDR, HIGH);
    digitalWrite(LEDG, HIGH);
    digitalWrite(LEDB, HIGH);

    if (found_command[0] == 'y') {
      digitalWrite(LEDG, LOW);
    } else if (found_command[0] == 'n') {
      digitalWrite(LEDR, LOW);
    } else if (found_command[0] == 'u') {
      digitalWrite(LEDB, LOW);
    }
  }

  if (last_command_time != 0) {
    if (last_command_time < (current_time - 3000)) {
      last_command_time = 0;
      digitalWrite(LED_BUILTIN, LOW);
      digitalWrite(LEDR, HIGH);
      digitalWrite(LEDG, HIGH);
      digitalWrite(LEDB, HIGH);
    }
    return;
  }

  ++count;
  if (count & 1) {
    digitalWrite(LED_BUILTIN, HIGH);
  } else {
    digitalWrite(LED_BUILTIN, LOW);
  }
}

#endif
