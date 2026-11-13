// DIstoHelp Patient — mobile application (patient-only).
// Same visual system as the website patient portal: light theme, white cards,
// brand accents, Outfit, .btn-primary / .input / .card. Posts the same data the web app does.
import { useEffect, useRef, useState } from 'react';
import {
  Stethoscope, ShieldCheck, LogOut, Activity, Radio,
  ChevronRight, HeartPulse, Wind, Thermometer, Droplets,
  CheckCircle2, TriangleAlert,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Legend,
} from 'recharts';
import { RISK } from '../components/ui.jsx';
import { PanicButton, EmergencyContacts } from '../components/PanicButton.jsx';

const API = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '') + '/api';
const DEVICE_KEY = 'demo-esp32-key';
const PATIENT_TOKEN_KEY = 'distohelp_patient_token';

async function patientFetch(path, { method = 'GET', body, headers: extra } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = localStorage.getItem(PATIENT_TOKEN_KEY);
  if (token) headers.Authorization = `Bearer ${token}`;
  if (extra) Object.assign(headers, extra);
  const res = await fetch(API + path, {
    method, headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && token) localStorage.removeItem(PATIENT_TOKEN_KEY);
  if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
  return data;
}

const SIM_SEED = { hr: 76, spo2: 97, rr: 14, temp: 36.6 };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const rand = (a, b) => a + Math.random() * (b - a);
const initials = (name = '') => {
  const p = String(name).trim().split(/\s+/);
  return (((p[0]?.[0] || '') + (p.at(-1)?.[0] || '')).toUpperCase().slice(0, 2)) || '?';
};

export default function MobileApp() {
  const [token, setToken] = useState(() => localStorage.getItem(PATIENT_TOKEN_KEY));
  if (token) return <Home onLogout={() => { localStorage.removeItem(PATIENT_TOKEN_KEY); setToken(null); }} />;
  return <Login onLogin={(t) => { localStorage.setItem(PATIENT_TOKEN_KEY, t); setToken(t); }} />;
}

/* ---------------- LOGIN (mirrors portal sign-in) ---------------- */
function Login({ onLogin }) {
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState('mobile');
  const [demoOtp, setDemoOtp] = useState('');
  const [patientName, setPatientName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async (e) => {
    e?.preventDefault();
    setBusy(true); setError('');
    try {
      const d = await patientFetch('/patient/send-otp', { method: 'POST', body: { mobile: mobile.replace(/\s/g, '') } });
      setDemoOtp(d.demoOtp || '');
      setPatientName(d.patient_name || '');
      setStep('otp');
    } catch (err) { setError(err.message || 'Could not send OTP'); } finally { setBusy(false); }
  };

  const verify = async (e) => {
    e?.preventDefault();
    setBusy(true); setError('');
    try {
      const d = await patientFetch('/patient/verify', { method: 'POST', body: { mobile: mobile.replace(/\s/g, ''), otp } });
      onLogin(d.token);
    } catch (err) { setError(err.message || 'Invalid OTP'); } finally { setBusy(false); }
  };

  return (
    <div className="min-h-[100dvh] bg-gray-50">
      {/* hero panel */}
      <div className="flex flex-col justify-between bg-gray-900 px-6 pb-8 pt-6 text-white">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-500"><Stethoscope size={22} /></div>
          <div>
            <p className="font-bold leading-tight">DIstoHelp</p>
            <p className="text-[9px] uppercase tracking-widest text-brand-300">Patient companion</p>
          </div>
        </div>
        <div className="mt-6">
          <h1 className="text-3xl font-extrabold leading-tight">Your health, <span className="text-brand-300">explained.</span></h1>
          <p className="mt-2 max-w-sm text-sm text-gray-300">Sign in with your registered mobile number to see your own report — vitals, early-warning score and what your care team sees.</p>
        </div>
      </div>

      {/* sign-in card */}
      <div className="px-4 pb-10 pt-4">
        <div className="card w-full p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-600"><ShieldCheck /></div>
            <div><h2 className="text-lg font-bold">Patient sign in</h2><p className="text-xs text-gray-500">Registered patients only</p></div>
          </div>

          {step === 'mobile' ? (
            <form onSubmit={send} className="space-y-4">
              <div>
                <label className="label">Registered mobile number</label>
                <input className="input tracking-widest" inputMode="numeric" placeholder="10-digit mobile"
                  value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))} required />
                <p className="mt-2 rounded-xl bg-gray-50 p-2 text-[11px] text-gray-500">
                  Demo patients: <b>98450 01001</b> (Beryl) · 02002 (Denis) · 03003 (Athena) · 04004 (April) · 05005 (Andre)
                </p>
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button className="btn-primary w-full justify-center" disabled={busy || mobile.length !== 10}>
                {busy ? 'Sending…' : 'Send OTP'}
              </button>
            </form>
          ) : (
            <form onSubmit={verify} className="space-y-4">
              <p className="text-sm text-gray-600">Enter the OTP for <b>{patientName}</b>.</p>
              {demoOtp && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Simulated OTP: <b className="tracking-widest">{demoOtp}</b></p>}
              <input className="input text-center text-2xl tracking-[0.5em]" inputMode="numeric" placeholder="······"
                value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} required />
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button className="btn-primary w-full justify-center" disabled={busy || otp.length !== 6}>
                {busy ? 'Verifying…' : 'View my report'}
              </button>
              <button type="button" className="w-full text-sm text-brand-600 hover:underline"
                onClick={() => { setStep('mobile'); setOtp(''); setError(''); }}>← Back</button>
            </form>
          )}
        </div>
        <p className="mt-4 text-center text-[10px] uppercase tracking-widest text-gray-400">
          Clinical decision support — not a medical diagnosis system
        </p>
      </div>
    </div>
  );
}

