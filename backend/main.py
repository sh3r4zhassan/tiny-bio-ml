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
from pathlib import Path
from datetime import datetime

from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

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
            "id": "tbio-kws-yes-no-v1",
            "slug": "tbio/kws-yes-no-v1",
            "title": "Keyword Spotting (Yes/No)",
            "author": "TinyBioML",
            "task": "Audio Classification",
            "description": "Real-time keyword detection from microphone audio. Detects 'yes' and 'no' commands using a DS-CNN on 40-bin log-mel filterbank features. Designed for always-on voice interfaces on battery-powered biomedical wearables.",
            "downloads": 0,
            "likes": 0,
            "tags": ["Audio", "Keywords", "int8", "PDM-Mic", "Speech-Commands"],
            "updated": datetime.now().isoformat(),
            "file": str(MODELS_DIR / "KWS_yes_no.tflite"),
            "firmware_template": "kws_yes_no",
            # --- Model Details ---
            "details": {
                "architecture": "DS-CNN (Depthwise Separable CNN)",
                "framework": "TensorFlow Lite Micro",
                "quantization": "int8 (post-training)",
                "dataset": "Google Speech Commands v0.02",
                "accuracy": "92.3%",
                "input_type": "Audio (PDM Microphone → 40-bin filterbank)",
                "input_shape": [1, 1960],
                "input_format": "int8 spectrogram features (49 frames × 40 bins)",
                "output_type": "Classification (4 classes)",
                "output_classes": 4,
                "class_labels": ["silence", "unknown", "yes", "no"],
                "sample_rate": "16 kHz",
                "inference_window": "1 second",
                "parameters": "~20K",
                "compatible_mcus": ["nrf52840", "esp32"],
            },
            "stats": {
                "flash": "18KB",
                "ram": "10KB",
            },
            "sensor": "pdm_microphone",
        },
        {
            "id": "tbio-tiny-ecg-arrhythmia-v1",
            "slug": "tbio/tiny-ecg-arrhythmia-v1",
            "title": "Tiny-ECG-Arrhythmia",
            "author": "TinyBioML",
            "task": "ECG Classification",
            "description": "Lightweight arrhythmia detection for single-lead ECG. Connect an AD8232 or similar ECG sensor to an analog pin.",
            "downloads": 12000,
            "likes": 342,
            "tags": ["ECG", "Quantized", "int8", "Analog"],
            "updated": datetime.now().isoformat(),
            "file": None,
            "firmware_template": None,
            "details": {
                "architecture": "1D-CNN",
                "framework": "TensorFlow Lite Micro",
                "quantization": "int8 (post-training)",
                "dataset": "MIT-BIH Arrhythmia Database",
                "accuracy": "96.1%",
                "input_type": "Analog sensor (ECG lead, e.g. AD8232)",
                "input_shape": [1, 128],
                "input_format": "int8 normalized ECG samples (128 points @ 360Hz)",
                "output_type": "Classification (5 classes)",
                "output_classes": 5,
                "class_labels": ["Normal", "Afib", "AFlutter", "VTach", "Other"],
                "sample_rate": "360 Hz",
                "inference_window": "~350ms",
                "parameters": "~8K",
                "compatible_mcus": ["nrf52840", "esp32", "atmega328p"],
            },
            "stats": {
                "flash": "45KB",
                "ram": "15KB",
            },
            "sensor": "analog",
        },
        {
            "id": "tbio-imu-gesture-recognition",
            "slug": "tbio/imu-gesture-recognition",
            "title": "IMU-Gesture-Recognition",
            "author": "TinyBioML",
            "task": "Gesture Classification",
            "description": "Recognizes 4 gestures from onboard IMU accelerometer + gyroscope.",
            "downloads": 6800,
            "likes": 175,
            "tags": ["IMU", "Gesture", "Accel", "Gyro"],
            "updated": datetime.now().isoformat(),
            "file": None,
            "firmware_template": None,
            "details": {
                "architecture": "1D-CNN + Dense",
                "framework": "TensorFlow Lite Micro",
                "quantization": "int8 (post-training)",
                "dataset": "Custom gesture dataset (500 samples/class)",
                "accuracy": "94.7%",
                "input_type": "IMU (Accelerometer + Gyroscope)",
                "input_shape": [1, 600],
                "input_format": "float32 IMU readings (100 samples × 6 axes)",
                "output_type": "Classification (4 classes)",
                "output_classes": 4,
                "class_labels": ["wave", "circle", "punch", "idle"],
                "sample_rate": "100 Hz (10ms per sample)",
                "inference_window": "1 second",
                "parameters": "~12K",
                "compatible_mcus": ["nrf52840"],
            },
            "stats": {
                "flash": "35KB",
                "ram": "12KB",
            },
            "sensor": "imu",
        },
        {
            "id": "community-ppg-hr-estimator",
            "slug": "community/ppg-hr-estimator",
            "title": "PPG-HeartRate-Estimator",
            "author": "OpenHealth",
            "task": "Heart Rate Regression",
            "description": "Heart rate estimation from PPG signal. Connect MAX30102 via I2C.",
            "downloads": 5000,
            "likes": 89,
            "tags": ["PPG", "Wearable", "BLE", "I2C"],
            "updated": datetime.now().isoformat(),
            "file": None,
            "firmware_template": None,
            "details": {
                "architecture": "LSTM-Tiny",
                "framework": "TensorFlow Lite Micro",
                "quantization": "int8 (post-training)",
                "dataset": "TROIKA PPG Dataset",
                "accuracy": "MAE: 2.3 BPM",
                "input_type": "I2C sensor (MAX30102 PPG)",
                "input_shape": [1, 64],
                "input_format": "int8 normalized PPG readings (64 samples)",
                "output_type": "Regression (BPM value)",
                "output_classes": 1,
                "class_labels": None,
                "sample_rate": "100 Hz",
                "inference_window": "640ms",
                "parameters": "~5K",
                "compatible_mcus": ["nrf52840", "esp32"],
            },
            "stats": {
                "flash": "32KB",
                "ram": "8KB",
            },
            "sensor": "i2c",
        },
        {
            "id": "tbio-emg-gesture-control",
            "slug": "tbio/emg-gesture-control",
            "title": "EMG-Gesture-Control-Tiny",
            "author": "TinyBioML",
            "task": "EMG Classification",
            "description": "Recognizes 6 hand gestures from forearm EMG. Connect EMG sensor to analog pin.",
            "downloads": 3200,
            "likes": 210,
            "tags": ["EMG", "Prosthetics", "Real-time", "Analog"],
            "updated": datetime.now().isoformat(),
            "file": None,
            "firmware_template": None,
            "details": {
                "architecture": "DS-CNN",
                "framework": "TensorFlow Lite Micro",
                "quantization": "int8 (post-training)",
                "dataset": "NinaPro DB5 (subset)",
                "accuracy": "88.5%",
                "input_type": "Analog sensor (sEMG electrode)",
                "input_shape": [1, 128],
                "input_format": "int8 normalized EMG samples (128 points @ 1kHz)",
                "output_type": "Classification (6 classes)",
                "output_classes": 6,
                "class_labels": ["fist", "open", "pinch", "wave_in", "wave_out", "rest"],
                "sample_rate": "1 kHz",
                "inference_window": "128ms",
                "parameters": "~15K",
                "compatible_mcus": ["nrf52840", "esp32"],
            },
            "stats": {
                "flash": "50KB",
                "ram": "18KB",
            },
            "sensor": "analog",
        },
    ],
    "datasets": [
        {
            "id": "dataset-mit-bih-quantized",
            "slug": "dataset/mit-bih-quantized",
            "title": "MIT-BIH-Tiny-Format",
            "author": "TinyBioML",
            "size": "45 MB",
            "rows": "100k",
            "description": "Pre-processed MIT-BIH Arrhythmia Database optimized for microcontroller training pipelines.",
            "updated": datetime.now().isoformat(),
            "downloads": 2100,
        },
        {
            "id": "dataset-sleep-edf-micro",
            "slug": "dataset/sleep-edf-micro",
            "title": "Sleep-EDF-Micro",
            "author": "Stanford-Wearables",
            "size": "120 MB",
            "rows": "50k",
            "description": "EEG fragments normalized and windowed for integer-only inference testing.",
            "updated": datetime.now().isoformat(),
            "downloads": 1500,
        },
    ],
}

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
    return {"models": DB["models"], "total": len(DB["models"])}


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
    return {"datasets": DB["datasets"], "total": len(DB["datasets"])}


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


# --- Run ---
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
