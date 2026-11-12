import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Phone, MapPin } from 'lucide-react';
import { api } from '../services/api.js';
import { Modal, RiskBadge, Spinner } from '../components/ui.jsx';
import { ScoreCard } from '../risk-assessment/ScoreBreakdown.jsx';
import VitalsPanel from '../vitals/VitalsPanel.jsx';
import MonitoringHistory from './MonitoringHistory.jsx';
import EnquirySection from '../enquiries/EnquirySection.jsx';
import PatientForm from './PatientForm.jsx';
import { fmt, initials } from '../services/format.js';

export default function PatientProfile() {
  const { id } = useParams();
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
    <div className="space-y-6">
      <Link to="/patients" className="inline-flex items-center gap-1 text-sm text-teal-600 hover:underline">
        <ArrowLeft size={14} /> All patients
      </Link>

      <section className="card flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-cyan-400 to-teal-500 text-lg font-bold text-white">
            {initials(p.fullName)}
          </div>
          <div>
            <p className="text-xs text-slate-500">{p.id}</p>
            <h1 className="text-2xl font-bold">{p.fullName}</h1>
            <p className="text-sm text-slate-500">{p.age} yrs · {p.gender} · Registered {fmt(p.registeredOn)}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {latest && <RiskBadge level={latest.news2.risk.level} />}
          <button className="btn-ghost" onClick={() => setEditing(true)}><Pencil size={16} /> Edit</button>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card space-y-4 text-sm lg:col-span-1">
          <h2 className="font-bold tracking-wide">PERSONAL INFORMATION</h2>
          <p className="flex items-center gap-2"><Phone size={16} className="text-teal-500" /> {p.phone}</p>
          <p className="flex items-start gap-2"><MapPin size={16} className="mt-0.5 shrink-0 text-teal-500" /> {p.address || '—'}</p>
          <div>
            <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Existing conditions</p>
            <div className="flex flex-wrap gap-2">
              {p.conditions.length
                ? p.conditions.map((c) => <span key={c} className="rounded-full bg-teal-50 px-2.5 py-1 text-xs text-teal-700">{c}</span>)
                : <span className="text-slate-400">None recorded</span>}
            </div>
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Medical history</p>
            <p className="text-slate-700">{p.medicalHistory || '—'}</p>
          </div>
        </section>
        <div className="lg:col-span-2">
          <ScoreCard news2={latest?.news2} measuredAt={latest?.measuredAt} />
        </div>
      </div>

      <VitalsPanel patient={p} onSaved={load} />
      <MonitoringHistory records={p.records} patientName={p.fullName} />
      <EnquirySection patient={p} onSaved={load} />

      {editing && (
        <Modal title="Edit patient" onClose={() => setEditing(false)}>
          <PatientForm initial={p} onSaved={() => { setEditing(false); load(); }} />
        </Modal>
      )}
    </div>
  );
}