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
  boards: {},
  
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
        compiledBinary: null,
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

      if (res.ok) {
        const blob = await res.blob();
        set((s) => ({
          deployState: {
            ...s.deployState,
            step: 'flashing',
            compiledBinary: blob,
          },
        }));
      } else {
        const errData = await res.json();
        set((s) => ({
          deployState: {
            ...s.deployState,
            step: 'error',
            error: errData.error || 'Compilation failed',
            sketch: errData.sketch || null,
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
