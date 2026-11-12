import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, AudioLines, Play, Square, TrendingDown, TrendingUp, Minus, Check, X, Volume2, VolumeX, Bluetooth, HeartPulse } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts';
import { api } from '../services/api.js';
import { RISK, Spinner } from '../components/ui.jsx';
import { fmt } from '../services/format.js';
import { connectBLE } from '../sensors/ble.js';

const LOINC_KEY = { '8867-4': 'hr', '2708-6': 'spo2', '9279-1': 'rr', '8310-5': 'temp' };

export default function Live() {
  const [patients, setPatients] = useState([]);
  const [vitals, setVitals] = useState({});
  const [history, setHistory] = useState({});
  const [wave, setWave] = useState({});          // time-series points per patient (for charts)
  const [chartPid, setChartPid] = useState('p02');
  const [alertsFeed, setAlertsFeed] = useState([]);
  const [latestAlert, setLatestAlert] = useState(null);
  const [running, setRunning] = useState(true);
  const [sound, setSound] = useState(true);
  const [bleStatus, setBleStatus] = useState('');
  const audioCtx = useRef(null);

  useEffect(() => {
    api('/patients').then(setPatients).catch(() => {});
  }, []);

  // WebSocket live feed
  useEffect(() => {
    let ws, retry;
    const connect = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      ws = new WebSocket(`${proto}://${location.host}/ws/live`);
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === 'vital') {
            const d = msg.data;
            if (!d.patient_id || !LOINC_KEY[d.loinc]) return;
            setVitals((v) => ({
              ...v,
              [d.patient_id]: {
                ...(v[d.patient_id] || {}),
                [LOINC_KEY[d.loinc]]: d.value,
                score: d.score?.total,
                level: d.score?.level,
                scale: d.score?.spo2_scale,
                at: new Date().toISOString(),
              },
            }));
            setHistory((h) => {
              const s = d.score?.total ?? 0;
              const arr = [...(h[d.patient_id] || []), s].slice(-40);
              return { ...h, [d.patient_id]: arr };
            });
            setWave((w) => {
              const t = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
              const arr = [...(w[d.patient_id] || [])];
              const key = LOINC_KEY[d.loinc];
              const last = arr[arr.length - 1];
              if (last && last.t === t) {
                arr[arr.length - 1] = { ...last, [key]: d.value, score: d.score?.total ?? last.score };
              } else {
                arr.push({ t, [key]: d.value, score: d.score?.total ?? 0 });
              }
              return { ...w, [d.patient_id]: arr.slice(-120) };
            });
          } else if (msg.type === 'alert') {
            const a = msg.data;
            setAlertsFeed((f) => [a, ...f].slice(0, 25));
            setLatestAlert(a);
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
  }, []);

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

  const startDemo = async () => {
    await api('/simulator/p02/start', { method: 'POST', body: { scenario: 'slow_deterioration', rate_per_minute: 120 } }).catch(() => {});
    await api('/simulator/p04/start', { method: 'POST', body: { scenario: 'probe_removal', rate_per_minute: 120 } }).catch(() => {});
    setRunning(true);
  };
  const stopDemo = async () => {
    await api('/simulator/p02/stop', { method: 'POST' }).catch(() => {});
    await api('/simulator/p04/stop', { method: 'POST' }).catch(() => {});
    await api('/simulator/p03/stop', { method: 'POST' }).catch(() => {});
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
          body: { patient_id: 'p02', vitals: reading },
        }).catch(() => {});
      });
      setBleStatus('Wearable streaming → patient p02');
    } catch (e) {
      setBleStatus(e.message || 'Bluetooth unavailable — will not affect UI demo');
    }
  };

  if (!patients.length) return <Spinner />;

  const levelOf = (v) => v?.level || 'none';

  return (
    <div className="space-y-6">
      {/* header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <AudioLines className="text-teal-500" /> Live Monitoring
            <span className="ml-2 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
              ALWAYS ON
            </span>
          </h1>
          <p className="text-sm text-slate-500">Real-time telemetry from wearables — artifact-filtered, personalized, explained · streams run continuously from server boot</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!running ? (
            <button className="btn-primary" onClick={startDemo}><Play size={16} /> Boost streams</button>
          ) : (
            <button className="btn-primary !from-red-500 !to-rose-500" onClick={stopDemo}><Square size={16} /> Stop streams</button>
          )}
          <button className="btn-ghost" onClick={() => setSound((s) => !s)} title="Toggle alert chime">
            {sound ? <Volume2 size={16} /> : <VolumeX size={16} />} {sound ? 'Sound on' : 'Muted'}
          </button>
          <button className="btn-ghost" onClick={connectWearable}><Bluetooth size={16} /> Connect BLE band</button>
          <Link to="/watch?p=p02" className="btn-ghost">⌚ Watch mode</Link>
        </div>
      </div>
      {bleStatus && <p className="text-xs text-slate-500">{bleStatus}</p>}

      {/* urgent banner */}
      {latestAlert && (latestAlert.level === 'urgent' || latestAlert.level === 'review') && (
        <div className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 p-4 ${
          latestAlert.level === 'urgent' ? 'border-red-400 bg-red-50' : 'border-orange-300 bg-orange-50'}`}>
          <div className="flex items-center gap-3">
            <span className={`grid h-11 w-11 place-items-center rounded-xl font-black text-white ${latestAlert.level === 'urgent' ? 'bg-red-500 animate-pulse' : 'bg-orange-500'}`}>
              {latestAlert.level === 'urgent' ? '!' : '!'}
            </span>
            <div>
              <p className="font-bold text-navy-900">{latestAlert.patient_name} — {latestAlert.level.toUpperCase()} alert · NEWS2 {latestAlert.score_total}</p>
              <p className="text-xs text-slate-600 line-clamp-1">{latestAlert.explanation}</p>
            </div>
          </div>
          <button className="btn-ghost bg-white" onClick={() => ack(latestAlert.id)}><Check size={16} /> Acknowledge</button>
        </div>
      )}

      {/* live waveforms */}
      <LiveWaveforms wave={wave} patients={patients} selected={chartPid} onSelect={setChartPid} />

      {/* patient telemetry grid */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {patients.map((p) => {
          const v = vitals[p.id];
          const lvl = levelOf(v);
          const hist = history[p.id] || [];
          const trend = hist.length >= 10 ? hist[hist.length - 1] - hist[hist.length - 10] : 0;
          const ring = { none: 'border-slate-200', watch: 'border-yellow-300', review: 'border-orange-400', urgent: 'border-red-500 animate-pulse' }[lvl] || 'border-slate-200';
          return (
            <div key={p.id} className={`rounded-2xl border-2 ${ring} bg-white p-4 shadow-sm transition`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold text-navy-900">{p.fullName}</p>
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">{p.id} · {p.conditions[0] || 'Routine'}{v?.scale === 'scale2' ? ' · SpO₂ S2' : ''}</p>
                </div>
                <LevelChip level={lvl} total={v?.score} />
              </div>

              <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                <Cell label="HR" value={v?.hr} unit="bpm" />
                <Cell label="SpO₂" value={v?.spo2} unit="%" alert={v?.spo2 != null && v.spo2 < 92} />
                <Cell label="RR" value={v?.rr} unit="/min" />
                <Cell label="Temp" value={v?.temp != null ? Number(v.temp).toFixed(1) : null} unit="°C" />
              </div>

              <div className="mt-3 flex items-center justify-between">
                <Spark data={hist} level={lvl} />
                <div className="flex flex-col items-end">
                  {trend > 0 ? <TrendingUp size={18} className="text-red-500" /> : trend < 0 ? <TrendingDown size={18} className="text-emerald-500" /> : <Minus size={18} className="text-slate-400" />}
                  <span className="text-[10px] text-slate-400">{trend > 0 ? 'drifting up' : trend < 0 ? 'improving' : 'steady'}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* alerts feed */}
      <div className="card">
        <h2 className="mb-3 flex items-center gap-2 font-bold"><Activity size={18} className="text-teal-500" /> Live alert stream</h2>
        {alertsFeed.length === 0 ? (
          <p className="text-sm text-slate-500">No alerts yet — start the demo streams and watch them arrive in real time.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {alertsFeed.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm">
                <div className="flex items-center gap-3 min-w-0">
                  <LevelChip level={a.level} total={a.score_total} />
                  <span className="truncate font-medium text-slate-700">{a.patient_name} — {a.explanation}</span>
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

function LevelChip({ level, total }) {
  const map = {
    none: 'bg-emerald-100 text-emerald-700', watch: 'bg-yellow-100 text-yellow-800',
    review: 'bg-orange-100 text-orange-800', urgent: 'bg-red-100 text-red-800',
  };
  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold ${map[level] || map.none}`}>
      {level.toUpperCase()}{total != null && <b className="text-sm">{total}</b>}
    </span>
  );
}

