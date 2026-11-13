// DIstoHelp Patient — mobile application (patient-only).
// Wraps the same backend the website uses: patient OTP login, NEWS2 report,
// on-device vitals simulation posted to the Render API, panic + emergency contacts.
import { useEffect, useRef, useState } from 'react';
import {
  Stethoscope, ShieldCheck, LogOut, Activity, TriangleAlert, Radio,
  ChevronRight, CheckCircle2, Clock, HeartPulse, Wind, Thermometer, Droplets, UserRound,
} from 'lucide-react';

const API = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '') + '/api';
const DEVICE_KEY = 'demo-esp32-key';
const PATIENT_TOKEN_KEY = 'distohelp_patient_token';

async function patientFetch(path, { method = 'GET', body, headers: extra } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = localStorage.getItem(PATIENT_TOKEN_KEY);
  if (token) headers.Authorization = `Bearer ${token}`;
  if (extra) Object.assign(headers, extra);
  const res = await fetch(API + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && token) {
    localStorage.removeItem(PATIENT_TOKEN_KEY);
  }
  if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
  return data;
}

const SIM_SEED = { hr: 76, spo2: 97, rr: 14, temp: 36.6 };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export default function MobileApp() {
  const [token, setToken] = useState(() => localStorage.getItem(PATIENT_TOKEN_KEY));
  if (token) return <Home onLogout={() => { localStorage.removeItem(PATIENT_TOKEN_KEY); setToken(null); }} />;
  return <Login onLogin={(t) => { localStorage.setItem(PATIENT_TOKEN_KEY, t); setToken(t); }} />;
}

/* ---------------- LOGIN ---------------- */
function Login({ onLogin }) {
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState('phone');
  const [demoOtp, setDemoOtp] = useState('');
  const [patientName, setPatientName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const sendOtp = async (e) => {
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
    <div className="flex min-h-[100dvh] flex-col bg-slate-950 text-white">
      {/* brand */}
      <div className="flex items-center gap-2.5 px-5 pt-6">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-brand-500 font-extrabold text-white">D</div>
        <div>
          <p className="text-[15px] font-bold leading-tight">DIstoHelp</p>
          <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-teal-400">Patient companion</p>
        </div>
      </div>

      {/* hero */}
      <div className="px-5 pt-6">
        <h1 className="text-[34px] font-extrabold leading-[1.05] text-white">
          Your health,<br /><span className="text-teal-400">in your pocket.</span>
        </h1>
        <p className="mt-3 max-w-[85%] text-[13px] leading-snug text-slate-300">
          Sign in with your registered mobile number to see your vitals, early-warning score and alerts.
        </p>
        <p className="mt-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-amber-400/90">
          <ShieldCheck size={12} /> Demo build · simulated OTP · not a medical device
        </p>
      </div>

      {/* form card */}
      <div className="mt-6 flex-1 rounded-t-3xl bg-slate-900 px-5 pt-6 pb-8">
        {step === 'phone' ? (
          <form onSubmit={sendOtp} className="space-y-4">
            <label className="block text-xs font-bold uppercase tracking-widest text-slate-400">Registered mobile number</label>
            <input
              className="w-full rounded-2xl border border-slate-700 bg-slate-800 px-4 py-4 text-center text-xl font-semibold tracking-widest text-white placeholder-slate-600 outline-none focus:border-teal-400"
              inputMode="numeric" placeholder="10-digit mobile"
              value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))} required
            />
            <p className="rounded-xl bg-slate-800/60 p-2.5 text-[10px] text-slate-400">
              Demo patients: <b className="text-slate-200">98450 01001</b> Beryl · <b>02002</b> Denis · <b>03003</b> Athena · <b>04004</b> April · <b>05005</b> Andre
            </p>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button
              type="submit" disabled={busy || mobile.length !== 10}
              className="w-full rounded-2xl bg-teal-500 py-4 text-base font-black uppercase tracking-widest text-slate-950 transition active:scale-95 disabled:opacity-40"
            >
              {busy ? 'Sending…' : 'Send OTP'}
            </button>
          </form>
        ) : (
          <form onSubmit={verify} className="space-y-4">
            <p className="text-sm text-slate-300">Enter the OTP for <b className="text-white">{patientName}</b></p>
            {demoOtp && <p className="rounded-xl bg-amber-500/15 p-3 text-sm text-amber-300">Simulated OTP: <b className="tracking-[0.3em]">{demoOtp}</b></p>}
            <input
              className="w-full rounded-2xl border border-slate-700 bg-slate-800 px-4 py-4 text-center text-3xl font-black tracking-[0.4em] text-white placeholder-slate-600 outline-none focus:border-teal-400"
              inputMode="numeric" placeholder="······" value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} required
            />
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button type="submit" disabled={busy || otp.length !== 6}
              className="w-full rounded-2xl bg-teal-500 py-4 text-base font-black uppercase tracking-widest text-slate-950 transition active:scale-95 disabled:opacity-40">
              {busy ? 'Verifying…' : 'View my report'}
            </button>
            <button type="button" className="w-full text-center text-sm text-slate-400 underline" onClick={() => { setStep('phone'); setOtp(''); setError(''); }}>
              Change number
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-[10px] uppercase tracking-widest text-slate-500">
          Clinical decision support · not for medical emergencies — call 112 if unwell
        </p>
      </div>
    </div>
  );
}

