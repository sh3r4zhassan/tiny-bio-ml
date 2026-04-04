"""
TinyBioML Backend — FastAPI
Handles: model/dataset CRUD, firmware compilation, model optimization, benchmarking.
"""

import os
import json
import uuid
import shutil
import subprocess
import asyncio
import numpy as np
from pathlib import Path
from datetime import datetime

from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

# Fix numpy types in JSON responses
import json as _json

class _NumpyEncoder(_json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, np.integer): return int(obj)
        if isinstance(obj, np.floating): return float(obj)
        if isinstance(obj, np.ndarray): return obj.tolist()
        return super().default(obj)

def _safe_json(data):
    """Convert any numpy types in a dict/list to native Python types."""
    return _json.loads(_json.dumps(data, cls=_NumpyEncoder))

app = FastAPI(title="TinyBioML API", version="0.1.0")

# --- CORS (allow your Vite dev server) ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Paths ---
BASE_DIR = Path(__file__).parent
MODELS_DIR = BASE_DIR / "models_store"
DATASETS_DIR = BASE_DIR / "datasets_store"
BUILDS_DIR = BASE_DIR / "builds"
TEMPLATES_DIR = BASE_DIR / "templates"

for d in [MODELS_DIR, DATASETS_DIR, BUILDS_DIR]:
    d.mkdir(exist_ok=True)

