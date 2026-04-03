import React, { useState, useEffect, useRef } from 'react';
import {
  Search, Database, Box, Users, BookOpen, Cpu, Activity,
  Download, Heart, X, Zap, Github, Upload, Usb,
  Terminal, Radio, AlertTriangle, Check, Loader2, ArrowLeft,
} from 'lucide-react';
import { useStore } from './store/useStore';
import { useWebSerial } from './hooks/useWebSerial';
import PinConfigurator from './components/PinConfigurator';

// ==================================================================
// LIVE CONFIDENCE PLOT (SVG-based, renders from serial data)
// ==================================================================
const LivePlot = ({ serial }) => {
  const W = 600, H = 120, MAX_POINTS = 60;
  const dataRef = useRef([]);

  // Extract confidence values from serial output
  const points = serial.serialOutput
    .filter(e => e.parsed && (e.parsed.confidence !== undefined || e.parsed.raw_score !== undefined))
    .slice(-MAX_POINTS)
    .map((e, i) => {
      const conf = e.parsed.confidence || (e.parsed.raw_score / 255);
      const label = e.parsed.label || '';
      return { x: (i / (MAX_POINTS - 1)) * W, y: H - conf * H, conf, label };
    });

  if (points.length < 2) return null;

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');

  const colorMap = { yes: '#4ade80', no: '#f87171', silence: '#6b7280', unknown: '#facc15' };

  return (
    <div className="mt-2">
      <div className="text-[10px] text-gray-500 mb-1">Confidence over time</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-24 bg-gray-800/50 rounded-lg" preserveAspectRatio="none">
        {/* Grid lines */}
        {[0.25, 0.5, 0.75].map(v => (
          <line key={v} x1={0} y1={H - v * H} x2={W} y2={H - v * H} stroke="#374151" strokeWidth="0.5" strokeDasharray="4 4" />
        ))}
        {/* Confidence line */}
        <path d={pathD} fill="none" stroke="#facc15" strokeWidth="2" strokeLinejoin="round" />
        {/* Dots colored by label */}
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={3} fill={colorMap[p.label] || '#facc15'} opacity={0.8} />
        ))}
        {/* Y-axis labels */}
        <text x={4} y={12} fill="#6b7280" fontSize="9">100%</text>
        <text x={4} y={H - 2} fill="#6b7280" fontSize="9">0%</text>
      </svg>
      <div className="flex gap-3 mt-1">
        {Object.entries(colorMap).map(([label, color]) => (
          <span key={label} className="flex items-center gap-1 text-[10px] text-gray-500">
            <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: color }} /> {label}
          </span>
        ))}
      </div>
    </div>
  );
};

// ==================================================================
// PORT SELECTOR (auto-detects connected devices)
// ==================================================================
const PortSelector = ({ value, onChange }) => {
  const [ports, setPorts] = useState([]);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await fetch('http://localhost:8000/api/ports');
      const data = await res.json();
      setPorts(data.ports || []);
      if (data.ports?.length > 0 && !value) {
        onChange(data.ports[0].address);
      }
    } catch { setPorts([]); }
    setLoading(false);
  };

  useEffect(() => { refresh(); }, []);

  return (
    <div>
      <div className="flex items-center justify-between">
        <label className="text-xs text-gray-500">Device Port</label>
        <button onClick={refresh} disabled={loading}
          className="text-[10px] text-yellow-600 hover:text-yellow-700 font-medium">
          {loading ? 'Scanning...' : '↻ Refresh'}
        </button>
      </div>
      {ports.length > 0 ? (
        <select value={value || ''} onChange={(e) => onChange(e.target.value)}
          className="mt-0.5 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-yellow-500 focus:border-yellow-500">
          {ports.map((p) => (
            <option key={p.address} value={p.address}>
              {p.address} — {p.board_name}
            </option>
          ))}
        </select>
      ) : (
        <div className="mt-0.5">
          <input type="text" value={value || 'COM4'} onChange={(e) => onChange(e.target.value)}
            className="block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="COM4" />
          <p className="text-[10px] text-gray-400 mt-0.5">No devices found. Plug in your board and click Refresh.</p>
        </div>
      )}
    </div>
  );
};

