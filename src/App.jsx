import React, { useState } from 'react';
import { 
  Search, 
  Database, 
  Box, 
  Users, 
  BookOpen, 
  Cpu, 
  Activity, 
  Download, 
  Heart, 
  Filter, 
  Menu, 
  X,
  Zap,
  Github
} from 'lucide-react';

// --- Mock Data based on your Proposal ---

const MODELS = [
  {
    id: "tbio/tiny-ecg-arrhythmia-v1",
    title: "Tiny-ECG-Arrhythmia",
    author: "TinyBioML",
    task: "Classification",
    hardware: "ESP32",
    description: "Lightweight arrhythmia detection for single-lead ECG. Optimized for ESP32 with minimal latency.",
    downloads: "12k",
    likes: 342,
    tags: ["ECG", "Quantized", "int8"],
    updated: "2 days ago",
    stats: {
      ram: "15KB",
      latency: "12ms",
      flash: "45KB"
    }
  },
  {
    id: "stanford-lab/eeg-sleep-stage-micro",
    title: "EEG-Sleep-Stage-Micro",
    author: "Stanford-Wearables",
    task: "Time-Series",
    hardware: "Cortex M4",
    description: "5-class sleep staging model compressed for Cortex M4F microcontrollers.",
    downloads: "8.5k",
    likes: 120,
    tags: ["EEG", "Sleep", "Low-Power"],
    updated: "1 week ago",
    stats: {
      ram: "24KB",
      latency: "45ms",
      flash: "120KB"
    }
  },
  {
    id: "community/ppg-hr-estimator",
    title: "PPG-HeartRate-Estimator",
    author: "OpenHealth",
    task: "Regression",
    hardware: "Arduino Nano 33",
    description: "Robust heart rate estimation from raw PPG signals with motion artifact cancellation.",
    downloads: "5k",
    likes: 89,
    tags: ["PPG", "Wearable", "BLE"],
    updated: "3 days ago",
    stats: {
      ram: "8KB",
      latency: "8ms",
      flash: "32KB"
    }
  },
  {
    id: "tbio/emg-gesture-control",
    title: "EMG-Gesture-Control-Tiny",
    author: "TinyBioML",
    task: "Classification",
    hardware: "nRF52840",
    description: "Recognizes 6 hand gestures from forearm EMG. Ready for BLE streaming.",
    downloads: "3.2k",
    likes: 210,
    tags: ["EMG", "Prosthetics", "Real-time"],
    updated: "1 month ago",
    stats: {
      ram: "18KB",
      latency: "15ms",
      flash: "50KB"
    }
  }
];

const DATASETS = [
  {
    id: "dataset/mit-bih-quantized",
    title: "MIT-BIH-Tiny-Format",
    author: "TinyBioML",
    size: "45 MB",
    rows: "100k",
    description: "Pre-processed MIT-BIH Arrhythmia Database optimized for microcontroller training pipelines.",
    updated: "5 days ago",
    downloads: "2.1k"
  },
  {
    id: "dataset/sleep-edf-micro",
    title: "Sleep-EDF-Micro",
    author: "Stanford-Wearables",
    size: "120 MB",
    rows: "50k",
    description: "EEG fragments normalized and windowed for integer-only inference testing.",
    updated: "2 weeks ago",
    downloads: "1.5k"
  }
];

// --- Components ---

