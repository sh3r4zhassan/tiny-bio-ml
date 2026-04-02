/**
 * useWebSerial — React hook for browser ↔ microcontroller communication
 * 
 * Uses the WebSerial API (Chrome/Edge only) to:
 *   1. Connect to an Arduino/ESP32 over USB
 *   2. Read serial output (inference results)
 *   3. Send commands
 *   4. Flash compiled firmware binaries
 */

import { useState, useRef, useCallback, useEffect } from 'react';

// Common USB vendor IDs for supported boards
const KNOWN_BOARDS = {
  0x2341: 'Arduino',
  0x1A86: 'CH340 (Arduino Clone)',
  0x10C4: 'CP2102 (ESP32)',
  0x0403: 'FTDI',
  0x239A: 'Adafruit',
  0x1366: 'Nordic Semiconductor',
};

export function useWebSerial() {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [deviceInfo, setDeviceInfo] = useState(null);
  const [serialOutput, setSerialOutput] = useState([]);
  const [error, setError] = useState(null);

  const portRef = useRef(null);
  const readerRef = useRef(null);
  const readLoopRef = useRef(false);
  const onDataCallbackRef = useRef(null);

  // Check if WebSerial is supported
  const isSupported = typeof navigator !== 'undefined' && 'serial' in navigator;

  /**
   * Request and open a serial port connection
   */
  const connect = useCallback(async (baudRate = 115200) => {
    if (!isSupported) {
      setError('WebSerial is not supported in this browser. Use Chrome or Edge.');
      return false;
    }

    setIsConnecting(true);
    setError(null);

    try {
      // Request a port — this shows the browser's device picker dialog
      const port = await navigator.serial.requestPort({
        // Filter for known microcontroller vendors
        filters: Object.keys(KNOWN_BOARDS).map(vid => ({
          usbVendorId: parseInt(vid),
        })),
      });

      // Get device info before opening
      const info = port.getInfo();
      const vendorName = KNOWN_BOARDS[info.usbVendorId] || 'Unknown';

      await port.open({ baudRate });

      portRef.current = port;
      setIsConnected(true);
      setDeviceInfo({
        vendorId: info.usbVendorId,
        productId: info.usbProductId,
        vendorName,
        baudRate,
      });

      // Start reading
      _startReading(port);

      return true;
    } catch (err) {
      if (err.name === 'NotFoundError') {
        setError('No device selected. Please try again and select your board.');
      } else if (err.name === 'SecurityError') {
        setError('Permission denied. This page must be served over HTTPS or localhost.');
      } else {
        setError(`Connection failed: ${err.message}`);
      }
      return false;
    } finally {
      setIsConnecting(false);
    }
  }, [isSupported]);

  /**
   * Disconnect from the serial port
   */
  const disconnect = useCallback(async () => {
    readLoopRef.current = false;

    if (readerRef.current) {
      try {
        await readerRef.current.cancel();
        readerRef.current.releaseLock();
      } catch (e) {
        // Reader may already be released
      }
      readerRef.current = null;
    }

    if (portRef.current) {
      try {
        await portRef.current.close();
      } catch (e) {
        // Port may already be closed
      }
      portRef.current = null;
    }

    setIsConnected(false);
    setDeviceInfo(null);
  }, []);

  /**
   * Send a string to the device
   */
  const sendData = useCallback(async (data) => {
    if (!portRef.current || !isConnected) {
      setError('Not connected to a device');
      return;
    }

    try {
      const writer = portRef.current.writable.getWriter();
      const encoder = new TextEncoder();
      await writer.write(encoder.encode(data + '\n'));
      writer.releaseLock();
    } catch (err) {
      setError(`Send failed: ${err.message}`);
    }
  }, [isConnected]);

  /**
   * Send raw binary data (for firmware flashing)
   */
  const sendBinary = useCallback(async (buffer) => {
    if (!portRef.current || !isConnected) {
      setError('Not connected to a device');
      return;
    }

    try {
      const writer = portRef.current.writable.getWriter();
      const CHUNK_SIZE = 256;
      const total = buffer.byteLength;
      let sent = 0;

      while (sent < total) {
        const chunk = buffer.slice(sent, sent + CHUNK_SIZE);
        await writer.write(new Uint8Array(chunk));
        sent += chunk.byteLength;
        // Small delay between chunks to avoid overwhelming the bootloader
        await new Promise(r => setTimeout(r, 5));
      }

      writer.releaseLock();
      return true;
    } catch (err) {
      setError(`Binary send failed: ${err.message}`);
      return false;
    }
  }, [isConnected]);

  /**
   * Set a callback for incoming data
   */
  const onData = useCallback((callback) => {
    onDataCallbackRef.current = callback;
  }, []);

  /**
   * Clear the serial output buffer
   */
  const clearOutput = useCallback(() => {
    setSerialOutput([]);
  }, []);

  /**
   * Internal: start the read loop
   */
  const _startReading = async (port) => {
    readLoopRef.current = true;
    const decoder = new TextDecoder();
    let lineBuffer = '';

    while (readLoopRef.current && port.readable) {
      try {
        const reader = port.readable.getReader();
        readerRef.current = reader;

        while (readLoopRef.current) {
          const { value, done } = await reader.read();
          if (done) break;

          const text = decoder.decode(value, { stream: true });
          lineBuffer += text;

          // Process complete lines
          const lines = lineBuffer.split('\n');
          lineBuffer = lines.pop() || ''; // Keep incomplete line in buffer

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            const entry = {
              timestamp: Date.now(),
              raw: trimmed,
              parsed: null,
            };

            // Try to parse JSON (our firmware outputs JSON)
            try {
              entry.parsed = JSON.parse(trimmed);
            } catch {
              // Not JSON — just a log line
            }

            setSerialOutput(prev => [...prev.slice(-200), entry]); // Keep last 200 lines
            onDataCallbackRef.current?.(entry);
          }
        }

        reader.releaseLock();
      } catch (err) {
        if (readLoopRef.current) {
          console.error('Serial read error:', err);
          // Try to reconnect on non-fatal errors
          await new Promise(r => setTimeout(r, 1000));
        }
      }
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      readLoopRef.current = false;
      disconnect();
    };
  }, [disconnect]);

  return {
    // State
    isSupported,
    isConnected,
    isConnecting,
    deviceInfo,
    serialOutput,
    error,

    // Actions
    connect,
    disconnect,
    sendData,
    sendBinary,
    onData,
    clearOutput,
  };
}

export default useWebSerial;
