import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, Send } from 'lucide-react';
import { api } from '../services/api.js';
import { fmt } from '../services/format.js';

const FIELDS = [
  ['mainComplaint', 'Main complaint *', true],
  ['symptoms', 'Symptoms experienced'],
  ['duration', 'Duration of symptoms'],
  ['painDescription', 'Pain or discomfort description'],
  ['existingConditions', 'Existing medical conditions'],
  ['currentMedications', 'Current medications'],
  ['allergies', 'Allergies'],
  ['additionalObservations', 'Additional observations'],
  ['staffRemarks', 'Healthcare staff remarks'],
];
const EMPTY = Object.fromEntries(FIELDS.map(([k]) => [k, '']));

export default function EnquirySection({ patient, onSaved }) {
  const [f, setF] = useState(EMPTY);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true); setErr('');
    try {
      await api(`/patients/${patient.id}/enquiries`, { method: 'POST', body: f });
      setF(EMPTY);
      onSaved?.();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card space-y-5">
      <div className="flex items-center gap-3">
        <ClipboardList className="text-brand-500" />
        <h2 className="font-bold tracking-wide">PATIENT ENQUIRY / HEALTH ISSUES</h2>
      </div>

      {patient.enquiries.length === 0 ? (
        <p className="text-sm text-gray-500">No enquiries recorded yet.</p>
      ) : (
        <ul className="space-y-3">
          {[...patient.enquiries].reverse().map((e) => (
            <li key={e.id} className="rounded-xl border border-gray-200 p-4 text-sm">
              <div className="flex flex-wrap justify-between gap-2">
                <p className="font-semibold">{e.mainComplaint}</p>
                <span className="text-xs text-gray-500">{fmt(e.createdAt)}</span>
              </div>
              <dl className="mt-2 grid gap-x-6 gap-y-1 md:grid-cols-2">
                {FIELDS.slice(1).filter(([k]) => e[k]).map(([k, label]) => (
                  <div key={k}>
                    <dt className="inline text-xs font-semibold text-gray-500">{label}: </dt>
                    <dd className="inline">{e[k]}</dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {FIELDS.map(([k, label, required]) => (
          <div key={k} className={required ? 'md:col-span-2' : ''}>
            <label className="label">{label}</label>
            <textarea rows={2} className="input" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
          </div>
        ))}
      </div>

      {err && <p className="text-sm text-red-600">{err}</p>}
      <button className="btn-primary" disabled={busy || !f.mainComplaint.trim()} onClick={submit}>
        <Send size={16} /> Submit Enquiry
      </button>
    </section>
  );
}

export function EnquiriesPage() {
  const [list, setList] = useState(null);
  useEffect(() => { api('/patients/enquiries').then(setList); }, []);

  if (!list) return <p className="text-sm text-gray-500">Loading…</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Patient Enquiries</h1>
      {list.length === 0 && <div className="card text-sm text-gray-500">No enquiries yet.</div>}
      <div className="grid gap-4 md:grid-cols-2">
        {list.map((e) => (
          <Link key={e.id} to={`/patients/${e.patientId}`} className="card transition hover:shadow-xl">
            <div className="flex justify-between gap-2">
              <p className="font-semibold">{e.patientName}</p>
              <span className="text-xs text-gray-500">{fmt(e.createdAt)}</span>
            </div>
            <p className="mt-2 text-sm">{e.mainComplaint}</p>
            {e.staffRemarks && <p className="mt-2 text-xs text-gray-500">Remarks: {e.staffRemarks}</p>}
          </Link>
        ))}
      </div>
    </div>
  );
}