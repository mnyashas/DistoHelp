import { AlertOctagon, Info } from 'lucide-react';
import { RiskBadge, RISK, SCORE_CLS } from '../components/ui.jsx';
import { fmt } from '../services/format.js';

export function ScoreCard({ news2, measuredAt }) {
  if (!news2) {
    return (
      <div className="card text-sm text-gray-500">
        No monitoring records yet. Save a vital-sign reading to calculate the early warning score.
      </div>
    );
  }
  const r = news2.risk;
  return (
    <div className="card grid gap-6 md:grid-cols-[auto_1fr] md:items-center">
      <div className={`grid h-40 w-40 place-items-center rounded-3xl text-white shadow-lg ${RISK[r.level].bar}`}>
        <div className="text-center">
          <p className="text-[11px] font-semibold uppercase tracking-widest opacity-90">NEWS2 total</p>
          <p className="text-6xl font-extrabold leading-none">{news2.total}</p>
        </div>
      </div>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-500">Dashboard category:</span>
          <RiskBadge level={r.level} />
          {news2.escalation && (
            <span className="rounded-full bg-yellow-400 px-3 py-1 text-xs font-bold text-yellow-950">Clinical escalation alert</span>
          )}
        </div>
        <p className="text-sm text-gray-600">
          <span className="font-semibold">NEWS2 clinical response:</span> {r.clinical}
        </p>
        {measuredAt && <p className="text-xs text-gray-400">Latest reading {fmt(measuredAt)}</p>}
        <p className="flex gap-2 text-[11px] text-gray-400">
          <Info size={14} className="shrink-0" />
          Decision-support score using NEWS2 (RCP, scale 1). Not an automated diagnosis.
        </p>
      </div>
    </div>
  );
}

export function ScoreBreakdown({ news2 }) {
  if (!news2) return null;
  return (
    <div className="space-y-3">
      {news2.escalation && (
        <div className="flex items-start gap-3 rounded-xl border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-900">
          <AlertOctagon size={18} className="mt-0.5 shrink-0" />
          <p>
            <b>Clinical escalation alert:</b> one parameter scored 3. Urgent clinical review is recommended even when the total is low.
          </p>
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {news2.items.map((it) => (
          <div key={it.key} className="rounded-xl border border-gray-200 bg-white p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-gray-600">{it.label}</p>
              <span className={`rounded-lg px-2 py-0.5 text-xs font-bold ${it.score == null ? 'bg-gray-100 text-gray-500' : SCORE_CLS[it.score]}`}>
                {it.score ?? '–'}/3
              </span>
            </div>
            <p className="mt-1 text-lg font-bold">
              {it.value ?? '—'} <span className="text-xs font-normal text-gray-500">{it.unit}</span>
            </p>
            <p className="text-[11px] leading-snug text-gray-500">{it.explanation}</p>
          </div>
        ))}
      </div>
      <p className="text-sm font-semibold">
        Total score: {news2.total}
        {!news2.complete && <span className="font-normal text-gray-500"> (partial: some values missing)</span>}
      </p>
    </div>
  );
}