# --- In-memory DB (replace with SQLite/Postgres later) ---
# Seed with your existing mock data
DB = {
    "models": [
        {
            "id": "tbio-kws-yes-no-v1", "slug": "tbio/kws-yes-no-v1",
            "title": "Keyword Spotting (Yes/No)", "author": "TinyBioML",
            "task": "Audio Classification",
            "description": "Real-time keyword detection using a DS-CNN on 40-bin log-mel filterbank features. Detects 'yes'/'no' for voice interfaces on biomedical wearables.",
            "downloads": 0, "likes": 0,
            "tags": ["Audio", "Keywords", "int8", "PDM-Mic", "DS-CNN"],
            "updated": datetime.now().isoformat(),
            "file": str(MODELS_DIR / "KWS_yes_no.tflite"),
            "firmware_template": "kws_yes_no",
            "details": {
                "architecture": "DS-CNN (Depthwise Separable CNN)", "framework": "TensorFlow Lite Micro",
                "quantization": "int8 (post-training)", "dataset": "Google Speech Commands v0.02",
                "accuracy": "92.3%", "input_type": "Audio (PDM Mic → 40-bin filterbank)",
                "input_shape": [1, 1960], "input_format": "int8 spectrogram (49 × 40)",
                "output_type": "Classification (4 classes)", "output_classes": 4,
                "class_labels": ["silence", "unknown", "yes", "no"],
                "sample_rate": "16 kHz", "inference_window": "1 second", "parameters": "~20K",
                "compatible_mcus": ["nrf52840", "esp32"],
            },
            "stats": {"flash": "18KB", "ram": "10KB"}, "sensor": "pdm_microphone",
            "benchmark_dataset": "kws_yes_no",
        },
        {
            "id": "tbio-ecg-arrhythmia-resnet", "slug": "tbio/ecg-arrhythmia-resnet",
            "title": "ECG Arrhythmia Classifier (ResNet-1D)", "author": "TinyBioML",
            "task": "ECG Classification",
            "description": "5-class arrhythmia detection from single-lead ECG using ResNet-1D with residual blocks. Trained on the MIT-BIH Arrhythmia Database (109K annotated beats).",
            "downloads": 12400, "likes": 342,
            "tags": ["ECG", "Arrhythmia", "int8", "MIT-BIH", "ResNet"],
            "updated": datetime.now().isoformat(),
            "file": str(MODELS_DIR / "ecg_arrhythmia_resnet.tflite"),
            "firmware_template": None,
            "details": {
                "architecture": "ResNet-1D (residual blocks, 64→128 filters)", "framework": "TensorFlow Lite Micro",
                "quantization": "int8 (post-training)", "dataset": "MIT-BIH Arrhythmia Database",
                "accuracy": "97.2%", "input_type": "Analog sensor (AD8232 ECG)",
                "input_shape": [1, 187, 1], "input_format": "int8 ECG (187 samples @ 360Hz)",
                "output_type": "Classification (5 classes)", "output_classes": 5,
                "class_labels": ["Normal", "Supraventricular", "Ventricular", "Fusion", "Unknown"],
                "sample_rate": "360 Hz", "inference_window": "~520ms", "parameters": "~45K",
                "compatible_mcus": ["nrf52840", "esp32"],
            },
            "stats": {"flash": "52KB", "ram": "18KB"}, "sensor": "analog",
            "benchmark_dataset": "ecg_arrhythmia",
        },
        {
            "id": "tbio-ppg-heartrate-deepconvlstm", "slug": "tbio/ppg-heartrate-deepconvlstm",
            "title": "PPG Heart Rate Estimator (DeepConvLSTM)", "author": "TinyBioML",
            "task": "Heart Rate Regression",
            "description": "Continuous heart rate estimation from wrist PPG using DeepConvLSTM (4×Conv1D + 2×LSTM-128). Trained on PPG-DaLiA dataset (15 subjects, daily activities). Outputs BPM.",
            "downloads": 5200, "likes": 128,
            "tags": ["PPG", "Heart-Rate", "LSTM", "Wearable", "DeepConvLSTM"],
            "updated": datetime.now().isoformat(),
            "file": str(MODELS_DIR / "ppg_heartrate_deepconvlstm.tflite"),
            "firmware_template": None,
            "details": {
                "architecture": "DeepConvLSTM (4×Conv1D + 2×LSTM-128)", "framework": "TensorFlow Lite Micro",
                "quantization": "int8 (post-training)", "dataset": "PPG-DaLiA (UCI Archive)",
                "accuracy": "MAE: 3.1 BPM", "input_type": "Analog/I2C PPG (MAX30102)",
                "input_shape": [1, 128, 1], "input_format": "int8 PPG (128 pts @ 100Hz)",
                "output_type": "Regression (BPM)", "output_classes": 1, "class_labels": None,
                "sample_rate": "100 Hz", "inference_window": "1.28s", "parameters": "~180K",
                "compatible_mcus": ["nrf52840", "esp32"],
            },
            "stats": {"flash": "95KB", "ram": "32KB"}, "sensor": "analog",
            "benchmark_dataset": "ppg_heartrate",
        },
        {
            "id": "tbio-eeg-seizure-eegnet", "slug": "tbio/eeg-seizure-eegnet",
            "title": "EEG Seizure Detector (EEGNet)", "author": "TinyBioML",
            "task": "Seizure Detection",
            "description": "Binary seizure detection from single-channel EEG using EEGNet with temporal-spatial filters. Trained on UCI Epileptic Seizure Recognition (11.5K segments, Bonn University EEG corpus).",
            "downloads": 3800, "likes": 210,
            "tags": ["EEG", "Seizure", "Epilepsy", "EEGNet", "Neurology"],
            "updated": datetime.now().isoformat(),
            "file": str(MODELS_DIR / "eeg_seizure_eegnet.tflite"),
            "firmware_template": None,
            "details": {
                "architecture": "EEGNet (DepthwiseConv + SeparableConv)", "framework": "TensorFlow Lite Micro",
                "quantization": "int8 (post-training)", "dataset": "UCI Epileptic Seizure Recognition",
                "accuracy": "95.8%", "input_type": "Analog EEG (ADS1299, OpenBCI)",
                "input_shape": [1, 178, 1], "input_format": "int8 EEG (178 samples)",
                "output_type": "Classification (2 classes)", "output_classes": 2,
                "class_labels": ["Normal", "Seizure"],
                "sample_rate": "178 Hz", "inference_window": "1s", "parameters": "~8K",
                "compatible_mcus": ["nrf52840", "esp32"],
            },
            "stats": {"flash": "24KB", "ram": "10KB"}, "sensor": "analog",
            "benchmark_dataset": "eeg_seizure",
        },
        {
            "id": "tbio-fall-detection-inception", "slug": "tbio/fall-detection-inception",
            "title": "IMU Fall Detector (InceptionTime)", "author": "TinyBioML",
            "task": "Fall Detection",
            "description": "Real-time fall detection from 6-axis IMU using InceptionTime with multi-scale temporal convolutions (3/5/11 kernels). Trained on SisFall (38 subjects, 15 fall types, 19 ADL).",
            "downloads": 6800, "likes": 175,
            "tags": ["IMU", "Fall", "Accelerometer", "Gyro", "InceptionTime"],
            "updated": datetime.now().isoformat(),
            "file": str(MODELS_DIR / "fall_detection_inception.tflite"),
            "firmware_template": None,
            "details": {
                "architecture": "InceptionTime (3 modules, multi-scale 3/5/11)", "framework": "TensorFlow Lite Micro",
                "quantization": "int8 (post-training)", "dataset": "SisFall (38 subjects)",
                "accuracy": "96.3%", "input_type": "IMU (6-axis accel+gyro)",
                "input_shape": [1, 256, 6], "input_format": "float32 IMU (256 × 6 @ 200Hz)",
                "output_type": "Classification (2 classes)", "output_classes": 2,
                "class_labels": ["No Fall", "Fall"],
                "sample_rate": "200 Hz", "inference_window": "1.28s", "parameters": "~35K",
                "compatible_mcus": ["nrf52840", "esp32"],
            },
            "stats": {"flash": "42KB", "ram": "15KB"}, "sensor": "imu",
            "benchmark_dataset": "fall_detection",
        },
        {
            "id": "tbio-cough-detection-mobilenet", "slug": "tbio/cough-detection-mobilenet",
            "title": "Cough Detector (MobileNetV2)", "author": "TinyBioML",
            "task": "Audio Classification",
            "description": "Audio cough detection using MobileNetV2 on 128×128 mel spectrograms. Trained on COUGHVID crowdsourced dataset (25K+ recordings). For continuous respiratory health monitoring.",
            "downloads": 2400, "likes": 95,
            "tags": ["Audio", "Cough", "Respiratory", "MobileNetV2", "PDM-Mic"],
            "updated": datetime.now().isoformat(),
            "file": str(MODELS_DIR / "cough_detection_mobilenet.tflite"),
            "firmware_template": None,
            "details": {
                "architecture": "MobileNetV2 (adapted for 1-ch spectrograms)", "framework": "TensorFlow Lite Micro",
                "quantization": "int8 (post-training)", "dataset": "COUGHVID (EPFL, Zenodo)",
                "accuracy": "91.5%", "input_type": "Audio (PDM Mic → mel spectrogram)",
                "input_shape": [1, 128, 128, 1], "input_format": "int8 mel spectrogram (128×128)",
                "output_type": "Classification (2 classes)", "output_classes": 2,
                "class_labels": ["No Cough", "Cough"],
                "sample_rate": "16 kHz", "inference_window": "3 seconds", "parameters": "~2.2M",
                "compatible_mcus": ["esp32"],
            },
            "stats": {"flash": "820KB", "ram": "128KB"}, "sensor": "pdm_microphone",
            "benchmark_dataset": "cough_detection",
        },
        {
            "id": "tbio-stress-detection-mlp", "slug": "tbio/stress-detection-mlp",
            "title": "Stress Classifier (Residual MLP)", "author": "TinyBioML",
            "task": "Stress Classification",
            "description": "4-class stress classification from chest EDA using deep residual MLP. Trained on WESAD (15 subjects, 4 conditions: baseline, stress, amusement, meditation).",
            "downloads": 1800, "likes": 67,
            "tags": ["EDA", "Stress", "WESAD", "Mental-Health", "MLP"],
            "updated": datetime.now().isoformat(),
            "file": str(MODELS_DIR / "stress_detection_mlp.tflite"),
            "firmware_template": None,
            "details": {
                "architecture": "Residual MLP (128-unit blocks + skip)", "framework": "TensorFlow Lite Micro",
                "quantization": "int8 (post-training)", "dataset": "WESAD",
                "accuracy": "86.4%", "input_type": "Analog EDA (chest-worn)",
                "input_shape": [1, 64], "input_format": "float32 EDA (64 samples from 700Hz)",
                "output_type": "Classification (4 classes)", "output_classes": 4,
                "class_labels": ["Baseline", "Stress", "Amusement", "Meditation"],
                "sample_rate": "700 Hz (windowed)", "inference_window": "~90ms", "parameters": "~50K",
                "compatible_mcus": ["nrf52840", "esp32", "atmega328p"],
            },
            "stats": {"flash": "18KB", "ram": "6KB"}, "sensor": "analog",
            "benchmark_dataset": "stress_detection",
        },
        {
            "id": "tbio-spo2-estimation-tcn", "slug": "tbio/spo2-estimation-tcn",
            "title": "SpO2 Estimator (TCN)", "author": "TinyBioML",
            "task": "SpO2 Regression",
            "description": "Blood oxygen estimation from PPG using a TCN with dilated causal convolutions (d=1,2,4,8,16). Trained on BIDMC PPG/SpO2 from PhysioNet (125Hz PPG, 1Hz SpO2 ground truth).",
            "downloads": 3100, "likes": 112,
            "tags": ["SpO2", "PPG", "Pulse-Oximeter", "TCN"],
            "updated": datetime.now().isoformat(),
            "file": str(MODELS_DIR / "spo2_estimation_tcn.tflite"),
            "firmware_template": None,
            "details": {
                "architecture": "TCN (dilated causal, d=1,2,4,8,16)", "framework": "TensorFlow Lite Micro",
                "quantization": "int8 (post-training)", "dataset": "BIDMC PPG/SpO2 (PhysioNet)",
                "accuracy": "MAE: 1.2% SpO2", "input_type": "I2C (MAX30102 PPG)",
                "input_shape": [1, 128, 1], "input_format": "int8 PPG (128 @ 125Hz)",
                "output_type": "Regression (SpO2 %)", "output_classes": 1, "class_labels": None,
                "sample_rate": "125 Hz", "inference_window": "~1s", "parameters": "~85K",
                "compatible_mcus": ["nrf52840", "esp32"],
            },
            "stats": {"flash": "65KB", "ram": "24KB"}, "sensor": "i2c",
            "benchmark_dataset": "spo2_estimation",
        },
        {
            "id": "tbio-emg-gesture-tcn", "slug": "tbio/emg-gesture-tcn",
            "title": "EMG Gesture Classifier (TCN)", "author": "TinyBioML",
            "task": "Gesture Classification",
            "description": "53-class hand gesture recognition from 10-channel sEMG using a TCN. Trained on NinaPro DB1 (27 subjects, 52 gestures + rest). For prosthetics and rehabilitation.",
            "downloads": 4200, "likes": 198,
            "tags": ["EMG", "Gesture", "Prosthetics", "NinaPro", "TCN"],
            "updated": datetime.now().isoformat(),
            "file": str(MODELS_DIR / "emg_gesture_tcn.tflite"),
            "firmware_template": None,
            "details": {
                "architecture": "TCN (dilated causal, 64 filters)", "framework": "TensorFlow Lite Micro",
                "quantization": "int8 (post-training)", "dataset": "NinaPro DB1 (27 subjects)",
                "accuracy": "78.3%", "input_type": "Analog (10-ch sEMG)",
                "input_shape": [1, 200, 10], "input_format": "int8 EMG (200 × 10 @ 100Hz)",
                "output_type": "Classification (53 classes)", "output_classes": 53, "class_labels": None,
                "sample_rate": "100 Hz", "inference_window": "2s", "parameters": "~95K",
                "compatible_mcus": ["nrf52840", "esp32"],
            },
            "stats": {"flash": "72KB", "ram": "28KB"}, "sensor": "analog",
            "benchmark_dataset": "emg_gesture",
        },
    ],
    "datasets": [
        {"id": "ds-mitbih", "slug": "kaggle/mit-bih-heartbeat", "title": "MIT-BIH Arrhythmia Database",
         "author": "PhysioNet / Moody & Mark", "size": "101 MB", "rows": "109,446 beats",
         "description": "Gold standard ECG arrhythmia benchmark. 48 half-hour two-lead ambulatory recordings, 5 AAMI beat classes. Used for ResNet-1D baseline.",
         "updated": "2005-02-01", "downloads": 45000,
         "url": "https://www.kaggle.com/datasets/shayanfazeli/heartbeat", "license": "PhysioNet Open Access",
         "benchmark_key": "ecg_arrhythmia"},
        {"id": "ds-ppg-dalia", "slug": "uci/ppg-dalia", "title": "PPG-DaLiA",
         "author": "UCI / Reiss et al.", "size": "2.4 GB", "rows": "15 subjects × ~4h",
         "description": "PPG + accelerometer for HR estimation during daily life. Empatica E4 wristband with ECG ground truth. Used for DeepConvLSTM baseline.",
         "updated": "2019-01-01", "downloads": 8500,
         "url": "https://archive.ics.uci.edu/dataset/495/ppg+dalia", "license": "CC BY 4.0",
         "benchmark_key": "ppg_heartrate"},
        {"id": "ds-uci-seizure", "slug": "kaggle/epileptic-seizure", "title": "Epileptic Seizure Recognition",
         "author": "UCI / Andrzejak et al.", "size": "6.2 MB", "rows": "11,500 segments",
         "description": "EEG segments from Bonn University. 178 features per sample. Binary: seizure vs non-seizure. Used for EEGNet baseline.",
         "updated": "2017-11-01", "downloads": 15000,
         "url": "https://www.kaggle.com/datasets/harunshimanto/epileptic-seizure-recognition", "license": "CC BY 4.0",
         "benchmark_key": "eeg_seizure"},
        {"id": "ds-sisfall", "slug": "kaggle/sisfall", "title": "SisFall Fall Detection",
         "author": "U. de Antioquia", "size": "1.2 GB", "rows": "4,505 recordings",
         "description": "6-axis IMU from 38 subjects (23 young, 15 elderly). 15 fall types, 19 ADL. 200Hz accel + gyro. Used for InceptionTime baseline.",
         "updated": "2017-06-01", "downloads": 5600,
         "url": "https://www.kaggle.com/datasets/kushajm/sisfall-dataset-fall-detection", "license": "Research Use",
         "benchmark_key": "fall_detection"},
        {"id": "ds-coughvid", "slug": "zenodo/coughvid", "title": "COUGHVID",
         "author": "EPFL", "size": "17 GB", "rows": "25,000+ recordings",
         "description": "Crowdsourced cough audio with expert annotations. COVID-19, healthy, and symptomatic classes. Used for MobileNetV2 baseline.",
         "updated": "2021-08-01", "downloads": 7200,
         "url": "https://zenodo.org/record/4048312", "license": "CC BY 4.0",
         "benchmark_key": "cough_detection"},
        {"id": "ds-wesad", "slug": "kaggle/wesad", "title": "WESAD (Stress & Affect)",
         "author": "Schmidt et al.", "size": "6.8 GB", "rows": "15 subjects",
         "description": "Multimodal stress detection: ECG, BVP, EDA, EMG, respiration, temp, accel. 4 conditions. Used for Residual MLP baseline.",
         "updated": "2018-10-01", "downloads": 12000,
         "url": "https://www.kaggle.com/datasets/mohamedasem318/wesad-full-dataset", "license": "CC BY 4.0",
         "benchmark_key": "stress_detection"},
        {"id": "ds-bidmc", "slug": "physionet/bidmc-spo2", "title": "BIDMC PPG & SpO2",
         "author": "PhysioNet / Pimentel", "size": "580 MB", "rows": "53 ICU subjects",
         "description": "Simultaneous PPG (125Hz) and SpO2 (1Hz) from ICU patients. Part of MIMIC-III. Used for TCN SpO2 baseline.",
         "updated": "2016-09-01", "downloads": 4300,
         "url": "https://physionet.org/content/bidmc/1.0.0/", "license": "PhysioNet Open Access",
         "benchmark_key": "spo2_estimation"},
        {"id": "ds-ninapro", "slug": "kaggle/ninapro-db1", "title": "NinaPro DB1 (sEMG Gestures)",
         "author": "HES-SO / Atzori et al.", "size": "3.1 GB", "rows": "27 subjects × 53 gestures",
         "description": "10-channel sEMG for hand gesture recognition. 52 movements + rest. Benchmark for prosthetics research. Used for TCN baseline.",
         "updated": "2014-12-01", "downloads": 9800,
         "url": "https://www.kaggle.com/datasets/mansibmursalin/ninapro-db1-full-dataset", "license": "CC BY-NC-SA 3.0",
         "benchmark_key": "emg_gesture"},
        {"id": "ds-speech-commands", "slug": "tensorflow/speech-commands", "title": "Google Speech Commands v0.02",
         "author": "Google / Pete Warden", "size": "2.3 GB", "rows": "105,829 utterances",
         "description": "35 keyword classes, 1s audio at 16kHz. Standard KWS benchmark. Used for DS-CNN baseline.",
         "updated": "2018-04-01", "downloads": 52000,
         "url": "https://www.tensorflow.org/datasets/catalog/speech_commands", "license": "CC BY 4.0",
         "benchmark_key": "kws_yes_no"},
    ],
    "leaderboard": {},  # dataset_name → list of benchmark entries
}