const Navbar = ({ activeTab, setActiveTab }) => (
  <nav className="border-b border-gray-200 bg-white sticky top-0 z-50">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="flex justify-between h-16 items-center">
        {/* Logo Section */}
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => setActiveTab('models')}>
          <div className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <span className="text-3xl">🧬</span> TinyBioML
          </div>
        </div>

        {/* Search Bar (Hidden on small mobile) */}
        <div className="hidden md:flex flex-1 max-w-lg mx-4">
          <div className="relative w-full">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-gray-400" />
            </div>
            <input
              type="text"
              className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-full leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-yellow-500 focus:border-yellow-500 sm:text-sm"
              placeholder="Search models, datasets, users..."
            />
          </div>
        </div>

        {/* Nav Links */}
        <div className="flex items-center space-x-6 text-sm font-medium text-gray-600">
          <button 
            onClick={() => setActiveTab('models')}
            className={`${activeTab === 'models' ? 'text-gray-900 border-b-2 border-yellow-400' : 'hover:text-gray-900'}`}
          >
            Models
          </button>
          <button 
            onClick={() => setActiveTab('datasets')}
            className={`${activeTab === 'datasets' ? 'text-gray-900 border-b-2 border-yellow-400' : 'hover:text-gray-900'}`}
          >
            Datasets
          </button>
          <button 
            onClick={() => setActiveTab('community')}
            className={`${activeTab === 'community' ? 'text-gray-900 border-b-2 border-yellow-400' : 'hover:text-gray-900'}`}
          >
            Community
          </button>
          <button 
            onClick={() => setActiveTab('docs')}
            className={`${activeTab === 'docs' ? 'text-gray-900 border-b-2 border-yellow-400' : 'hover:text-gray-900'}`}
          >
            Docs
          </button>
        </div>

        {/* Auth Buttons */}
        <div className="hidden md:flex items-center space-x-3 ml-4">
          <button className="text-gray-600 hover:text-gray-900 font-medium text-sm">Log In</button>
          <button className="bg-gray-900 text-white px-4 py-1.5 rounded-full text-sm font-medium hover:bg-gray-800 transition-colors">
            Sign Up
          </button>
        </div>
      </div>
    </div>
  </nav>
);

