import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, UserPlus, Phone, ChevronRight, Trash2 } from 'lucide-react';
import { api } from '../services/api.js';
import { Modal, RiskBadge, Spinner } from '../components/ui.jsx';
import { initials } from '../services/format.js';
import PatientForm from './PatientForm.jsx';

const isUserAdded = (id) => !/^p0[1-5]$/.test(id);   // seeded discharge cohort is protected

export default function PatientsPage() {
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get('q') || '');
  const [list, setList] = useState(null);
  const [adding, setAdding] = useState(params.get('new') === '1');

  useEffect(() => {
    const t = setTimeout(() => api(`/patients?q=${encodeURIComponent(q)}`).then(setList), 200);
    return () => clearTimeout(t);
  }, [q, adding]);

  const remove = async (p) => {
    if (!window.confirm(`Delete ${p.fullName} (${p.id}) and all their records? This cannot be undone.`)) return;
    try {
      await api(`/patients/${p.id}`, { method: 'DELETE' });
      setList((l) => (l || []).filter((x) => x.id !== p.id));
    } catch (e) {
      alert(e.message || 'Delete failed');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Patients</h1>
          <p className="text-sm text-slate-500">{list?.length ?? 0} registered profiles</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input w-64 pl-9" placeholder="Search patients" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <button className="btn-primary" onClick={() => setAdding(true)}><UserPlus size={16} /> Add patient</button>
        </div>
      </div>

      {!list ? <Spinner /> : list.length === 0 ? (
        <div className="card text-sm text-slate-500">No patients match your search.</div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((p) => (
            <Link key={p.id} to={`/patients/${p.id}`} className="card group transition hover:-translate-y-0.5 hover:shadow-xl">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-cyan-400 to-teal-500 font-bold text-white">
                    {initials(p.fullName)}
                  </div>
                  <div>
                    <p className="font-semibold group-hover:text-teal-600">{p.fullName}</p>
                    <p className="text-xs text-slate-500">{p.id} · {p.age} yrs · {p.gender}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {isUserAdded(p.id) && (
                    <button
                      aria-label="Delete patient"
                      title="Delete this user-added patient"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); remove(p); }}
                      className="rounded-lg p-1.5 text-slate-300 transition hover:bg-red-50 hover:text-red-500">
                      <Trash2 size={18} />
                    </button>
                  )}
                  <ChevronRight size={18} className="text-slate-400" />
                </div>
              </div>
              <p className="mt-3 flex items-center gap-2 text-sm text-slate-600"><Phone size={14} /> {p.phone}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {p.conditions.map((c) => (
                  <span key={c} className="rounded-full bg-teal-50 px-2.5 py-0.5 text-xs text-teal-700">{c}</span>
                ))}
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                {p.latest ? (
                  <>
                    <RiskBadge level={p.latest.risk} />
                    <span className="text-sm">NEWS2 <b className="text-lg">{p.latest.total}</b></span>
                  </>
                ) : (
                  <span className="text-xs text-slate-400">Not monitored yet</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      {adding && (
        <Modal title="Register new patient" onClose={() => setAdding(false)}>
          <PatientForm onSaved={() => setAdding(false)} />
        </Modal>
      )}
    </div>
  );
}