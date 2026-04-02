/* Copyright 2017 The TensorFlow Authors. All Rights Reserved.
Licensed under the Apache License, Version 2.0. */

#include "recognize_commands.h"
#include <limits>

RecognizeCommands::RecognizeCommands(tflite::ErrorReporter* error_reporter,
                                     int32_t average_window_duration_ms,
                                     uint8_t detection_threshold,
                                     int32_t suppression_ms,
                                     int32_t minimum_count)
    : error_reporter_(error_reporter),
      previous_results_count_(0),
      average_window_duration_ms_(average_window_duration_ms),
      detection_threshold_(detection_threshold),
      suppression_ms_(suppression_ms),
      minimum_count_(minimum_count),
      previous_top_label_("silence"),
      previous_top_label_time_(0) {}

TfLiteStatus RecognizeCommands::ProcessLatestResults(
    const TfLiteTensor* latest_results, const int32_t current_time_ms,
    const char** found_command, uint8_t* score, bool* is_new_command) {
  if ((latest_results->dims->size != 2) ||
      (latest_results->dims->data[0] != 1) ||
      (latest_results->dims->data[1] != kCategoryCount)) {
    TF_LITE_REPORT_ERROR(
        error_reporter_,
        "The results for recognition should contain %d elements, but there are "
        "%d in an ideally %d-dimensional tensor",
        kCategoryCount, latest_results->dims->data[1],
        latest_results->dims->size);
    return kTfLiteError;
  }

  if (latest_results->type != kTfLiteInt8) {
    TF_LITE_REPORT_ERROR(
        error_reporter_,
        "The results for recognition should be int8 elements, but are %d",
        latest_results->type);
    return kTfLiteError;
  }

  if ((!previous_results_count_) ||
      (current_time_ms <
       previous_results_[previous_results_count_ - 1].time_)) {
    previous_results_count_ = 0;
  }

  // Add the latest results to the head of the queue.
  if (previous_results_count_ < kMaxResults) {
    PreviousResultsEntry& entry =
        previous_results_[previous_results_count_];
    entry.time_ = current_time_ms;
    for (int i = 0; i < kCategoryCount; ++i) {
      entry.scores_[i] = latest_results->data.int8[i];
    }
    ++previous_results_count_;
  }

  // Prune any earlier results that are too old for the averaging window.
  const int64_t time_limit = current_time_ms - average_window_duration_ms_;
  int how_many_to_drop = 0;
  for (int i = 0; i < previous_results_count_; ++i) {
    if (previous_results_[i].time_ < time_limit) {
      how_many_to_drop++;
    } else {
      break;
    }
  }
  if (how_many_to_drop > 0) {
    for (int i = how_many_to_drop; i < previous_results_count_; ++i) {
      previous_results_[i - how_many_to_drop] = previous_results_[i];
    }
    previous_results_count_ -= how_many_to_drop;
  }

  // If there are too few results, assume the result is unreliable and
  // bail.
  const int64_t earliest_time =
      previous_results_[0].time_;
  const int64_t samples_duration = current_time_ms - earliest_time;
  if ((previous_results_count_ < minimum_count_) ||
      (samples_duration < (average_window_duration_ms_ / 4))) {
    *found_command = previous_top_label_;
    *score = 0;
    *is_new_command = false;
    return kTfLiteOk;
  }

  // Calculate the average score across all the results in the window.
  int32_t average_scores[kCategoryCount];
  for (int offset = 0; offset < kCategoryCount; ++offset) {
    int64_t total = 0;
    for (int i = 0; i < previous_results_count_; ++i) {
      total += previous_results_[i].scores_[offset];
    }
    average_scores[offset] =
        static_cast<int32_t>(total / previous_results_count_);
  }

  // Find the current highest scoring category.
  int current_top_index = 0;
  int32_t current_top_score = 0;
  for (int i = 0; i < kCategoryCount; ++i) {
    if (average_scores[i] > current_top_score) {
      current_top_score = average_scores[i];
      current_top_index = i;
    }
  }
  const char* current_top_label = kCategoryLabels[current_top_index];

  // If we've recently had another label trigger, assume one that occurs too
  // soon afterwards is a bad result.
  int64_t time_since_last_top;
  if ((previous_top_label_ == kCategoryLabels[0]) ||
      (previous_top_label_time_ == std::numeric_limits<int32_t>::min())) {
    time_since_last_top = std::numeric_limits<int32_t>::max();
  } else {
    time_since_last_top = current_time_ms - previous_top_label_time_;
  }
  if ((current_top_score > detection_threshold_) &&
      ((current_top_label != previous_top_label_) ||
       (time_since_last_top > suppression_ms_))) {
    previous_top_label_ = current_top_label;
    previous_top_label_time_ = current_time_ms;
    *is_new_command = true;
  } else {
    *is_new_command = false;
  }
  *found_command = current_top_label;
  *score = current_top_score;

  return kTfLiteOk;
}
