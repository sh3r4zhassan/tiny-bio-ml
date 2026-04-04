import { create } from 'zustand';
const API_BASE = 'http://localhost:8000/api';

export const useStore = create((set, get) => ({
  models: [], modelsLoading: false,
  fetchModels: async () => {
    set({ modelsLoading: true });
    try { const r = await fetch(`${API_BASE}/models`); const d = await r.json(); set({ models: d.models, modelsLoading: false }); }
    catch { set({ modelsLoading: false }); }
  },
  datasets: [],
  fetchDatasets: async () => {
    try { const r = await fetch(`${API_BASE}/datasets`); const d = await r.json(); set({ datasets: d.datasets }); } catch {}
  },
  mcus: {},
  fetchMcus: async () => {
    try { const r = await fetch(`${API_BASE}/mcus`); const d = await r.json(); set({ mcus: d.mcus }); } catch {}
  },
  boards: {},
  fetchBoards: async () => {
    try { const r = await fetch(`${API_BASE}/boards`); const d = await r.json(); set({ boards: d.boards }); } catch {}
  },
  selectedModel: null,
  setSelectedModel: (m) => set({ selectedModel: m }),

  deployState: {
    step: 'idle', mcuKey: null, boardKey: null, inputSource: null,
    useDefault: true, sensorProtocol: null,
    pin: 'A0', sampleRateMs: 100, analogSampleHz: 16000,
    imuFeatures: 3, i2cAddress: '0x68', i2cSda: '', i2cScl: '', i2cRegister: '0x00',
    pdmClkPin: '', pdmDataPin: '', spiCsPin: 'D10',
    customModelId: null,
    port: 'COM4', buildId: null, error: null, sketch: null,
  },
  setDeployConfig: (c) => set((s) => ({ deployState: { ...s.deployState, ...c } })),
  resetDeploy: () => set({ deployState: {
    step: 'idle', mcuKey: null, boardKey: null, inputSource: null,
    useDefault: true, sensorProtocol: null,
    pin: 'A0', sampleRateMs: 100, analogSampleHz: 16000,
    imuFeatures: 3, i2cAddress: '0x68', i2cSda: '', i2cScl: '', i2cRegister: '0x00',
    pdmClkPin: '', pdmDataPin: '', spiCsPin: 'D10',
    customModelId: null,
    port: 'COM4', buildId: null, error: null, sketch: null,
  }}),

  compile: async () => {
    const { selectedModel, deployState } = get();
    if (!selectedModel) return;
    set((s) => ({ deployState: { ...s.deployState, step: 'compiling', error: null } }));
    try {
      const fd = new FormData();
      fd.append('model_id', selectedModel.id);
      fd.append('board_key', deployState.boardKey || 'nrf52840__nano_33_ble');
      fd.append('custom_model_id', deployState.customModelId || '');
      fd.append('input_source', deployState.inputSource || selectedModel.sensor || 'pdm_microphone');
      fd.append('use_default', deployState.useDefault !== false ? 'true' : 'false');
      fd.append('sensor_protocol', deployState.sensorProtocol ?? 0);
      fd.append('pin', deployState.pin || 'A0');
      fd.append('sample_rate_ms', deployState.sampleRateMs || 100);
      fd.append('analog_sample_hz', deployState.analogSampleHz || 16000);
      fd.append('imu_features', deployState.imuFeatures || 3);
      fd.append('i2c_address', deployState.i2cAddress || '0x68');
      fd.append('i2c_sda', deployState.i2cSda || '');
      fd.append('i2c_scl', deployState.i2cScl || '');
      fd.append('i2c_register', deployState.i2cRegister || '0x00');
      fd.append('pdm_clk_pin', deployState.pdmClkPin || '');
      fd.append('pdm_data_pin', deployState.pdmDataPin || '');
      fd.append('spi_cs_pin', deployState.spiCsPin || 'D10');
      const res = await fetch(`${API_BASE}/compile`, { method: 'POST', body: fd });
      const data = await res.json();
      if (res.ok && data.status === 'compiled') {
        set((s) => ({ deployState: { ...s.deployState, step: 'compiled', buildId: data.build_id } }));
      } else {
        const err = [data.error, data.details ? `\n${data.details}` : ''].join('');
        set((s) => ({ deployState: { ...s.deployState, step: 'error', error: err, sketch: data.sketch } }));
      }
    } catch (e) { set((s) => ({ deployState: { ...s.deployState, step: 'error', error: e.message } })); }
  },

  flash: async () => {
    const { deployState } = get();
    if (!deployState.buildId) return;
    set((s) => ({ deployState: { ...s.deployState, step: 'flashing', error: null } }));
    try {
      const fd = new FormData();
      fd.append('build_id', deployState.buildId);
      fd.append('board_key', deployState.boardKey || 'nrf52840__nano_33_ble');
      fd.append('port', deployState.port || 'COM4');
      const res = await fetch(`${API_BASE}/flash`, { method: 'POST', body: fd });
      const data = await res.json();
      if (res.ok && data.status === 'flashed') {
        set((s) => ({ deployState: { ...s.deployState, step: 'done' } }));
      } else {
        const err = [data.error, data.details ? `\n${data.details}` : '', data.hint ? `\nHint: ${data.hint}` : ''].join('');
        set((s) => ({ deployState: { ...s.deployState, step: 'error', error: err } }));
      }
    } catch (e) { set((s) => ({ deployState: { ...s.deployState, step: 'error', error: e.message } })); }
  },

  uploadModel: async (file, meta) => {
    const fd = new FormData(); fd.append('file', file);
    Object.entries(meta).forEach(([k, v]) => fd.append(k, Array.isArray(v) ? v.join(',') : v));
    try {
      const r = await fetch(`${API_BASE}/models/upload`, { method: 'POST', body: fd });
      const d = await r.json();
      if (r.ok) { get().fetchModels(); return { success: true }; }
      return { success: false, error: d.detail };
    } catch (e) { return { success: false, error: e.message }; }
  },

  // Live stats from serial
  liveStats: { lastLatencyMs: 0, avgLatencyMs: 0, count: 0, lastLabel: null, lastConf: 0 },
  updateLiveStats: (entry) => {
    if (!entry.parsed) return;
    set((s) => {
      const p = entry.parsed;
      const lat = p.infer_us ? p.infer_us / 1000 : s.liveStats.lastLatencyMs;
      const c = s.liveStats.count + 1;
      const avg = c === 1 ? lat : s.liveStats.avgLatencyMs * 0.85 + lat * 0.15;
      return { liveStats: {
        lastLatencyMs: lat, avgLatencyMs: avg, count: c,
        lastLabel: p.label || s.liveStats.lastLabel,
        lastConf: p.confidence || p.raw_score ? (p.confidence || p.raw_score / 255) : s.liveStats.lastConf,
      }};
    });
  },
  resetLiveStats: () => set({ liveStats: { lastLatencyMs: 0, avgLatencyMs: 0, count: 0, lastLabel: null, lastConf: 0 } }),
}));

export default useStore;
