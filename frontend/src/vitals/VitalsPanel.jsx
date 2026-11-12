import { useEffect, useState } from 'react';
import { ChevronDown, HeartPulse, Save } from 'lucide-react';
import { api } from '../services/api.js';
import { fmt } from '../services/format.js';
import { ScoreBreakdown } from '../risk-assessment/ScoreBreakdown.jsx';
import SensorPanel from '../sensors/SensorPanel.jsx';

export const VITAL_FIELDS = [
  { key: 'respiratoryRate', label: 'Respiratory Rate', unit: 'breaths/min', step: 1 },
  { key: 'heartRate', label: 'Heart Rate / Pulse', unit: 'bpm', step: 1 },
  { key: 'spo2', label: 'Oxygen Saturation', unit: 'SpO₂ %', step: 1 },
  { key: 'temperature', label: 'Body Temperature', unit: '°C', step: 0.1 },
  { key: 'height', label: 'Height', unit: 'cm', step: 0.1 },
  { key: 'headCircumference', label: 'Head Circumference', unit: 'cm', step: 0.1 },
  { key: 'weight', label: 'Body Weight', unit: 'kg', step: 0.1 },
  { key: 'bmi', label: 'BMI (auto)', unit: 'kg/m²', readOnly: true },
  { key: 'systolic', label: 'Systolic BP', unit: 'mmHg', step: 1 },
  { key: 'diastolic', label: 'Diastolic BP', unit: 'mmHg', step: 1 },
];

const ABNORMAL = {
  respiratoryRate: (v) => v < 12 || v > 20,
  heartRate: (v) => v < 60 || v > 100,
  spo2: (v) => v < 95,
  temperature: (v) => v < 36.1 || v > 38,
  systolic: (v) => v < 100 || v > 140,
  diastolic: (v) => v > 90 || v < 60,
  bmi: (v) => v < 18.5 || v >= 25,
};

const INPUT_KEYS = VITAL_FIELDS.map((f) => f.key).filter((k) => k !== 'bmi');
const toInputs = (v = {}) => Object.fromEntries(INPUT_KEYS.map((k) => [k, v[k] ?? '']));

export default function VitalsPanel({ patient, onSaved, defaultOpen = false }) {
  const latest = patient.records.at(-1);
  const [open, setOpen] = useState(defaultOpen);
  const [values, setValues] = useState(() => toInputs(latest?.vitals));
  const [onOxygen, setOnOxygen] = useState(!!latest?.vitals?.onOxygen);
  const [consciousness, setConsciousness] = useState(latest?.vitals?.consciousness || 'A');
  const [source, setSource] = useState('manual');
  const [bmi, setBmi] = useState(latest?.vitals?.bmi ?? null);
  const [preview, setPreview] = useState(latest?.news2 ?? null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    setValues(toInputs(latest?.vitals));
    setOnOxygen(!!latest?.vitals?.onOxygen);
    setConsciousness(latest?.vitals?.consciousness || 'A');
    setBmi(latest?.vitals?.bmi ?? null);
    setSource('manual');
  }, [latest?.id]);

  useEffect(() => {
    const t = setTimeout(() => {
      api('/patients/score', { method: 'POST', body: { vitals: { ...values, onOxygen, consciousness } } })
        .then((d) => { setPreview(d.news2); setBmi(d.vitals.bmi); })
        .catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [values, onOxygen, consciousness]);

  const change = (key, val) => {
    setValues((v) => ({ ...v, [key]: val }));
    setSource('manual');
  };

  const applyReading = (vitals, src) => {
    const next = {};
    INPUT_KEYS.forEach((k) => { if (vitals[k] != null) next[k] = String(vitals[k]); });
    setValues((v) => ({ ...v, ...next }));
    setSource(src);
  };

  const save = async () => {
    setBusy(true); setErr(''); setMsg('');
    try {
      const rec = await api(`/patients/${patient.id}/records`, {
        method: 'POST',
        body: { vitals: { ...values, onOxygen, consciousness }, source },
      });
      setMsg(`Saved ${fmt(rec.measuredAt)} · NEWS2 total ${rec.news2.total}`);
      onSaved?.();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-600"><HeartPulse /></div>
          <div className="text-left">
            <h2 className="font-bold tracking-wide">VITAL SIGNS MONITORING</h2>
            <p className="text-xs text-gray-500">
              {latest ? `Last reading ${fmt(latest.measuredAt)} · source: ${latest.source}` : 'No readings yet'}
            </p>
          </div>
        </div>
        <ChevronDown className={`transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="mt-6 space-y-6">
          <SensorPanel patient={patient} onReading={applyReading} />

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            {VITAL_FIELDS.map((f) => {
              const raw = f.key === 'bmi' ? (bmi ?? '') : values[f.key];
              const n = raw === '' || raw == null ? null : Number(raw);
              const abnormal = n !== null && ABNORMAL[f.key]?.(n);
              return (
                <div key={f.key}
                  className={`rounded-xl border p-3 transition ${abnormal ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-gray-50'}`}>
                  <label className="text-xs font-semibold text-gray-600">{f.label}</label>
                  <div className="mt-1 flex items-baseline gap-1">
                    <input
                      type="number"
                      step={f.step || 'any'}
                      readOnly={f.readOnly}
                      value={raw}
                      onChange={(e) => change(f.key, e.target.value)}
                      className="w-full bg-transparent text-xl font-bold text-gray-900 outline-none"
                    />
                    <span className="shrink-0 text-xs text-gray-500">{f.unit}</span>
                  </div>
                  {abnormal && <p className="mt-1 text-[11px] font-semibold text-red-600">Outside expected range</p>}
                </div>
              );
            })}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={onOxygen}
                onChange={(e) => { setOnOxygen(e.target.checked); setSource('manual'); }} />
              Patient is on supplemental oxygen
            </label>
            <div>
              <label className="label">Consciousness</label>
              <select className="input" value={consciousness}
                onChange={(e) => { setConsciousness(e.target.value); setSource('manual'); }}>
                <option value="A">Alert</option>
                <option value="CVPU">New confusion / CVPU</option>
              </select>
            </div>
          </div>

          <div>
            <h3 className="mb-3 text-sm font-semibold">Early warning score (live preview)</h3>
            <ScoreBreakdown news2={preview} />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button className="btn-primary" disabled={busy} onClick={save}>
              <Save size={16} /> Save reading
            </button>
            <span className="rounded-lg bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600">Source: {source}</span>
            {msg && <span className="text-sm text-green-700">{msg}</span>}
            {err && <span className="text-sm text-red-600">{err}</span>}
          </div>
        </div>
      )}
    </section>
  );
}