// ==================================================================
// NAVBAR
// ==================================================================
const Navbar = ({ activeTab, setActiveTab, isConnected, onConnectClick }) => (
  <nav className="border-b border-gray-200 bg-white sticky top-0 z-50">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="flex justify-between h-16 items-center">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => setActiveTab('models')}>
          <div className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <span className="text-3xl">🧬</span> TinyBioML
          </div>
        </div>
        <div className="hidden md:flex flex-1 max-w-lg mx-4">
          <div className="relative w-full">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-gray-400" />
            </div>
            <input type="text" className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-full bg-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-yellow-500 focus:border-yellow-500 sm:text-sm" placeholder="Search models, datasets..." />
          </div>
        </div>
        <div className="flex items-center space-x-4 text-sm font-medium text-gray-600">
          {['models', 'datasets', 'deploy', 'docs'].map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`capitalize ${activeTab === tab ? 'text-gray-900 border-b-2 border-yellow-400' : 'hover:text-gray-900'}`}>
              {tab}
            </button>
          ))}
        </div>
        <div className="hidden md:flex items-center space-x-3 ml-4">
          <button onClick={onConnectClick}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border ${isConnected ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'}`}>
            <Usb className="w-3.5 h-3.5" />
            {isConnected ? 'Connected' : 'Connect Device'}
          </button>
        </div>
      </div>
    </div>
  </nav>
);

