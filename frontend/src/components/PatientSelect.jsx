import { useEffect, useState } from 'react';
import { api } from '../services/api.js';

export default function PatientSelect({ value, onChange }) {
  const [list, setList] = useState([]);
  useEffect(() => { api('/patients').then(setList).catch(() => {}); }, []);

  return (
    <select className="input max-w-xs" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Select patient…</option>
      {list.map((p) => (
        <option key={p.id} value={p.id}>{p.fullName} ({p.id})</option>
      ))}
    </select>
  );
}