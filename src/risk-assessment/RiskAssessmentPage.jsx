import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api.js';
import { RiskBadge, Spinner } from '../components/ui.jsx';
import { fmt } from '../services/format.js';

const RULES = [
  ['0–4 (no parameter scored 3)', 'Low Risk', 'Ward-based response; continue routine monitoring', 'bg-green-500'],
  ['Any single parameter scored 3', 'Low–Medium Risk', 'Urgent ward-based response; clinical escalation alert', 'bg-yellow-400'],
  ['5–6', 'Medium Risk', 'Urgent response by the clinical team', 'bg-orange-500'],
  ['7 or above', 'High Risk', 'Emergency response; immediate critical-care review', 'bg-red-500'],
];
const GROUPS = ['high', 'medium', 'low-medium', 'low'];

export default function RiskAssessmentPage() {
  const [list, setList] = useState(null);
  useEffect(() => { api('/patients').then(setList); }, []);

  if (!list) return <Spinner />;
  const unassessed = list.filter((p) => !p.latest);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Risk Assessment</h1>

      <div className="card overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase text-slate-500">
            <tr><th className="py-2">NEWS2 total</th><th>Dashboard category</th><th>Clinical response (NEWS2)</th></tr>
          </thead>
          <tbody>
            {RULES.map(([score, cat, resp, color]) => (
              <tr key={cat} className="border-t border-slate-100">
                <td className="py-2 font-semibold">{score}</td>
                <td><span className={`mr-2 inline-block h-2.5 w-2.5 rounded-full ${color}`} />{cat}</td>
                <td className="text-slate-600">{resp}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {GROUPS.map((level) => {
        const items = list.filter((p) => p.latest?.risk === level);
        if (!items.length) return null;
        return (
          <section key={level} className="card space-y-3">
            <div className="flex items-center gap-3">
              <RiskBadge level={level} />
              <span className="text-sm text-slate-500">{items.length} patient(s)</span>
            </div>
            <ul className="divide-y divide-slate-100">
              {items.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <Link to={`/patients/${p.id}`} className="font-medium hover:underline">
                    {p.fullName} <span className="text-xs text-slate-400">{p.id}</span>
                  </Link>
                  <span className="text-sm">
                    NEWS2 <b className="text-lg">{p.latest.total}</b>
                    {p.latest.escalation && <span className="ml-2 font-semibold text-yellow-700">Escalation alert</span>}
                    <span className="ml-3 text-xs text-slate-500">{fmt(p.latest.measuredAt)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {unassessed.length > 0 && (
        <div className="card text-sm text-slate-500">
          Not yet assessed: {unassessed.map((p) => p.fullName).join(', ')}
        </div>
      )}
    </div>
  );
}