function Cell({ label, value, unit, alert }) {
  return (
    <div className={`rounded-xl border p-2 ${alert ? 'border-red-300 bg-red-50' : 'border-slate-100 bg-slate-50'}`}>
      <p className="text-[10px] font-semibold uppercase text-slate-500">{label}</p>
      <p className={`text-xl font-extrabold tabular-nums leading-tight ${alert ? 'text-red-600' : 'text-navy-900'}`}>{value ?? '––'}</p>
      <p className="text-[9px] text-slate-400">{unit}</p>
    </div>
  );
}

function Spark({ data, level }) {
  if (data.length < 2) return <div className="h-10 w-36 rounded bg-slate-50" />;
  const w = 150, h = 40, max = 14;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - (Math.min(v, max) / max) * (h - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const color = { none: '#10b981', watch: '#eab308', review: '#f97316', urgent: '#ef4444' }[level] || '#0ea5e9';
  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={w} cy={h - (Math.min(data[data.length - 1], max) / max) * (h - 4) - 2} r="3.5" fill={color} />
    </svg>
  );
}

function smoothSeries(arr, keys, window_ = 5) {
  // centered moving average — the "trend" clinicians read at the bedside
  return arr.map((p, i) => {
    const from = Math.max(0, i - window_ + 1);
    const slice = arr.slice(from, i + 1).filter(Boolean);
    const out = { ...p };
    for (const k of keys) {
      const vals = slice.map((q) => q[k]).filter((v) => v != null);
      out[k + 'Trend'] = vals.length ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2) : null;
    }
    return out;
  });
}

