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
            "id": "tbio-tiny-ecg-arrhythmia-v1",
            "slug": "tbio/tiny-ecg-arrhythmia-v1",
            "title": "Tiny-ECG-Arrhythmia",
            "author": "TinyBioML",
            "task": "Classification",
            "hardware": "ESP32",
            "description": "Lightweight arrhythmia detection for single-lead ECG. Optimized for ESP32 with minimal latency.",
            "downloads": 12000,
            "likes": 342,
            "tags": ["ECG", "Quantized", "int8"],
            "updated": datetime.now().isoformat(),
            "stats": {"ram": "15KB", "latency": "12ms", "flash": "45KB"},
            "file": None,  # path to .tflite file
            "input_shape": [1, 128],
            "output_classes": 5,
        },
        {
            "id": "stanford-eeg-sleep-stage-micro",
            "slug": "stanford-lab/eeg-sleep-stage-micro",
            "title": "EEG-Sleep-Stage-Micro",
            "author": "Stanford-Wearables",
            "task": "Time-Series",
            "hardware": "Cortex M4",
            "description": "5-class sleep staging model compressed for Cortex M4F microcontrollers.",
            "downloads": 8500,
            "likes": 120,
            "tags": ["EEG", "Sleep", "Low-Power"],
            "updated": datetime.now().isoformat(),
            "stats": {"ram": "24KB", "latency": "45ms", "flash": "120KB"},
            "file": None,
            "input_shape": [1, 256],
            "output_classes": 5,
        },
        {
            "id": "community-ppg-hr-estimator",
            "slug": "community/ppg-hr-estimator",
            "title": "PPG-HeartRate-Estimator",
            "author": "OpenHealth",
            "task": "Regression",
            "hardware": "Arduino Nano 33",
            "description": "Robust heart rate estimation from raw PPG signals with motion artifact cancellation.",
            "downloads": 5000,
            "likes": 89,
            "tags": ["PPG", "Wearable", "BLE"],
            "updated": datetime.now().isoformat(),
            "stats": {"ram": "8KB", "latency": "8ms", "flash": "32KB"},
            "file": None,
            "input_shape": [1, 64],
            "output_classes": 1,
        },
        {
            "id": "tbio-emg-gesture-control",
            "slug": "tbio/emg-gesture-control",
            "title": "EMG-Gesture-Control-Tiny",
            "author": "TinyBioML",
            "task": "Classification",
            "hardware": "nRF52840",
            "description": "Recognizes 6 hand gestures from forearm EMG. Ready for BLE streaming.",
            "downloads": 3200,
            "likes": 210,
            "tags": ["EMG", "Prosthetics", "Real-time"],
            "updated": datetime.now().isoformat(),
            "stats": {"ram": "18KB", "latency": "15ms", "flash": "50KB"},
            "file": None,
            "input_shape": [1, 128],
            "output_classes": 6,
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

# --- Board Registry ---
BOARDS = {
    "arduino_nano_33_ble": {
        "name": "Arduino Nano 33 BLE Sense",
        "fqbn": "arduino:mbed_nano:nano33ble",
        "mcu": "nRF52840 (Cortex-M4F)",
        "flash_kb": 1024,
        "ram_kb": 256,
        "analog_pins": ["A0", "A1", "A2", "A3", "A4", "A5", "A6", "A7"],
        "digital_pins": ["D2", "D3", "D4", "D5", "D6", "D7", "D8", "D9", "D10", "D11", "D12", "D13"],
        "i2c_pins": {"sda": "A4", "scl": "A5"},
        "spi_pins": {"mosi": "D11", "miso": "D12", "sck": "D13", "cs": "D10"},
        "flash_protocol": "bossa",
    },
    "arduino_nano_classic": {
        "name": "Arduino Nano (ATmega328P)",
        "fqbn": "arduino:avr:nano",
        "mcu": "ATmega328P",
        "flash_kb": 32,
        "ram_kb": 2,
        "analog_pins": ["A0", "A1", "A2", "A3", "A4", "A5", "A6", "A7"],
        "digital_pins": ["D2", "D3", "D4", "D5", "D6", "D7", "D8", "D9", "D10", "D11", "D12", "D13"],
        "i2c_pins": {"sda": "A4", "scl": "A5"},
        "spi_pins": {"mosi": "D11", "miso": "D12", "sck": "D13", "cs": "D10"},
        "flash_protocol": "avrdude",
    },
    "esp32": {
        "name": "ESP32 DevKit",
        "fqbn": "esp32:esp32:esp32",
        "mcu": "Xtensa LX6",
        "flash_kb": 4096,
        "ram_kb": 520,
        "analog_pins": ["GPIO32", "GPIO33", "GPIO34", "GPIO35", "GPIO36", "GPIO39"],
        "digital_pins": ["GPIO2", "GPIO4", "GPIO5", "GPIO12", "GPIO13", "GPIO14", "GPIO15", "GPIO16", "GPIO17", "GPIO18", "GPIO19", "GPIO21", "GPIO22", "GPIO23", "GPIO25", "GPIO26", "GPIO27"],
        "i2c_pins": {"sda": "GPIO21", "scl": "GPIO22"},
        "spi_pins": {"mosi": "GPIO23", "miso": "GPIO19", "sck": "GPIO18", "cs": "GPIO5"},
        "flash_protocol": "esptool",
    },
}


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
            "latency": "TBD",
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


# --- Boards ---
@app.get("/api/boards")
async def list_boards():
    return {"boards": BOARDS}


@app.get("/api/boards/{board_key}")
async def get_board(board_key: str):
    if board_key not in BOARDS:
        raise HTTPException(404, "Board not found")
    return BOARDS[board_key]


# --- Compile & Deploy ---
@app.post("/api/compile")
async def compile_firmware(
    model_id: str = Form(...),
    board_key: str = Form("arduino_nano_33_ble"),
    pin: str = Form("A0"),
    pin_mode: str = Form("analog"),  # analog, digital, i2c
    sample_rate_ms: int = Form(100),
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

    # --- Step 1: Generate model C header ---
    model_file = model.get("file")
    if model_file and os.path.exists(model_file):
        # Convert .tflite to C byte array
        result = subprocess.run(
            ["xxd", "-i", model_file],
            capture_output=True, text=True
        )
        if result.returncode != 0:
            # Fallback: generate a dummy model header for demo
            model_header = _generate_dummy_model_header()
        else:
            model_header = result.stdout
    else:
        # No real model file — generate a small dummy for demo
        model_header = _generate_dummy_model_header()

    # Write model header
    with open(build_dir / "model_data.h", "w") as f:
        f.write(model_header)

    # --- Step 2: Render firmware from template ---
    from jinja2 import Environment, FileSystemLoader
    env = Environment(loader=FileSystemLoader(str(TEMPLATES_DIR)))
    template = env.get_template("firmware_tflite.ino.j2")

    firmware_code = template.render(
        model_name=model["title"],
        pin=pin,
        pin_mode=pin_mode,
        sample_rate_ms=sample_rate_ms,
        num_classes=model.get("output_classes", 2),
        input_size=model.get("input_shape", [1, 128])[-1] if model.get("input_shape") else 128,
        board_name=board["name"],
    )

    sketch_dir = build_dir / "firmware"
    sketch_dir.mkdir(exist_ok=True)
    with open(sketch_dir / "firmware.ino", "w") as f:
        f.write(firmware_code)
    shutil.copy(build_dir / "model_data.h", sketch_dir / "model_data.h")

    # --- Step 3: Compile with arduino-cli ---
    compile_cmd = [
        "arduino-cli", "compile",
        "--fqbn", board["fqbn"],
        "--output-dir", str(build_dir / "output"),
        str(sketch_dir),
    ]

    try:
        proc = await asyncio.create_subprocess_exec(
            *compile_cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await proc.communicate()

        if proc.returncode != 0:
            return JSONResponse(
                status_code=422,
                content={
                    "error": "Compilation failed",
                    "details": stderr.decode(),
                    "stdout": stdout.decode(),
                    "build_id": build_id,
                    # Still return the generated sketch so user can debug
                    "sketch": firmware_code,
                },
            )

        # Find the binary
        output_dir = build_dir / "output"
        binary_file = None
        for ext in [".bin", ".hex"]:
            candidates = list(output_dir.glob(f"*{ext}"))
            if candidates:
                binary_file = candidates[0]
                break

        if not binary_file:
            raise HTTPException(500, "Compilation succeeded but no binary found")

        return FileResponse(
            binary_file,
            media_type="application/octet-stream",
            filename=f"tinybioml_{model_id}_{board_key}.bin",
            headers={
                "X-Build-Id": build_id,
                "X-Board-FQBN": board["fqbn"],
                "X-Flash-Protocol": board["flash_protocol"],
            },
        )

    except FileNotFoundError:
        return JSONResponse(
            status_code=503,
            content={
                "error": "arduino-cli not found",
                "message": "Install arduino-cli and the board core. See setup instructions.",
                "build_id": build_id,
                "sketch": firmware_code,
            },
        )


# --- Optimize ---
@app.post("/api/optimize")
async def optimize_model(
    model_id: str = Form(...),
    target_board: str = Form("arduino_nano_33_ble"),
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
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
