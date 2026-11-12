import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { HeartPulse, Wifi, WifiOff } from 'lucide-react';

const RISK = {
  none: { color: '#10b981', label: 'STABLE', glow: 'rgba(16,185,129,.45)' },
  low: { color: '#10b981', label: 'STABLE', glow: 'rgba(16,185,129,.45)' },
  watch: { color: '#eab308', label: 'WATCH', glow: 'rgba(234,179,8,.5)' },
  review: { color: '#f97316', label: 'REVIEW', glow: 'rgba(249,115,22,.55)' },
  urgent: { color: '#ef4444', label: 'URGENT', glow: 'rgba(239,68,68,.65)' },
};

function Arc({ score, color }) {
  const R = 84, C = 2 * Math.PI * R;
  const frac = Math.min(Math.max(score, 0), 14) / 14;
  return (
    <svg viewBox="0 0 220 220" className="absolute inset-0 h-full w-full -rotate-90">
      <circle cx="110" cy="110" r={R} fill="none" stroke="#1f2937" strokeWidth="16" />
      <circle
        cx="110" cy="110" r={R} fill="none" stroke={color} strokeWidth="16"
        strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - frac * 0.75 - 0.125)}
        style={{ transition: 'stroke-dashoffset .6s, stroke .6s', filter: `drop-shadow(0 0 12px ${color})` }}
      />
    </svg>
  );
}

export default function Watch() {
  const [params] = useSearchParams();
  const patientId = params.get('p') || 'p02';
  const [patientName, setPatientName] = useState(patientId);
  const [vitals, setVitals] = useState({ heartRate: null, spo2: null, respiratoryRate: null, temperature: null });
  const [score, setScore] = useState({ total: null, level: 'none', spo2_scale: null });
  const [alert, setAlert] = useState(null);
  const [now, setNow] = useState(new Date());
  const [connected, setConnected] = useState(false);
  const lastBuzz = useRef(0);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    fetch(`/api/patients/${patientId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setPatientName((d.fullName || d.name || '').split(' ')[0]))
      .catch(() => {});
  }, [patientId]);

  useEffect(() => {
    let ws;
    let retry;
    const connect = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      ws = new WebSocket(`${proto}://${location.host}/ws/live`);
      ws.onopen = () => setConnected(true);
      ws.onclose = () => { setConnected(false); retry = setTimeout(connect, 1500); };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === 'vital' && msg.data.patient_id === patientId) {
            setVitals((v) => ({ ...v, [mapKey(msg.data.loinc)]: msg.data.value }));
            if (msg.data.score) setScore({ total: msg.data.score.total, level: msg.data.score.level, spo2_scale: msg.data.score.spo2_scale });
            if (msg.data.alert) triggerAlert(msg.data.alert);
          } else if (msg.type === 'alert' && msg.data.patient_id === patientId) {
            triggerAlert(msg.data);
          }
        } catch { /* ignore malformed frames */ }
      };
    };
    const triggerAlert = (a) => {
      setAlert(a);
      setTimeout(() => setAlert((cur) => (cur && cur.id === a.id ? null : cur)), 20000);
      if (navigator.vibrate && Date.now() - lastBuzz.current > 8000) {
        navigator.vibrate(a.level === 'urgent' ? [300, 120, 300, 120, 300] : [160, 80, 160]);
        lastBuzz.current = Date.now();
      }
    };
    connect();
    return () => { clearTimeout(retry); ws && ws.close(); };
  }, [patientId]);

  const risk = RISK[score.level] || RISK.none;
  const urgent = score.level === 'urgent' || (alert && alert.level === 'urgent');

  return (
    <div className="fixed inset-0 overflow-hidden bg-black text-white select-none" style={{ fontFamily: 'ui-rounded, system-ui' }}>
      {/* back to dashboard — subtle, top-right (appears on hover) */}
      <Link to="/" className="absolute right-3 top-3 z-10 rounded-full border border-white/15 bg-black/40 px-3 py-1.5 text-[11px] font-semibold text-white/60 opacity-40 transition hover:opacity-100">
        ← Dashboard
      </Link>

      {/* ambient glow */}
      <div className="pointer-events-none absolute inset-0 transition-all duration-700"
           style={{ background: `radial-gradient(circle at 50% 45%, ${risk.glow} 0%, transparent 65%)` }} />
      {urgent && <div className="pointer-events-none absolute inset-0 animate-pulse border-[10px] border-red-500/70" />}

      <div className="relative flex h-full flex-col items-center justify-between p-6 pt-5">
        {/* top row: time + link state */}
        <div className="flex w-full items-center justify-between text-[13px] text-gray-400">
          <span className="tabular-nums tracking-widest">{now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
          <div className="flex items-center gap-2">
            {connected ? <Wifi size={14} className="text-emerald-400" /> : <WifiOff size={14} className="text-red-400" />}
            <span>{connected ? 'LIVE' : 'RECONNECTING'}</span>
          </div>
        </div>

        {/* patient */}
        <div className="text-center">
          <p className="text-[11px] uppercase tracking-[0.35em] text-gray-500">Post-discharge monitor</p>
          <h1 className="mt-0.5 text-3xl font-extrabold tracking-wide">{patientName}</h1>
        </div>

        {/* gauge + HR */}
        <div className="relative grid h-52 w-52 place-items-center">
          <Arc score={score.total ?? 0} color={risk.color} />
          <div className="text-center">
            <HeartPulse size={26} className="mx-auto text-red-400 animate-pulse" />
            <p className="mt-1 text-6xl font-black tabular-nums leading-none">{vitals.heartRate ?? '––'}</p>
            <p className="mt-1 text-[11px] uppercase tracking-widest text-gray-400">bpm · NEWS2 {score.total ?? '–'}</p>
          </div>
        </div>

        {/* vitals row */}
        <div className="grid w-full grid-cols-3 gap-3 text-center">
          <Vital label="SpO₂" value={vitals.spo2} unit="%" tone={vitals.spo2 != null && vitals.spo2 < 92 ? 'bad' : 'ok'} />
          <Vital label="Resp rate" value={vitals.respiratoryRate} unit="/min" tone="ok" />
          <Vital label="Temp" value={vitals.temperature != null ? vitals.temperature.toFixed(1) : null} unit="°C" tone="ok" />
        </div>

        {/* status banner */}
        <div className="w-full">
          <div className="rounded-2xl py-3 text-center text-xl font-black tracking-[0.3em] transition-colors duration-500"
               style={{ background: risk.color, color: urgent ? '#fff' : '#08131f', boxShadow: `0 0 40px ${risk.glow}` }}>
            {alert && (alert.level === 'urgent' || alert.level === 'review') ? `${alert.level.toUpperCase()} ALERT` : risk.label}
          </div>
          {alert && <p className="mt-2 line-clamp-2 text-center text-[11px] leading-snug text-gray-300">{alert.explanation}</p>}
          <p className="mt-1 text-center text-[9px] uppercase tracking-widest text-gray-600">Clinical decision support — not a medical diagnosis</p>
        </div>
      </div>
    </div>
  );
}

function Vital({ label, value, unit, tone }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-2 py-3">
      <p className="text-[10px] uppercase tracking-widest text-gray-400">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${tone === 'bad' ? 'text-red-400' : 'text-white'}`}>{value ?? '––'}<span className="text-xs font-medium text-gray-500"> {unit}</span></p>
    </div>
  );
}

function mapKey(loinc) {
  return { '8867-4': 'heartRate', '2708-6': 'spo2', '9279-1': 'respiratoryRate', '8310-5': 'temperature' }[loinc];
}
