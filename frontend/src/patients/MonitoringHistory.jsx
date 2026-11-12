import { useEffect, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Download } from 'lucide-react';
import { api } from '../services/api.js';
import { RiskBadge } from '../components/ui.jsx';
import PatientSelect from '../components/PatientSelect.jsx';
import { downloadCSV, fmt } from '../services/format.js';

const short = (iso) =>
  new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

function Chart({ title, data, lines }) {
  return (
    <div className="card">
      <h4 className="mb-2 text-sm font-semibold">{title}</h4>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 16, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="t" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} domain={['auto', 'auto']} />
            <Tooltip />
            <Legend />
            {lines.map((l) => (
              <Line key={l.key} type="monotone" dataKey={l.key} name={l.name} stroke={l.color}
                strokeWidth={2} dot={{ r: 3 }} connectNulls />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default function MonitoringHistory({ records = [], patientName = 'patient' }) {
  if (!records.length) {
    return <p className="text-sm text-slate-500">No monitoring history yet. Save a vital-sign reading to start tracking.</p>;
  }

  const data = records.map((r) => ({
    t: short(r.measuredAt),
    hr: r.vitals.heartRate,
    spo2: r.vitals.spo2,
    temp: r.vitals.temperature,
    sbp: r.vitals.systolic,
    dbp: r.vitals.diastolic,
  }));

  const exportCsv = () =>
    downloadCSV(`${patientName.replace(/\s+/g, '_')}_monitoring_report.csv`, [
      ['Measured at', 'Source', 'Resp rate', 'Heart rate', 'SpO2', 'Temp C', 'Height cm', 'Weight kg', 'BMI',
        'Systolic', 'Diastolic', 'On oxygen', 'Consciousness', 'NEWS2 total', 'Risk', 'Escalation'],
      ...records.map((r) => {
        const v = r.vitals;
        return [fmt(r.measuredAt), r.source, v.respiratoryRate, v.heartRate, v.spo2, v.temperature,
          v.height, v.weight, v.bmi, v.systolic, v.diastolic, v.onOxygen ? 'Yes' : 'No',
          v.consciousness, r.news2.total, r.news2.risk.label, r.news2.escalation ? 'Yes' : 'No'];
      }),
    ]);

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-bold tracking-wide">MONITORING HISTORY</h2>
        <button className="btn-ghost" onClick={exportCsv}><Download size={16} /> Download report (CSV)</button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Chart title="Heart rate (bpm)" data={data} lines={[{ key: 'hr', name: 'Heart rate', color: '#14b8a6' }]} />
        <Chart title="Oxygen saturation (%)" data={data} lines={[{ key: 'spo2', name: 'SpO₂', color: '#0ea5e9' }]} />
        <Chart title="Body temperature (°C)" data={data} lines={[{ key: 'temp', name: 'Temperature', color: '#f97316' }]} />
        <Chart title="Blood pressure (mmHg)" data={data} lines={[
          { key: 'sbp', name: 'Systolic', color: '#ef4444' },
          { key: 'dbp', name: 'Diastolic', color: '#6366f1' },
        ]} />
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase text-slate-500">
            <tr>
              <th className="py-2">Date & time</th><th>HR</th><th>SpO₂</th><th>Temp</th>
              <th>BP</th><th>NEWS2</th><th>Risk</th>
            </tr>
          </thead>
          <tbody>
            {[...records].reverse().map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="py-2">{fmt(r.measuredAt)}</td>
                <td>{r.vitals.heartRate ?? '—'}</td>
                <td>{r.vitals.spo2 ?? '—'}</td>
                <td>{r.vitals.temperature ?? '—'}</td>
                <td>{r.vitals.systolic ?? '—'}/{r.vitals.diastolic ?? '—'}</td>
                <td className="font-bold">{r.news2.total}</td>
                <td><RiskBadge level={r.news2.risk.level} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function HistoryPage() {
  const [id, setId] = useState('');
  const [patient, setPatient] = useState(null);

  useEffect(() => {
    setPatient(null);
    if (id) api(`/patients/${id}`).then(setPatient);
  }, [id]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Monitoring History</h1>
        <PatientSelect value={id} onChange={setId} />
      </div>
      {!id && <div className="card text-sm text-slate-500">Select a patient to view their history.</div>}
      {patient && <MonitoringHistory records={patient.records} patientName={patient.fullName} />}
    </div>
  );
}