import { useEffect, useState } from 'react';
import { HeartPulse, Radio } from 'lucide-react';
import { api } from '../services/api.js';
import PatientSelect from '../components/PatientSelect.jsx';
import { Spinner } from '../components/ui.jsx';
import VitalsPanel from './VitalsPanel.jsx';

export default function VitalSignsPage({ sensorsFirst = false }) {
  const [id, setId] = useState('');
  const [patient, setPatient] = useState(null);

  const load = () => api(`/patients/${id}`).then(setPatient);

  useEffect(() => {
    setPatient(null);
    if (id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const Icon = sensorsFirst ? Radio : HeartPulse;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Icon className="text-teal-500" />
            {sensorsFirst ? 'Real-time Sensor Monitoring' : 'Vital Signs'}
          </h1>
          <p className="text-sm text-slate-500">
            {sensorsFirst
              ? 'Connect ESP32 with MAX30102 and DS18B20, or use simulated readings for testing.'
              : 'Enter, review and save vital-sign readings with automatic BMI and NEWS2 scoring.'}
          </p>
        </div>
        <PatientSelect value={id} onChange={setId} />
      </div>

      {!id && <div className="card text-sm text-slate-500">Select a patient to begin.</div>}
      {id && !patient && <Spinner />}
      {patient && <VitalsPanel key={patient.id} patient={patient} onSaved={load} defaultOpen />}
    </div>
  );
}