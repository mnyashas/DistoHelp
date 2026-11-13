import { useEffect, useRef, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts';
import { Activity, Bluetooth, Check, Play, Square, Volume2, VolumeX, X } from 'lucide-react';
import { api } from '../services/api.js';
import { Spinner } from '../components/ui.jsx';
import { connectBLE } from '../sensors/ble.js';

const LOINC_KEY = { '8867-4': 'hr', '2708-6': 'spo2', '9279-1': 'rr', '8310-5': 'temp', '8480-6': 'bpSys', '8462-4': 'bpDia' };
const WS_PATH = '/ws/live';

export function wsUrlForLive() {
  const base = import.meta.env.VITE_WS_URL || import.meta.env.VITE_API_URL || '';
  if (base) {
    return base.replace(/^http/, 'ws').replace(/\/$/, '') + WS_PATH;
  }
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}${WS_PATH}`;
}

export default function Live({ patientId }) {
  const [patient, setPatient] = useState(null);
  const [vitals, setVitals] = useState(null);
  const [wave, setWave] = useState([]);
  const [alertsFeed, setAlertsFeed] = useState([]);
  const [running, setRunning] = useState(true);
  const [sound, setSound] = useState(true);
  const [bleStatus, setBleStatus] = useState('');
  const audioCtx = useRef(null);

  useEffect(() => {
    api(`/patients/${patientId}`)
      .then((d) => setPatient({ id: d.id, fullName: d.fullName, age: d.age, gender: d.gender, conditions: d.conditions }))
      .catch(() => {});
    api(`/alerts?patient_id=${encodeURIComponent(patientId)}&status=active&limit=10`)
      .then((d) => setAlertsFeed((d.alerts || []).map((a) => ({ ...a, patient_name: a.patient_name || patientId }))))
      .catch(() => {});
  }, [patientId]);

  // WebSocket live feed — single patient
  useEffect(() => {
    let ws, retry;
    const connect = () => {
      const wsUrl = wsUrlForLive();
      ws = new WebSocket(wsUrl);
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === 'vital') {
            const d = msg.data;
            if (d.patient_id !== patientId || !LOINC_KEY[d.loinc]) return;
            setVitals((v) => ({
              ...(v || {}),
              [LOINC_KEY[d.loinc]]: d.value,
              score: d.score?.total,
              level: d.score?.level,
              scale: d.score?.spo2_scale,
              at: new Date().toISOString(),
            }));
            setWave((arr) => {
              const t = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
              const key = LOINC_KEY[d.loinc];
              const next = [...arr];
              const last = next[next.length - 1];
              if (last && last.t === t) {
                next[next.length - 1] = { ...last, [key]: d.value, score: d.score?.total ?? last.score };
              } else {
                next.push({ t, [key]: d.value, score: d.score?.total ?? 0 });
              }
              return next.slice(-90);
            });
          } else if (msg.type === 'alert') {
            const a = msg.data;
            if (a.patient_id !== patientId) return;
            setAlertsFeed((f) => [a, ...f].slice(0, 10));
            beep(a.level);
            if (navigator.vibrate && a.level === 'urgent') navigator.vibrate([400, 150, 400, 150, 400]);
          }
        } catch { /* ignore */ }
      };
      ws.onclose = () => { retry = setTimeout(connect, 1500); };
    };
    connect();
    return () => { clearTimeout(retry); ws && ws.close(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  const beep = (level) => {
    if (!sound) return;
    try {
      audioCtx.current ||= new (window.AudioContext || window.webkitAudioContext)();
      const ctx = audioCtx.current;
      const tones = level === 'urgent' ? [880, 660, 880, 660] : [660, 880];
      tones.forEach((f, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = f;
        o.connect(g); g.connect(ctx.destination);
        const t = ctx.currentTime + i * 0.35;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.25, t + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
        o.start(t); o.stop(t + 0.32);
      });
    } catch { /* audio unavailable */ }
  };

  const [scenario, setScenario] = useState('low_bp');

  const startDemo = async () => {
    await api(`/simulator/${patientId}/start`, { method: 'POST', body: { scenario, rate_per_minute: 120 } }).catch(() => {});
    setRunning(true);
  };
  const stopDemo = async () => {
    await api(`/simulator/${patientId}/stop`, { method: 'POST' }).catch(() => {});
    setRunning(false);
  };
  const ack = async (id) => { await api(`/alerts/${id}/ack`, { method: 'POST' }).catch(() => {}); setAlertsFeed((f) => f.filter((a) => a.id !== id)); };
  const resolve = async (id) => { await api(`/alerts/${id}/resolve`, { method: 'POST' }).catch(() => {}); setAlertsFeed((f) => f.filter((a) => a.id !== id)); };

  const connectWearable = async () => {
    setBleStatus('Connecting…');
    try {
      await connectBLE((reading) => {
        api('/sensors/readings', {
          method: 'POST',
          headers: { 'x-device-key': 'demo-esp32-key' },
          body: { patient_id: patientId, vitals: reading },
        }).catch(() => {});
      });
      setBleStatus(`Wearable streaming → ${patientId}`);
    } catch (e) {
      setBleStatus(e.message || 'Bluetooth unavailable');
    }
  };

  if (!patient) return <Spinner />;
  const lvl = vitals?.level || 'none';

  return (
    <div className="space-y-5">
      {/* compact controls */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-gray-700">
          {patient.fullName} <span className="font-normal text-gray-400">· {patient.id}</span>
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs font-semibold text-gray-600"
            value={scenario}
            onChange={(e) => setScenario(e.target.value)}
            title="Scenario to run"
          >
            <option value="low_bp">Simulate: Low BP (hypotension)</option>
            <option value="slow_deterioration">Simulate: Slow deterioration</option>
            <option value="sudden_spike">Simulate: Sudden spike</option>
            <option value="probe_removal">Simulate: Probe removal</option>
            <option value="stable_recovery">Simulate: Stable recovery</option>
          </select>
          {!running ? (
            <button className="btn-primary !h-9 px-3" onClick={startDemo}><Play size={15} /> Start</button>
          ) : (
            <button className="btn-ghost !h-9 !border-red-300 !text-red-600" onClick={stopDemo}><Square size={15} /> Stop sim</button>
          )}
          <button className="btn-ghost !h-9" onClick={() => setSound((s) => !s)} title="Toggle alert chime">
            {sound ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>
          <button className="btn-ghost !h-9" onClick={connectWearable}><Bluetooth size={16} /> BLE</button>
        </div>
      </div>
      {bleStatus && <p className="text-xs text-gray-500">{bleStatus}</p>}

      {/* live waveform */}
      <div className="card">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-bold"><Activity className="text-brand-500" size={18} /> Live telemetry</h2>
          <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-emerald-700">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" /> always on
          </span>
        </div>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={wave} margin={{ top: 5, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="t" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
              <YAxis yAxisId="l" domain={['dataMin - 10', 'dataMax + 10']} tick={{ fontSize: 9 }} />
              <YAxis yAxisId="r" orientation="right" domain={[80, 100]} tick={{ fontSize: 9 }} />
              <Tooltip />
              <Legend verticalAlign="top" iconSize={10} wrapperStyle={{ fontSize: 11 }} />
              <ReferenceLine yAxisId="l" y={120} stroke="#e11d48" strokeDasharray="4 4" />
              <Line yAxisId="l" type="monotone" dataKey="hr" name="HR bpm" stroke="#0f766e" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line yAxisId="l" type="monotone" dataKey="rr" name="RR /min" stroke="#f97316" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line yAxisId="l" type="monotone" dataKey="temp" name="Temp °C" stroke="#a855f7" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line yAxisId="r" type="monotone" dataKey="spo2" name="SpO₂ %" stroke="#0ea5e9" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* vitals tile + score */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Cell label="HR" value={vitals?.hr != null ? Number(vitals.hr).toFixed(0) : null} unit="bpm" />
        <Cell label="SpO₂" value={vitals?.spo2 != null ? Number(vitals.spo2).toFixed(1) : null} unit="%" alert={vitals?.spo2 != null && vitals.spo2 < 92} />
        <Cell label="RR" value={vitals?.rr != null ? Number(vitals.rr).toFixed(0) : null} unit="/min" />
        <Cell label="BP" value={vitals?.bpSys != null ? `${Number(vitals.bpSys).toFixed(0)}/${vitals?.bpDia != null ? Number(vitals.bpDia).toFixed(0) : '––'}` : null} unit="mmHg" alert={vitals?.bpSys != null && vitals.bpSys <= 88} />
        <Cell label="NEWS2" value={vitals?.score != null ? vitals.score : null} unit={lvl} alert={lvl === 'urgent'} />
      </div>

      {/* alert stream, scoped */}
      <div className="card">
        <h2 className="mb-2 flex items-center gap-2 font-bold"><Activity size={18} className="text-brand-500" /> Alerts</h2>
        {alertsFeed.length === 0 ? (
          <p className="text-sm text-gray-500">No active alerts.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {alertsFeed.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <div className="flex min-w-0 items-center gap-2">
                  <LevelChip level={a.level} total={a.score_total} />
                  <span className="truncate text-gray-600">{a.explanation}</span>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => ack(a.id)} title="Acknowledge"><Check size={14} /></button>
                  <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => resolve(a.id)} title="Resolve"><X size={14} /></button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Cell({ label, value, unit, alert }) {
  return (
    <div className={`rounded-xl border p-3 text-center ${alert ? 'border-red-300 bg-red-50' : 'border-gray-100 bg-gray-50'}`}>
      <p className="text-[10px] font-semibold uppercase text-gray-500">{label}</p>
      <p className={`text-2xl font-extrabold tabular-nums ${alert ? 'text-red-600' : 'text-gray-900'}`}>{value ?? '––'}</p>
      <p className="text-[10px] text-gray-400">{unit}</p>
    </div>
  );
}

function LevelChip({ level, total }) {
  const map = {
    none: 'bg-emerald-100 text-emerald-800', watch: 'bg-yellow-100 text-yellow-800',
    review: 'bg-orange-100 text-orange-800', urgent: 'bg-red-100 text-red-800',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest ${map[level] || map.none}`}>
      {level}{total != null && <b className="text-xs">{total}</b>}
    </span>
  );
}
