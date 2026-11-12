import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { api } from '../services/api.js';
import { useAuth } from '../services/AuthContext.jsx';
import { Brand } from '../components/ui.jsx';

export default function Login() {
  const [step, setStep] = useState('credentials');
  const [aadhaar, setAadhaar] = useState('');
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState('');
  const [demoOtp, setDemoOtp] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const sendOtp = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const d = await api('/auth/send-otp', { method: 'POST', body: { aadhaar, mobile } });
      setDemoOtp(d.demoOtp || '');
      setStep('otp');
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const verify = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const d = await api('/auth/verify-otp', { method: 'POST', body: { aadhaar, otp } });
      login(d.token, d.user);
      navigate('/');
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <div className="grid min-h-screen md:grid-cols-2">
      <div className="hidden flex-col justify-between bg-navy-900 bg-[radial-gradient(circle_at_30%_20%,rgba(20,184,166,.35),transparent_50%)] p-12 text-white md:flex">
        <Brand />
        <div>
          <h1 className="text-4xl font-extrabold leading-tight">
            Detect deterioration early. <span className="text-teal-300">Act faster.</span>
          </h1>
          <p className="mt-4 max-w-md text-slate-300">
            Monitor vital signs, calculate NEWS2 early warning scores and record patient enquiries in one secure workspace.
          </p>
        </div>
        <p className="text-xs text-slate-400">Decision-support tool · Demo build with simulated OTP and dummy data</p>
      </div>

      <div className="grid place-items-center bg-slate-50 p-6">
        <div className="card w-full max-w-md p-8">
          <div className="mb-6 flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-teal-50 text-teal-600"><ShieldCheck /></div>
            <div>
              <h2 className="text-xl font-bold">Staff sign in</h2>
              <p className="text-xs text-slate-500">Authorized healthcare personnel only</p>
            </div>
          </div>

          {step === 'credentials' ? (
            <form onSubmit={sendOtp} className="space-y-4">
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
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button className="btn-primary w-full justify-center" disabled={busy || aadhaar.length !== 12 || mobile.length !== 10}>
                Send OTP
              </button>
              <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
                Demo account: Aadhaar 9999 4105 7058 · mobile 98765 43210 (dummy data).
              </p>
            </form>
          ) : (
            <form onSubmit={verify} className="space-y-4">
              <p className="text-sm text-slate-600">Enter the 6-digit OTP sent to your registered mobile number.</p>
              {demoOtp && (
                <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
                  Simulated OTP for demo: <b className="tracking-widest">{demoOtp}</b>
                </p>
              )}
              <input className="input text-center text-2xl tracking-[0.5em]" inputMode="numeric" placeholder="······"
                value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} required />
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button className="btn-primary w-full justify-center" disabled={busy || otp.length !== 6}>Verify & Login</button>
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