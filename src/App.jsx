import React, { useState, useEffect, useRef } from 'react';
import {
  Search, Database, Box, Users, BookOpen, Cpu, Activity,
  Download, Heart, Filter, X, Zap, Github, Upload, Usb,
  ChevronRight, ChevronLeft, Terminal, Radio, Settings,
  AlertTriangle, Check, Loader2, ArrowLeft, Eye,
} from 'lucide-react';
import { useStore } from './store/useStore';
import { useWebSerial } from './hooks/useWebSerial';

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
            <input
              type="text"
              className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-full leading-5 bg-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-yellow-500 focus:border-yellow-500 sm:text-sm"
              placeholder="Search models, datasets, users..."
            />
          </div>
        </div>

        <div className="flex items-center space-x-4 text-sm font-medium text-gray-600">
          {['models', 'datasets', 'deploy', 'docs'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`capitalize ${
                activeTab === tab
                  ? 'text-gray-900 border-b-2 border-yellow-400'
                  : 'hover:text-gray-900'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="hidden md:flex items-center space-x-3 ml-4">
          {/* Device Connection Button */}
          <button
            onClick={onConnectClick}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors border ${
              isConnected
                ? 'bg-green-50 text-green-700 border-green-200'
                : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
            }`}
          >
            <Usb className="w-3.5 h-3.5" />
            {isConnected ? 'Connected' : 'Connect Device'}
          </button>
          <button className="bg-gray-900 text-white px-4 py-1.5 rounded-full text-sm font-medium hover:bg-gray-800">
            Sign Up
          </button>
        </div>
      </div>
    </div>
  </nav>
);

// ==================================================================
// SIDEBAR (Filters)
// ==================================================================
const Sidebar = () => (
  <div className="w-64 flex-shrink-0 hidden lg:block pr-8">
    <div className="space-y-6">
      <div>
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Tasks</h3>
        <div className="space-y-2">
          {['ECG Classification', 'EEG Analysis', 'Anomaly Detection', 'Vitals Regression'].map((item) => (
            <label key={item} className="flex items-center cursor-pointer">
              <input type="checkbox" className="h-4 w-4 text-yellow-500 focus:ring-yellow-400 border-gray-300 rounded" />
              <span className="ml-2 text-sm text-gray-700 hover:text-gray-900">{item}</span>
            </label>
          ))}
        </div>
      </div>
      <div>
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Hardware Targets</h3>
        <div className="space-y-2">
          {['ESP32', 'Cortex M4/M7', 'Arduino Nano 33', 'nRF52840', 'Raspberry Pi Pico'].map((item) => (
            <label key={item} className="flex items-center cursor-pointer">
              <input type="checkbox" className="h-4 w-4 text-yellow-500 focus:ring-yellow-400 border-gray-300 rounded" />
              <span className="ml-2 text-sm text-gray-700 hover:text-gray-900">{item}</span>
            </label>
          ))}
        </div>
      </div>
      <div>
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Libraries</h3>
        <div className="flex flex-wrap gap-2">
          {['TFLite Micro', 'Edge Impulse', 'PyTorch Mobile', 'MicroTensor'].map((lib) => (
            <span key={lib} className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium bg-gray-100 text-gray-800 border border-gray-200">
              {lib}
            </span>
          ))}
        </div>
      </div>
    </div>
  </div>
);

