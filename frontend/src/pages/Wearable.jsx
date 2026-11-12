import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Watch, Camera, Bluetooth, UserPlus, HeartPulse, CheckCircle2, Loader2, Radio,
} from 'lucide-react';
import { api } from '../services/api.js';
import { Spinner } from '../components/ui.jsx';
import { CameraPpg } from '../sensors/cameraPpg.js';
import { connectBLE } from '../sensors/ble.js';

// Phone-as-wearable: register a REAL person (team member / volunteer) and stream
// live measurements from the phone into the same monitoring pipeline.
// Sources: camera PPG (real, no hardware) | BLE heart-rate band.
export default function Wearable() {
  const [patients, setPatients] = useState(null);
  const [patientId, setPatientId] = useState('');
  const [source, setSource] = useState('camera');
  const [registering, setRegistering] = useState(false);
  const [form, setForm] = useState({ fullName: '', age: '', gender: 'Male', phone: '', condition: '' });
  const [formErr, setFormErr] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [bpm, setBpm] = useState(null);
  const [quality, setQuality] = useState(0);
  const [ppgState, setPpgState] = useState('idle');
  const [sent, setSent] = useState(0);
  const [lastSentAt, setLastSentAt] = useState(null);
  const [msg, setMsg] = useState('');
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const waveRef = useRef(null);
  const ppgRef = useRef(null);
  const bleDeviceRef = useRef(null);
  const latest = useRef({ bpm: null, quality: 0 });

  const loadPatients = () => api('/patients').then((l) => {
    setPatients(l);
    if (!patientId && l?.[0]) setPatientId(l[0].id);
  }).catch(() => {});

  useEffect(() => { loadPatients(); /* eslint-disable-next-line */ }, []);

  // ---------- camera PPG source ----------
  const startCamera = async () => {
    setMsg('');
    try {
      const ppg = new CameraPpg(videoRef.current, canvasRef.current);
      ppg.onUpdate = ({ bpm, quality, state, waveform }) => {
        latest.current = { bpm, quality };
        setBpm(bpm);
        setQuality(quality);
        setPpgState(state || 'idle');
        drawWave(waveRef.current, waveform, bpm ? '#2dd4bf' : '#334155');
      };
      ppgRef.current = ppg;
      await ppg.start();
      setStreaming(true);
    } catch (e) {
      setMsg(e.message || 'Camera unavailable — grant camera permission (needs rear camera + light).');
    }
  };
  const stopCamera = () => { ppgRef.current?.stop(); setStreaming(false); setBpm(null); setQuality(0); setPpgState('idle'); };

  // ---------- BLE band source ----------
  const startBLE = async () => {
    setMsg('');
    try {
      bleDeviceRef.current = await connectBLE(({ heartRate }) => {
        latest.current = { bpm: heartRate, quality: 0.9 };
        setBpm(heartRate);
        setQuality(0.9);
      });
      setStreaming(true);
    } catch (e) {
      setMsg(e.message || 'Bluetooth unavailable — use Chrome/Edge on Android or PC, and pick a BLE heart-rate band.');
    }
  };
  const stopBLE = () => {
    try { bleDeviceRef.current?.gatt?.disconnect(); } catch { /* ignore */ }
    bleDeviceRef.current = null;
    setStreaming(false); setBpm(null); setQuality(0);
  };

  const start = source === 'camera' ? startCamera : startBLE;
  const stop = source === 'camera' ? stopCamera : stopBLE;

  // ---------- periodic upload to pipeline (every 2 s while streaming) ----------
  useEffect(() => {
    if (!streaming) return;
    const id = setInterval(async () => {
      const { bpm, quality } = latest.current;
      if (!bpm || !patientId) return;
      if (quality < 0.12) return;   // skip garbage samples
      try {
        await api('/sensors/readings', {
          method: 'POST',
          headers: { 'x-device-key': 'demo-esp32-key' },
          body: { patient_id: patientId, source: source === 'camera' ? 'camera' : 'ble', vitals: { heartRate: bpm } },
        });
        setSent((s) => s + 1);
        setLastSentAt(new Date());
      } catch { /* keep streaming */ }
    }, 2000);
    return () => clearInterval(id);
  }, [streaming, patientId, source]);

  // ---------- create a real patient on the spot ----------
  const createPatient = async (e) => {
    e.preventDefault();
    setFormErr('');
    const age = Number(form.age);
    if (!form.fullName.trim() || !Number.isFinite(age) || age < 1 || age > 120) {
      setFormErr('Enter a name and a valid age.');
      return;
    }
    try {
      const saved = await api('/patients', {
        method: 'POST',
        body: {
          fullName: form.fullName.trim(),
          age,
          gender: form.gender,
          phone: form.phone || '—',
          address: 'On-site volunteer (wearable demo)',
          conditions: form.condition ? [form.condition] : ['Healthy volunteer'],
          medicalHistory: 'Real person — enrolled for live wearable demonstration today.',
        },
      });
      await loadPatients();
      setPatientId(saved.id);
      setRegistering(false);
      setForm({ fullName: '', age: '', gender: 'Male', phone: '', condition: '' });
    } catch (err) {
      setFormErr(err.message || 'Could not create patient.');
    }
  };

  const selected = patients?.find((p) => p.id === patientId);

  if (!patients) return <Spinner />;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold"><Watch className="text-brand-500" /> Wearable Mode</h1>
        <p className="text-sm text-gray-500">
          Turn this phone into the wearable for a <b>real person</b> — a teammate's actual pulse streams into the same pipeline as the monitored patients (artifact filter, NEWS2, alerts).
        </p>
      </div>

      {/* STEP 1 — choose or register the real patient */}
      <section className="card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-bold"><span className="mr-2 inline-grid h-6 w-6 place-items-center rounded-full bg-gray-900 text-xs text-white">1</span>Whose vitals are we streaming?</h2>
          <button className="btn-ghost text-xs" onClick={() => setRegistering((v) => !v)}>
            <UserPlus size={14} /> {registering ? 'Pick existing patient' : 'Register real person'}
          </button>
        </div>

        {!registering ? (
          <select className="input" value={patientId} onChange={(e) => setPatientId(e.target.value)}>
            {patients.map((p) => <option key={p.id} value={p.id}>{p.fullName} — {p.id} (age {p.age})</option>)}
          </select>
        ) : (
          <form onSubmit={createPatient} className="grid gap-3 md:grid-cols-2">
            <input className="input" placeholder="Full name" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required />
            <input className="input" type="number" placeholder="Age" min={1} max={120} value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} required />
            <select className="input" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
              <option>Male</option><option>Female</option><option>Other</option>
            </select>
            <input className="input" placeholder="Phone (optional)" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <input className="input md:col-span-2" placeholder="Condition / context (e.g. 'Post-op day 3', 'Healthy volunteer')" value={form.condition} onChange={(e) => setForm({ ...form, condition: e.target.value })} />
            {formErr && <p className="text-sm text-red-600 md:col-span-2">{formErr}</p>}
            <button type="submit" className="btn-primary md:col-span-2"><CheckCircle2 size={16} /> Create real patient & select</button>
          </form>
        )}
        {selected && !registering && (
          <p className="text-xs text-gray-500">
            Streaming target: <b>{selected.fullName}</b> · {selected.id} · conditions: {selected.conditions?.join(', ') || '—'} ·{' '}
            <Link className="text-brand-600 hover:underline" to={`/patients/${selected.id}`}>open patient file →</Link>
          </p>
        )}
      </section>

      {/* STEP 2 — choose the measurement source */}
      <section className="card">
        <h2 className="mb-3 font-bold"><span className="mr-2 inline-grid h-6 w-6 place-items-center rounded-full bg-gray-900 text-xs text-white">2</span>Measure with</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <button onClick={() => setSource('camera')}
            className={`rounded-2xl border-2 p-4 text-left transition ${source === 'camera' ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-gray-300'}`}>
            <Camera size={26} className="text-brand-600" />
            <p className="mt-2 font-bold">Phone camera</p>
            <p className="text-xs text-gray-500">Fingertip on the rear camera + torch. Real PPG measurement — no hardware needed. HR only.</p>
          </button>
          <button onClick={() => setSource('ble')}
            className={`rounded-2xl border-2 p-4 text-left transition ${source === 'ble' ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-gray-300'}`}>
            <Bluetooth size={26} className="text-sky-600" />
            <p className="mt-2 font-bold">BLE heart-rate band</p>
            <p className="text-xs text-gray-500">Any standard BLE strap (Polar H10, chest band). Chrome/Edge only. HR only.</p>
          </button>
        </div>
        {source === 'camera' &&
          <p className="mt-2 text-[11px] text-gray-400">SpO₂ &amp; temperature need a MAX30102/DS18B20 (see <code>firmware/</code>) — the camera gives true pulse rate only.</p>}
      </section>

      {/* STEP 3 — streaming console */}
      <section className="card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-bold"><span className="mr-2 inline-grid h-6 w-6 place-items-center rounded-full bg-gray-900 text-xs text-white">3</span>Stream to dashboard</h2>
          {!streaming ? (
            <button className="btn-primary" onClick={start}><Radio size={16} /> Start streaming</button>
          ) : (
            <button className="btn-primary !from-red-500 !to-rose-500" onClick={stop}>Stop</button>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-[auto_1fr_auto] md:items-center">
          <div className="relative h-40 w-40 overflow-hidden rounded-2xl bg-gray-900 md:h-44 md:w-44">
            <video ref={videoRef} className="h-full w-full object-cover opacity-70" muted playsInline />
            <canvas ref={canvasRef} width={160} height={120} className="hidden" />
            {source === 'ble' && (
              <div className="grid h-full w-full place-items-center text-sky-400"><Bluetooth size={48} /></div>
            )}
            <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[9px] uppercase text-gray-300">
              {source === 'camera' ? 'camera · finger on lens' : 'ble band'}
            </span>
          </div>
          <div>
            <canvas ref={waveRef} width={340} height={100} className="w-full rounded-xl bg-gray-900" />
            <p className="mt-1 text-xs text-gray-500">Pulse waveform — the same PPG trace a pulse oximeter sees.</p>
          </div>
          <div className="text-center md:w-32">
            <HeartPulse size={30} className={`mx-auto text-red-400 ${streaming ? 'animate-pulse' : ''}`} />
            <p className="mt-1 text-6xl font-black tabular-nums leading-none text-gray-900">{bpm ?? '––'}</p>
            <p className="text-[10px] uppercase tracking-widest text-gray-500">bpm · live</p>
            <div className="mt-1.5 h-2 w-full overflow-hidden rounded bg-gray-200">
              <div className="h-full bg-brand-500 transition-all" style={{ width: `${Math.round(quality * 100)}%` }} />
            </div>
            <p className="mt-1 text-[9px] uppercase text-gray-400">signal quality</p>
          </div>
        </div>

        {msg && <p className="text-sm text-amber-700">{msg}</p>}
        {streaming && source === 'camera' && (
          <p className="rounded-xl bg-gray-50 px-4 py-2.5 text-xs text-gray-700">
            {ppgState === 'locked' && <><b className="text-emerald-700">Locked on.</b> Real fingertip PPG — pulse rate reading live. Keep still.</>}
            {ppgState === 'estimating' && <><b className="text-amber-700">Reading pulse…</b> keep your finger over the lens — BPM will appear in a few seconds.</>}
            {ppgState === 'settling' && <><b className="text-amber-700">Settling in…</b> keep the finger fully over the lens.</>}
            {ppgState === 'no-finger' && <><b className="text-red-600">No pulse detected.</b> Cover the ENTIRE rear camera with the fingertip, LED on, avoid bright backlight, keep still ~20 s.</>}
          </p>
        )}
        {streaming && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-2.5 text-sm">
            <p className="text-brand-900">
              <b>Streaming to {selected?.fullName}</b> · {sent} readings sent{lastSentAt ? ` · last ${lastSentAt.toLocaleTimeString()}` : ''}
            </p>
            <div className="flex flex-wrap gap-2">
              <Link to="/live" className="btn-ghost bg-white text-xs">Live Monitoring →</Link>
              <Link to={`/watch?p=${patientId}`} className="btn-ghost bg-white text-xs">Wrist view →</Link>
            </div>
          </div>
        )}
        <p className="text-[11px] text-gray-400">
          The pulse flows through the same artifact filter and NEWS2 engine as the simulated patients — try walking around or shaking the phone to see motion-noise suppression on a real signal.
        </p>
      </section>
    </div>
  );
}

function drawWave(canvas, data, color) {
  if (!canvas || !data || data.length < 4) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, w, h);
  const max = Math.max(...data.map((v) => Math.abs(v)), 1);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  ctx.beginPath();
  data.forEach((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h / 2 + (v / max) * (h / 2 - 8);
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  });
  ctx.stroke();
}
