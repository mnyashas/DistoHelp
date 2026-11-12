import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Radio } from 'lucide-react';
import { api } from '../services/api.js';
import { fmt } from '../services/format.js';
import { simulateReading } from './simulator.js';

const MODES = [
  { id: 'manual', label: 'Manual entry' },
  { id: 'simulated', label: 'Simulated sensor' },
  { id: 'esp32', label: 'ESP32 Wi-Fi sensor' },
];

export default function SensorPanel({ patient, onReading }) {
  const [mode, setMode] = useState('manual');
  const [connected, setConnected] = useState(false);
  const [lastTs, setLastTs] = useState(null);
  const [alert, setAlert] = useState(false);
  const wasConnected = useRef(false);
  const latest = patient.records.at(-1)?.vitals;

  useEffect(() => {
    wasConnected.current = false;
    setAlert(false);
    setConnected(false);
    setLastTs(null);

    if (mode === 'simulated') {
      const tick = () => {
        onReading(simulateReading(latest), 'simulated');
        setConnected(true);
        setLastTs(new Date().toISOString());
      };
      tick();
      const id = setInterval(tick, 3000);
      return () => clearInterval(id);
    }

    if (mode === 'esp32') {
      const poll = async () => {
        try {
          const d = await api(`/sensors/${patient.id}/latest`);
          if (d.connected && d.reading) {
            wasConnected.current = true;
            setConnected(true);
            setAlert(false);
            setLastTs(d.reading.timestamp);
            onReading(d.reading.vitals, 'sensor');
          } else {
            setConnected(false);
            if (wasConnected.current) setAlert(true);
          }
        } catch {
          setConnected(false);
          if (wasConnected.current) setAlert(true);
        }
      };
      poll();
      const id = setInterval(poll, 2000);
      return () => clearInterval(id);
    }
  }, [mode, patient.id]);

  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Radio size={18} className="text-teal-500" />
          <h3 className="font-semibold">REAL-TIME SENSOR MONITORING</h3>
        </div>
        <div className="flex flex-wrap rounded-xl bg-slate-100 p-1">
          {MODES.map((m) => (
            <button key={m.id} onClick={() => setMode(m.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                mode === m.id ? 'bg-white text-navy-900 shadow' : 'text-slate-500'
              }`}>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4 text-xs">
        <span className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${connected ? 'animate-pulse bg-green-500' : 'bg-slate-300'}`} />
          {mode === 'manual' ? 'Manual input active' : connected ? 'Connected' : 'Not connected'}
        </span>
        {lastTs && <span className="text-slate-500">Last data: {fmt(lastTs)}</span>}
        {mode === 'simulated' && (
          <span className="rounded bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">
            SIMULATED values for testing only, not a medical measurement
          </span>
        )}
        {mode === 'esp32' && (
          <span className="text-slate-500">
            Device posts to /api/sensors/readings with the x-device-key header.
          </span>
        )}
      </div>

      {alert && (
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          <AlertTriangle size={18} />
          Sensor disconnected. Check device power and Wi-Fi. Manual entry remains available.
        </div>
      )}
    </div>
  );
}