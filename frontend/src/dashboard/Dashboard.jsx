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
  const [q, setQ] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    api('/patients/summary').then(setS).catch(() => setS({ recent: [] }));
  }, []);

  if (!s) return <Spinner />;

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
          <h1 className="text-2xl font-bold">Clinical Dashboard</h1>
          <p className="text-sm text-gray-500">Registered patients and early warning status</p>
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
          <h2 className="mb-3 font-semibold">Latest monitoring records</h2>
          <ul className="divide-y divide-gray-100">
            {s.recent?.map((r) => (
              <li key={r.measuredAt + r.patientId} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <Link to={`/patients/${r.patientId}`} className="font-medium text-gray-800 hover:underline">
                  {r.patientName}
                </Link>
                <span className="text-xs text-gray-500">{fmt(r.measuredAt)}</span>
                <span className="text-sm font-bold">Score {r.total}</span>
                <RiskBadge level={r.risk} />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}