/* ---------------- HOME ---------------- */
const RISK_STYLE = {
  low: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  'low-medium': 'border-yellow-500/40 bg-yellow-500/10 text-yellow-300',
  medium: 'border-orange-500/40 bg-orange-500/10 text-orange-300',
  high: 'border-red-500/50 bg-red-500/10 text-red-300',
};

function Home({ onLogout }) {
  const [me, setMe] = useState(null);
  const [mode, setMode] = useState('normal');     // 'normal' | null
  const [simOn, setSimOn] = useState(false);
  const [demo, setDemo] = useState('stable');     // 'stable' | 'deteriorating'
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
  const level = latest?.news2?.risk?.level ?? 'low';
  const history = (me?.records ?? []).slice(-18);
  const chart = history.map((r, i) => ({ i, hr: r.vitals.heartRate, spo2: r.vitals.spo2, rr: r.vitals.respiratoryRate, temp: r.vitals.temperature }));

  return (
    <div className="flex min-h-[100dvh] flex-col bg-slate-950 text-white">
      {/* top bar */}
      <header className="flex items-center justify-between border-b border-slate-800 bg-slate-900/60 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-brand-500 text-sm font-extrabold text-white">D</div>
          <p className="text-[13px] font-bold">DIstoHelp <span className="text-teal-400">Patient</span></p>
        </div>
        <button onClick={onLogout} className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1.5 text-[11px] font-semibold text-slate-300 active:scale-95">
          <LogOut size={13} /> Sign out
        </button>
      </header>

      {!p ? (
        <div className="grid flex-1 place-items-center text-slate-400">Loading your report…</div>
      ) : (
        <main className="flex-1 space-y-4 overflow-y-auto px-4 py-4 pb-24">
          {/* identity + score */}
          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <div className="flex items-center gap-3">
              <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 text-xl font-black text-white">
                {initials(p.fullName)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-lg font-extrabold leading-tight">{p.fullName}</p>
                <p className="text-[11px] text-slate-400">{p.id} · {p.age} yrs · {p.gender}</p>
              </div>
              <div className={`grid h-16 w-16 shrink-0 place-items-center rounded-2xl border text-center ${RISK_STYLE[level] ?? RISK_STYLE.low}`}>
                <div>
                  <p className="text-[8px] font-bold uppercase tracking-widest opacity-80">NEWS2</p>
                  <p className="text-2xl font-black leading-none">{news2 ?? '—'}</p>
                </div>
              </div>
            </div>
            {p.primaryCondition && (
              <p className="mt-3 inline-flex rounded-lg bg-amber-500/15 px-2.5 py-1 text-[11px] font-bold text-amber-300">{p.primaryCondition}</p>
            )}
          </section>

          {/* telemetry tiles */}
          <section className="grid grid-cols-4 gap-2 text-center">
            <Tile icon={HeartPulse} label="HR" value={latest?.vitals?.heartRate} unit="bpm" tone="text-rose-400" />
            <Tile icon={Droplets} label="SpO₂" value={latest?.vitals?.spo2} unit="%" tone="text-sky-400" />
            <Tile icon={Wind} label="RR" value={latest?.vitals?.respiratoryRate} unit="/min" tone="text-orange-400" />
            <Tile icon={Thermometer} label="Temp" value={latest?.vitals?.temperature != null ? Number(latest.vitals.temperature).toFixed(1) : null} unit="°C" tone="text-violet-400" />
          </section>

          {/* simulator */}
          <section className="rounded-2xl border border-teal-500/30 bg-teal-500/5 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className={`grid h-9 w-9 place-items-center rounded-xl ${simOn ? 'bg-teal-500 text-slate-950' : 'bg-slate-800 text-teal-400'}`}><Radio size={18} /></span>
                <div>
                  <p className="text-[13px] font-extrabold uppercase tracking-widest text-teal-300">Device simulator</p>
                  <p className="text-[10px] text-slate-400">{simOn ? `Simulating ${demo} · tick ${ticks}` : 'Feeds the hospital pipeline every 3 s'}</p>
                </div>
              </div>
              <button
                onClick={() => setSimOn((s) => !s)}
                className={`rounded-xl px-3 py-2 text-[11px] font-black uppercase tracking-widest transition active:scale-95 ${simOn ? 'bg-red-500 text-white' : 'bg-teal-500 text-slate-950'}`}
              >
                {simOn ? 'Stop' : 'Start'}
              </button>
            </div>
            {simOn && (
              <div className="mt-3 flex gap-2">
                {['stable', 'deteriorating'].map((m) => (
                  <button key={m} onClick={() => setDemo(m)}
                    className={`flex-1 rounded-lg border px-2 py-1.5 text-[10px] font-bold uppercase tracking-widest ${demo === m ? 'border-teal-400 bg-teal-500/15 text-teal-300' : 'border-slate-700 text-slate-400'}`}>
                    {m}
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* recent trend — lightweight SVG, not a chart library (small bundle) */}
          {chart.length > 1 && <TrendChart data={chart} />}

          {/* alerts summary */}
          {(me.alerts ?? []).length > 0 && (
            <section className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4">
              <p className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-widest text-amber-300"><TriangleAlert size={14} /> Latest warning</p>
              <p className="mt-1.5 text-[12px] leading-snug text-amber-100/80">{me.alerts[0].explanation}</p>
            </section>
          )}

          {/* sign-off */}
          <p className="pt-1 text-center text-[9px] font-semibold uppercase tracking-widest text-slate-600">
            Synthetic / simulated data · clinical decision support · not a medical device
          </p>
        </main>
      )}

      {/* emergency footer */}
      <PanicBar patientId={p?.id} patientName={p?.fullName} />
    </div>
  );
}

function rand(min, max) { return min + Math.random() * (max - min); }
function initials(name = '') {
  const parts = String(name).trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts.at(-1)?.[0] || '')).toUpperCase().slice(0, 2) || '?';
}

function Tile({ icon: Icon, label, value, unit, tone }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 px-2 py-2.5">
      <Icon size={14} className={`mx-auto ${tone}`} />
      <p className="mt-1 text-[15px] font-extrabold leading-tight tabular-nums">{value ?? '––'}</p>
      <p className="text-[8px] font-bold uppercase tracking-widest text-slate-500">{label} · {unit}</p>
    </div>
  );
}

function TrendChart({ data }) {
  // minimal SVG sparkline for HR / SpO2
  const hr = data.map((d) => d.hr);
  const minHr = Math.min(...hr) - 2, maxHr = Math.max(...hr) + 2;
  const pts = hr.map((v, i) => `${(i / (hr.length - 1)) * 100},${100 - ((v - minHr) / Math.max(1, maxHr - minHr)) * 100}`);
  const path = `M${pts.join(' L')}`;
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
      <p className="flex items-center justify-between text-[11px] font-bold uppercase tracking-widest text-slate-400">
        <span>Heart rate · last {hr.length} readings</span>
        <span className="tabular-nums text-teal-400">{hr.at(-1).toFixed(0)} bpm</span>
      </p>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="mt-2 h-16 w-full">
        <path d={path} fill="none" stroke="#2dd4bf" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
    </section>
  );
}

// emergency bar — the patient's panic action
function PanicBar({ patientId, patientName }) {
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(null);

  if (!patientId) return null;

  const fire = async () => {
    setSending(true);
    try {
      const r = await patientFetch('/panic', { method: 'POST', body: { patient_id: patientId } });
      setSent(r);
      setConfirming(false);
    } catch (e) {
      setSent({ error: e.message || 'Failed' });
    } finally { setSending(false); }
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-red-900/50 bg-slate-950/95 px-4 pb-5 pt-3 backdrop-blur">
      {!sent ? (
        !confirming ? (
          <button onClick={() => setConfirming(true)}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-red-600 bg-red-600 py-4 text-base font-black uppercase tracking-[0.2em] text-white shadow-lg shadow-red-950 transition active:scale-95">
            <TriangleAlert size={22} /> Panic
          </button>
        ) : (
          <div className="rounded-2xl border-2 border-red-500 bg-red-950 p-3 text-center">
            <p className="text-xs font-black uppercase tracking-widest text-red-300">Alert care team + emergency contacts?</p>
            <div className="mt-2 flex gap-2">
              <button onClick={fire} disabled={sending}
                className="flex-1 rounded-xl bg-red-600 py-3 text-sm font-black uppercase tracking-widest text-white active:scale-95 disabled:opacity-60">
                {sending ? 'Sending…' : 'Yes, send'}
              </button>
              <button onClick={() => setConfirming(false)}
                className="flex-1 rounded-xl border border-slate-600 py-3 text-sm font-bold text-slate-300">Cancel</button>
            </div>
          </div>
        )
      ) : (
        <div className="rounded-2xl border border-emerald-600/50 bg-emerald-950 p-3 text-center text-xs text-emerald-200">
          {sent.error ? `Couldn't send: ${sent.error}` : `Panic sent — care team alerted. Emergency contacts notified${sent.dispatched ? ` (${sent.dispatched})` : ''}.`}
          <button onClick={() => setSent(null)} className="mt-1.5 block w-full text-[10px] font-bold uppercase tracking-widest text-emerald-400 underline">Dismiss</button>
        </div>
      )}
    </div>
  );
}
