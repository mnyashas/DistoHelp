import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Stethoscope, ShieldCheck, LogOut, Printer, CheckCircle2, ChevronRight, Info,
  Watch, Camera, Bluetooth, Radio,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Legend,
} from 'recharts';
import { api } from '../services/api.js';
import { RISK, Spinner } from '../components/ui.jsx';
import { CameraPpg } from '../sensors/cameraPpg.js';
import { connectBLE } from '../sensors/ble.js';
import { PanicButton, EmergencyContacts } from '../components/PanicButton.jsx';

const QUESTIONS = [
  { key: 'breathlessness', label: 'Breathlessness', options: [['None', 0], ['Mild', 1], ['Severe', 2]] },
  { key: 'fever', label: 'Fever', options: [['No', 0], ['Yes', 1]] },
  { key: 'dizziness', label: 'Dizziness', options: [['None', 0], ['Mild', 1], ['Severe', 2]] },
];

export default function PatientPortal() {
  const [token, setToken] = useState(() => localStorage.getItem('spm_patient_token'));
  const [step, setStep] = useState('mobile');
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState('');
  const [demoOtp, setDemoOtp] = useState('');
  const [patientName, setPatientName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const d = await api('/patient/send-otp', { method: 'POST', body: { mobile: mobile.replace(/\s/g, '') } });
      setDemoOtp(d.demoOtp || '');
      setPatientName(d.patient_name || '');
      setStep('otp');
    } catch (err) {
      setError(err.message);
    } finally { setBusy(false); }
  };

  const verify = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const d = await api('/patient/verify', { method: 'POST', body: { mobile: mobile.replace(/\s/g, ''), otp } });
      localStorage.setItem('spm_patient_token', d.token);
      setToken(d.token);
    } catch (err) {
      setError(err.message);
    } finally { setBusy(false); }
  };

  const logout = () => { localStorage.removeItem('spm_patient_token'); setToken(null); setStep('mobile'); setMobile(''); setOtp(''); };

  if (token) return <Report token={token} onLogout={logout} />;

  return (
    <div className="grid min-h-screen md:grid-cols-2">
      <div className="hidden flex-col justify-between bg-gray-900 p-12 text-white md:flex">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-500"><Stethoscope size={22} /></div>
          <div><p className="font-bold leading-tight">DIstoHelp</p><p className="text-[10px] uppercase tracking-widest text-brand-300">Patient report</p></div>
        </div>
        <div>
          <h1 className="text-4xl font-extrabold leading-tight">Your health, <span className="text-brand-300">explained.</span></h1>
          <p className="mt-4 max-w-md text-gray-300">Sign in with your registered mobile number to see your own report — conditions, medicines, vital trends, early-warning score and what your care team sees.</p>
        </div>
        <p className="text-xs text-gray-400">Clinical decision support — not a medical diagnosis system.</p>
      </div>

      <div className="grid place-items-center bg-gray-50 p-6">
        <div className="card w-full max-w-md p-8">
          <div className="mb-6 flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-600"><ShieldCheck /></div>
            <div><h2 className="text-xl font-bold">Patient sign in</h2><p className="text-xs text-gray-500">Registered patients only</p></div>
          </div>

          {step === 'mobile' ? (
            <form onSubmit={send} className="space-y-4">
              <div>
                <label className="label">Registered mobile number</label>
                <input className="input tracking-widest" inputMode="numeric" placeholder="10-digit mobile"
                  value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))} required />
                <p className="mt-2 rounded-xl bg-gray-50 p-2 text-xs text-gray-500">
                  Demo patients: <b>98450 01001</b> (Beryl) · 02002 (Denis) · 03003 (Athena) · 04004 (April) · 05005 (Andre)
                </p>
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button className="btn-primary w-full justify-center" disabled={busy || mobile.length !== 10}>Send OTP</button>
              <p className="text-center text-sm text-gray-500">Clinician? <Link to="/login" className="text-brand-600 hover:underline">Staff sign in</Link></p>
            </form>
          ) : (
            <form onSubmit={verify} className="space-y-4">
              <p className="text-sm text-gray-600">Enter the OTP for <b>{patientName}</b>.</p>
              {demoOtp && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Simulated OTP: <b className="tracking-widest">{demoOtp}</b></p>}
              <input className="input text-center text-2xl tracking-[0.5em]" inputMode="numeric" placeholder="······"
                value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} required />
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button className="btn-primary w-full justify-center" disabled={busy || otp.length !== 6}>View my report</button>
              <button type="button" className="w-full text-sm text-brand-600 hover:underline" onClick={() => { setStep('mobile'); setOtp(''); setError(''); }}>← Back</button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

