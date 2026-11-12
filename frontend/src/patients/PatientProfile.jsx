import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Activity, HeartPulse, LineChart, ClipboardList, Siren, Pencil, Phone, Trash2 } from 'lucide-react';
import { api } from '../services/api.js';
import { Modal, RiskBadge, Spinner } from '../components/ui.jsx';
import { ScoreCard } from '../risk-assessment/ScoreBreakdown.jsx';
import VitalsPanel from '../vitals/VitalsPanel.jsx';
import MonitoringHistory from './MonitoringHistory.jsx';
import EnquirySection from '../enquiries/EnquirySection.jsx';
import PatientForm from './PatientForm.jsx';
import { fmt, initials } from '../services/format.js';
import Live from '../pages/Live.jsx';
import { PanicButton, EmergencyContacts } from '../components/PanicButton.jsx';

const TABS = [
  { id: 'live', label: 'Live', icon: Activity },
  { id: 'vitals', label: 'Vitals', icon: HeartPulse },
  { id: 'history', label: 'History', icon: LineChart },
  { id: 'enquiries', label: 'Enquiries', icon: ClipboardList },
  { id: 'emergency', label: 'Emergency', icon: Siren },
];

export default function PatientProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'live';
  const isUserAdded = !/^p0[1-5]$/.test(id || '');   // seeded cohort is protected
  const [p, setP] = useState(null);
  const [editing, setEditing] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(
    () => api(`/patients/${id}`).then(setP).catch((e) => setErr(e.message)),
    [id]
  );
  useEffect(() => { load(); }, [load]);

  if (err) return <p className="text-red-600">{err}</p>;
  if (!p) return <Spinner />;
  const latest = p.records.at(-1);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to="/patients" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:underline">
          <ArrowLeft size={14} /> Patients
        </Link>
        <div className="flex items-center gap-2">
          <button className="btn-ghost" onClick={() => setEditing(true)}><Pencil size={16} /> Edit</button>
          {isUserAdded && (
            <button
              className="btn-ghost !border-red-200 !text-red-600 hover:!bg-red-50"
              onClick={async () => {
                if (!window.confirm(`Delete ${p.fullName} (${p.id}) and all their records? This cannot be undone.`)) return;
                try { await api(`/patients/${p.id}`, { method: 'DELETE' }); navigate('/patients'); }
                catch (e) { setErr(e.message || 'Delete failed'); }
              }}>
              <Trash2 size={16} /> Delete
            </button>
          )}
        </div>
      </div>

      {/* header */}
      <section className="card flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-500 text-xl font-bold text-white">
            {initials(p.fullName)}
          </div>
          <div>
            <h1 className="text-2xl font-bold leading-tight">{p.fullName}</h1>
            <p className="text-sm text-gray-500">{p.id} · {p.age} yrs · {p.gender}</p>
            <p className="mt-1 flex items-center gap-2 text-sm font-semibold text-gray-800">
              {p.primaryCondition && (
                <span className="rounded-full bg-amber-50 px-3 py-0.5 text-xs font-bold text-amber-800">{p.primaryCondition}</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <a className="flex items-center gap-1.5 text-sm text-gray-600" href={`tel:${p.phone}`}>
            <Phone size={15} className="text-brand-500" /> {p.phone}
          </a>
          {latest && <RiskBadge level={latest.news2.risk.level} />}
        </div>
      </section>

      {/* score card */}
      <ScoreCard news2={latest?.news2} measuredAt={latest?.measuredAt} />

      {/* tabs */}
      <div className="flex flex-wrap gap-1.5 border-b border-gray-200 pb-px">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setParams({ tab: id })}
            className={`flex items-center gap-1.5 rounded-t-xl border-b-2 px-4 py-2 text-sm font-semibold transition ${
              tab === id
                ? 'border-brand-500 text-brand-700'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {/* tab panels */}
      {tab === 'live' && <Live patientId={p.id} />}
      {tab === 'vitals' && <VitalsPanel patient={p} onSaved={load} defaultOpen />}
      {tab === 'history' && <MonitoringHistory records={p.records} patientName={p.fullName} />}
      {tab === 'enquiries' && <EnquirySection patient={p} onSaved={load} />}
      {tab === 'emergency' && (
        <div className="grid gap-5 lg:grid-cols-2">
          <PanicButton patientId={p.id} patientName={p.fullName} />
          <EmergencyContacts patientId={p.id} patientName={p.fullName} />
        </div>
      )}

      {editing && (
        <Modal title="Edit patient" onClose={() => setEditing(false)}>
          <PatientForm initial={p} onSaved={() => { setEditing(false); load(); }} />
        </Modal>
      )}
    </div>
  );
}