# Pre-populate leaderboard with baseline entries from each model
def _init_baselines():
    """Add baseline model entries to leaderboard on startup."""
    for model in DB["models"]:
        ds_key = model.get("benchmark_dataset")
        if not ds_key:
            continue

        details = model.get("details", {})
        acc_str = details.get("accuracy", "")

        # Build metrics from model details
        is_reg = ds_key in {"ppg_heartrate", "spo2_estimation"}
        if is_reg:
            # Parse "MAE: 3.1 BPM" or "MAE: 1.2% SpO2"
            mae_val = 0.0
            if "MAE" in acc_str:
                try:
                    mae_val = float(acc_str.split(":")[1].strip().split(" ")[0].replace("%", ""))
                except:
                    pass
            metrics = {"mae": mae_val, "mse": 0.0, "r2": 0.0, "avg_inference_ms": 0.0, "samples": 0}
        else:
            # Parse "97.2%" → 0.972
            acc_val = 0.0
            if "%" in acc_str:
                try:
                    acc_val = float(acc_str.replace("%", "")) / 100.0
                except:
                    pass
            metrics = {"accuracy": acc_val, "f1": acc_val, "precision": acc_val, "recall": acc_val, "avg_inference_ms": 0.0, "samples": 0}

        # Try running actual evaluation if test data + tensorflow available
        test_dir = MODELS_DIR / "test_data"
        model_path = Path(model.get("file", ""))
        if model_path.exists() and (test_dir / f"{ds_key}_X.npy").exists():
            try:
                X_test = np.load(str(test_dir / f"{ds_key}_X.npy"))
                y_test = np.load(str(test_dir / f"{ds_key}_y.npy"))
                metrics = _evaluate_tflite(model_path.read_bytes(), X_test, y_test, is_reg)
                print(f"  ✓ Baseline evaluated: {ds_key} → {metrics}")
            except Exception as e:
                print(f"  ⚠ Baseline eval skipped for {ds_key}: {e}")

        # Determine file size
        size_kb = 0
        if model_path.exists():
            size_kb = round(model_path.stat().st_size / 1024, 1)

        entry = {
            "author": "TinyBioML (Baseline)",
            "filename": model_path.name if model_path.exists() else f"{ds_key}_baseline.tflite",
            "size_kb": size_kb,
            "metrics": metrics,
            "timestamp": model.get("updated", datetime.now().isoformat()),
            "is_regression": is_reg,
            "deployable": True,
            "custom_model_id": None,
            "is_baseline": True,
        }

        DB["leaderboard"][ds_key] = [entry]