// ==================================================================
// MODEL CARD
// ==================================================================
const ModelCard = ({ model, onSelect }) => (
  <div
    onClick={() => onSelect(model)}
    className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md hover:border-yellow-200 transition-all cursor-pointer flex flex-col justify-between h-full group"
  >
    <div>
      <div className="flex justify-between items-start mb-2">
        <h3 className="text-md font-bold text-gray-900 font-mono tracking-tight group-hover:text-yellow-700 transition-colors">
          {model.slug || model.id}
        </h3>
        <span className="text-xs font-medium bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded border border-yellow-200">
          {model.task}
        </span>
      </div>
      <p className="text-sm text-gray-600 mb-4 line-clamp-2">{model.description}</p>

      <div className="grid grid-cols-3 gap-2 mb-4">
        {[
          { label: 'RAM', value: model.stats.ram },
          { label: 'Flash', value: model.stats.flash },
          { label: 'Latency', value: model.stats.latency },
        ].map((s) => (
          <div key={s.label} className="bg-gray-50 p-2 rounded text-center border border-gray-100">
            <div className="text-[10px] text-gray-500 uppercase">{s.label}</div>
            <div className="text-xs font-bold text-gray-800">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-1 mb-4">
        {(model.tags || []).map((tag) => (
          <span key={tag} className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
            #{tag}
          </span>
        ))}
      </div>
    </div>

    <div className="flex items-center justify-between text-xs text-gray-500 border-t border-gray-100 pt-3">
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1">
          <Download className="w-3 h-3" /> {typeof model.downloads === 'number' ? `${(model.downloads / 1000).toFixed(1)}k` : model.downloads}
        </span>
        <span className="flex items-center gap-1"><Heart className="w-3 h-3" /> {model.likes}</span>
      </div>
      <div className="flex items-center gap-1 font-medium text-gray-700">
        <Cpu className="w-3 h-3" /> {model.hardware}
      </div>
    </div>
  </div>
);

// ==================================================================
// DATASET CARD
// ==================================================================
const DatasetCard = ({ dataset }) => (
  <div className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md transition-shadow cursor-pointer">
    <div className="flex justify-between items-start mb-2">
      <h3 className="text-md font-bold text-gray-900 font-mono tracking-tight">{dataset.slug || dataset.id}</h3>
      <span className="text-xs font-medium bg-red-100 text-red-800 px-2 py-0.5 rounded border border-red-200">
        Dataset
      </span>
    </div>
    <p className="text-sm text-gray-600 mb-4">{dataset.description}</p>
    <div className="flex items-center justify-between text-xs text-gray-500 border-t border-gray-100 pt-3">
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1">
          <Download className="w-3 h-3" /> {typeof dataset.downloads === 'number' ? `${(dataset.downloads / 1000).toFixed(1)}k` : dataset.downloads}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="bg-gray-100 px-2 py-1 rounded font-mono">{dataset.size}</span>
        <span className="bg-gray-100 px-2 py-1 rounded font-mono">{dataset.rows} rows</span>
      </div>
    </div>
  </div>
);

// ==================================================================
// MODEL DETAIL + DEPLOY PANEL
// ==================================================================
const ModelDetail = ({ model, onBack, serial, deployState, boards }) => {
  const { setDeployConfig, setDeployStep, compile, optimizeModel, optimizeResult } = useStore();
  const selectedBoard = boards[deployState.boardKey] || null;

  useEffect(() => {
    if (deployState.boardKey) {
      optimizeModel(model.id, deployState.boardKey);
    }
  }, [deployState.boardKey, model.id]);

  return (
    <div className="space-y-6">
      {/* Back button + title */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 font-mono">{model.slug || model.id}</h1>
          <p className="text-sm text-gray-500">by {model.author} · Updated {model.updated}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Model info */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h2 className="font-semibold text-gray-900 mb-2">About</h2>
            <p className="text-gray-600">{model.description}</p>
            <div className="grid grid-cols-3 gap-3 mt-4">
              {[
                { label: 'RAM', value: model.stats.ram, icon: '💾' },
                { label: 'Flash', value: model.stats.flash, icon: '📦' },
                { label: 'Latency', value: model.stats.latency, icon: '⚡' },
              ].map((s) => (
                <div key={s.label} className="bg-gray-50 p-3 rounded-lg border border-gray-100 text-center">
                  <div className="text-lg mb-1">{s.icon}</div>
                  <div className="text-xs text-gray-500 uppercase">{s.label}</div>
                  <div className="text-lg font-bold text-gray-900">{s.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Serial Monitor */}
          <SerialMonitor serial={serial} />
        </div>

        {/* Right: Deploy Panel */}
        <div className="space-y-4">
          <DeployPanel
            model={model}
            deployState={deployState}
            boards={boards}
            selectedBoard={selectedBoard}
            optimizeResult={optimizeResult}
            serial={serial}
          />
        </div>
      </div>
    </div>
  );
};

// ==================================================================
// DEPLOY PANEL (right sidebar on model detail)
// ==================================================================
const DeployPanel = ({ model, deployState, boards, selectedBoard, optimizeResult, serial }) => {
  const { setDeployConfig, setDeployStep, compile } = useStore();

  const handleCompileAndFlash = async () => {
    await compile();
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="bg-gray-900 text-white p-4">
        <h3 className="font-semibold flex items-center gap-2">
          <Zap className="w-4 h-4 text-yellow-400" />
          Deploy to Device
        </h3>
        <p className="text-xs text-gray-400 mt-1">Flash this model to your microcontroller</p>
      </div>

      <div className="p-4 space-y-4">
        {/* Step 1: Device Status */}
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            1. Device
          </label>
          <div className={`mt-1 p-3 rounded-lg border text-sm ${
            serial.isConnected
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-orange-50 border-orange-200 text-orange-800'
          }`}>
            {serial.isConnected ? (
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                {serial.deviceInfo?.vendorName || 'Device'} connected
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Usb className="w-4 h-4" /> No device connected
                </span>
                <button
                  onClick={() => serial.connect()}
                  className="text-xs font-medium bg-white px-2 py-1 rounded border border-orange-300 hover:bg-orange-50"
                >
                  Connect
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Step 2: Select Board */}
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            2. Board Type
          </label>
          <select
            value={deployState.boardKey || ''}
            onChange={(e) => setDeployConfig({ boardKey: e.target.value })}
            className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-yellow-500 focus:border-yellow-500"
          >
            <option value="">Select board...</option>
            {Object.entries(boards).map(([key, board]) => (
              <option key={key} value={key}>{board.name}</option>
            ))}
          </select>
        </div>

        {/* Step 3: Pin Configuration */}
        {selectedBoard && (
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              3. Pin Configuration
            </label>
            <div className="mt-1 space-y-2">
              <div className="flex gap-2">
                <select
                  value={deployState.pin}
                  onChange={(e) => setDeployConfig({ pin: e.target.value })}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-yellow-500 focus:border-yellow-500"
                >
                  <optgroup label="Analog Pins">
                    {selectedBoard.analog_pins.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Digital Pins">
                    {selectedBoard.digital_pins.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </optgroup>
                </select>
                <select
                  value={deployState.pinMode}
                  onChange={(e) => setDeployConfig({ pinMode: e.target.value })}
                  className="w-28 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-yellow-500 focus:border-yellow-500"
                >
                  <option value="analog">Analog</option>
                  <option value="digital">Digital</option>
                  <option value="i2c">I2C</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500">Sample Rate (ms)</label>
                <input
                  type="number"
                  value={deployState.sampleRateMs}
                  onChange={(e) => setDeployConfig({ sampleRateMs: parseInt(e.target.value) || 100 })}
                  className="mt-0.5 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-yellow-500 focus:border-yellow-500"
                  min={1}
                  max={10000}
                />
              </div>
            </div>
          </div>
        )}

        {/* Compatibility Check */}
        {optimizeResult && selectedBoard && (
          <div className={`p-3 rounded-lg border text-xs ${
            optimizeResult.fits_on_device
              ? 'bg-green-50 border-green-200'
              : 'bg-red-50 border-red-200'
          }`}>
            <div className="font-semibold mb-1 flex items-center gap-1">
              {optimizeResult.fits_on_device ? (
                <><Check className="w-3 h-3 text-green-600" /> Model fits on device</>
              ) : (
                <><AlertTriangle className="w-3 h-3 text-red-600" /> Model too large</>
              )}
            </div>
            <div className="text-gray-600">
              Model: {optimizeResult.original_size_kb}KB → Board flash: {optimizeResult.board_flash_kb}KB
            </div>
            {optimizeResult.quantized && (
              <div className="text-gray-600 mt-1">
                After int8 quantization: ~{optimizeResult.optimized_size_kb}KB
              </div>
            )}
            {(optimizeResult.warnings || []).map((w, i) => (
              <div key={i} className="text-orange-700 mt-1">⚠ {w}</div>
            ))}
          </div>
        )}

        {/* Deploy Button */}
        <button
          onClick={handleCompileAndFlash}
          disabled={!serial.isConnected || !deployState.boardKey || deployState.step === 'compiling'}
          className={`w-full py-3 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 transition-all ${
            serial.isConnected && deployState.boardKey
              ? 'bg-yellow-400 text-gray-900 hover:bg-yellow-500 shadow-sm'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          }`}
        >
          {deployState.step === 'compiling' ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Compiling firmware...</>
          ) : deployState.step === 'flashing' ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Flashing to device...</>
          ) : deployState.step === 'done' ? (
            <><Check className="w-4 h-4" /> Deployed!</>
          ) : (
            <><Zap className="w-4 h-4" /> Compile &amp; Flash</>
          )}
        </button>

        {/* Error display */}
        {deployState.step === 'error' && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
            <div className="font-semibold mb-1">Build Error</div>
            {deployState.error}
            {deployState.sketch && (
              <details className="mt-2">
                <summary className="cursor-pointer text-red-600 font-medium">View generated sketch</summary>
                <pre className="mt-1 text-[10px] bg-white p-2 rounded border border-red-200 overflow-x-auto max-h-48 overflow-y-auto">
                  {deployState.sketch}
                </pre>
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

  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [serial.serialOutput, autoScroll]);

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
          <Terminal className="w-3.5 h-3.5" />
          Serial Monitor
          {serial.isConnected && (
            <span className="flex items-center gap-1 text-green-400">
              <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
              Live
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`text-xs px-2 py-0.5 rounded ${autoScroll ? 'bg-yellow-500/20 text-yellow-400' : 'text-gray-500'}`}
          >
            Auto-scroll
          </button>
          <button
            onClick={serial.clearOutput}
            className="text-xs text-gray-500 hover:text-gray-300 px-2 py-0.5"
          >
            Clear
          </button>
        </div>
      </div>
      <div className="p-3 font-mono text-xs max-h-80 overflow-y-auto">
        {serial.serialOutput.map((entry, i) => (
          <div key={i} className="py-0.5">
            {entry.parsed ? (
              <div className="text-green-400">
                <span className="text-gray-600">[{new Date(entry.timestamp).toLocaleTimeString()}]</span>{' '}
                {entry.parsed.class !== undefined && (
                  <>class: <span className="text-yellow-400 font-bold">{entry.parsed.class}</span>{' '}
                  conf: <span className="text-cyan-400">{(entry.parsed.confidence * 100).toFixed(1)}%</span>{' '}</>
                )}
                {entry.parsed.value !== undefined && (
                  <>value: <span className="text-yellow-400 font-bold">{entry.parsed.value}</span>{' '}</>
                )}
                {entry.parsed.latency_us !== undefined && (
                  <span className="text-gray-500">{entry.parsed.latency_us}μs</span>
                )}
              </div>
            ) : (
              <div className="text-gray-400">
                <span className="text-gray-600">[{new Date(entry.timestamp).toLocaleTimeString()}]</span>{' '}
                {entry.raw}
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
};

// ==================================================================
// UPLOAD MODEL MODAL
// ==================================================================
const UploadModal = ({ isOpen, onClose }) => {
  const { uploadModel } = useStore();
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');
  const [task, setTask] = useState('Classification');
  const [hardware, setHardware] = useState('Arduino Nano 33');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);

  if (!isOpen) return null;

  const handleUpload = async () => {
    if (!file || !title) return;
    setUploading(true);
    const res = await uploadModel(file, { title, task, hardware, description, tags: tags.split(',').map(t => t.trim()) });
    setResult(res);
    setUploading(false);
    if (res.success) {
      setTimeout(() => { onClose(); setResult(null); }, 1500);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold text-gray-900">Upload Model</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>

        <div className="space-y-3">
          {/* File drop */}
          <div
            className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center hover:border-yellow-400 transition-colors cursor-pointer"
            onClick={() => document.getElementById('model-file-input').click()}
          >
            <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
            <p className="text-sm text-gray-600">
              {file ? <span className="font-medium text-gray-900">{file.name}</span> : 'Drop .tflite, .h5, or .onnx file here'}
            </p>
            <input
              id="model-file-input"
              type="file"
              accept=".tflite,.h5,.onnx"
              className="hidden"
              onChange={(e) => setFile(e.target.files[0])}
            />
          </div>

          <input
            type="text" placeholder="Model name *" value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-yellow-500 focus:border-yellow-500"
          />
          <div className="grid grid-cols-2 gap-3">
            <select value={task} onChange={(e) => setTask(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-yellow-500 focus:border-yellow-500">
              <option>Classification</option>
              <option>Regression</option>
              <option>Time-Series</option>
              <option>Anomaly Detection</option>
            </select>
            <select value={hardware} onChange={(e) => setHardware(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-yellow-500 focus:border-yellow-500">
              <option>Arduino Nano 33</option>
              <option>ESP32</option>
              <option>Cortex M4</option>
              <option>nRF52840</option>
            </select>
          </div>
          <textarea
            placeholder="Description" value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-yellow-500 focus:border-yellow-500"
            rows={2}
          />
          <input
            type="text" placeholder="Tags (comma separated)" value={tags}
            onChange={(e) => setTags(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-yellow-500 focus:border-yellow-500"
          />

          {result && !result.success && (
            <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg">{result.error}</div>
          )}
          {result && result.success && (
            <div className="p-3 bg-green-50 text-green-700 text-sm rounded-lg flex items-center gap-2">
              <Check className="w-4 h-4" /> Model uploaded!
            </div>
          )}

          <button
            onClick={handleUpload}
            disabled={!file || !title || uploading}
            className="w-full py-2.5 bg-gray-900 text-white rounded-lg font-medium text-sm hover:bg-gray-800 disabled:bg-gray-200 disabled:text-gray-400 flex items-center justify-center gap-2"
          >
            {uploading ? <><Loader2 className="w-4 h-4 animate-spin" /> Uploading...</> : 'Upload to Hub'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ==================================================================
// COMING SOON
// ==================================================================
const ComingSoon = ({ title, icon }) => (
  <div className="flex flex-col items-center justify-center py-20 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
    <div className="bg-white p-4 rounded-full shadow-sm mb-4">{icon}</div>
    <h2 className="text-xl font-bold text-gray-900 mb-2">{title} Coming Soon</h2>
    <p className="text-gray-500 max-w-md text-center">
      We are building the open-source benchmarks and community features defined in our proposal.
    </p>
  </div>
);

// ==================================================================
// MAIN APP
// ==================================================================
export default function App() {
  const [activeTab, setActiveTab] = useState('models');
  const [showUpload, setShowUpload] = useState(false);

  const serial = useWebSerial();
  const {
    models, datasets, boards,
    fetchModels, fetchDatasets, fetchBoards,
    selectedModel, setSelectedModel,
    deployState, resetDeploy,
  } = useStore();

  // Fetch data on mount
  useEffect(() => {
    fetchModels();
    fetchDatasets();
    fetchBoards();
  }, []);

  // Fallback to mock data if API is not running
  const displayModels = models.length > 0 ? models : MOCK_MODELS;
  const displayDatasets = datasets.length > 0 ? datasets : MOCK_DATASETS;

  const handleModelSelect = (model) => {
    setSelectedModel(model);
    resetDeploy();
    setActiveTab('deploy');
  };

  const handleBack = () => {
    setSelectedModel(null);
    resetDeploy();
    setActiveTab('models');
  };

  return (
    <div className="min-h-screen bg-white font-sans text-gray-900">
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isConnected={serial.isConnected}
        onConnectClick={() => serial.isConnected ? serial.disconnect() : serial.connect()}
      />

      {/* Hero — only show on hub views */}
      {(activeTab === 'models' || activeTab === 'datasets') && !selectedModel && (
        <div className="bg-gradient-to-b from-yellow-50 to-white border-b border-gray-100">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl md:text-6xl mb-4">
              The Home of <span className="text-yellow-500">Tiny Biomedical</span> Models
            </h1>
            <p className="max-w-2xl text-lg text-gray-600 mb-8">
              An open-source benchmarking platform and deployment system for TinyML in healthcare.
              Discover, benchmark, and deploy lightweight models to constrained hardware.
            </p>
            <div className="flex flex-wrap gap-4">
              <button
                onClick={() => setActiveTab('models')}
                className="px-6 py-3 text-base font-medium rounded-md text-white bg-gray-900 hover:bg-gray-800 shadow-sm"
              >
                Browse Models
              </button>
              <button
                onClick={() => setShowUpload(true)}
                className="px-6 py-3 border border-gray-300 text-base font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 shadow-sm"
              >
                Submit a Model
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Deploy view with model selected */}
        {activeTab === 'deploy' && selectedModel ? (
          <ModelDetail
            model={selectedModel}
            onBack={handleBack}
            serial={serial}
            deployState={deployState}
            boards={boards}
          />
        ) : activeTab === 'deploy' && !selectedModel ? (
          <div className="text-center py-20">
            <Cpu className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">No model selected</h2>
            <p className="text-gray-500 mb-4">Pick a model from the hub to deploy it to your device.</p>
            <button
              onClick={() => setActiveTab('models')}
              className="px-4 py-2 bg-yellow-400 text-gray-900 rounded-md font-semibold hover:bg-yellow-500"
            >
              Browse Models
            </button>
          </div>
        ) : (
          <div className="flex">
            {(activeTab === 'models' || activeTab === 'datasets') && <Sidebar />}
            <div className="flex-1">
              {activeTab === 'models' && (
                <>
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                      <Box className="w-5 h-5 text-gray-500" />
                      {displayModels.length} Models
                    </h2>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowUpload(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800"
                      >
                        <Upload className="w-3.5 h-3.5" /> Upload
                      </button>
                      <select className="pl-3 pr-10 py-2 text-sm border-gray-300 rounded-md border bg-white">
                        <option>Most Downloads</option>
                        <option>Recently Updated</option>
                        <option>Smallest Footprint</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {displayModels.map((model, idx) => (
                      <ModelCard key={model.id || idx} model={model} onSelect={handleModelSelect} />
                    ))}
                  </div>
                </>
              )}

              {activeTab === 'datasets' && (
                <>
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                      <Database className="w-5 h-5 text-gray-500" />
                      {displayDatasets.length} Datasets
                    </h2>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {displayDatasets.map((ds, idx) => (
                      <DatasetCard key={ds.id || idx} dataset={ds} />
                    ))}
                  </div>
                </>
              )}

              {activeTab === 'docs' && (
                <ComingSoon title="Documentation & SDKs" icon={<BookOpen className="w-12 h-12 text-yellow-500" />} />
              )}
            </div>
          </div>
        )}
      </div>

      {/* Upload Modal */}
      <UploadModal isOpen={showUpload} onClose={() => setShowUpload(false)} />

      {/* WebSerial error toast */}
      {serial.error && (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm bg-red-50 border border-red-200 rounded-xl p-4 shadow-lg">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-red-700">{serial.error}</p>
              <p className="text-xs text-red-500 mt-1">WebSerial requires Chrome or Edge browser.</p>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-12">
        <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
          <div className="md:flex md:items-center md:justify-between">
            <div className="flex justify-center md:justify-start space-x-6 md:order-2">
              <a href="#" className="text-gray-400 hover:text-gray-500"><Github className="h-6 w-6" /></a>
            </div>
            <div className="mt-8 md:mt-0 md:order-1">
              <p className="text-center text-base text-gray-400">
                &copy; 2025 TinyBioML Platform. Open Source.
              </p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ==================================================================
// FALLBACK MOCK DATA (used if backend isn't running)
// ==================================================================
const MOCK_MODELS = [
  {
    id: "tbio-tiny-ecg-arrhythmia-v1",
    slug: "tbio/tiny-ecg-arrhythmia-v1",
    title: "Tiny-ECG-Arrhythmia",
    author: "TinyBioML",
    task: "Classification",
    hardware: "ESP32",
    description: "Lightweight arrhythmia detection for single-lead ECG. Optimized for ESP32 with minimal latency.",
    downloads: 12000, likes: 342,
    tags: ["ECG", "Quantized", "int8"],
    updated: "2 days ago",
    stats: { ram: "15KB", latency: "12ms", flash: "45KB" },
  },
  {
    id: "stanford-eeg-sleep-stage-micro",
    slug: "stanford-lab/eeg-sleep-stage-micro",
    title: "EEG-Sleep-Stage-Micro",
    author: "Stanford-Wearables",
    task: "Time-Series",
    hardware: "Cortex M4",
    description: "5-class sleep staging model compressed for Cortex M4F microcontrollers.",
    downloads: 8500, likes: 120,
    tags: ["EEG", "Sleep", "Low-Power"],
    updated: "1 week ago",
    stats: { ram: "24KB", latency: "45ms", flash: "120KB" },
  },
  {
    id: "community-ppg-hr-estimator",
    slug: "community/ppg-hr-estimator",
    title: "PPG-HeartRate-Estimator",
    author: "OpenHealth",
    task: "Regression",
    hardware: "Arduino Nano 33",
    description: "Robust heart rate estimation from raw PPG signals with motion artifact cancellation.",
    downloads: 5000, likes: 89,
    tags: ["PPG", "Wearable", "BLE"],
    updated: "3 days ago",
    stats: { ram: "8KB", latency: "8ms", flash: "32KB" },
  },
  {
    id: "tbio-emg-gesture-control",
    slug: "tbio/emg-gesture-control",
    title: "EMG-Gesture-Control-Tiny",
    author: "TinyBioML",
    task: "Classification",
    hardware: "nRF52840",
    description: "Recognizes 6 hand gestures from forearm EMG. Ready for BLE streaming.",
    downloads: 3200, likes: 210,
    tags: ["EMG", "Prosthetics", "Real-time"],
    updated: "1 month ago",
    stats: { ram: "18KB", latency: "15ms", flash: "50KB" },
  },
];

const MOCK_DATASETS = [
  {
    id: "dataset-mit-bih-quantized",
    slug: "dataset/mit-bih-quantized",
    title: "MIT-BIH-Tiny-Format",
    author: "TinyBioML",
    size: "45 MB", rows: "100k",
    description: "Pre-processed MIT-BIH Arrhythmia Database optimized for microcontroller training pipelines.",
    updated: "5 days ago", downloads: 2100,
  },
  {
    id: "dataset-sleep-edf-micro",
    slug: "dataset/sleep-edf-micro",
    title: "Sleep-EDF-Micro",
    author: "Stanford-Wearables",
    size: "120 MB", rows: "50k",
    description: "EEG fragments normalized and windowed for integer-only inference testing.",
    updated: "2 weeks ago", downloads: 1500,
  },
];