// ==================================================================
// MODEL CARD
// ==================================================================
const ModelCard = ({ model, onSelect }) => (
  <div onClick={() => onSelect(model)}
    className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md hover:border-yellow-200 transition-all cursor-pointer flex flex-col justify-between h-full group">
    <div>
      <div className="flex justify-between items-start mb-2">
        <h3 className="text-md font-bold text-gray-900 font-mono tracking-tight group-hover:text-yellow-700 transition-colors">{model.slug || model.id}</h3>
        <span className="text-xs font-medium bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded border border-yellow-200">{model.task}</span>
      </div>
      <p className="text-sm text-gray-600 mb-4 line-clamp-2">{model.description}</p>
      <div className="grid grid-cols-3 gap-2 mb-3">
        {[{ l: 'Flash', v: model.stats?.flash }, { l: 'RAM', v: model.stats?.ram }, { l: 'Accuracy', v: model.details?.accuracy || '—' }].map((s) => (
          <div key={s.l} className="bg-gray-50 p-2 rounded text-center border border-gray-100">
            <div className="text-[10px] text-gray-500 uppercase">{s.l}</div>
            <div className="text-xs font-bold text-gray-800">{s.v}</div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-1 mb-3">
        {(model.tags || []).map((tag) => (
          <span key={tag} className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">#{tag}</span>
        ))}
      </div>
    </div>
    <div className="flex items-center justify-between text-xs text-gray-500 border-t border-gray-100 pt-3">
      <span className="flex items-center gap-1"><Download className="w-3 h-3" /> {typeof model.downloads === 'number' ? `${(model.downloads / 1000).toFixed(1)}k` : model.downloads || 0}</span>
      <span className="flex items-center gap-1"><Heart className="w-3 h-3" /> {model.likes || 0}</span>
    </div>
  </div>
);

// ==================================================================
// MODEL DETAILS PANEL (left side of deploy page)
// ==================================================================
const ModelDetailsPanel = ({ model, liveStats, serial }) => {
  const d = model.details || {};
  return (
    <div className="space-y-4">
      {/* About */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="font-semibold text-gray-900 mb-2">About</h2>
        <p className="text-sm text-gray-600 mb-4">{model.description}</p>
        <div className="grid grid-cols-3 gap-3">
          {[{ l: 'Flash', v: model.stats?.flash, icon: '📦' }, { l: 'RAM', v: model.stats?.ram, icon: '💾' }, { l: 'Accuracy', v: model.details?.accuracy, icon: '🎯' }].map((s) => (
            <div key={s.l} className="bg-gray-50 p-3 rounded-lg border border-gray-100 text-center">
              <div className="text-lg mb-1">{s.icon}</div>
              <div className="text-xs text-gray-500 uppercase">{s.l}</div>
              <div className="text-lg font-bold text-gray-900">{s.v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Model Specs */}
      {d.architecture && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="font-semibold text-gray-900 mb-3">Model Specifications</h2>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            {[
              ['Architecture', d.architecture],
              ['Framework', d.framework],
              ['Quantization', d.quantization],
              ['Parameters', d.parameters],
              ['Dataset', d.dataset],
              ['Accuracy', d.accuracy],
              ['Input Type', d.input_type],
              ['Input Shape', JSON.stringify(d.input_shape)],
              ['Input Format', d.input_format],
              ['Output Type', d.output_type],
              ['Sample Rate', d.sample_rate],
              ['Window', d.inference_window],
            ].filter(([, v]) => v).map(([label, value]) => (
              <div key={label} className="flex justify-between py-1 border-b border-gray-50">
                <span className="text-gray-500">{label}</span>
                <span className="text-gray-900 font-medium text-right max-w-[60%] truncate">{value}</span>
              </div>
            ))}
          </div>
          {d.class_labels && (
            <div className="mt-3">
              <span className="text-xs text-gray-500">Classes: </span>
              <div className="flex flex-wrap gap-1 mt-1">
                {d.class_labels.map((l) => (
                  <span key={l} className="text-xs bg-yellow-50 text-yellow-800 px-2 py-0.5 rounded border border-yellow-200">{l}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Live Stats + Plot */}
      {liveStats.count > 0 && (
        <div className="bg-gray-900 rounded-xl p-5 text-white">
          <h2 className="font-semibold mb-3 flex items-center gap-2">
            <Activity className="w-4 h-4 text-yellow-400" /> Live Inference
          </h2>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-400">{liveStats.avgLatencyMs.toFixed(1)}</div>
              <div className="text-xs text-gray-400">ms latency</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-400">{liveStats.count}</div>
              <div className="text-xs text-gray-400">inferences</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-cyan-400">
                {liveStats.lastLabel ? liveStats.lastLabel.toUpperCase() : '—'}
              </div>
              <div className="text-xs text-gray-400">
                {liveStats.lastConf > 0 ? `${(liveStats.lastConf * 100).toFixed(0)}%` : 'waiting'}
              </div>
            </div>
          </div>
          <LivePlot serial={serial} />
        </div>
      )}
    </div>
  );
};

// ==================================================================
// DEPLOY PANEL (right side — MCU → Board → Pins → Compile → Connect → Flash)
// ==================================================================
const DeployPanel = ({ model, deployState, mcus, boards, serial }) => {
  const { setDeployConfig, compile, flash } = useStore();
  const selectedBoard = deployState.boardKey ? boards[deployState.boardKey] : null;

  const handleFlash = async () => {
    if (serial.isConnected) await serial.disconnect();
    await flash();
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="bg-gray-900 text-white p-4">
        <h3 className="font-semibold flex items-center gap-2">
          <Zap className="w-4 h-4 text-yellow-400" /> Deploy to Device
        </h3>
        <p className="text-xs text-gray-400 mt-1">Configure hardware, compile, then flash</p>
      </div>

      <div className="p-4 space-y-4">
        {/* Steps 1-3: MCU → Board → Input (PinConfigurator) */}
        <PinConfigurator
          config={{
            mcuKey: deployState.mcuKey,
            boardKey: deployState.boardKey,
            inputSource: deployState.inputSource || model.sensor,
            pin: deployState.pin,
            sampleRateMs: deployState.sampleRateMs,
            imuFeatures: deployState.imuFeatures,
            i2cAddress: deployState.i2cAddress,
          }}
          onChange={(cfg) => setDeployConfig(cfg)}
          mcus={mcus}
          boards={boards}
          model={model}
        />

        {/* Memory check */}
        {selectedBoard && (
          <div className={`p-2 rounded-lg border text-xs ${
            parseInt(model.stats?.flash) < selectedBoard.flash_kb ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'
          }`}>
            <Check className="w-3 h-3 inline mr-1" />
            Model {model.stats?.flash} → MCU {selectedBoard.flash_kb}KB flash, {selectedBoard.ram_kb}KB RAM
          </div>
        )}

        {/* Step 4: Compile */}
        <div className="border-t border-gray-200 pt-3">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">4. Compile</label>
          <button onClick={compile}
            disabled={!deployState.boardKey || !deployState.inputSource || deployState.step === 'compiling' || deployState.step === 'compiled' || deployState.step === 'done'}
            className={`mt-1 w-full py-2.5 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 transition-all ${
              deployState.step === 'compiled' || deployState.step === 'flashing' || deployState.step === 'done'
                ? 'bg-green-100 text-green-700 border border-green-200'
                : deployState.boardKey && deployState.inputSource
                ? 'bg-yellow-400 text-gray-900 hover:bg-yellow-500'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}>
            {deployState.step === 'compiling' ? <><Loader2 className="w-4 h-4 animate-spin" /> Compiling...</>
              : deployState.step === 'compiled' || deployState.step === 'flashing' || deployState.step === 'done' ? <><Check className="w-4 h-4" /> Compiled</>
              : <><Zap className="w-4 h-4" /> Compile Firmware</>}
          </button>
        </div>

        {/* Steps 5-6: Connect & Flash (shown after compile) */}
        {(deployState.step === 'compiled' || deployState.step === 'flashing' || deployState.step === 'done') && (
          <div className="border-t border-gray-200 pt-3 space-y-3">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">5. Connect & Flash</label>
            <PortSelector value={deployState.port} onChange={(p) => setDeployConfig({ port: p })} />
            <button onClick={handleFlash}
              disabled={deployState.step === 'flashing' || deployState.step === 'done'}
              className={`w-full py-2.5 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 ${
                deployState.step === 'done' ? 'bg-green-500 text-white'
                  : deployState.step === 'flashing' ? 'bg-gray-100 text-gray-400'
                  : 'bg-gray-900 text-white hover:bg-gray-800'
              }`}>
              {deployState.step === 'flashing' ? <><Loader2 className="w-4 h-4 animate-spin" /> Flashing...</>
                : deployState.step === 'done' ? <><Check className="w-4 h-4" /> Deployed! Connect serial to see output.</>
                : <><Upload className="w-4 h-4" /> Flash to Device</>}
            </button>
          </div>
        )}

        {/* Error */}
        {deployState.step === 'error' && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 whitespace-pre-wrap">
            <div className="font-semibold mb-1">Error</div>
            {deployState.error}
            {deployState.sketch && (
              <details className="mt-2">
                <summary className="cursor-pointer text-red-600 font-medium">View sketch</summary>
                <pre className="mt-1 text-[10px] bg-white p-2 rounded border overflow-auto max-h-40">{deployState.sketch}</pre>
              </details>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ==================================================================
// SERIAL MONITOR
// ==================================================================
const SerialMonitor = ({ serial }) => {
  const bottomRef = useRef(null);
  const [autoScroll, setAutoScroll] = useState(true);
  useEffect(() => { if (autoScroll && bottomRef.current) bottomRef.current.scrollIntoView({ behavior: 'smooth' }); }, [serial.serialOutput, autoScroll]);

  if (!serial.isConnected && serial.serialOutput.length === 0) {
    return (
      <div className="bg-gray-900 rounded-xl p-6 text-center">
        <Terminal className="w-8 h-8 text-gray-600 mx-auto mb-2" />
        <p className="text-gray-500 text-sm">Serial monitor — connect a device to see live output</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <Terminal className="w-3.5 h-3.5" /> Serial Monitor
          {serial.isConnected && <span className="flex items-center gap-1 text-green-400"><div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" /> Live</span>}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setAutoScroll(!autoScroll)} className={`text-xs px-2 py-0.5 rounded ${autoScroll ? 'bg-yellow-500/20 text-yellow-400' : 'text-gray-500'}`}>Auto-scroll</button>
          <button onClick={serial.clearOutput} className="text-xs text-gray-500 hover:text-gray-300 px-2 py-0.5">Clear</button>
        </div>
      </div>
      <div className="p-3 font-mono text-xs max-h-80 overflow-y-auto">
        {serial.serialOutput.map((entry, i) => (
          <div key={i} className="py-0.5">
            {entry.parsed ? (
              <div className="text-green-400">
                <span className="text-gray-600">[{new Date(entry.timestamp).toLocaleTimeString()}]</span>{' '}
                {entry.parsed.label && (
                  <><span className={`font-bold px-1.5 py-0.5 rounded text-xs ${entry.parsed.label === 'silence' || entry.parsed.label === 'unknown' ? 'bg-gray-700 text-gray-400' : 'bg-yellow-500/20 text-yellow-300'}`}>{entry.parsed.label.toUpperCase()}</span>{' '}
                  <span className="text-cyan-400">{(entry.parsed.confidence * 100).toFixed(1)}%</span>{' '}</>
                )}
                {entry.parsed.value !== undefined && <>value: <span className="text-yellow-400 font-bold">{entry.parsed.value}</span>{' '}</>}
                {entry.parsed.infer_us && <span className="text-gray-500">{(entry.parsed.infer_us / 1000).toFixed(1)}ms</span>}
                {entry.parsed.status && <span className="text-blue-400">[{entry.parsed.status}] {entry.parsed.msg}</span>}
              </div>
            ) : (
              <div className="text-gray-400"><span className="text-gray-600">[{new Date(entry.timestamp).toLocaleTimeString()}]</span> {entry.raw}</div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
};

// ==================================================================
// DATASET CARD
// ==================================================================
const DatasetCard = ({ dataset }) => (
  <div className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md transition-shadow cursor-pointer">
    <div className="flex justify-between items-start mb-2">
      <h3 className="text-md font-bold text-gray-900 font-mono tracking-tight">{dataset.slug || dataset.id}</h3>
      <span className="text-xs font-medium bg-red-100 text-red-800 px-2 py-0.5 rounded border border-red-200">Dataset</span>
    </div>
    <p className="text-sm text-gray-600 mb-4">{dataset.description}</p>
    <div className="flex items-center justify-between text-xs text-gray-500 border-t border-gray-100 pt-3">
      <span className="flex items-center gap-1"><Download className="w-3 h-3" /> {typeof dataset.downloads === 'number' ? `${(dataset.downloads / 1000).toFixed(1)}k` : dataset.downloads}</span>
      <div className="flex items-center gap-2">
        <span className="bg-gray-100 px-2 py-1 rounded font-mono">{dataset.size}</span>
        <span className="bg-gray-100 px-2 py-1 rounded font-mono">{dataset.rows} rows</span>
      </div>
    </div>
  </div>
);

// ==================================================================
// MAIN APP
// ==================================================================
export default function App() {
  const [activeTab, setActiveTab] = useState('models');
  const serial = useWebSerial();
  const {
    models, datasets, mcus, boards,
    fetchModels, fetchDatasets, fetchMcus, fetchBoards,
    selectedModel, setSelectedModel,
    deployState, resetDeploy, liveStats, updateLiveStats, resetLiveStats,
  } = useStore();

  useEffect(() => { fetchModels(); fetchDatasets(); fetchMcus(); fetchBoards(); }, []);

  // Track live stats from serial
  useEffect(() => {
    serial.onData((entry) => { updateLiveStats(entry); });
  }, []);

  const handleModelSelect = (model) => { setSelectedModel(model); resetDeploy(); resetLiveStats(); setActiveTab('deploy'); };
  const handleBack = () => { setSelectedModel(null); resetDeploy(); setActiveTab('models'); };

  const displayModels = models.length > 0 ? models : [];

  return (
    <div className="min-h-screen bg-white font-sans text-gray-900">
      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} isConnected={serial.isConnected}
        onConnectClick={() => serial.isConnected ? serial.disconnect() : serial.connect()} />

      {/* Hero */}
      {(activeTab === 'models' || activeTab === 'datasets') && !selectedModel && (
        <div className="bg-gradient-to-b from-yellow-50 to-white border-b border-gray-100">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl md:text-6xl mb-4">
              The Home of <span className="text-yellow-500">Tiny Biomedical</span> Models
            </h1>
            <p className="max-w-2xl text-lg text-gray-600 mb-8">
              Deploy TinyML models to any microcontroller. Pick a model, configure your hardware, flash — no code needed.
            </p>
            <button onClick={() => setActiveTab('models')}
              className="px-6 py-3 text-base font-medium rounded-md text-white bg-gray-900 hover:bg-gray-800 shadow-sm">
              Browse Models
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Deploy view */}
        {activeTab === 'deploy' && selectedModel ? (
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <button onClick={handleBack} className="p-2 hover:bg-gray-100 rounded-lg"><ArrowLeft className="w-5 h-5 text-gray-600" /></button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 font-mono">{selectedModel.slug || selectedModel.id}</h1>
                <p className="text-sm text-gray-500">by {selectedModel.author}</p>
              </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-6">
                <ModelDetailsPanel model={selectedModel} liveStats={liveStats} serial={serial} />
                <SerialMonitor serial={serial} />
              </div>
              <div>
                <DeployPanel model={selectedModel} deployState={deployState} mcus={mcus} boards={boards} serial={serial} />
              </div>
            </div>
          </div>
        ) : activeTab === 'deploy' && !selectedModel ? (
          <div className="text-center py-20">
            <Cpu className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">No model selected</h2>
            <p className="text-gray-500 mb-4">Pick a model from the hub to deploy.</p>
            <button onClick={() => setActiveTab('models')} className="px-4 py-2 bg-yellow-400 text-gray-900 rounded-md font-semibold hover:bg-yellow-500">Browse Models</button>
          </div>
        ) : (
          <div className="flex">
            {/* Sidebar — only on models/datasets */}
            {(activeTab === 'models' || activeTab === 'datasets') && (
              <div className="w-64 flex-shrink-0 hidden lg:block pr-8">
                <div className="space-y-6">
                  <div>
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Tasks</h3>
                    <div className="space-y-2">
                      {['ECG Classification', 'EEG Analysis', 'Keyword Spotting', 'Gesture Recognition', 'Vitals Regression'].map((item) => (
                        <label key={item} className="flex items-center cursor-pointer">
                          <input type="checkbox" className="h-4 w-4 text-yellow-500 focus:ring-yellow-400 border-gray-300 rounded" />
                          <span className="ml-2 text-sm text-gray-700 hover:text-gray-900">{item}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">MCU Targets</h3>
                    <div className="space-y-2">
                      {['nRF52840', 'ESP32', 'ATmega328P', 'Cortex-M4', 'RP2040'].map((item) => (
                        <label key={item} className="flex items-center cursor-pointer">
                          <input type="checkbox" className="h-4 w-4 text-yellow-500 focus:ring-yellow-400 border-gray-300 rounded" />
                          <span className="ml-2 text-sm text-gray-700 hover:text-gray-900">{item}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Input Type</h3>
                    <div className="flex flex-wrap gap-2">
                      {['Microphone', 'IMU', 'Analog', 'I2C', 'Camera'].map((lib) => (
                        <span key={lib} className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium bg-gray-100 text-gray-800 border border-gray-200 cursor-pointer hover:bg-yellow-50 hover:border-yellow-200">{lib}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="flex-1">
              {activeTab === 'models' && (
                <>
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2"><Box className="w-5 h-5 text-gray-500" /> {displayModels.length} Models</h2>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {displayModels.map((m) => <ModelCard key={m.id} model={m} onSelect={handleModelSelect} />)}
                  </div>
                </>
              )}
              {activeTab === 'datasets' && (
                <>
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2"><Database className="w-5 h-5 text-gray-500" /> {datasets.length} Datasets</h2>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {datasets.map((ds) => <DatasetCard key={ds.id} dataset={ds} />)}
                  </div>
                </>
              )}
              {activeTab === 'docs' && (
                <div className="flex flex-col items-center justify-center py-20 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
                  <div className="bg-white p-4 rounded-full shadow-sm mb-4">
                    <BookOpen className="w-12 h-12 text-yellow-500" />
                  </div>
                  <h2 className="text-xl font-bold text-gray-900 mb-2">Documentation & SDKs</h2>
                  <p className="text-gray-500 max-w-md text-center mb-6">
                    Guides for creating firmware skeletons, adding new MCUs, training models for TinyBioML, and the REST API reference.
                  </p>
                  <div className="flex gap-3">
                    <button className="px-4 py-2 bg-yellow-400 text-gray-900 rounded-md font-semibold hover:bg-yellow-500">Getting Started</button>
                    <button className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md font-semibold hover:bg-gray-50">API Reference</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Serial error toast */}
      {serial.error && (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm bg-red-50 border border-red-200 rounded-xl p-4 shadow-lg">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{serial.error}</p>
          </div>
        </div>
      )}

      <footer className="bg-white border-t border-gray-200 mt-12">
        <div className="max-w-7xl mx-auto py-8 px-4 flex items-center justify-between">
          <p className="text-sm text-gray-400">&copy; 2025 TinyBioML Platform. Open Source.</p>
          <a href="#" className="text-gray-400 hover:text-gray-500"><Github className="h-5 w-5" /></a>
        </div>
      </footer>
    </div>
  );
}
