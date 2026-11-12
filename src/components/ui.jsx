import { Stethoscope, X } from 'lucide-react';

export const RISK = {
  low: { label: 'Low Risk', cls: 'bg-green-100 text-green-700 border-green-300', bar: 'bg-green-500' },
  'low-medium': { label: 'Low–Medium Risk', cls: 'bg-yellow-100 text-yellow-800 border-yellow-300', bar: 'bg-yellow-400' },
  medium: { label: 'Medium Risk', cls: 'bg-orange-100 text-orange-700 border-orange-300', bar: 'bg-orange-500' },
  high: { label: 'High Risk', cls: 'bg-red-100 text-red-700 border-red-300', bar: 'bg-red-500' },
};

export const SCORE_CLS = [
  'bg-green-100 text-green-700',
  'bg-yellow-100 text-yellow-800',
  'bg-orange-100 text-orange-700',
  'bg-red-100 text-red-700',
];

export function RiskBadge({ level = 'low' }) {
  const r = RISK[level] || RISK.low;
  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${r.cls}`}>
      {r.label}
    </span>
  );
}

export function StatCard({ icon: Icon, label, value, accent = 'text-teal-500' }) {
  return (
    <div className="card flex items-center gap-4">
      <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-slate-100 ${accent}`}>
        <Icon size={24} />
      </div>
      <div>
        <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
        <p className="text-2xl font-bold text-navy-900">{value}</p>
      </div>
    </div>
  );
}

export function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-navy-900/50 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-slate-100"><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Brand({ small = false }) {
  return (
    <div className="flex items-center gap-3">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-cyan-400 to-teal-500 shadow-lg">
        <Stethoscope size={22} className="text-white" />
      </div>
      {!small && (
        <div>
          <p className="text-sm font-bold leading-tight text-white">Smart Patient Monitoring</p>
          <p className="text-[10px] uppercase tracking-widest text-teal-300">& Early Warning System</p>
        </div>
      )}
    </div>
  );
}

export const Spinner = () => (
  <div className="grid h-40 place-items-center text-sm text-slate-400">Loading…</div>
);