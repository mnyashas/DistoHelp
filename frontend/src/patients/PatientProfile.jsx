import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Activity, HeartPulse, LineChart, ClipboardList, Siren, Pencil, Phone, Trash2,
  Download, Loader2,
} from 'lucide-react';
import { api, downloadFile } from '../services/api.js';
import { Modal, RISK, RiskBadge, Spinner } from '../components/ui.jsx';
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
  const [exporting, setExporting] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(
    () => api(`/patients/${id}`).then(setP).catch((e) => setErr(e.message)),
    [id]
  );
  useEffect(() => { load(); }, [load]);

  const exportPdf = async () => {
    setExporting(true); setErr('');
    try {
      const safe = (p?.fullName || id || 'patient').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
      await downloadFile(`/patients/${id}/report.pdf`, `DIstoHelp_${safe}_${id}.pdf`);
    } catch (e) {
      setErr(e.message || 'Export failed');
    } finally { setExporting(false); }
  };

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
          <button className="btn-primary" onClick={exportPdf} disabled={exporting}>
            {exporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} Export PDF
          </button>
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

      {/* header — personal data, big and legible */}
      <section className="card !p-6">
        <div className="flex flex-wrap items-center gap-6">
          <div className="grid h-24 w-24 shrink-0 place-items-center rounded-3xl bg-gradient-to-br from-brand-400 to-brand-600 text-3xl font-black text-white shadow-theme-md">
            {initials(p.fullName)}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-3xl font-extrabold leading-tight text-gray-900">{p.fullName}</h1>
            <p className="mt-0.5 text-base font-medium text-gray-500">
              <span className="text-gray-400">{p.id}</span> · {p.age} yrs · {p.gender} · registered {fmt(p.registeredOn)}
            </p>
            <p className="mt-2 flex items-center gap-2 text-lg font-semibold text-gray-800">
              <Phone size={18} className="text-brand-500" />
              <a className="tabular-nums hover:underline" href={`tel:${p.phone}`}>{p.phone}</a>
            </p>
            {p.primaryCondition && (
              <p className="mt-3 inline-flex max-w-full items-center rounded-2xl bg-amber-50 px-4 py-2 text-base font-bold text-amber-900 ring-1 ring-amber-200">
                {p.primaryCondition}
              </p>
            )}
          </div>

          {/* compact NEWS2 — icon, not a billboard */}
          {latest && (
            <div className="flex shrink-0 flex-col items-center rounded-2xl border border-gray-200 px-4 py-3">
              <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-gray-400">NEWS2</p>
              <div className={`mt-1 grid h-16 w-16 place-items-center rounded-2xl text-white shadow-theme-md ${RISK[latest.news2.risk.level]?.bar || 'bg-gray-300'}`}>
                <span className="text-3xl font-black leading-none tabular-nums">{latest.news2.total}</span>
              </div>
              <div className="mt-2"><RiskBadge level={latest.news2.risk.level} /></div>
              <p className="mt-1 text-[10px] text-gray-400">{fmt(latest.measuredAt)}</p>
            </div>
          )}
        </div>
        {p.medicalHistory && (
          <p className="mt-4 border-t border-gray-100 pt-4 line-clamp-1 text-sm text-gray-500" title={p.medicalHistory}>
            {p.medicalHistory}
          </p>
        )}
      </section>

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
