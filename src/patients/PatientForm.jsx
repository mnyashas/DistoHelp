import { useState } from 'react';
import { api } from '../services/api.js';

const EMPTY = {
  fullName: '', age: '', gender: 'Female', phone: '',
  address: '', conditions: '', medicalHistory: '',
};

export default function PatientForm({ initial, onSaved }) {
  const [f, setF] = useState(() =>
    initial ? { ...initial, conditions: (initial.conditions || []).join(', ') } : EMPTY);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const change = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr('');
    const body = {
      ...f,
      age: Number(f.age),
      conditions: f.conditions.split(',').map((s) => s.trim()).filter(Boolean),
    };
    try {
      const saved = initial
        ? await api(`/patients/${initial.id}`, { method: 'PUT', body })
        : await api('/patients', { method: 'POST', body });
      onSaved?.(saved);
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
      <div className="md:col-span-2">
        <label className="label">Full name</label>
        <input className="input" value={f.fullName} onChange={change('fullName')} required />
      </div>
      <div>
        <label className="label">Age</label>
        <input className="input" type="number" min="0" max="130" value={f.age} onChange={change('age')} required />
      </div>
      <div>
        <label className="label">Gender</label>
        <select className="input" value={f.gender} onChange={change('gender')}>
          <option>Female</option><option>Male</option><option>Other</option>
        </select>
      </div>
      <div>
        <label className="label">Phone number</label>
        <input className="input" inputMode="numeric" maxLength={10} value={f.phone} onChange={change('phone')} required />
      </div>
      <div>
        <label className="label">Address</label>
        <input className="input" value={f.address} onChange={change('address')} />
      </div>
      <div className="md:col-span-2">
        <label className="label">Existing health conditions (comma separated)</label>
        <input className="input" value={f.conditions} onChange={change('conditions')} />
      </div>
      <div className="md:col-span-2">
        <label className="label">Medical history</label>
        <textarea className="input" rows={3} value={f.medicalHistory} onChange={change('medicalHistory')} />
      </div>
      {err && <p className="text-sm text-red-600 md:col-span-2">{err}</p>}
      <div className="md:col-span-2">
        <button className="btn-primary" disabled={busy}>{initial ? 'Save changes' : 'Register patient'}</button>
      </div>
    </form>
  );
}