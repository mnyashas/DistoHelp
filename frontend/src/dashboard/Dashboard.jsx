import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Users, Activity, CheckCircle2, AlertTriangle, ShieldAlert, Siren, Search, Plus,
} from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { api } from '../services/api.js';
import { StatCard, RiskBadge, Spinner } from '../components/ui.jsx';
import { fmt } from '../services/format.js';

export default function Dashboard() {
  const [s, setS] = useState(null);
  const [activeAlerts, setActiveAlerts] = useState([]);
  const [q, setQ] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const load = () => Promise.all([
      api('/patients/summary').then(setS).catch(() => setS((prev) => prev || { recent: [] })),
      api('/alerts?status=active&limit=30').then((d) => setActiveAlerts(d.alerts || [])).catch(() => {}),
    ]);
    load();
    const id = setInterval(load, 15000);   // reflect acknowledgements/new criticals without a reload
    return () => clearInterval(id);
  }, []);

  if (!s) return <Spinner />;

  // patients currently on fire: patient_id -> { level, name } (review/urgent only)
  const onFire = new Map();
  for (const a of activeAlerts) {
    if (a.level !== 'urgent' && a.level !== 'review') continue;
    const prev = onFire.get(a.patient_id);
    if (!prev || a.level === 'urgent') onFire.set(a.patient_id, { level: a.level, name: a.patient_name });
  }
  const pinRank = (id) => (onFire.get(id)?.level === 'urgent' ? 3 : onFire.get(id)?.level === 'review' ? 2 : 0);
  const sortedRecent = [...(s.recent || [])].sort((a, b) =>
    pinRank(b.patientId) - pinRank(a.patientId) || new Date(b.measuredAt) - new Date(a.measuredAt));

  const pie = [
    { name: 'Low', value: s.low, color: '#22c55e' },
    { name: 'Low–Medium', value: s.lowMedium, color: '#eab308' },
    { name: 'Medium', value: s.medium, color: '#f97316' },
    { name: 'High', value: s.high, color: '#ef4444' },
  ].filter((d) => d.value > 0);

  const search = (e) => {
    e.preventDefault();
    navigate(`/patients?q=${encodeURIComponent(q)}`);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Overview</h1>
        </div>
        <div className="flex flex-wrap gap-3">
          <form onSubmit={search} className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="input w-72 pl-9" placeholder="Search name, ID or phone"
              value={q} onChange={(e) => setQ(e.target.value)} />
          </form>
          <Link to="/patients?new=1" className="btn-primary"><Plus size={16} /> Add patient</Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-3">
        <StatCard icon={Users} label="Registered patients" value={s.totalRegistered ?? 0} />
        <StatCard icon={Activity} label="Patients monitored" value={s.monitored ?? 0} />
        <StatCard icon={CheckCircle2} label="Low-risk patients" value={s.low ?? 0} accent="text-green-500" />
        <StatCard icon={AlertTriangle} label="Medium-risk patients" value={s.medium ?? 0} accent="text-orange-500" />
        <StatCard icon={ShieldAlert} label="High-risk patients" value={s.high ?? 0} accent="text-red-500" />
        <StatCard icon={Siren} label="Escalation alerts" value={s.escalations ?? 0} accent="text-yellow-600" />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="card">
          <h2 className="mb-2 font-semibold">Risk distribution</h2>
          {pie.length ? (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pie} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={3}>
                    {pie.map((d) => <Cell key={d.name} fill={d.color} />)}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-gray-500">No assessments yet.</p>
          )}
        </div>

        <div className="card xl:col-span-2">
          <h2 className="mb-3 flex items-center justify-between font-semibold">
            Latest monitoring records
            {onFire.size > 0 && (
              <span className="rounded-full bg-red-600 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-white">
                {onFire.size} on fire
              </span>
            )}
          </h2>

          {/* critical now — always pinned above the feed */}
          {onFire.size > 0 && (
            <div className="mb-3 grid gap-2">
              {[...onFire].map(([pid, info]) => (
                <Link
                  key={pid}
                  to={`/patients/${pid}?tab=live`}
                  className="row-urgent flex items-center justify-between gap-3 rounded-xl border-2 border-red-400 bg-red-50 px-4 py-3 transition hover:bg-red-100"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <Siren size={20} className="shrink-0 animate-pulse text-red-600" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-black text-red-800">{info.name}</span>
                      <span className="block text-[11px] font-bold uppercase tracking-widest text-red-500">
                        {info.level === 'urgent' ? 'Urgent — needs attention now' : 'Review — check soon'}
                      </span>
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-black uppercase tracking-widest text-red-600">Open →</span>
                </Link>
              ))}
            </div>
          )}

          <ul className="divide-y divide-gray-100">
            {sortedRecent?.map((r) => {
              const fire = !!onFire.get(r.patientId);
              return (
                <li key={r.measuredAt + r.patientId}
                    className={`flex flex-wrap items-center justify-between gap-3 rounded-xl px-2 py-3 ${fire ? 'row-urgent' : ''}`}>
                  <Link to={`/patients/${r.patientId}?tab=live`} className="flex min-w-0 items-center gap-2 font-medium text-gray-800 hover:underline">
                    {fire && <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-red-600" />}
                    {r.patientName}
                  </Link>
                  <span className="text-xs text-gray-500">{fmt(r.measuredAt)}</span>
                  <span className="text-sm font-bold">Score {r.total}</span>
                  <RiskBadge level={r.risk} />
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}