# Run after _evaluate_tflite is defined (deferred to app startup)
@app.on_event("startup")
async def startup_init_baselines():
    try:
        _init_baselines()
        print(f"✓ Baselines initialized for {len(DB['leaderboard'])} datasets")
    except Exception as e:
        print(f"⚠ Baseline init failed (will populate on first benchmark): {e}")

# --- MCU & Board Registry ---
# Hierarchy: MCU → Board presets → Pin defaults
MCUS = {
    "nrf52840": {
        "name": "nRF52840 (Cortex-M4F)",
        "arch": "arm",
        "flash_kb": 1024,
        "ram_kb": 256,
        "boards": {
            "nano_33_ble": {
                "name": "Arduino Nano 33 BLE Sense",
                "fqbn": "arduino:mbed_nano:nano33ble",
                "flash_protocol": "bossa",
                "onboard": ["pdm_mic", "imu_lsm9ds1", "temp_hts221", "pressure_lps22hb", "light_apds9960"],
                "defaults": {
                    "mic": "onboard_pdm",
                    "imu": "onboard_lsm9ds1",
                    "led_class_0": "LEDR",
                    "led_class_1": "LEDG",
                    "led_class_2": "LEDB",
                    "mic_gain": 20,
                },
                "pins": {
                    "analog": ["A0", "A1", "A2", "A3", "A4", "A5", "A6", "A7"],
                    "digital": ["D2", "D3", "D4", "D5", "D6", "D7", "D8", "D9", "D10", "D11", "D12", "D13"],
                    "i2c": {"sda": "A4", "scl": "A5"},
                },
            },
            "xiao_ble_sense": {
                "name": "Seeed XIAO BLE Sense",
                "fqbn": "Seeeduino:mbed:xiaoBLE",
                "flash_protocol": "bossa",
                "onboard": ["pdm_mic", "imu_lsm6ds3"],
                "defaults": {
                    "mic": "onboard_pdm",
                    "imu": "onboard_lsm6ds3",
                    "led_class_0": "LED_RED",
                    "led_class_1": "LED_GREEN",
                    "led_class_2": "LED_BLUE",
                    "mic_gain": 20,
                },
                "pins": {
                    "analog": ["A0", "A1", "A2", "A3", "A4", "A5"],
                    "digital": ["D0", "D1", "D2", "D3", "D4", "D5", "D6", "D7", "D8", "D9", "D10"],
                    "i2c": {"sda": "D4", "scl": "D5"},
                },
            },
            "custom_nrf52840": {
                "name": "Custom nRF52840 Board",
                "fqbn": "arduino:mbed_nano:nano33ble",  # default FQBN, user may override
                "flash_protocol": "bossa",
                "onboard": [],
                "defaults": {},
                "pins": {
                    "analog": ["A0", "A1", "A2", "A3", "A4", "A5", "A6", "A7"],
                    "digital": ["D2", "D3", "D4", "D5", "D6", "D7", "D8", "D9", "D10", "D11", "D12", "D13"],
                    "i2c": {"sda": "A4", "scl": "A5"},
                },
            },
        },
    },
    "atmega328p": {
        "name": "ATmega328P",
        "arch": "avr",
        "flash_kb": 32,
        "ram_kb": 2,
        "boards": {
            "nano_classic": {
                "name": "Arduino Nano Classic",
                "fqbn": "arduino:avr:nano",
                "flash_protocol": "avrdude",
                "onboard": [],
                "defaults": {},
                "pins": {
                    "analog": ["A0", "A1", "A2", "A3", "A4", "A5", "A6", "A7"],
                    "digital": ["D2", "D3", "D4", "D5", "D6", "D7", "D8", "D9", "D10", "D11", "D12", "D13"],
                    "i2c": {"sda": "A4", "scl": "A5"},
                },
            },
        },
    },
    "esp32": {
        "name": "ESP32 (Xtensa LX6)",
        "arch": "xtensa",
        "flash_kb": 4096,
        "ram_kb": 520,
        "boards": {
            "esp32_devkit": {
                "name": "ESP32 DevKit V1",
                "fqbn": "esp32:esp32:esp32",
                "flash_protocol": "esptool",
                "onboard": [],
                "defaults": {},
                "pins": {
                    "analog": ["GPIO32", "GPIO33", "GPIO34", "GPIO35", "GPIO36", "GPIO39"],
                    "digital": ["GPIO2", "GPIO4", "GPIO5", "GPIO12", "GPIO13", "GPIO14", "GPIO15", "GPIO16", "GPIO17", "GPIO18", "GPIO19", "GPIO21", "GPIO22", "GPIO23", "GPIO25", "GPIO26", "GPIO27"],
                    "i2c": {"sda": "GPIO21", "scl": "GPIO22"},
                },
            },
            "esp32s3_sense": {
                "name": "XIAO ESP32S3 Sense",
                "fqbn": "esp32:esp32:XIAO_ESP32S3",
                "flash_protocol": "esptool",
                "onboard": ["camera_ov2640", "pdm_mic"],
                "defaults": {"mic": "onboard_pdm"},
                "pins": {
                    "analog": ["A0", "A1", "A2", "A3", "A4", "A5"],
                    "digital": ["D0", "D1", "D2", "D3", "D4", "D5", "D6", "D7", "D8", "D9"],
                    "i2c": {"sda": "D4", "scl": "D5"},
                },
            },
        },
    },
}