const isSeedPatient = (id) => /^p0[1-5]$/.test(id);

function Report({ token, onLogout }) {
  const [r, setR] = useState(null);
  const [err, setErr] = useState('');
  const [checkin, setCheckin] = useState({ breathlessness: 0, fever: 0, dizziness: 0 });
  const [sent, setSent] = useState(false);

  const load = () => api('/patient/me', { headers: { Authorization: `Bearer ${token}` } })
    .then(setR)
    .catch((e) => setErr(e.message || 'Could not load your report'));

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const submitCheckin = async () => {
    await api('/checkins', { method: 'POST', body: { patient_id: r.patient.id, ...checkin } });
    setSent(true);
    load();
  };

  if (err) return <div className="grid min-h-screen place-items-center text-red-600">{err}</div>;
  if (!r) return <Spinner />;

  const p = r.patient;
  const latest = r.records.at(-1);
  const risk = latest ? RISK[latest.news2.risk.level] : null;
  const chart = r.records.slice(-14).map((x) => ({
    t: new Date(x.measuredAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
    hr: x.vitals.heartRate, spo2: x.vitals.spo2, rr: x.vitals.respiratoryRate, temp: x.vitals.temperature,
  }));

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="print:hidden sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-white/90 px-6 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <Stethoscope className="text-brand-600" />
          <div><p className="text-sm font-bold leading-tight">My Health Report</p><p className="text-[10px] uppercase tracking-widest text-gray-500">DIstoHelp · post-discharge monitoring</p></div>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-ghost" onClick={() => window.print()}><Printer size={16} /> Print / save PDF</button>
          <button className="btn-ghost" onClick={onLogout}><LogOut size={16} /> Sign out</button>
        </div>
      </header>

      <main className="print-report mx-auto max-w-3xl space-y-5 p-5">
        {/* header card */}
        <section className="card">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs text-gray-500">{p.id} · age {p.age} · {p.gender}</p>
              <h1 className="text-3xl font-extrabold">{p.fullName}</h1>
              <div className="mt-2 flex flex-wrap gap-2">
                {p.conditions.map((c) => <span key={c} className="rounded-full bg-brand-50 px-2.5 py-1 text-xs text-brand-700">{c}</span>)}
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-500">
                {p.medications.map((m) => (
                  <span key={m.display} className={`rounded-full px-2.5 py-1 ${m.beta_blocker ? 'bg-amber-100 font-semibold text-amber-800' : 'bg-gray-100'}`}>
                    ⚕ {m.display.split('  ')[0]}{m.beta_blocker ? ' · beta-blocker' : ''}
                  </span>
                ))}
              </div>
            </div>
            {risk && (
              <div className="text-center">
                <div className={`grid h-28 w-28 place-items-center rounded-3xl text-white shadow-lg ${risk.bar}`}>
                  <div><p className="text-[10px] font-semibold uppercase opacity-90">NEWS2</p><p className="text-5xl font-black leading-none">{latest.news2.total}</p></div>
                </div>
                <p className="mt-2 text-sm font-bold text-gray-800">{risk.label}</p>
              </div>
            )}
          </div>
          {latest && (
            <p className="mt-3 flex items-start gap-2 rounded-xl bg-gray-50 p-3 text-xs text-gray-600">
              <Info size={14} className="mt-0.5 shrink-0" />
              Latest reading {new Date(latest.measuredAt).toLocaleString('en-IN')} · source: {latest.source} · {risk.clinical}
            </p>
          )}
        </section>

        {/* manage own emergency contacts (real SMS targets) */}
        <div className="print:hidden">
          <EmergencyContacts patientId={p.id} patientName={p.fullName} />
        </div>

        {/* panic — always visible to the patient */}
        <section className="card print:hidden border-2 border-red-200">
          <h2 className="mb-1 flex items-center gap-2 font-bold text-red-700">In an emergency</h2>
          <p className="mb-2 text-xs text-gray-500">Press only if you need urgent help at home. This instantly alerts your care team and texts every emergency contact on file.</p>
          <PanicButton big patientId={p.id} patientName={p.fullName} />
        </section>

        {/* vitals trend */}
        <section className="card">
          <h2 className="mb-2 font-bold">Vital signs — recent trend</h2>
          <div className="h-56">
            {chart.length === 0 ? <p className="text-sm text-gray-500">No saved readings yet.</p> : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="t" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="l" domain={['dataMin - 5', 'dataMax + 5']} tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="r" orientation="right" domain={[80, 100]} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Line yAxisId="l" type="monotone" dataKey="hr" name="HR bpm" stroke="#0f766e" strokeWidth={2} dot={{ r: 3 }} />
                  <Line yAxisId="l" type="monotone" dataKey="rr" name="RR /min" stroke="#f97316" strokeWidth={2} dot={{ r: 3 }} />
                  <Line yAxisId="l" type="monotone" dataKey="temp" name="Temp °C" stroke="#a855f7" strokeWidth={2} dot={{ r: 3 }} />
                  <Line yAxisId="r" type="monotone" dataKey="spo2" name="SpO₂ %" stroke="#0ea5e9" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        {/* alerts */}
        <section className="card">
          <h2 className="mb-2 font-bold">Warnings your care team sees</h2>
          {r.alerts.length === 0 ? <p className="text-sm text-gray-500">None right now. Keep it up!</p> : (
            <ul className="divide-y divide-gray-100">
              {r.alerts.slice(0, 5).map((a) => (
                <li key={a.id} className="py-2.5 text-sm">
                  <p className="font-semibold capitalize">{a.level} · NEWS2 {a.score_total ?? '–'}</p>
                  <p className="text-xs text-gray-600">{a.explanation}</p>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[11px] text-gray-400">Only your care team can acknowledge or clear these. Please call the hospital helpline if you feel much worse.</p>
        </section>

        {/* self-monitor — only for user-added patients */}
        {!isSeedPatient(p.id) && <SelfMonitor patientId={p.id} patientName={p.fullName} onSaved={load} />}
        {isSeedPatient(p.id) && (
          <section className="card text-sm text-slate-500">
            <h2 className="mb-1 font-bold text-slate-600">Readings & monitoring</h2>
            <p>This is a simulated cohort supplied by your clinic for the demonstration. Measurements are recorded by the wearable monitor — you can see your history above; phone-based self-monitoring is disabled for this profile.</p>
          </section>
        )}

        {/* check-in */}
        <section className="card print:hidden">
          <h2 className="mb-3 font-bold">How are you feeling today?</h2>
          {sent ? (
            <p className="flex items-center gap-2 text-brand-700"><CheckCircle2 size={18} /> Thank you — your answers were shared with your care team.</p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                {QUESTIONS.map(({ key, label, options }) => (
                  <div key={key} className="rounded-xl border border-gray-200 p-3">
                    <p className="label">{label}</p>
                    <div className="grid grid-cols-3 gap-1.5">
                      {options.map(([text, val]) => (
                        <button key={val} onClick={() => setCheckin((c) => ({ ...c, [key]: val }))}
                          className={`rounded-lg border px-2 py-2 text-xs font-semibold ${checkin[key] === val ? 'border-brand-500 bg-brand-50 text-brand-800' : 'border-gray-200 text-gray-600'}`}>
                          {text}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <button className="btn-primary mt-3" onClick={submitCheckin}>Submit today's check-in <ChevronRight size={16} /></button>
            </>
          )}
        </section>

        <p className="text-center text-[11px] uppercase tracking-widest text-gray-400">
          Clinical decision support only — not a medical diagnosis system
        </p>
      </main>
    </div>
  );
}

// Self-monitoring card shown only to user-added patients: streams their phone's
// camera PPG (or a BLE band) straight into the same pipeline as the cohort.
function SelfMonitor({ patientId, patientName, onSaved }) {
  const [source, setSource] = useState('camera');
  const [streaming, setStreaming] = useState(false);
  const [bpm, setBpm] = useState(null);
  const [quality, setQuality] = useState(0);
  const [sent, setSent] = useState(0);
  const [msg, setMsg] = useState('');
  const [ppgState, setPpgState] = useState('idle');
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const waveRef = useRef(null);
  const ppgRef = useRef(null);
  const bleRef = useRef(null);
  const latest = useRef({ bpm: null, quality: 0 });

  const startCamera = async () => {
    setMsg('');
    try {
      const ppg = new CameraPpg(videoRef.current, canvasRef.current);
      ppg.onUpdate = ({ bpm, quality, state, waveform }) => {
        latest.current = { bpm, quality };
        setBpm(bpm);
        setQuality(quality);
        setPpgState(state || 'idle');
        drawWave(waveRef.current, waveform, bpm ? '#2dd4bf' : '#475569');
      };
      ppgRef.current = ppg;
      await ppg.start();
      setStreaming(true);
    } catch (e) {
      setMsg('Camera needs a secure context (HTTPS or localhost). If unavailable here, the BLE band option works on Chrome/Edge too.');
    }
  };
  const stopCamera = () => { ppgRef.current?.stop(); setStreaming(false); setBpm(null); setQuality(0); setPpgState('idle'); };

  const startBLE = async () => {
    setMsg('');
    try {
      bleRef.current = await connectBLE(({ heartRate }) => {
        latest.current = { bpm: heartRate, quality: 0.9 };
        setBpm(heartRate);
        setQuality(0.9);
      });
      setStreaming(true);
    } catch (e) {
      setMsg(e.message || 'Bluetooth unavailable — needs Chrome/Edge and a BLE heart-rate band (HTTPS or localhost).');
    }
  };
  const stopBLE = () => {
    try { bleRef.current?.gatt?.disconnect(); } catch { /* ignore */ }
    bleRef.current = null;
    setStreaming(false); setBpm(null); setQuality(0);
  };

  const start = source === 'camera' ? startCamera : startBLE;
  const stop = source === 'camera' ? stopCamera : stopBLE;

  useEffect(() => {
    if (!streaming) return;
    const id = setInterval(async () => {
      const { bpm, quality } = latest.current;
      if (!bpm || quality < 0.12) return;
      try {
        await api('/sensors/readings', {
          method: 'POST',
          headers: { 'x-device-key': 'demo-esp32-key' },
          body: { patient_id: patientId, source: source === 'camera' ? 'camera' : 'ble', vitals: { heartRate: bpm } },
        });
        setSent((s) => s + 1);
        onSaved?.();
      } catch { /* keep streaming */ }
    }, 2000);
    return () => clearInterval(id);
  }, [streaming, patientId, source, onSaved]);

  return (
    <section className="card print:hidden">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-bold"><Watch className="text-teal-500" size={18} /> Monitor with your phone</h2>
        <div className="flex rounded-xl bg-slate-100 p-1">
          {[['camera', 'Phone camera', Camera], ['ble', 'BLE band', Bluetooth]].map(([id, label, Icon]) => (
            <button key={id} onClick={() => setSource(id)} disabled={streaming}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${source === id ? 'bg-white text-navy-900 shadow' : 'text-slate-500'}`}>
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 grid gap-4 md:grid-cols-[auto_1fr_auto] md:items-center">
        <div className="relative h-32 w-32 overflow-hidden rounded-2xl bg-slate-900">
          <video ref={videoRef} className="h-full w-full object-cover opacity-60" muted playsInline />
          <canvas ref={canvasRef} width={160} height={120} className="hidden" />
          {source === 'ble' && <div className="grid h-full w-full place-items-center text-sky-400"><Bluetooth size={36} /></div>}
          <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[8px] uppercase text-slate-300">{source === 'camera' ? 'finger on lens' : 'ble'}</span>
        </div>
        <canvas ref={waveRef} width={300} height={88} className="w-full rounded-xl bg-slate-900" />
        <div className="text-center md:w-28">
          <p className="text-5xl font-black tabular-nums text-navy-900 leading-none">{bpm ?? '––'}</p>
          <p className="text-[9px] uppercase tracking-widest text-slate-400">bpm · live</p>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded bg-slate-200">
            <div className="h-full bg-teal-500" style={{ width: `${Math.round(quality * 100)}%` }} />
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          {streaming
            ? ppgState === 'locked' ? `Reading pulse for ${patientName} · ${sent} synced · shows on your clinic's dashboard`
              : ppgState === 'estimating' ? 'Reading pulse… hold steady — BPM will appear in a few seconds'
              : ppgState === 'settling' ? 'Cover the ENTIRE rear lens and keep perfectly still…'
              : ppgState === 'no-finger' ? 'No pulse detected — fingertip must fully cover camera, LED on'
              : `Streaming pulse for ${patientName} · ${sent} synced`
            : 'Place fingertip over the camera lens (or pair a BLE band) and start streaming — same NEWS2 scoring as the monitored patients.'}
        </p>
        <button className={`btn-primary ${streaming ? '!from-red-500 !to-rose-500' : ''}`} onClick={streaming ? stop : start}>
          {streaming ? 'Stop' : (<><Radio size={16} /> Start streaming</>)}
        </button>
      </div>
      {msg && <p className="text-xs text-amber-700">{msg}</p>}
      <p className="text-[10px] text-slate-400">Secure-context note: camera/BLE require HTTPS or localhost (Chrome/Edge). This is a demo build.</p>
    </section>
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
  ctx.shadowBlur = 6;
  ctx.beginPath();
  data.forEach((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h / 2 + (v / max) * (h / 2 - 6);
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  });
  ctx.stroke();
}
