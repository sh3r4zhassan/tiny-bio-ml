# TinyBioML Platform — MVP

Plug-and-play TinyML deployment: browse models → connect device → configure pin → flash.

## Quick Start

### 1. Backend

```bash
cd backend
pip install -r requirements.txt
python main.py
```

Backend runs on http://localhost:8000. API docs at http://localhost:8000/docs.

### 2. Frontend

```bash
cd your-vite-project
npm install zustand
# Copy these files into your project:
#   src/App.jsx          → replace your existing App.jsx
#   src/hooks/useWebSerial.js  → new file
#   src/store/useStore.js      → new file
npm run dev
```

Frontend runs on http://localhost:5173.

### 3. Arduino CLI (for firmware compilation)

```bash
# Install arduino-cli
brew install arduino-cli   # Mac
# or: curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh | sh

# Install board cores
arduino-cli core update-index
arduino-cli core install arduino:mbed_nano    # For Nano 33 BLE
arduino-cli core install arduino:avr          # For classic Nano
arduino-cli core install esp32:esp32          # For ESP32

# Verify your board is detected
arduino-cli board list
```

### 4. Connect & Deploy

1. Open http://localhost:5173 in **Chrome or Edge** (WebSerial requirement)
2. Click "Connect Device" in the navbar
3. Select your Arduino from the browser dialog
4. Browse a model → click it → configure pin → Deploy

## Project Structure

```
backend/
  main.py              # FastAPI server
  templates/           # Jinja2 firmware templates
    firmware_tflite.ino.j2
  models_store/        # Uploaded model files
  datasets_store/      # Uploaded datasets
  builds/              # Compilation output (temp)

frontend/src/
  App.jsx              # Main app with all views
  hooks/
    useWebSerial.js    # Browser ↔ USB serial hook
  store/
    useStore.js        # Zustand global state + API calls
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/models | List all models |
| GET | /api/models/:id | Get model details |
| POST | /api/models/upload | Upload .tflite model |
| GET | /api/datasets | List all datasets |
| GET | /api/boards | List supported boards |
| POST | /api/compile | Compile firmware for a model+board+pin |
| POST | /api/optimize | Check model fit + quantization |

## Requirements

- Python 3.10+
- Node 18+
- Chrome or Edge (for WebSerial)
- arduino-cli (for compilation)
- Physical microcontroller (Arduino Nano 33 BLE recommended)