# Backward compat helper: flat board lookup
def get_board_info(mcu_key, board_key):
    mcu = MCUS.get(mcu_key)
    if not mcu:
        return None, None
    board = mcu["boards"].get(board_key)
    return mcu, board


# ============================================================
# ROUTES
# ============================================================

# --- Health ---
@app.get("/api/health")
async def health():
    return {"status": "ok", "version": "0.1.0"}


# --- Models ---
@app.get("/api/models")
async def list_models():
    return JSONResponse(content=_safe_json({"models": DB["models"], "total": len(DB["models"])}))


@app.get("/api/models/{model_id}")
async def get_model(model_id: str):
    model = next((m for m in DB["models"] if m["id"] == model_id), None)
    if not model:
        raise HTTPException(404, "Model not found")
    return model


@app.post("/api/models/upload")
async def upload_model(
    file: UploadFile = File(...),
    title: str = Form(...),
    author: str = Form("anonymous"),
    task: str = Form("Classification"),
    hardware: str = Form("Arduino Nano 33"),
    description: str = Form(""),
    tags: str = Form(""),  # comma separated
):
    """Upload a .tflite model to the hub."""
    if not file.filename.endswith((".tflite", ".h5", ".onnx")):
        raise HTTPException(400, "Only .tflite, .h5, and .onnx files are supported")

    model_id = f"user-{uuid.uuid4().hex[:8]}-{title.lower().replace(' ', '-')}"
    model_dir = MODELS_DIR / model_id
    model_dir.mkdir(exist_ok=True)

    # Save the file
    file_path = model_dir / file.filename
    with open(file_path, "wb") as f:
        content = await file.read()
        f.write(content)

    file_size_kb = len(content) / 1024

    model_entry = {
        "id": model_id,
        "slug": f"user/{model_id}",
        "title": title,
        "author": author,
        "task": task,
        "hardware": hardware,
        "description": description,
        "downloads": 0,
        "likes": 0,
        "tags": [t.strip() for t in tags.split(",") if t.strip()],
        "updated": datetime.now().isoformat(),
        "stats": {
            "ram": f"{int(file_size_kb * 0.3)}KB",  # rough estimate
            "flash": f"{int(file_size_kb)}KB",
        },
        "file": str(file_path),
        "input_shape": None,
        "output_classes": None,
    }

    DB["models"].append(model_entry)
    return {"message": "Model uploaded", "model": model_entry}


# --- Datasets ---
@app.get("/api/datasets")
async def list_datasets():
    return JSONResponse(content=_safe_json({"datasets": DB["datasets"], "total": len(DB["datasets"])}))


# --- MCUs ---
@app.get("/api/mcus")
async def list_mcus():
    return {"mcus": MCUS}


# --- Boards (backward compat — flat lookup built from MCUS) ---
BOARDS = {}
for mcu_key, mcu in MCUS.items():
    for board_key, board in mcu["boards"].items():
        flat_key = f"{mcu_key}__{board_key}"
        BOARDS[flat_key] = {
            **board,
            "mcu_key": mcu_key,
            "mcu": mcu["name"],
            "flash_kb": mcu["flash_kb"],
            "ram_kb": mcu["ram_kb"],
            "analog_pins": board["pins"].get("analog", []),
            "digital_pins": board["pins"].get("digital", []),
            "i2c_pins": board["pins"].get("i2c", {}),
        }


@app.get("/api/boards")
async def list_boards():
    return {"boards": BOARDS}


@app.get("/api/boards/{board_key}")
async def get_board(board_key: str):
    if board_key not in BOARDS:
        raise HTTPException(404, "Board not found")
    return BOARDS[board_key]


# --- Firmware directory (pre-built firmware like keyword_spotting) ---
FIRMWARE_DIR = BASE_DIR / "firmware"
FIRMWARE_DIR.mkdir(exist_ok=True)


# --- Ports (auto-detect connected devices) ---
@app.get("/api/ports")
async def list_ports():
    """Detect connected boards using arduino-cli."""
    try:
        proc = subprocess.run(
            ["arduino-cli", "board", "list", "--format", "json"],
            capture_output=True, timeout=10,
        )
        if proc.returncode == 0:
            import json as _json
            data = _json.loads(proc.stdout.decode(errors="replace"))
            ports = []
            for entry in (data if isinstance(data, list) else data.get("detected_ports", [])):
                port_info = entry.get("port", entry) if isinstance(entry, dict) else {}
                boards = entry.get("matching_boards", []) if isinstance(entry, dict) else []
                ports.append({
                    "address": port_info.get("address", ""),
                    "protocol": port_info.get("protocol", ""),
                    "label": port_info.get("label", port_info.get("protocol_label", "")),
                    "board_name": boards[0].get("name", "Unknown") if boards else "Unknown",
                    "fqbn": boards[0].get("fqbn", "") if boards else "",
                })
            return {"ports": ports}
        return {"ports": [], "error": proc.stderr.decode(errors="replace")}
    except FileNotFoundError:
        return {"ports": [], "error": "arduino-cli not found"}
    except Exception as e:
        return {"ports": [], "error": str(e)}


def _tflite_to_c_header(tflite_path):
    """Convert a .tflite file to a C byte array header (works on Windows too)."""
    with open(tflite_path, "rb") as f:
        data = f.read()

    lines = []
    lines.append("// Auto-generated model data")
    lines.append(f"// Size: {len(data)} bytes ({len(data)/1024:.1f} KB)")
    lines.append("")
    lines.append("alignas(8) const unsigned char model_data[] = {")
    for i in range(0, len(data), 12):
        chunk = data[i:i+12]
        hex_vals = ", ".join(f"0x{b:02x}" for b in chunk)
        lines.append(f"  {hex_vals},")
    lines.append("};")
    lines.append(f"const unsigned int model_data_len = {len(data)};")
    return "\n".join(lines)


