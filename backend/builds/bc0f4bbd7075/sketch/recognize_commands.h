/* Copyright 2017 The TensorFlow Authors. All Rights Reserved.
Licensed under the Apache License, Version 2.0. */

#ifndef TENSORFLOW_LITE_MICRO_EXAMPLES_MICRO_SPEECH_RECOGNIZE_COMMANDS_H_
#define TENSORFLOW_LITE_MICRO_EXAMPLES_MICRO_SPEECH_RECOGNIZE_COMMANDS_H_

#include <cstdint>
#include "tensorflow/lite/c/common.h"
#include "tensorflow/lite/micro/micro_error_reporter.h"
#include "micro_features_micro_model_settings.h"

class RecognizeCommands {
 public:
  explicit RecognizeCommands(tflite::ErrorReporter* error_reporter,
                             int32_t average_window_duration_ms = 1000,
                             uint8_t detection_threshold = 200,
                             int32_t suppression_ms = 1500,
                             int32_t minimum_count = 3);

  TfLiteStatus ProcessLatestResults(const TfLiteTensor* latest_results,
                                    const int32_t current_time_ms,
                                    const char** found_command, uint8_t* score,
                                    bool* is_new_command);

 private:
  struct PreviousResultsEntry {
    int32_t time_;
    int8_t scores_[kCategoryCount];
  };
  static constexpr int kMaxResults = 50;
  tflite::ErrorReporter* error_reporter_;
  PreviousResultsEntry previous_results_[kMaxResults];
  int previous_results_count_;
  int32_t average_window_duration_ms_;
  uint8_t detection_threshold_;
  int32_t suppression_ms_;
  int32_t minimum_count_;
  const char* previous_top_label_;
  int32_t previous_top_label_time_;
};

#endif
