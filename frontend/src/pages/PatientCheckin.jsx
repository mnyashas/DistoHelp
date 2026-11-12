import { useEffect, useState } from 'react';
import { HeartPulse, CheckCircle2, ChevronRight, Stethoscope } from 'lucide-react';
import { api } from '../services/api.js';

// Patient-facing daily symptom check-in — PDF Hint #1.
// Breathlessness / fever / dizziness feed straight into the monitoring score.
const QUESTIONS = [
  { key: 'breathlessness', label: 'Breathlessness', options: [['None', 0], ['Mild', 1], ['Severe', 2]] },
  { key: 'fever', label: 'Fever', options: [['No', 0], ['Yes', 1]] },
  { key: 'dizziness', label: 'Dizziness', options: [['None', 0], ['Mild', 1], ['Severe', 2]] },
];

export default function PatientCheckin() {
  const [patients, setPatients] = useState([]);
  const [patientId, setPatientId] = useState('');
  const [answers, setAnswers] = useState({ breathlessness: 0, fever: 0, dizziness: 0 });
  const [notes, setNotes] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/patients').then((list) => {
      setPatients(list);
      if (list[0]) setPatientId(list[0].id);
    }).catch(() => {});
  }, []);

  const submit = async () => {
    if (!patientId) return;
    setBusy(true);
    try {
      const d = await api('/checkins', {
        method: 'POST',
        body: { patient_id: patientId, ...answers, notes: notes || null },
      });
      setResult(d);
    } catch (e) {
      setResult({ error: e.message });
    } finally {
      setBusy(false);
    }
  };

  const chosen = (k) => patients.find((p) => p.id === k);

  if (result) {
    return (
      <div className="grid min-h-screen place-items-center bg-gray-50 p-6">
        <div className="card w-full max-w-md text-center">
          {result.error ? (
            <p className="text-red-600">{result.error}</p>
          ) : (
            <>
              <CheckCircle2 size={48} className="mx-auto text-brand-500" />
              <h1 className="mt-3 text-2xl font-bold">Thank you</h1>
              <p className="mt-2 text-gray-600">
                Your symptoms were recorded for today.
                {result.score_modifier > 0
                  ? ` Your care team sees this report as part of your monitoring (severity +${result.score_modifier}).`
                  : ' You reported feeling fine — no early warning points were added.'}
              </p>
              <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
                Clinical decision support only — not a medical diagnosis. Call your hospital helpline if you feel much worse.
              </p>
            </>
          )}
          <button className="btn-primary mt-4" onClick={() => { setResult(null); setAnswers({ breathlessness: 0, fever: 0, dizziness: 0 }); setNotes(''); }}>
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-500 text-white"><Stethoscope size={22} /></div>
          <div>
            <p className="font-bold">DIstoHelp — Daily Check-in</p>
            <p className="text-xs text-gray-500">Takes 30 seconds. Your care team monitors these answers.</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-lg space-y-5 p-6">
        <div className="card space-y-2">
          <label className="label">Who are you?</label>
          <select className="input" value={patientId} onChange={(e) => setPatientId(e.target.value)}>
            {patients.map((p) => <option key={p.id} value={p.id}>{p.fullName} ({p.id})</option>)}
          </select>
        </div>

        {QUESTIONS.map(({ key, label, options }) => (
          <div key={key} className="card space-y-2">
            <label className="label">{label}</label>
            <div className="grid grid-cols-3 gap-2">
              {options.map(([text, val]) => (
                <button key={val} onClick={() => setAnswers((a) => ({ ...a, [key]: val }))}
                  className={`rounded-xl border px-3 py-3 text-sm font-semibold transition ${
                    answers[key] === val
                      ? val === 0 ? 'border-brand-500 bg-brand-50 text-brand-800' : val === 1 ? 'border-amber-400 bg-amber-50 text-amber-800' : 'border-red-400 bg-red-50 text-red-800'
                      : 'border-gray-200 bg-white text-gray-600'
                  }`}>
                  {text}
                </button>
              ))}
            </div>
          </div>
        ))}

        <div className="card space-y-2">
          <label className="label">Anything else? (optional)</label>
          <textarea className="input" rows={2} placeholder="e.g. chest tightness when climbing stairs" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <button className="btn-primary w-full justify-center py-4 text-base" disabled={busy || !patientId} onClick={submit}>
          Submit daily check-in <ChevronRight size={18} />
        </button>
        <p className="text-center text-[11px] uppercase tracking-widest text-gray-400">
          Clinical decision support only — not a medical diagnosis system
        </p>
      </main>
    </div>
  );
}
