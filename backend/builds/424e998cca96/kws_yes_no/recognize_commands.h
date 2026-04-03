/* Copyright 2017 The TensorFlow Authors. All Rights Reserved.
Licensed under the Apache License, Version 2.0. */

#ifndef TENSORFLOW_LITE_MICRO_EXAMPLES_MICRO_SPEECH_RECOGNIZE_COMMANDS_H_
#define TENSORFLOW_LITE_MICRO_EXAMPLES_MICRO_SPEECH_RECOGNIZE_COMMANDS_H_

#include <cstdint>
#include "tensorflow/lite/c/common.h"
#include "tensorflow/lite/micro/micro_error_reporter.h"
#include "micro_features_micro_model_settings.h"

// FIFO queue for storing previous inference results for averaging.
class PreviousResultsQueue {
 public:
  struct Result {
    Result() : time_(0), scores_() {}
    Result(int32_t time, const int8_t* input_scores) : time_(time) {
      for (int i = 0; i < kCategoryCount; ++i) {
        scores_[i] = input_scores[i];
      }
    }
    int32_t time_;
    int8_t scores_[kCategoryCount];
  };

  explicit PreviousResultsQueue(tflite::ErrorReporter* error_reporter)
      : error_reporter_(error_reporter), front_index_(0), size_(0) {}

  int size() const { return size_; }
  bool empty() const { return size_ == 0; }

  Result& front() { return results_[front_index_]; }
  const Result& front() const { return results_[front_index_]; }

  Result from_front(int offset) const {
    int index = (front_index_ + offset) % kMaxResults;
    return results_[index];
  }

  void push_back(const Result& entry) {
    int back_index = (front_index_ + size_) % kMaxResults;
    results_[back_index] = entry;
    if (size_ >= kMaxResults) {
      // Queue is full, overwrite oldest
      front_index_ = (front_index_ + 1) % kMaxResults;
    } else {
      ++size_;
    }
  }

  void pop_front() {
    if (size_ > 0) {
      front_index_ = (front_index_ + 1) % kMaxResults;
      --size_;
    }
  }

 private:
  static constexpr int kMaxResults = 50;
  tflite::ErrorReporter* error_reporter_;
  Result results_[kMaxResults];
  int front_index_;
  int size_;
};

// Post-processing class that averages results over a window
// and suppresses repeated detections.
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
  tflite::ErrorReporter* error_reporter_;
  int32_t average_window_duration_ms_;
  uint8_t detection_threshold_;
  int32_t suppression_ms_;
  int32_t minimum_count_;
  PreviousResultsQueue previous_results_;
  const char* previous_top_label_;
  int32_t previous_top_label_time_;
};

#endif