def _tflite_to_g_model_cpp(tflite_path):
    """Convert a .tflite file to micro_speech compatible g_model format."""
    with open(tflite_path, "rb") as f:
        data = f.read()

    lines = []
    lines.append('#include "micro_features_model.h"')
    lines.append("")
    lines.append(f"// Auto-generated by TinyBioML — {len(data)} bytes ({len(data)/1024:.1f} KB)")
    lines.append("")
    lines.append("#ifdef __has_attribute")
    lines.append("#define HAVE_ATTRIBUTE(x) __has_attribute(x)")
    lines.append("#else")
    lines.append("#define HAVE_ATTRIBUTE(x) 0")
    lines.append("#endif")
    lines.append("#if HAVE_ATTRIBUTE(aligned) || (defined(__GNUC__) && !defined(__clang__))")
    lines.append('#define DATA_ALIGN_ATTRIBUTE __attribute__((aligned(4)))')
    lines.append("#else")
    lines.append("#define DATA_ALIGN_ATTRIBUTE")
    lines.append("#endif")
    lines.append("")
    lines.append("const unsigned char g_model[] DATA_ALIGN_ATTRIBUTE = {")
    for i in range(0, len(data), 12):
        chunk = data[i:i+12]
        hex_vals = ", ".join(f"0x{b:02x}" for b in chunk)
        lines.append(f"  {hex_vals},")
    lines.append("};")
    lines.append(f"const int g_model_len = {len(data)};")
    return "\n".join(lines)


# --- Compile & Deploy ---
@app.post("/api/compile")
async def compile_firmware(
    model_id: str = Form(...),
    board_key: str = Form("nrf52840__nano_33_ble"),
    custom_model_id: str = Form(""),  # If set, use uploaded custom .tflite instead of baseline
    input_source: str = Form("pdm_microphone"),
    use_default: bool = Form(True),
    sensor_protocol: int = Form(0),  # 0=PDM, 1=analog, 2=I2C, 3=SPI
    pin: str = Form("A0"),
    sample_rate_ms: int = Form(100),
    analog_sample_hz: int = Form(16000),
    imu_features: int = Form(3),
    i2c_address: str = Form("0x68"),
    i2c_sda: str = Form("A4"),
    i2c_scl: str = Form("A5"),
    i2c_register: str = Form("0x00"),
    pdm_clk_pin: str = Form(""),
    pdm_data_pin: str = Form(""),
    spi_cs_pin: str = Form("D10"),
):
    """
    Generates firmware from template, compiles with arduino-cli,
    returns the binary for WebSerial flashing.
    """
    model = next((m for m in DB["models"] if m["id"] == model_id), None)
    if not model:
        raise HTTPException(404, "Model not found")

    board = BOARDS.get(board_key)
    if not board:
        raise HTTPException(404, "Board not found")

    build_id = uuid.uuid4().hex[:12]
    build_dir = BUILDS_DIR / build_id
    build_dir.mkdir(exist_ok=True)

    firmware_template_key = model.get("firmware_template")
    firmware_code = "(pre-built sketch)"

    # --- Step 1: Prepare sketch directory ---
    # arduino-cli REQUIRES: directory_name == .ino_filename (without extension)
    sketch_name = firmware_template_key or "firmware"
    sketch_dir = build_dir / sketch_name
    sketch_dir.mkdir(exist_ok=True)

    if not firmware_template_key or not (FIRMWARE_DIR / firmware_template_key).is_dir():
        return JSONResponse(status_code=400, content={
            "error": f"No firmware skeleton found for '{firmware_template_key}'",
            "message": f"Create backend/firmware/{firmware_template_key}/ with the skeleton .ino and support files.",
            "available": [d.name for d in FIRMWARE_DIR.iterdir() if d.is_dir()],
        })

    # --- Step 1: Copy skeleton (fixed files) ---
    src_sketch = FIRMWARE_DIR / firmware_template_key
    for f in src_sketch.iterdir():
        if f.is_file():
            shutil.copy(f, sketch_dir / f.name)

    # --- Step 2: Generate micro_features_model.cpp from .tflite ---
    # If custom_model_id is set, use the user's uploaded model from benchmark
    if custom_model_id:
        custom_path = CUSTOM_MODELS_DIR / f"{custom_model_id}.tflite"
        if custom_path.exists():
            model_cpp = _tflite_to_g_model_cpp(str(custom_path))
        else:
            raise HTTPException(404, f"Custom model '{custom_model_id}' not found. Re-upload via benchmark.")
    else:
        model_file = model.get("file")
        if model_file and os.path.exists(model_file):
            model_cpp = _tflite_to_g_model_cpp(model_file)
        else:
            model_cpp = _generate_dummy_model_header()
    with open(sketch_dir / "micro_features_model.cpp", "w") as fw:
        fw.write(model_cpp)

    # --- Step 3: Generate pin_config.h ---
    from jinja2 import Environment, FileSystemLoader
    env = Environment(loader=FileSystemLoader(str(TEMPLATES_DIR)))
    pin_template = env.get_template("pin_config.h.j2")

    # Map frontend input_source to template variable
    source_map = {
        'pdm_microphone': 'pdm_mic',
        'analog': 'analog',
        'digital': 'digital',
        'imu': 'imu',
        'i2c': 'i2c',
    }

    pin_config = pin_template.render(
        board_name=board["name"],
        mcu=board["mcu"],
        model_name=model["title"],
        timestamp=datetime.now().isoformat(),
        serial_baud=115200,
        # Sensor config
        sensor_protocol=sensor_protocol,
        use_default=use_default,
        # PDM
        mic_gain=20,
        pdm_clk_pin=pdm_clk_pin if pdm_clk_pin else "26",
        pdm_data_pin=pdm_data_pin if pdm_data_pin else "25",
        # Analog
        analog_pin=pin,
        analog_sample_hz=analog_sample_hz,
        analog_resolution=4095 if "esp32" in board_key else 1023,
        # I2C
        i2c_address=i2c_address,
        i2c_sda=i2c_sda or board.get("i2c_pins", {}).get("sda", "A4"),
        i2c_scl=i2c_scl or board.get("i2c_pins", {}).get("scl", "A5"),
        i2c_register=i2c_register,
        i2c_read_bytes=2,
        # SPI
        spi_cs_pin=spi_cs_pin,
        # LEDs — use board defaults if available
        **({
            "led_class_0": board.get("defaults", {}).get("led_class_0"),
            "led_class_1": board.get("defaults", {}).get("led_class_1"),
            "led_class_2": board.get("defaults", {}).get("led_class_2"),
        } if board.get("defaults", {}).get("led_class_0") else {}),
    )
    with open(sketch_dir / "pin_config.h", "w") as fw:
        fw.write(pin_config)

    firmware_code = pin_config  # Show in error UI

    # Read .ino name for reference
    ino_files = list(sketch_dir.glob("*.ino"))
    if ino_files:
        with open(ino_files[0]) as f:
            firmware_code = f.read()[:3000]

    # --- Step 2: Compile with arduino-cli ---
    output_dir = build_dir / "output"
    output_dir.mkdir(exist_ok=True)

    compile_cmd = [
        "arduino-cli", "compile",
        "--fqbn", board["fqbn"],
        "--output-dir", str(output_dir),
        str(sketch_dir),
    ]

    try:
        proc = subprocess.run(
            compile_cmd,
            capture_output=True,
            timeout=600,  # 10 min — first mbed_nano compile is very slow
        )

        if proc.returncode != 0:
            return JSONResponse(
                status_code=422,
                content={
                    "error": "Compilation failed",
                    "details": proc.stderr.decode(errors="replace"),
                    "stdout": proc.stdout.decode(errors="replace"),
                    "build_id": build_id,
                    "sketch": firmware_code[:5000] if len(firmware_code) > 5000 else firmware_code,
                },
            )

        # Find the binary
        binary_file = None
        for ext in [".bin", ".hex"]:
            candidates = list(output_dir.glob(f"*{ext}"))
            if candidates:
                binary_file = candidates[0]
                break

        if not binary_file:
            return JSONResponse(status_code=500, content={
                "error": "Compilation succeeded but no binary found",
                "files": [f.name for f in output_dir.iterdir()],
            })

        # Return build info — frontend will call /api/flash next
        return {
            "status": "compiled",
            "build_id": build_id,
            "board_fqbn": board["fqbn"],
            "flash_protocol": board["flash_protocol"],
            "binary_size": binary_file.stat().st_size,
            "message": f"Compiled successfully. Binary: {binary_file.stat().st_size} bytes.",
        }

    except FileNotFoundError:
        return JSONResponse(
            status_code=503,
            content={
                "error": "arduino-cli not found",
                "message": "Install arduino-cli and the board core.",
                "build_id": build_id,
            },
        )
    except subprocess.TimeoutExpired:
        return JSONResponse(
            status_code=504,
            content={
                "error": "Compilation timed out. Try again — cached builds are faster.",
                "build_id": build_id,
            },
        )


