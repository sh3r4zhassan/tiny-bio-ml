/**
 * Global app state using Zustand
 * Manages: API data, selected model, deploy flow state, device connection.
 */

import { create } from 'zustand';

const API_BASE = 'http://localhost:8000/api';

export const useStore = create((set, get) => ({
  // --- Models ---
  models: [],
  modelsLoading: false,
  
  fetchModels: async () => {
    set({ modelsLoading: true });
    try {
      const res = await fetch(`${API_BASE}/models`);
      const data = await res.json();
      set({ models: data.models, modelsLoading: false });
    } catch (err) {
      console.error('Failed to fetch models:', err);
      set({ modelsLoading: false });
    }
  },

  // --- Datasets ---
  datasets: [],
  datasetsLoading: false,
  
  fetchDatasets: async () => {
    set({ datasetsLoading: true });
    try {
      const res = await fetch(`${API_BASE}/datasets`);
      const data = await res.json();
      set({ datasets: data.datasets, datasetsLoading: false });
    } catch (err) {
      console.error('Failed to fetch datasets:', err);
      set({ datasetsLoading: false });
    }
  },

  // --- Boards ---
  boards: {
    // Fallback board data — used if backend is not running
    "arduino_nano_33_ble": {
      name: "Arduino Nano 33 BLE Sense",
      fqbn: "arduino:mbed_nano:nano33ble",
      mcu: "nRF52840 (Cortex-M4F)",
      flash_kb: 1024,
      ram_kb: 256,
      analog_pins: ["A0", "A1", "A2", "A3", "A4", "A5", "A6", "A7"],
      digital_pins: ["D2", "D3", "D4", "D5", "D6", "D7", "D8", "D9", "D10", "D11", "D12", "D13"],
      i2c_pins: { sda: "A4", scl: "A5" },
      spi_pins: { mosi: "D11", miso: "D12", sck: "D13", cs: "D10" },
      flash_protocol: "bossa",
    },
    "esp32": {
      name: "ESP32 DevKit",
      fqbn: "esp32:esp32:esp32",
      mcu: "Xtensa LX6",
      flash_kb: 4096,
      ram_kb: 520,
      analog_pins: ["GPIO32", "GPIO33", "GPIO34", "GPIO35", "GPIO36", "GPIO39"],
      digital_pins: ["GPIO2", "GPIO4", "GPIO5", "GPIO12", "GPIO13", "GPIO14", "GPIO15"],
      i2c_pins: { sda: "GPIO21", scl: "GPIO22" },
      spi_pins: { mosi: "GPIO23", miso: "GPIO19", sck: "GPIO18", cs: "GPIO5" },
      flash_protocol: "esptool",
    },
  },
  
  fetchBoards: async () => {
    try {
      const res = await fetch(`${API_BASE}/boards`);
      const data = await res.json();
      set({ boards: data.boards });
    } catch (err) {
      console.error('Failed to fetch boards:', err);
    }
  },

  // --- Selected Model (for deploy flow) ---
  selectedModel: null,
  setSelectedModel: (model) => set({ selectedModel: model }),

  // --- Deploy Flow ---
  deployState: {
    step: 'idle', // idle | select-board | configure-pins | compiling | flashing | done | error
    boardKey: null,
    pin: 'A0',
    pinMode: 'analog',
    sampleRateMs: 100,
    compiledBinary: null,
    error: null,
    sketch: null, // generated Arduino code (for preview)
  },

  setDeployStep: (step) =>
    set((s) => ({ deployState: { ...s.deployState, step } })),

  setDeployConfig: (config) =>
    set((s) => ({ deployState: { ...s.deployState, ...config } })),

  resetDeploy: () =>
    set({
      deployState: {
        step: 'idle',
        boardKey: null,
        pin: 'A0',
        pinMode: 'analog',
        sampleRateMs: 100,
        port: 'COM4',
        buildId: null,
        error: null,
        sketch: null,
      },
    }),

  // --- Compile ---
  compile: async () => {
    const { selectedModel, deployState } = get();
    if (!selectedModel) return;

    set((s) => ({
      deployState: { ...s.deployState, step: 'compiling', error: null },
    }));

    try {
      const formData = new FormData();
      formData.append('model_id', selectedModel.id);
      formData.append('board_key', deployState.boardKey || 'arduino_nano_33_ble');
      formData.append('pin', deployState.pin);
      formData.append('pin_mode', deployState.pinMode);
      formData.append('sample_rate_ms', deployState.sampleRateMs);

      const res = await fetch(`${API_BASE}/compile`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (res.ok && data.status === 'compiled') {
        set((s) => ({
          deployState: {
            ...s.deployState,
            step: 'compiled',
            buildId: data.build_id,
            error: null,
          },
        }));
      } else {
        const fullError = [
          data.error || 'Compilation failed',
          data.details ? `\n--- stderr ---\n${data.details}` : '',
          data.stdout ? `\n--- stdout ---\n${data.stdout}` : '',
        ].join('');
        set((s) => ({
          deployState: {
            ...s.deployState,
            step: 'error',
            error: fullError,
            sketch: data.sketch || null,
          },
        }));
      }
    } catch (err) {
      set((s) => ({
        deployState: {
          ...s.deployState,
          step: 'error',
          error: `Network error: ${err.message}`,
        },
      }));
    }
  },

  // --- Flash ---
  flash: async () => {
    const { deployState } = get();
    if (!deployState.buildId) return;

    set((s) => ({
      deployState: { ...s.deployState, step: 'flashing', error: null },
    }));

    try {
      const formData = new FormData();
      formData.append('build_id', deployState.buildId);
      formData.append('board_key', deployState.boardKey || 'arduino_nano_33_ble');
      formData.append('port', deployState.port || 'COM4');

      const res = await fetch(`${API_BASE}/flash`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (res.ok && data.status === 'flashed') {
        set((s) => ({
          deployState: { ...s.deployState, step: 'done' },
        }));
      } else {
        const fullError = [
          data.error || 'Flash failed',
          data.details ? `\n${data.details}` : '',
          data.hint ? `\nHint: ${data.hint}` : '',
        ].join('');
        set((s) => ({
          deployState: { ...s.deployState, step: 'error', error: fullError },
        }));
      }
    } catch (err) {
      set((s) => ({
        deployState: {
          ...s.deployState,
          step: 'error',
          error: `Network error: ${err.message}`,
        },
      }));
    }
  },

  // --- Upload Model ---
  uploadModel: async (file, metadata) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', metadata.title);
    formData.append('author', metadata.author || 'anonymous');
    formData.append('task', metadata.task || 'Classification');
    formData.append('hardware', metadata.hardware || 'Arduino Nano 33');
    formData.append('description', metadata.description || '');
    formData.append('tags', (metadata.tags || []).join(','));

    try {
      const res = await fetch(`${API_BASE}/models/upload`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        // Refresh models list
        get().fetchModels();
        return { success: true, model: data.model };
      }
      return { success: false, error: data.detail || 'Upload failed' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },

  // --- Optimize ---
  optimizeResult: null,
  
  optimizeModel: async (modelId, boardKey) => {
    try {
      const formData = new FormData();
      formData.append('model_id', modelId);
      formData.append('target_board', boardKey);
      formData.append('quantize', true);

      const res = await fetch(`${API_BASE}/optimize`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      set({ optimizeResult: data });
      return data;
    } catch (err) {
      console.error('Optimization check failed:', err);
      return null;
    }
  },
}));

export default useStore;
