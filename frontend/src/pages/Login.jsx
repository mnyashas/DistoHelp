import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, HeartPulse } from 'lucide-react';
import { api } from '../services/api.js';
import { useAuth } from '../services/AuthContext.jsx';
import { Brand } from '../components/ui.jsx';

const ROLES = [
  { id: 'staff', label: 'Healthcare worker', icon: ShieldCheck, hint: 'Staff sign in · authorized healthcare personnel only' },
  { id: 'patient', label: 'Patient', icon: HeartPulse, hint: 'Patient sign in · view your own report' },
];

const PATIENT_HINTS = [
  ['Beryl (p01)', '98450 01001'],
  ['Denis (p02)', '98450 02002'],
  ['Athena (p03)', '98450 03003'],
  ['April (p04)', '98450 04004'],
  ['Andre (p05)', '98450 05005'],
];

export default function Login() {
  const [role, setRole] = useState('staff');
  const [step, setStep] = useState('credentials');
  const [aadhaar, setAadhaar] = useState('');
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState('');
  const [demoOtp, setDemoOtp] = useState('');
  const [patientName, setPatientName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const switchRole = (r) => {
    setRole(r); setStep('credentials');
    setAadhaar(''); setMobile(''); setOtp(''); setDemoOtp(''); setError(''); setPatientName('');
  };

  const sendOtp = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      if (role === 'staff') {
        const d = await api('/auth/send-otp', { method: 'POST', body: { aadhaar, mobile } });
        setDemoOtp(d.demoOtp || '');
      } else {
        const d = await api('/patient/send-otp', { method: 'POST', body: { mobile: mobile.replace(/\s/g, '') } });
        setPatientName(d.patient_name || '');
        setDemoOtp(d.demoOtp || '');
      }
      setStep('otp');
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const verify = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      if (role === 'staff') {
        const d = await api('/auth/verify-otp', { method: 'POST', body: { aadhaar, otp } });
        login(d.token, d.user);
        navigate('/');
      } else {
        const d = await api('/patient/verify', { method: 'POST', body: { mobile: mobile.replace(/\s/g, ''), otp } });
        localStorage.setItem('spm_patient_token', d.token);
        navigate('/me');
      }
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const staffValid = aadhaar.length === 12 && mobile.length === 10;
  const patientValid = mobile.length === 10;
  const canSubmit = role === 'staff' ? staffValid : patientValid;

  return (
    <div className="grid min-h-screen md:grid-cols-2">
      <div className="hidden flex-col justify-between bg-navy-900 bg-[radial-gradient(circle_at_30%_20%,rgba(20,184,166,.35),transparent_50%)] p-12 text-white md:flex">
        <Brand />
        <div>
          <h1 className="text-4xl font-extrabold leading-tight">
            Detect deterioration early. <span className="text-teal-300">Act faster.</span>
          </h1>
          <p className="mt-4 max-w-md text-slate-300">
            Monitor vital signs, calculate NEWS2 early warning scores and keep patients safe —
            one workspace for care teams and one personal view for patients.
          </p>
        </div>
        <p className="text-xs text-slate-400">Decision-support tool · Demo build with simulated OTP and dummy data</p>
      </div>

      <div className="grid place-items-center bg-slate-50 p-6">
        <div className="card w-full max-w-md p-8">
          {/* role switcher */}
          <div className="mb-6 grid grid-cols-2 rounded-2xl bg-slate-100 p-1.5">
            {ROLES.map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => switchRole(id)}
                className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                  role === id ? 'bg-white text-navy-900 shadow' : 'text-slate-500 hover:text-slate-700'
                }`}>
                <Icon size={17} /> {label}
              </button>
            ))}
          </div>

          <div className="mb-6 flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-teal-50 text-teal-600"><ShieldCheck /></div>
            <div>
              <h2 className="text-xl font-bold">{role === 'staff' ? 'Staff sign in' : 'Patient sign in'}</h2>
              <p className="text-xs text-slate-500">{ROLES.find((r) => r.id === role).hint}</p>
            </div>
          </div>

          {step === 'credentials' ? (
            <form onSubmit={sendOtp} className="space-y-4">
              {role === 'staff' ? (
                <>
                  <div>
                    <label className="label">Aadhaar number</label>
                    <input className="input tracking-widest" inputMode="numeric" placeholder="12-digit Aadhaar"
                      value={aadhaar} onChange={(e) => setAadhaar(e.target.value.replace(/\D/g, '').slice(0, 12))} required />
                  </div>
                  <div>
                    <label className="label">Registered mobile number</label>
                    <input className="input" inputMode="numeric" placeholder="10-digit mobile"
                      value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))} required />
                  </div>
                  <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
                    Demo account: Aadhaar <b>9999 4105 7058</b> · mobile <b>98765 43210</b> · OTP <b>123456</b>
                  </p>
                </>
              ) : (
                <>
                  <div>
                    <label className="label">Registered mobile number</label>
                    <input className="input" inputMode="numeric" placeholder="10-digit mobile"
                      value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))} required />
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
                    <p className="mb-1.5 font-semibold text-slate-600">Any registered patient can sign in — the Synthea cohort:</p>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                      {PATIENT_HINTS.map(([name, num]) => (
                        <p key={num}><span className="text-slate-400">{name}:</span> <b className="text-navy-800">{num}</b></p>
                      ))}
                    </div>
                    <p className="mt-2"><b>New patients you add work too</b> — they sign in with the phone you registered them with (give it 10 digits). OTP: <b>123456</b> for everyone.</p>
                  </div>
                </>
              )}
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button className="btn-primary w-full justify-center" disabled={busy || !canSubmit}>
                Send OTP
              </button>
            </form>
          ) : (
            <form onSubmit={verify} className="space-y-4">
              <p className="text-sm text-slate-600">
                {role === 'staff'
                  ? 'Enter the 6-digit OTP sent to your registered mobile number.'
                  : `Enter the OTP to view ${patientName ? patientName + "'s" : 'your'} report.`}
              </p>
              {demoOtp && (
                <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
                  Simulated OTP for demo: <b className="tracking-widest">{demoOtp}</b>
                </p>
              )}
              <input className="input text-center text-2xl tracking-[0.5em]" inputMode="numeric" placeholder="······"
                value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} required />
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button className="btn-primary w-full justify-center" disabled={busy || otp.length !== 6}>
                {role === 'staff' ? 'Verify & enter workspace' : 'View my report'}
              </button>
              <button type="button" className="w-full text-sm text-teal-600 hover:underline"
                onClick={() => { setStep('credentials'); setOtp(''); setError(''); }}>
                ← Back
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
