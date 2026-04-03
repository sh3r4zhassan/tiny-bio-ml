import React from 'react';

export default function PinConfigurator({ config, onChange, mcus, boards, model }) {
  const update = (p) => onChange({ ...config, ...p });
  const selectedMcu = config.mcuKey ? mcus[config.mcuKey] : null;
  const selectedBoard = config.boardKey ? boards[config.boardKey] : null;

  // Filter MCUs compatible with this model
  const compatMcus = model?.details?.compatible_mcus;

  // Input sources based on board's onboard sensors
  const onboardSensors = selectedBoard?.onboard || [];
  const inputSources = [
    ...(onboardSensors.includes('pdm_mic') ? [{ id: 'pdm_microphone', icon: '🎤', label: 'Onboard Microphone', desc: 'PDM mic — audio/keyword detection' }] : []),
    ...(onboardSensors.includes('imu_lsm9ds1') || onboardSensors.includes('imu_lsm6ds3') ? [{ id: 'imu', icon: '📐', label: 'Onboard IMU', desc: 'Accelerometer + Gyroscope' }] : []),
    { id: 'analog', icon: '📊', label: 'Analog Pin', desc: 'ECG, EMG, PPG, temperature sensor' },
    { id: 'digital', icon: '🔢', label: 'Digital Pin', desc: 'On/off sensors, buttons' },
    { id: 'i2c', icon: '🔌', label: 'I2C Sensor', desc: 'External I2C device (specify address)' },
  ];

  return (
    <div className="space-y-4">
      {/* Step 1: MCU */}
      <div>
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">1. Select MCU</label>
        <select value={config.mcuKey || ''} onChange={(e) => update({ mcuKey: e.target.value, boardKey: null, inputSource: null })}
          className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-yellow-500 focus:border-yellow-500">
          <option value="">Choose MCU...</option>
          {Object.entries(mcus).map(([key, mcu]) => (
            <option key={key} value={key} disabled={compatMcus && !compatMcus.includes(key)}>
              {mcu.name} — {mcu.flash_kb}KB Flash, {mcu.ram_kb}KB RAM
              {compatMcus && !compatMcus.includes(key) ? ' (incompatible)' : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Step 2: Board Preset */}
      {selectedMcu && (
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">2. Board Preset</label>
          <select value={config.boardKey || ''} onChange={(e) => {
            const bk = e.target.value;
            const board = boards[bk];
            const defaultInput = board?.onboard?.includes('pdm_mic') && model?.sensor === 'pdm_microphone'
              ? 'pdm_microphone'
              : model?.sensor || 'analog';
            update({ boardKey: bk, inputSource: defaultInput });
          }}
            className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-yellow-500 focus:border-yellow-500">
            <option value="">Choose board...</option>
            {Object.entries(selectedMcu.boards).map(([key, board]) => {
              const flatKey = `${config.mcuKey}__${key}`;
              return (
                <option key={flatKey} value={flatKey}>
                  {board.name}
                  {board.onboard?.length > 0 ? ` (${board.onboard.length} onboard sensors)` : ' (no onboard sensors)'}
                </option>
              );
            })}
          </select>
          {selectedBoard && selectedBoard.onboard?.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {selectedBoard.onboard.map((s) => (
                <span key={s} className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded border border-blue-100">{s.replace('_', ' ')}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Step 3: Input Source */}
      {selectedBoard && (
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">3. Input Source</label>
          <div className="mt-1 space-y-1.5">
            {inputSources.map((src) => (
              <button key={src.id} onClick={() => update({
                inputSource: src.id,
                pin: src.id === 'analog' ? (selectedBoard.analog_pins?.[0] || 'A0')
                   : src.id === 'digital' ? (selectedBoard.digital_pins?.[0] || 'D2')
                   : config.pin,
              })}
                className={`w-full text-left p-2 rounded-lg border text-sm transition-all ${
                  config.inputSource === src.id
                    ? 'border-yellow-400 bg-yellow-50 ring-1 ring-yellow-400'
                    : 'border-gray-200 hover:border-gray-300'
                }`}>
                <span className="text-base mr-2">{src.icon}</span>
                <span className="font-medium text-gray-900 text-xs">{src.label}</span>
                <span className="text-[10px] text-gray-500 ml-1">— {src.desc}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 3b: Pin details */}
      {config.inputSource === 'analog' && selectedBoard && (
        <div className="pl-4 border-l-2 border-yellow-300 space-y-2">
          <div>
            <label className="text-xs text-gray-500">Analog Pin</label>
            <select value={config.pin} onChange={(e) => update({ pin: e.target.value })}
              className="mt-0.5 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              {(selectedBoard.analog_pins || []).map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500">Sample Rate</label>
            <div className="flex items-center gap-2">
              <input type="number" value={config.sampleRateMs} onChange={(e) => update({ sampleRateMs: parseInt(e.target.value) || 10 })}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm" min={1} max={10000} />
              <span className="text-xs text-gray-400 w-16">{(1000 / (config.sampleRateMs || 10)).toFixed(0)} Hz</span>
            </div>
          </div>
        </div>
      )}

      {config.inputSource === 'digital' && selectedBoard && (
        <div className="pl-4 border-l-2 border-yellow-300">
          <label className="text-xs text-gray-500">Digital Pin</label>
          <select value={config.pin} onChange={(e) => update({ pin: e.target.value })}
            className="mt-0.5 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
            {(selectedBoard.digital_pins || []).map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      )}

      {config.inputSource === 'imu' && (
        <div className="pl-4 border-l-2 border-yellow-300 space-y-1">
          {[{ v: 3, l: 'Accelerometer only (3 axes)' }, { v: 6, l: 'Accel + Gyro (6 axes)' }].map((o) => (
            <label key={o.v} className="flex items-center gap-2 p-2 rounded border border-gray-200 text-xs cursor-pointer hover:bg-gray-50">
              <input type="radio" checked={config.imuFeatures === o.v} onChange={() => update({ imuFeatures: o.v })}
                className="text-yellow-500" />
              {o.l}
            </label>
          ))}
        </div>
      )}

      {config.inputSource === 'i2c' && (
        <div className="pl-4 border-l-2 border-yellow-300">
          <label className="text-xs text-gray-500">I2C Address (hex)</label>
          <input type="text" value={config.i2cAddress || '0x68'} onChange={(e) => update({ i2cAddress: e.target.value })}
            className="mt-0.5 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono" />
          <p className="text-[10px] text-gray-400 mt-0.5">MPU6050=0x68, ADS1115=0x48, MAX30102=0x57</p>
        </div>
      )}
    </div>
  );
}
