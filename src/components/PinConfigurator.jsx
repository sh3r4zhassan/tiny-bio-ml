/**
 * PinConfigurator — Select input source and pin configuration
 * Supports: onboard mic, onboard IMU, analog pins, digital pins, I2C
 */

import React from 'react';
import { Radio, Cpu, Mic, Activity, Settings } from 'lucide-react';

const INPUT_SOURCES = [
  {
    id: 'pdm_microphone',
    label: 'Onboard Microphone',
    icon: '🎤',
    description: 'PDM mic — audio classification, keyword spotting',
    boards: ['arduino_nano_33_ble'], // only boards that have it
    needsPin: false,
  },
  {
    id: 'imu',
    label: 'Onboard IMU (Accelerometer + Gyro)',
    icon: '📐',
    description: 'LSM9DS1 — gesture recognition, motion detection',
    boards: ['arduino_nano_33_ble'],
    needsPin: false,
    options: [
      { id: 'accel', label: 'Accelerometer only (3 axes)', features: 3 },
      { id: 'accel_gyro', label: 'Accel + Gyro (6 axes)', features: 6 },
    ],
  },
  {
    id: 'analog',
    label: 'Analog Pin',
    icon: '📊',
    description: 'ECG, EMG, PPG, temperature, any analog sensor',
    boards: ['arduino_nano_33_ble', 'esp32', 'arduino_nano_classic'],
    needsPin: true,
    pinType: 'analog',
  },
  {
    id: 'digital',
    label: 'Digital Pin',
    icon: '🔢',
    description: 'On/off sensors, buttons, interrupt-driven input',
    boards: ['arduino_nano_33_ble', 'esp32', 'arduino_nano_classic'],
    needsPin: true,
    pinType: 'digital',
  },
  {
    id: 'i2c',
    label: 'I2C Sensor',
    icon: '🔌',
    description: 'External I2C sensors (specify address)',
    boards: ['arduino_nano_33_ble', 'esp32', 'arduino_nano_classic'],
    needsPin: false,
    needsAddress: true,
  },
];

export default function PinConfigurator({ config, onChange, board, boardKey }) {
  const selectedSource = INPUT_SOURCES.find(s => s.id === config.inputSource) || null;
  const availableSources = INPUT_SOURCES.filter(
    s => s.boards.includes(boardKey)
  );

  const update = (partial) => onChange({ ...config, ...partial });

  return (
    <div className="space-y-3">
      {/* Input Source Selection */}
      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
        3. Input Source
      </label>
      <div className="space-y-1.5">
        {availableSources.map((source) => (
          <button
            key={source.id}
            onClick={() => update({
              inputSource: source.id,
              pin: source.needsPin ? (board?.[source.pinType + '_pins']?.[0] || 'A0') : null,
              pinMode: source.pinType || null,
            })}
            className={`w-full text-left p-2.5 rounded-lg border text-sm transition-all ${
              config.inputSource === source.id
                ? 'border-yellow-400 bg-yellow-50 ring-1 ring-yellow-400'
                : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="text-base">{source.icon}</span>
              <div>
                <div className="font-medium text-gray-900 text-xs">{source.label}</div>
                <div className="text-[10px] text-gray-500">{source.description}</div>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Pin selector — shown for analog/digital */}
      {selectedSource?.needsPin && board && (
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Pin
          </label>
          <select
            value={config.pin || ''}
            onChange={(e) => update({ pin: e.target.value })}
            className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-yellow-500 focus:border-yellow-500"
          >
            {(board[selectedSource.pinType + '_pins'] || []).map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
      )}

      {/* IMU options */}
      {selectedSource?.id === 'imu' && selectedSource.options && (
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            IMU Mode
          </label>
          <div className="mt-1 space-y-1">
            {selectedSource.options.map((opt) => (
              <label key={opt.id} className="flex items-center gap-2 p-2 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer text-sm">
                <input
                  type="radio"
                  name="imu_mode"
                  checked={(config.imuFeatures || 3) === opt.features}
                  onChange={() => update({ imuFeatures: opt.features })}
                  className="text-yellow-500 focus:ring-yellow-400"
                />
                {opt.label}
              </label>
            ))}
          </div>
        </div>
      )}

      {/* I2C address */}
      {selectedSource?.needsAddress && (
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            I2C Address (hex)
          </label>
          <input
            type="text"
            value={config.i2cAddress || '0x68'}
            onChange={(e) => update({ i2cAddress: e.target.value })}
            placeholder="0x68"
            className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-yellow-500 focus:border-yellow-500"
          />
          <p className="text-[10px] text-gray-400 mt-0.5">Common: MPU6050=0x68, ADS1115=0x48, MAX30102=0x57</p>
        </div>
      )}

      {/* Sample Rate — shown for all except mic (which is fixed at 16kHz) */}
      {config.inputSource && config.inputSource !== 'pdm_microphone' && (
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Sample Rate
          </label>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="number"
              value={config.sampleRateMs || 10}
              onChange={(e) => update({ sampleRateMs: parseInt(e.target.value) || 10 })}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-yellow-500 focus:border-yellow-500"
              min={1}
              max={10000}
            />
            <span className="text-xs text-gray-500 w-20">ms ({(1000 / (config.sampleRateMs || 10)).toFixed(0)} Hz)</span>
          </div>
        </div>
      )}
    </div>
  );
}