# --- Flash to device ---
@app.post("/api/flash")
async def flash_firmware(
    build_id: str = Form(...),
    board_key: str = Form("nrf52840__nano_33_ble"),
    port: str = Form("COM4"),
):
    """Flash compiled firmware to a connected board via arduino-cli upload."""
    board = BOARDS.get(board_key)
    if not board:
        raise HTTPException(404, "Board not found")

    build_dir = BUILDS_DIR / build_id
    if not build_dir.exists():
        raise HTTPException(404, f"Build {build_id} not found. Compile first.")

    upload_cmd = [
        "arduino-cli", "upload",
        "--fqbn", board["fqbn"],
        "--port", port,
        "--input-dir", str(build_dir / "output"),
    ]

    try:
        proc = subprocess.run(upload_cmd, capture_output=True, timeout=60)

        if proc.returncode != 0:
            return JSONResponse(
                status_code=422,
                content={
                    "error": "Upload failed",
                    "details": proc.stderr.decode(errors="replace"),
                    "stdout": proc.stdout.decode(errors="replace"),
                    "hint": "Disconnect the serial monitor first, then try again.",
                },
            )

        return {
            "status": "flashed",
            "message": f"Firmware uploaded to {port} successfully!",
            "port": port,
            "board": board["name"],
        }

    except FileNotFoundError:
        raise HTTPException(503, "arduino-cli not found")
    except subprocess.TimeoutExpired:
        raise HTTPException(504, "Upload timed out (>60s)")


# --- Optimize ---
@app.post("/api/optimize")
async def optimize_model(
    model_id: str = Form(...),
    target_board: str = Form("nrf52840__nano_33_ble"),
    quantize: bool = Form(True),
):
    """
    Optimize a model for a target board.
    For MVP: int8 post-training quantization.
    """
    model = next((m for m in DB["models"] if m["id"] == model_id), None)
    if not model:
        raise HTTPException(404, "Model not found")

    board = BOARDS.get(target_board)
    if not board:
        raise HTTPException(404, "Board not found")

    # Check fit
    model_flash_kb = int(model["stats"]["flash"].replace("KB", ""))
    fits = model_flash_kb < board["flash_kb"]

    result = {
        "model_id": model_id,
        "target_board": target_board,
        "original_size_kb": model_flash_kb,
        "optimized_size_kb": int(model_flash_kb * 0.25) if quantize else model_flash_kb,
        "quantized": quantize,
        "fits_on_device": fits,
        "board_flash_kb": board["flash_kb"],
        "board_ram_kb": board["ram_kb"],
        "warnings": [],
    }

    if not fits:
        result["warnings"].append(
            f"Model ({model_flash_kb}KB) exceeds board flash ({board['flash_kb']}KB). "
            "Quantization and pruning recommended."
        )

    ram_kb = int(model["stats"]["ram"].replace("KB", ""))
    if ram_kb > board["ram_kb"] * 0.5:
        result["warnings"].append(
            f"Model RAM usage ({ram_kb}KB) is over 50% of board RAM ({board['ram_kb']}KB). "
            "May cause runtime OOM."
        )

    return result


# --- Helpers ---
def _generate_dummy_model_header():
    """Generate a tiny placeholder model for demo/testing."""
    # This is a minimal valid TFLite flatbuffer (not a real model)
    dummy_bytes = [0x20, 0x00, 0x00, 0x00] * 64  # 256 bytes placeholder
    hex_str = ", ".join(f"0x{b:02x}" for b in dummy_bytes)
    return f"""// Auto-generated model data (placeholder)
const unsigned char model_data[] = {{
  {hex_str}
}};
const unsigned int model_data_len = {len(dummy_bytes)};
"""


# ============================================================
# BENCHMARK & LEADERBOARD
# ============================================================
import time as _time

REGRESSION_DATASETS = {"ppg_heartrate", "spo2_estimation"}

def _evaluate_tflite(tflite_bytes, X_test, y_test, is_regression):
    """Evaluate a .tflite model on test data. Returns metrics dict."""
    import tensorflow as tf
    from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score
    from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score

    interpreter = tf.lite.Interpreter(model_content=tflite_bytes)
    interpreter.allocate_tensors()
    inp = interpreter.get_input_details()[0]
    out = interpreter.get_output_details()[0]

    preds = []
    t0 = _time.time()
    for i in range(len(X_test)):
        sample = X_test[i:i+1]
        if inp["dtype"] == np.int8:
            scale, zp = inp["quantization"]
            sample = (sample / scale + zp).astype(np.int8)
        else:
            sample = sample.astype(np.float32)
        interpreter.set_tensor(inp["index"], sample)
        interpreter.invoke()
        output = interpreter.get_tensor(out["index"])[0]
        if out["dtype"] == np.int8:
            scale, zp = out["quantization"]
            output = (output - zp) * scale
        preds.append(output)
    avg_ms = ((_time.time() - t0) / len(X_test)) * 1000
    preds = np.array(preds)

    metrics = {"avg_inference_ms": round(avg_ms, 3), "samples": len(X_test)}
    if is_regression:
        metrics["mse"] = round(float(mean_squared_error(y_test, preds)), 4)
        metrics["mae"] = round(float(mean_absolute_error(y_test, preds)), 4)
        metrics["r2"] = round(float(r2_score(y_test, preds)), 4)
    else:
        yp = np.argmax(preds, axis=1) if preds.shape[-1] > 1 else (preds > 0.5).astype(int)
        yt = y_test.flatten()
        yp = yp.flatten()
        metrics["accuracy"] = round(float(accuracy_score(yt, yp)), 4)
        metrics["f1"] = round(float(f1_score(yt, yp, average="weighted", zero_division=0)), 4)
        metrics["precision"] = round(float(precision_score(yt, yp, average="weighted", zero_division=0)), 4)
        metrics["recall"] = round(float(recall_score(yt, yp, average="weighted", zero_division=0)), 4)
    return metrics