const Sidebar = () => (
  <div className="w-64 flex-shrink-0 hidden lg:block pr-8">
    <div className="space-y-6">
      <div>
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Tasks</h3>
        <div className="space-y-2">
          {['ECG Classification', 'EEG Analysis', 'Anomaly Detection', 'Vitals Regression'].map((item) => (
            <div key={item} className="flex items-center">
              <input type="checkbox" className="h-4 w-4 text-yellow-500 focus:ring-yellow-400 border-gray-300 rounded" />
              <span className="ml-2 text-sm text-gray-700 hover:text-gray-900 cursor-pointer">{item}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Hardware Targets</h3>
        <div className="space-y-2">
          {['ESP32', 'Cortex M4/M7', 'Arduino Nano', 'nRF52840', 'Raspberry Pi Pico'].map((item) => (
            <div key={item} className="flex items-center">
              <input type="checkbox" className="h-4 w-4 text-yellow-500 focus:ring-yellow-400 border-gray-300 rounded" />
              <span className="ml-2 text-sm text-gray-700 hover:text-gray-900 cursor-pointer">{item}</span>
            </div>
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

const ModelCard = ({ model }) => (
  <div className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md transition-shadow cursor-pointer flex flex-col justify-between h-full">
    <div>
      <div className="flex justify-between items-start mb-2">
        <h3 className="text-md font-bold text-gray-900 font-mono tracking-tight">{model.id}</h3>
        <span className="text-xs font-medium bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded border border-yellow-200">
          {model.task}
        </span>
      </div>
      <p className="text-sm text-gray-600 mb-4 line-clamp-2">{model.description}</p>
      
      {/* TinyML Stats Grid */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="bg-gray-50 p-2 rounded text-center border border-gray-100">
          <div className="text-[10px] text-gray-500 uppercase">RAM</div>
          <div className="text-xs font-bold text-gray-800">{model.stats.ram}</div>
        </div>
        <div className="bg-gray-50 p-2 rounded text-center border border-gray-100">
          <div className="text-[10px] text-gray-500 uppercase">Flash</div>
          <div className="text-xs font-bold text-gray-800">{model.stats.flash}</div>
        </div>
        <div className="bg-gray-50 p-2 rounded text-center border border-gray-100">
          <div className="text-[10px] text-gray-500 uppercase">Latency</div>
          <div className="text-xs font-bold text-gray-800">{model.stats.latency}</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 mb-4">
        {model.tags.map(tag => (
          <span key={tag} className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">#{tag}</span>
        ))}
      </div>
    </div>

    <div className="flex items-center justify-between text-xs text-gray-500 border-t border-gray-100 pt-3">
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1"><Download className="w-3 h-3" /> {model.downloads}</span>
        <span className="flex items-center gap-1"><Heart className="w-3 h-3" /> {model.likes}</span>
      </div>
      <div className="flex items-center gap-1 font-medium text-gray-700">
        <Cpu className="w-3 h-3" /> {model.hardware}
      </div>
    </div>
  </div>
);

const DatasetCard = ({ dataset }) => (
  <div className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md transition-shadow cursor-pointer">
    <div className="flex justify-between items-start mb-2">
      <h3 className="text-md font-bold text-gray-900 font-mono tracking-tight">{dataset.id}</h3>
      <span className="text-xs font-medium bg-red-100 text-red-800 px-2 py-0.5 rounded border border-red-200">
        Dataset
      </span>
    </div>
    <p className="text-sm text-gray-600 mb-4">{dataset.description}</p>
    <div className="flex items-center justify-between text-xs text-gray-500 border-t border-gray-100 pt-3">
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1"><Download className="w-3 h-3" /> {dataset.downloads}</span>
        <span>Updated {dataset.updated}</span>
      </div>
      <div className="flex items-center gap-2">
         <span className="bg-gray-100 px-2 py-1 rounded font-mono">{dataset.size}</span>
         <span className="bg-gray-100 px-2 py-1 rounded font-mono">{dataset.rows} rows</span>
      </div>
    </div>
  </div>
);

const ComingSoon = ({ title, icon }) => (
  <div className="flex flex-col items-center justify-center py-20 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
    <div className="bg-white p-4 rounded-full shadow-sm mb-4">
      {icon}
    </div>
    <h2 className="text-xl font-bold text-gray-900 mb-2">{title} Coming Soon</h2>
    <p className="text-gray-500 max-w-md text-center">
      We are building the open-source benchmarks and community features defined in our proposal.
      Stay tuned for leaderboards and discussion forums.
    </p>
    <button className="mt-6 px-4 py-2 bg-yellow-400 text-gray-900 rounded-md font-semibold hover:bg-yellow-500 transition-colors">
      Read the Proposal
    </button>
  </div>
);

// --- Main App Component ---

export default function App() {
  const [activeTab, setActiveTab] = useState('models');

  return (
    <div className="min-h-screen bg-white font-sans text-gray-900">
      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />
      
      {/* Hero Section */}
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
            <button className="px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-gray-900 hover:bg-gray-800 md:text-lg shadow-sm">
              Browse Models
            </button>
            <button className="px-6 py-3 border border-gray-300 text-base font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 md:text-lg shadow-sm">
              Submit a Model
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex">
          
          {/* Sidebar (Only show on Models/Datasets views) */}
          {(activeTab === 'models' || activeTab === 'datasets') && <Sidebar />}

          {/* Main Grid */}
          <div className="flex-1">
            
            {/* Models View */}
            {activeTab === 'models' && (
              <>
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                    <Box className="w-5 h-5 text-gray-500" /> 
                    {MODELS.length} Models
                  </h2>
                  <div className="flex gap-2">
                    <select className="block w-full pl-3 pr-10 py-2 text-sm border-gray-300 focus:outline-none focus:ring-yellow-500 focus:border-yellow-500 sm:text-sm rounded-md border bg-white">
                      <option>Most Downloads</option>
                      <option>Recently Updated</option>
                      <option>Smallest Footprint</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                  {MODELS.map((model, idx) => (
                    <ModelCard key={idx} model={model} />
                  ))}
                </div>
              </>
            )}

            {/* Datasets View */}
            {activeTab === 'datasets' && (
              <>
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                    <Database className="w-5 h-5 text-gray-500" /> 
                    {DATASETS.length} Datasets
                  </h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
                  {DATASETS.map((ds, idx) => (
                    <DatasetCard key={idx} dataset={ds} />
                  ))}
                </div>
              </>
            )}

            {/* Community View (Coming Soon) */}
            {activeTab === 'community' && (
              <ComingSoon 
                title="Community & Leaderboards" 
                icon={<Users className="w-12 h-12 text-yellow-500" />} 
              />
            )}

            {/* Docs View (Coming Soon) */}
            {activeTab === 'docs' && (
              <ComingSoon 
                title="Documentation & SDKs" 
                icon={<BookOpen className="w-12 h-12 text-yellow-500" />} 
              />
            )}

          </div>
        </div>
      </div>
      
      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-12">
        <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
          <div className="md:flex md:items-center md:justify-between">
            <div className="flex justify-center md:justify-start space-x-6 md:order-2">
              <a href="#" className="text-gray-400 hover:text-gray-500">
                <Github className="h-6 w-6" />
              </a>
            </div>
            <div className="mt-8 md:mt-0 md:order-1">
              <p className="text-center text-base text-gray-400">
                &copy; 2024 TinyBioML Platform. Open Source.
              </p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}