function LiveWaveforms({ wave, patients, selected, onSelect }) {
  const raw = wave[selected] || [];
  const [mode, setMode] = useState('trend');
  const data = mode === 'trend' ? smoothSeries(raw, ['hr', 'spo2', 'rr', 'temp', 'score'], 5) : raw;
  const p = patients.find((x) => x.id === selected);
  return (
    <div className="card">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-bold"><HeartPulse className="text-teal-500" size={18} /> Live waveforms
          <span className="text-xs font-normal text-slate-400">smoothed trend by default</span>
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-xl bg-slate-100 p-1">
            {['trend', 'raw'].map((m) => (
              <button key={m} onClick={() => setMode(m)}
                className={`rounded-lg px-3 py-1 text-xs font-semibold capitalize transition ${mode === m ? 'bg-white text-navy-900 shadow' : 'text-slate-500'}`}>
                {m === 'trend' ? 'Trend (SMA-5)' : 'Raw'}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
          {patients.map((pt) => (
            <button key={pt.id} onClick={() => onSelect(pt.id)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${selected === pt.id ? 'bg-navy-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              {pt.id} — {pt.fullName.split(' ')[0]}
            </button>
          ))}
        </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            {p?.fullName} — HR / SpO₂ / RR (live)
          </p>
          <div className="h-64">
            {data.length < 2 ? (
              <div className="grid h-full place-items-center text-sm text-slate-400">Waiting for stream…</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="t" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis yAxisId="l" domain={['dataMin - 10', 'dataMax + 10']} tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="r" orientation="right" domain={[85, 100]} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Line yAxisId="l" type="monotone" dataKey={mode === 'trend' ? 'hrTrend' : 'hr'} name="HR bpm" stroke="#0f766e" strokeWidth={2.4} dot={false} isAnimationActive={false} />
                  <Line yAxisId="l" type="monotone" dataKey={mode === 'trend' ? 'rrTrend' : 'rr'} name="RR /min" stroke="#f97316" strokeWidth={1.8} dot={false} strokeDasharray="5 3" isAnimationActive={false} />
                  <Line yAxisId="r" type="monotone" dataKey={mode === 'trend' ? 'spo2Trend' : 'spo2'} name="SpO₂ %" stroke="#0ea5e9" strokeWidth={2.4} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">NEWS2 trajectory (live)</p>
          <div className="h-64">
            {data.length < 2 ? (
              <div className="grid h-full place-items-center text-sm text-slate-400">Waiting for stream…</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="t" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis domain={[0, 14]} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <ReferenceLine y={5} stroke="#f97316" strokeDasharray="4 4" label={{ value: 'Review', fontSize: 10, fill: '#f97316' }} />
                  <ReferenceLine y={7} stroke="#ef4444" strokeDasharray="4 4" label={{ value: 'Urgent', fontSize: 10, fill: '#ef4444' }} />
                  <Line type="monotone" dataKey={mode === 'trend' ? 'scoreTrend' : 'score'} name="NEWS2" stroke="#7c3aed" strokeWidth={2.4} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