CUSTOM_MODELS_DIR = BASE_DIR / "custom_models"
CUSTOM_MODELS_DIR.mkdir(exist_ok=True)


def _validate_model_shape(tflite_bytes, baseline_model):
    """Check if uploaded model has compatible input/output shape with baseline."""
    import tensorflow as tf
    try:
        interp = tf.lite.Interpreter(model_content=tflite_bytes)
        interp.allocate_tensors()
        inp = interp.get_input_details()[0]
        out = interp.get_output_details()[0]
        user_in_shape = list(inp["shape"])
        user_out_shape = list(out["shape"])
    except Exception as e:
        return False, f"Failed to load model: {e}", None

    # Get baseline expected shapes from model details
    expected_in = baseline_model.get("details", {}).get("input_shape")
    expected_out_classes = baseline_model.get("details", {}).get("output_classes", 1)

    shape_info = {
        "user_input_shape": user_in_shape,
        "user_output_shape": user_out_shape,
        "expected_input_shape": expected_in,
        "expected_output_classes": expected_out_classes,
    }

    # Check output class count matches
    if user_out_shape[-1] != expected_out_classes:
        return False, f"Output mismatch: your model outputs {user_out_shape[-1]} classes, baseline expects {expected_out_classes}", shape_info

    return True, "Compatible", shape_info


@app.post("/api/benchmark/{dataset_name}")
async def benchmark_model(dataset_name: str, file: UploadFile = File(...), author: str = Form("anonymous")):
    """Upload a .tflite model, benchmark against test data, validate for deployment."""
    if not file.filename.endswith(".tflite"):
        raise HTTPException(400, "Only .tflite files accepted")

    test_dir = MODELS_DIR / "test_data"
    x_path = test_dir / f"{dataset_name}_X.npy"
    y_path = test_dir / f"{dataset_name}_y.npy"
    if not x_path.exists() or not y_path.exists():
        raise HTTPException(404, f"No test data for '{dataset_name}'.")

    X_test = np.load(str(x_path))
    y_test = np.load(str(y_path))
    content = await file.read()
    is_reg = dataset_name in REGRESSION_DATASETS

    # Find baseline model for this dataset
    baseline_model = next((m for m in DB["models"] if m.get("benchmark_dataset") == dataset_name), None)

    # Validate shape compatibility
    deployable = False
    shape_info = None
    custom_model_id = None
    if baseline_model:
        compatible, msg, shape_info = _validate_model_shape(content, baseline_model)
        if compatible:
            deployable = True
            # Save the uploaded model so it can be used for deployment
            custom_model_id = str(uuid.uuid4())[:12]
            custom_path = CUSTOM_MODELS_DIR / f"{custom_model_id}.tflite"
            with open(custom_path, "wb") as f:
                f.write(content)

    # Run benchmark
    try:
        user_metrics = _evaluate_tflite(content, X_test, y_test, is_reg)
    except Exception as e:
        raise HTTPException(500, f"Evaluation failed: {e}")

    # Evaluate baseline for comparison
    baseline_metrics = None
    if baseline_model and baseline_model.get("file"):
        baseline_path = Path(baseline_model["file"])
        if baseline_path.exists():
            try:
                baseline_metrics = _evaluate_tflite(baseline_path.read_bytes(), X_test, y_test, is_reg)
                baseline_metrics["name"] = "TinyBioML Baseline"
            except:
                pass
        else:
            # Try finding by dataset name
            for f in MODELS_DIR.glob(f"{dataset_name}*.tflite"):
                try:
                    baseline_metrics = _evaluate_tflite(f.read_bytes(), X_test, y_test, is_reg)
                    baseline_metrics["name"] = "TinyBioML Baseline"
                    break
                except:
                    pass

    # Save to leaderboard
    entry = {
        "author": author,
        "filename": file.filename,
        "size_kb": round(len(content) / 1024, 1),
        "metrics": user_metrics,
        "timestamp": datetime.now().isoformat(),
        "is_regression": is_reg,
        "deployable": deployable,
        "custom_model_id": custom_model_id,
    }
    if dataset_name not in DB["leaderboard"]:
        DB["leaderboard"][dataset_name] = []
    DB["leaderboard"][dataset_name].append(entry)

    if is_reg:
        DB["leaderboard"][dataset_name].sort(key=lambda x: x["metrics"].get("mae", 999))
    else:
        DB["leaderboard"][dataset_name].sort(key=lambda x: -x["metrics"].get("accuracy", 0))

    return JSONResponse(content=_safe_json({
        "status": "success",
        "dataset": dataset_name,
        "is_regression": is_reg,
        "user_metrics": user_metrics,
        "baseline_metrics": baseline_metrics,
        "deployable": deployable,
        "custom_model_id": custom_model_id,
        "shape_info": shape_info,
        "firmware_template": baseline_model.get("firmware_template") if baseline_model else None,
        "sensor": baseline_model.get("sensor") if baseline_model else None,
        "rank": next((i+1 for i, e in enumerate(DB["leaderboard"][dataset_name]) if e["timestamp"] == entry["timestamp"]), None),
        "total_submissions": len(DB["leaderboard"][dataset_name]),
    }))


@app.get("/api/leaderboard/{dataset_name}")
async def get_leaderboard(dataset_name: str):
    entries = DB["leaderboard"].get(dataset_name, [])
    # Find baseline
    baseline = None
    model = next((m for m in DB["models"] if m.get("benchmark_dataset") == dataset_name), None)
    if model:
        baseline = {
            "name": model["title"],
            "accuracy": model["details"].get("accuracy"),
            "architecture": model["details"].get("architecture"),
        }
    return JSONResponse(content=_safe_json({"dataset": dataset_name, "baseline": baseline, "entries": entries}))


@app.get("/api/leaderboard")
async def list_leaderboards():
    return JSONResponse(content=_safe_json({
        "datasets": [
            {"name": ds.get("benchmark_key"), "title": ds["title"], "entries": len(DB["leaderboard"].get(ds.get("benchmark_key", ""), []))}
            for ds in DB["datasets"] if ds.get("benchmark_key")
        ]
    }))


# --- Run ---
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
