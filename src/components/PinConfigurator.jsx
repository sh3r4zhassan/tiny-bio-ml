import React from 'react';

const PROTOCOLS = [
  { id: 'pdm', code: 0, label: 'PDM (Digital Microphone)', desc: 'Standard digital mic protocol', icon: '🎤' },
  { id: 'analog', code: 1, label: 'Analog', desc: 'Read via analogRead()', icon: '📊' },
  { id: 'i2c', code: 2, label: 'I2C', desc: 'Read from I2C sensor register', icon: '🔌' },
  { id: 'spi', code: 3, label: 'SPI', desc: 'Read from SPI device', icon: '⚡' },
];

export default function PinConfigurator({ config, onChange, mcus, boards, model }) {
  const update = (p) => onChange({ ...config, ...p });
  const selectedMcu = config.mcuKey ? mcus[config.mcuKey] : null;
  const selectedBoard = config.boardKey ? boards[config.boardKey] : null;
  const compatMcus = model?.details?.compatible_mcus;
  const onboardSensors = selectedBoard?.onboard || [];
  const isDefault = selectedBoard && onboardSensors.length > 0;

  // Determine if the selected input uses board defaults
  const sensorNeedsConfig = config.inputSource && !config.useDefault;

  return (
    <div className="space-y-4">
      {/* Step 1: MCU */}
      <div>
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">1. Select MCU</label>
        <select value={config.mcuKey || ''} onChange={(e) => update({ mcuKey: e.target.value, boardKey: null, inputSource: null, useDefault: false })}
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
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">2. Board</label>
          <select value={config.boardKey || ''} onChange={(e) => {
            const bk = e.target.value;
            const board = boards[bk];
            const hasOnboard = board?.onboard?.length > 0;
            update({ boardKey: bk, inputSource: null, useDefault: hasOnboard, sensorProtocol: 0 });
          }}
            className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-yellow-500 focus:border-yellow-500">
            <option value="">Choose board...</option>
            {Object.entries(selectedMcu.boards).map(([key, board]) => {
              const flatKey = `${config.mcuKey}__${key}`;
              return (
                <option key={flatKey} value={flatKey}>
                  {board.name} {board.onboard?.length > 0 ? `(${board.onboard.length} onboard sensors)` : '(custom — configure pins)'}
                </option>
              );
            })}
          </select>
          {selectedBoard?.onboard?.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {selectedBoard.onboard.map((s) => (
                <span key={s} className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded border border-blue-100">{s.replace(/_/g, ' ')}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Step 3: Input mode — Default or Custom */}
      {selectedBoard && (
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">3. Sensor Configuration</label>

          {/* If board has onboard sensors, offer default vs custom */}
          {onboardSensors.length > 0 ? (
            <div className="mt-1 space-y-1.5">
              <button onClick={() => update({ useDefault: true, inputSource: model?.sensor || 'pdm_microphone', sensorProtocol: 0 })}
                className={`w-full text-left p-3 rounded-lg border text-sm transition-all ${config.useDefault ? 'border-yellow-400 bg-yellow-50 ring-1 ring-yellow-400' : 'border-gray-200 hover:border-gray-300'}`}>
                <div className="flex items-center gap-2">
                  <span className="text-green-500 text-lg">✓</span>
                  <div>
                    <div className="font-medium text-gray-900 text-xs">Use board defaults</div>
                    <div className="text-[10px] text-gray-500">Onboard sensors on default pins — no wiring needed</div>
                  </div>
                </div>
              </button>
              <button onClick={() => update({ useDefault: false, inputSource: null, sensorProtocol: null })}
                className={`w-full text-left p-3 rounded-lg border text-sm transition-all ${!config.useDefault && config.useDefault !== undefined ? 'border-yellow-400 bg-yellow-50 ring-1 ring-yellow-400' : 'border-gray-200 hover:border-gray-300'}`}>
                <div className="flex items-center gap-2">
                  <span className="text-lg">🔧</span>
                  <div>
                    <div className="font-medium text-gray-900 text-xs">Custom pin configuration</div>
                    <div className="text-[10px] text-gray-500">Different board with same MCU — specify pins manually</div>
                  </div>
                </div>
              </button>
            </div>
          ) : (
            // No onboard sensors — go straight to custom config
            <div className="mt-1 p-2 bg-orange-50 border border-orange-200 rounded-lg text-xs text-orange-700">
              Custom board — configure sensor pins below
            </div>
          )}
        </div>
      )}

      {/* Step 4: Custom sensor config (protocol + pin) */}
      {selectedBoard && !config.useDefault && (
        <div className="space-y-3">
          {/* Protocol selection */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              {onboardSensors.length > 0 ? '4' : '4'}. How is the sensor connected?
            </label>
            <div className="mt-1 space-y-1.5">
              {PROTOCOLS.map((proto) => (
                <button key={proto.id} onClick={() => update({
                  sensorProtocol: proto.code,
                  inputSource: proto.id === 'pdm' ? 'pdm_microphone' : proto.id,
                  // Set sensible defaults per protocol
                  ...(proto.code === 0 ? { pdmClkPin: '26', pdmDataPin: '25', micGain: 20 } : {}),
                  ...(proto.code === 1 ? { pin: selectedBoard?.analog_pins?.[0] || 'A0', analogSampleHz: 16000 } : {}),
                  ...(proto.code === 2 ? { i2cAddress: '0x68', i2cSda: selectedBoard?.i2c_pins?.sda || 'A4', i2cScl: selectedBoard?.i2c_pins?.scl || 'A5' } : {}),
                })}
                  className={`w-full text-left p-2 rounded-lg border text-sm transition-all ${config.sensorProtocol === proto.code ? 'border-yellow-400 bg-yellow-50 ring-1 ring-yellow-400' : 'border-gray-200 hover:border-gray-300'}`}>
                  <div className="flex items-center gap-2">
                    <span>{proto.icon}</span>
                    <div>
                      <div className="font-medium text-gray-900 text-xs">{proto.label}</div>
                      <div className="text-[10px] text-gray-500">{proto.desc}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Pin config per protocol */}
          {config.sensorProtocol === 0 && (
            <div className="pl-4 border-l-2 border-yellow-300 space-y-2">
              <p className="text-xs text-gray-600">
                Specify the nRF52840 GPIO pin numbers for your PDM mic. Uses raw PDM peripheral — no Arduino PDM library.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-gray-500">CLK Pin (nRF GPIO)</label>
                  <input type="number" value={config.pdmClkPin || 26} onChange={(e) => update({ pdmClkPin: e.target.value })}
                    className="block w-full border border-gray-300 rounded px-2 py-1 text-xs font-mono" />
                </div>
                <div>
                  <label className="text-[10px] text-gray-500">DATA Pin (nRF GPIO)</label>
                  <input type="number" value={config.pdmDataPin || 25} onChange={(e) => update({ pdmDataPin: e.target.value })}
                    className="block w-full border border-gray-300 rounded px-2 py-1 text-xs font-mono" />
                </div>
              </div>
              <div>
                <label className="text-[10px] text-gray-500">Mic Gain (0-80)</label>
                <input type="number" value={config.micGain || 20} onChange={(e) => update({ micGain: parseInt(e.target.value) || 20 })}
                  className="block w-full border border-gray-300 rounded px-2 py-1 text-xs" min={0} max={80} />
              </div>
              <div className="text-[10px] text-gray-400 bg-gray-50 p-2 rounded">
                <span className="font-medium">Reference:</span> Nano 33 BLE onboard mic: CLK=26 (P0.26), DATA=25 (P0.25).
                For P1.x pins, add 32 (e.g., P1.0 = 32).
              </div>
            </div>
          )}

          {config.sensorProtocol === 1 && (
            <div className="pl-4 border-l-2 border-yellow-300 space-y-2">
              <div>
                <label className="text-xs text-gray-500">Analog Pin</label>
                <select value={config.pin || 'A0'} onChange={(e) => update({ pin: e.target.value })}
                  className="mt-0.5 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  {(selectedBoard?.analog_pins || ['A0','A1','A2','A3','A4','A5']).map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500">Sample Rate (Hz)</label>
                <input type="number" value={config.analogSampleHz || 16000}
                  onChange={(e) => update({ analogSampleHz: parseInt(e.target.value) || 16000 })}
                  className="mt-0.5 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
          )}

          {config.sensorProtocol === 2 && (
            <div className="pl-4 border-l-2 border-yellow-300 space-y-2">
              <div>
                <label className="text-xs text-gray-500">I2C Address (hex)</label>
                <input type="text" value={config.i2cAddress || '0x68'}
                  onChange={(e) => update({ i2cAddress: e.target.value })}
                  className="mt-0.5 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-gray-500">SDA Pin</label>
                  <input type="text" value={config.i2cSda || selectedBoard?.i2c_pins?.sda || 'A4'}
                    onChange={(e) => update({ i2cSda: e.target.value })}
                    className="block w-full border border-gray-300 rounded px-2 py-1 text-xs" />
                </div>
                <div>
                  <label className="text-[10px] text-gray-500">SCL Pin</label>
                  <input type="text" value={config.i2cScl || selectedBoard?.i2c_pins?.scl || 'A5'}
                    onChange={(e) => update({ i2cScl: e.target.value })}
                    className="block w-full border border-gray-300 rounded px-2 py-1 text-xs" />
                </div>
              </div>
              <div>
                <label className="text-[10px] text-gray-500">Register Address</label>
                <input type="text" value={config.i2cRegister || '0x00'}
                  onChange={(e) => update({ i2cRegister: e.target.value })}
                  className="block w-full border border-gray-300 rounded px-2 py-1 text-xs font-mono" />
              </div>
            </div>
          )}

          {config.sensorProtocol === 3 && (
            <div className="pl-4 border-l-2 border-yellow-300 space-y-2">
              <div>
                <label className="text-xs text-gray-500">CS Pin</label>
                <select value={config.spiCsPin || 'D10'} onChange={(e) => update({ spiCsPin: e.target.value })}
                  className="mt-0.5 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  {(selectedBoard?.digital_pins || ['D10','D9','D8']).map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