/* ---------------- HOME (mirrors portal Report) ---------------- */
const RISK_KEY = (level) => ({ low: 'low', 'low-medium': 'low-medium', medium: 'medium', high: 'high' }[level] ?? 'low');

function Home({ onLogout }) {
  const [me, setMe] = useState(null);
  const [simOn, setSimOn] = useState(false);
  const [demo, setDemo] = useState('stable');
  const [ticks, setTicks] = useState(0);
  const simRef = useRef(null);

  const load = () => patientFetch('/patient/me').then(setMe).catch(() => {});
  useEffect(() => { load(); const id = setInterval(load, 3000); return () => clearInterval(id); }, []);

  // on-device simulated sensors -> posted to Render every 3s
  useEffect(() => {
    if (!simOn || !me?.patient?.id) return undefined;
    const seed = { ...SIM_SEED };
    let t = 0;
    simRef.current = setInterval(async () => {
      t += 1; setTicks((x) => x + 1);
      const ramp = demo === 'deteriorating' ? Math.min(t / 45, 1) : 0;
      const vitals = {
        heartRate: clamp(seed.hr + 6 * ramp + rand(-2.5, 2.5), 45, 160),
        spo2: clamp(seed.spo2 - 9 * ramp + rand(-0.5, 0.5), 60, 100),
        respiratoryRate: clamp(seed.rr + 10 * ramp + rand(-0.8, 0.8), 8, 40),
        temperature: clamp(seed.temp + 1.2 * ramp + rand(-0.1, 0.1), 34, 41),
        source: 'mobile-sim',
      };
      try {
        await patientFetch('/sensors/readings', {
          method: 'POST',
          headers: { 'x-device-key': DEVICE_KEY },
          body: { patient_id: me.patient.id, source: 'mobile-sim', vitals },
        });
      } catch { /* keep simulating */ }
    }, 3000);
    return () => clearInterval(simRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simOn, me?.patient?.id, demo]);

  const p = me?.patient;
  const latest = me?.records?.length ? me.records[me.records.length - 1] : null;
  const news2 = latest?.news2?.total ?? null;
  const level = RISK_KEY(latest?.news2?.risk?.level);
  const risk = RISK[level] ?? RISK.low;
  const history = (me?.records ?? []).filter((r) => r.vitals?.heartRate != null && r.vitals?.spo2 != null).slice(-12);
  const chart = history.map((r, i) => ({
    i: i + 1, hr: Math.round(r.vitals.heartRate), spo2: Number(r.vitals.spo2),
    rr: Math.round(r.vitals.respiratoryRate), temp: Number(r.vitals.temperature),
  }));

  return (
    <div className="min-h-[100dvh] bg-gray-50 pb-6">
      {/* sticky header (matches portal report) */}
      <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-gray-200 bg-white/90 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <Stethoscope className="text-brand-600" size={20} />
          <p className="text-sm font-bold leading-tight">My Health Report</p>
        </div>
        <button onClick={onLogout} className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-gray-600 transition hover:border-red-200 hover:text-red-600">
          <LogOut size={13} /> Sign out
        </button>
      </header>

      <main className="space-y-4 px-4 pt-4">
        {!p ? (
          <div className="grid place-items-center py-16 text-sm text-gray-500">Loading your report…</div>
        ) : (
          <>
            {/* identity + score card */}
            <section className="card flex items-center justify-between gap-4 p-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-500 text-xl font-extrabold text-white">{initials(p.fullName)}</div>
                <div className="min-w-0">
                  <p className="truncate text-lg font-extrabold leading-tight">{p.fullName}</p>
                  <p className="text-[10px] uppercase tracking-wider text-gray-500">{p.id} · {p.age} yrs · {p.gender}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {p.primaryCondition && <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[10px] font-semibold text-amber-800">{p.primaryCondition}</span>}
                    {p.medications?.some((m) => m.beta_blocker) && <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold text-amber-800">on beta-blocker</span>}
                  </div>
                </div>
              </div>
              <div className="shrink-0 text-center">
                <div className={`grid h-20 w-20 place-items-center rounded-2xl text-white shadow-theme-md ${risk.bar}`}>
                  <div>
                    <p className="text-[8px] font-semibold uppercase opacity-90">NEWS2</p>
                    <p className="text-3xl font-black leading-none">{news2 ?? '—'}</p>
                  </div>
                </div>
                <p className="mt-1 text-[10px] font-bold text-gray-700">{risk.label}</p>
              </div>
            </section>

            {/* telemetry tiles */}
            <section className="grid grid-cols-4 gap-2">
              <Tile label="HR" value={latest?.vitals?.heartRate != null ? Math.round(latest.vitals.heartRate) : null} unit="bpm" abnormal={latest?.vitals?.heartRate > 100} />
              <Tile label="SpO₂" value={latest?.vitals?.spo2 != null ? Number(latest.vitals.spo2).toFixed(1) : null} unit="%" abnormal={latest?.vitals?.spo2 != null && latest.vitals.spo2 < 92} />
              <Tile label="RR" value={latest?.vitals?.respiratoryRate != null ? Math.round(latest.vitals.respiratoryRate) : null} unit="/min" />
              <Tile label="Temp" value={latest?.vitals?.temperature != null ? Number(latest.vitals.temperature).toFixed(1) : null} unit="°C" />
            </section>

            {/* on-device simulator */}
            <section className="card p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className={`grid h-10 w-10 place-items-center rounded-xl transition ${simOn ? 'bg-brand-500 text-white' : 'bg-brand-50 text-brand-600'}`}><Radio size={18} /></div>
                  <div>
                    <p className="text-sm font-bold text-gray-900">Device simulator</p>
                    <p className="text-[10px] text-gray-500">{simOn ? `Simulating · ${demo} · tick ${ticks}` : 'Streams vitals to the hospital pipeline every 3 s'}</p>
                  </div>
                </div>
                <button onClick={() => setSimOn((s) => !s)}
                  className={`btn-primary h-9 px-4 text-xs ${simOn ? '!from-red-500 !to-rose-500' : ''}`}>
                  {simOn ? 'Stop' : 'Start'}
                </button>
              </div>
              {simOn && (
                <div className="mt-3 flex gap-2">
                  {['stable', 'deteriorating'].map((m) => (
                    <button key={m} onClick={() => setDemo(m)}
                      className={`flex-1 rounded-xl border px-3 py-2 text-[10px] font-bold uppercase tracking-widest transition ${demo === m ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-500'}`}>
                      {m}
                    </button>
                  ))}
                </div>
              )}
            </section>

            {/* vitals trend */}
            {chart.length > 1 && (
              <section className="card p-4">
                <h2 className="mb-2 flex items-center gap-2 text-sm font-bold"><Activity size={16} className="text-brand-500" /> Vital signs — recent trend</h2>
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chart} margin={{ top: 5, right: 4, left: -14, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="i" hide />
                      <YAxis yAxisId="l" tick={{ fontSize: 10 }} domain={['dataMin - 5', 'dataMax + 5']} />
                      <YAxis yAxisId="r" orientation="right" domain={[75, 100]} tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Legend verticalAlign="top" iconSize={9} wrapperStyle={{ fontSize: 10 }} />
                      <Line yAxisId="l" type="monotone" dataKey="hr" name="HR bpm" stroke="#0f766e" strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} />
                      <Line yAxisId="l" type="monotone" dataKey="rr" name="RR /min" stroke="#f97316" strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} />
                      <Line yAxisId="r" type="monotone" dataKey="spo2" name="SpO₂ %" stroke="#0ea5e9" strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </section>
            )}

            {/* latest warning */}
            {(me.alerts ?? []).length > 0 && (
              <section className="card border-l-4 !border-l-amber-400 p-4">
                <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-amber-700"><TriangleAlert size={13} /> Latest warning</p>
                <p className="mt-1 line-clamp-2 text-xs text-gray-600">{me.alerts[0].explanation}</p>
              </section>
            )}

            {/* emergency contacts + panic — same components as the portal */}
            <EmergencyContacts patientId={p.id} patientName={p.fullName} />

            <section className="card border-2 !border-red-200 p-4 text-center">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-red-700">In an emergency</p>
              <p className="mb-3 text-[11px] text-gray-500">Press only if you need urgent help. Alerts your care team and texts every emergency contact on file.</p>
              <PanicButton big patientId={p.id} patientName={p.fullName} />
            </section>

            <p className="pt-1 text-center text-[10px] font-semibold uppercase tracking-widest text-gray-400">
              Clinical decision support — not a medical diagnosis system
            </p>
          </>
        )}
      </main>
    </div>
  );
}

function Tile({ label, value, unit, abnormal }) {
  return (
    <div className={`rounded-xl border p-2.5 text-center ${abnormal ? 'border-red-300 bg-red-50' : 'border-gray-100 bg-gray-50'}`}>
      <p className="text-[9px] font-semibold uppercase text-gray-500">{label}</p>
      <p className={`text-lg font-extrabold tabular-nums leading-tight ${abnormal ? 'text-red-600' : 'text-gray-900'}`}>{value ?? '––'}</p>
      <p className="text-[8px] text-gray-400">{unit}</p>
    </div>
  );
}
