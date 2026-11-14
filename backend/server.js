const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;
const DEMO_MODE = process.env.DEMO_MODE !== 'false';
const DEVICE_KEY = process.env.DEVICE_KEY || 'demo-device-key';
const DATA_FILE = path.join(__dirname, 'data.json');

app.use(cors());
app.use(express.json());

// ==================== PERSISTENCE ====================
let db = { users: [], patients: [], enquiries: [], counter: 1000 };
const tokens = new Map(); // token -> user (in memory)

function loadDB() {
  try {
    if (fs.existsSync(DATA_FILE)) db = { ...db, ...JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) };
  } catch (e) {
    console.error('DB load error:', e.message);
  }
}
function saveDB() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
  } catch (e) {
    console.error('DB save error:', e.message);
  }
}

// ==================== NEWS2 SCORING (scale 1) ====================
const num = (v) => {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function calcBMI(heightCm, weightKg) {
  const h = num(heightCm);
  const w = num(weightKg);
  if (h && w && h > 0) return Number((w / (h / 100) ** 2).toFixed(1));
  return null;
}

function scoreRespiratoryRate(v) {
  if (v === null) return null;
  if (v <= 8) return 3;
  if (v <= 11) return 1;
  if (v <= 20) return 0;
  if (v <= 24) return 2;
  return 3;
}
function scoreSpo2(v) {
  if (v === null) return null;
  if (v <= 91) return 3;
  if (v <= 93) return 2;
  if (v <= 95) return 1;
  return 0;
}
function scoreSystolic(v) {
  if (v === null) return null;
  if (v <= 90) return 3;
  if (v <= 100) return 2;
  if (v <= 110) return 1;
  if (v <= 219) return 0;
  return 3;
}
function scoreHeartRate(v) {
  if (v === null) return null;
  if (v <= 40) return 3;
  if (v <= 50) return 1;
  if (v <= 90) return 0;
  if (v <= 110) return 1;
  if (v <= 130) return 2;
  return 3;
}
function scoreTemperature(v) {
  if (v === null) return null;
  if (v <= 35.0) return 3;
  if (v <= 36.0) return 1;
  if (v <= 38.0) return 0;
  if (v <= 39.0) return 1;
  return 2;
}

const EXPLAIN = {
  respiratoryRate: '12-20 normal; <=8 or >=25 scores 3',
  spo2: '>=96% normal; <=91% scores 3',
  systolic: '111-219 normal; <=90 or >=220 scores 3',
  heartRate: '51-90 normal; <=40 or >=131 scores 3',
  temperature: '36.1-38.0 normal; <=35.0 scores 3',
  consciousness: 'Alert scores 0; new confusion/CVPU scores 3',
  onOxygen: 'Supplemental oxygen scores 2',
};

function computeNews2(input = {}) {
  const v = input || {};
  const rr = num(v.respiratoryRate);
  const spo2 = num(v.spo2);
  const systolic = num(v.systolic);
  const heartRate = num(v.heartRate);
  const temperature = num(v.temperature);
  const onOxygen = !!v.onOxygen;
  const consciousness = v.consciousness === 'CVPU' ? 'CVPU' : 'A';

  const items = [
    { key: 'respiratoryRate', label: 'Respiratory Rate', unit: 'breaths/min', value: rr, score: scoreRespiratoryRate(rr), explanation: EXPLAIN.respiratoryRate },
    { key: 'spo2', label: 'Oxygen Saturation', unit: '%', value: spo2, score: scoreSpo2(spo2), explanation: EXPLAIN.spo2 },
    { key: 'systolic', label: 'Systolic BP', unit: 'mmHg', value: systolic, score: scoreSystolic(systolic), explanation: EXPLAIN.systolic },
    { key: 'heartRate', label: 'Heart Rate', unit: 'bpm', value: heartRate, score: scoreHeartRate(heartRate), explanation: EXPLAIN.heartRate },
    { key: 'temperature', label: 'Temperature', unit: '°C', value: temperature, score: scoreTemperature(temperature), explanation: EXPLAIN.temperature },
    { key: 'onOxygen', label: 'Supplemental Oxygen', unit: '', value: onOxygen ? 'Yes' : 'No', score: onOxygen ? 2 : 0, explanation: EXPLAIN.onOxygen },
    { key: 'consciousness', label: 'Consciousness', unit: '', value: consciousness === 'A' ? 'Alert' : 'CVPU', score: consciousness === 'A' ? 0 : 3, explanation: EXPLAIN.consciousness },
  ];

  const scored = items.filter((i) => i.score !== null);
  const total = scored.reduce((s, i) => s + i.score, 0);
  const required = ['respiratoryRate', 'spo2', 'systolic', 'heartRate', 'temperature'];
  const complete = required.every((k) => num(v[k]) !== null);
  const escalation = items.some((i) => i.score === 3);

  let level = 'low';
  if (total >= 7) level = 'high';
  else if (total >= 5) level = 'medium';
  else if (escalation) level = 'low-medium';

  const meta = {
    low: { label: 'Low Risk', clinical: 'Ward-based response; continue routine monitoring' },
    'low-medium': { label: 'Low–Medium Risk', clinical: 'Urgent ward-based response; clinical escalation alert' },
    medium: { label: 'Medium Risk', clinical: 'Urgent response by the clinical team' },
    high: { label: 'High Risk', clinical: 'Emergency response; immediate critical-care review' },
  }[level];

  return {
    total,
    complete,
    escalation,
    items,
    risk: { level, label: meta.label, clinical: meta.clinical },
  };
}

// ==================== AUTH ====================
app.post('/api/auth/send-otp', (req, res) => {
  const { aadhaar, mobile } = req.body || {};
  const a = String(aadhaar || '').replace(/\D/g, '');
  const m = String(mobile || '').replace(/\D/g, '');
  const user = db.users.find((u) => u.aadhaar === a && u.mobile === m);
  if (!user) {
    return res.status(404).json({ message: 'No staff account found for that Aadhaar and mobile number.' });
  }
  const otp = DEMO_MODE ? '123456' : String(Math.floor(100000 + Math.random() * 900000));
  user.otp = otp;
  saveDB();
  res.json({ ok: true, demoOtp: DEMO_MODE ? otp : undefined });
});

app.post('/api/auth/verify-otp', (req, res) => {
  const { aadhaar, otp } = req.body || {};
  const a = String(aadhaar || '').replace(/\D/g, '');
  const user = db.users.find((u) => u.aadhaar === a);
  if (!user) return res.status(404).json({ message: 'No staff account found.' });
  if (!user.otp || String(otp) !== String(user.otp)) {
    return res.status(401).json({ message: 'Incorrect OTP. Please try again.' });
  }
  user.otp = null;
  const token = crypto.randomBytes(24).toString('hex');
  const safeUser = { id: user.id, name: user.name, role: user.role };
  tokens.set(token, safeUser);
  saveDB();
  res.json({ token, user: safeUser });
});

app.get('/api/auth/me', (req, res) => {
  const user = authUser(req);
  if (!user) return res.status(401).json({ message: 'Unauthorized' });
  res.json({ user });
});

function authUser(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  return token ? tokens.get(token) : null;
}

// Protect everything under /api except auth endpoints and device ingestion
app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/auth/') || req.path === '/sensors/readings') return next();
  if (!authUser(req)) return res.status(401).json({ message: 'Unauthorized' });
  next();
});

// ==================== PATIENTS ====================
function latestRecord(p) {
  return p.records && p.records.length ? p.records[p.records.length - 1] : null;
}

function patientSummary(p) {
  const rec = latestRecord(p);
  return {
    id: p.id,
    fullName: p.fullName,
    age: p.age,
    gender: p.gender,
    phone: p.phone,
    address: p.address,
    conditions: p.conditions,
    medicalHistory: p.medicalHistory,
    registeredOn: p.registeredOn,
    latest: rec
      ? {
          risk: rec.news2.risk.level,
          total: rec.news2.total,
          escalation: rec.news2.escalation,
          measuredAt: rec.measuredAt,
        }
      : null,
  };
}

app.get('/api/patients/summary', (req, res) => {
  const patients = db.patients;
  const counts = { low: 0, 'low-medium': 0, medium: 0, high: 0 };
  let monitored = 0;
  let escalations = 0;
  const recent = [];
  for (const p of patients) {
    const rec = latestRecord(p);
    if (!rec) continue;
    monitored += 1;
    counts[rec.news2.risk.level] = (counts[rec.news2.risk.level] || 0) + 1;
    if (rec.news2.escalation) escalations += 1;
    recent.push({
      patientId: p.id,
      patientName: p.fullName,
      measuredAt: rec.measuredAt,
      total: rec.news2.total,
      risk: rec.news2.risk.level,
    });
  }
  recent.sort((a, b) => new Date(b.measuredAt) - new Date(a.measuredAt));
  res.json({
    totalRegistered: patients.length,
    monitored,
    low: counts.low,
    lowMedium: counts['low-medium'],
    medium: counts.medium,
    high: counts.high,
    escalations,
    recent: recent.slice(0, 8),
  });
});

app.get('/api/patients/enquiries', (req, res) => {
  const list = [...db.enquiries].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(list);
});

app.post('/api/patients/score', (req, res) => {
  const vitals = { ...(req.body?.vitals || {}) };
  vitals.bmi = calcBMI(vitals.height, vitals.weight);
  res.json({ vitals, news2: computeNews2(vitals) });
});

app.get('/api/patients', (req, res) => {
  const q = String(req.query.q || '').toLowerCase().trim();
  let list = db.patients;
  if (q) {
    list = list.filter(
      (p) =>
        p.fullName.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q) ||
        String(p.phone).includes(q)
    );
  }
  res.json(list.map(patientSummary));
});

app.post('/api/patients', (req, res) => {
  const b = req.body || {};
  if (!b.fullName || !b.age || !b.phone) {
    return res.status(400).json({ message: 'Full name, age and phone are required.' });
  }
  db.counter += 1;
  const patient = {
    id: `PT-${db.counter}`,
    fullName: String(b.fullName).trim(),
    age: Number(b.age),
    gender: b.gender || 'Other',
    phone: String(b.phone),
    address: b.address || '',
    conditions: Array.isArray(b.conditions) ? b.conditions : [],
    medicalHistory: b.medicalHistory || '',
    registeredOn: new Date().toISOString(),
    records: [],
    enquiries: [],
  };
  db.patients.push(patient);
  saveDB();
  res.status(201).json(patient);
});

app.get('/api/patients/:id', (req, res) => {
  const p = db.patients.find((x) => x.id === req.params.id);
  if (!p) return res.status(404).json({ message: 'Patient not found.' });
  res.json({ ...p, enquiries: p.enquiries.slice().reverse() });
});

app.put('/api/patients/:id', (req, res) => {
  const p = db.patients.find((x) => x.id === req.params.id);
  if (!p) return res.status(404).json({ message: 'Patient not found.' });
  const b = req.body || {};
  Object.assign(p, {
    fullName: b.fullName ?? p.fullName,
    age: b.age != null ? Number(b.age) : p.age,
    gender: b.gender ?? p.gender,
    phone: b.phone ?? p.phone,
    address: b.address ?? p.address,
    conditions: Array.isArray(b.conditions) ? b.conditions : p.conditions,
    medicalHistory: b.medicalHistory ?? p.medicalHistory,
  });
  saveDB();
  res.json(p);
});

app.post('/api/patients/:id/records', (req, res) => {
  const p = db.patients.find((x) => x.id === req.params.id);
  if (!p) return res.status(404).json({ message: 'Patient not found.' });
  const vitals = { ...(req.body?.vitals || {}) };
  vitals.bmi = calcBMI(vitals.height, vitals.weight);
  const record = {
    id: crypto.randomUUID(),
    patientId: p.id,
    measuredAt: new Date().toISOString(),
    source: req.body?.source || 'manual',
    vitals,
    news2: computeNews2(vitals),
  };
  p.records.push(record);
  saveDB();
  res.status(201).json(record);
});

app.post('/api/patients/:id/enquiries', (req, res) => {
  const p = db.patients.find((x) => x.id === req.params.id);
  if (!p) return res.status(404).json({ message: 'Patient not found.' });
  const b = req.body || {};
  if (!b.mainComplaint) return res.status(400).json({ message: 'Main complaint is required.' });
  const enquiry = {
    id: crypto.randomUUID(),
    patientId: p.id,
    patientName: p.fullName,
    createdAt: new Date().toISOString(),
    mainComplaint: b.mainComplaint,
    symptoms: b.symptoms || '',
    duration: b.duration || '',
    painDescription: b.painDescription || '',
    existingConditions: b.existingConditions || '',
    currentMedications: b.currentMedications || '',
    allergies: b.allergies || '',
    additionalObservations: b.additionalObservations || '',
    staffRemarks: b.staffRemarks || '',
  };
  p.enquiries.push(enquiry);
  db.enquiries.push(enquiry);
  saveDB();
  res.status(201).json(enquiry);
});

// ==================== SENSORS ====================
// In-memory latest readings pushed by devices: patientId -> { timestamp, vitals }
const sensorReadings = new Map();

app.post('/api/sensors/readings', (req, res) => {
  if (req.headers['x-device-key'] !== DEVICE_KEY) {
    return res.status(401).json({ message: 'Invalid device key.' });
  }
  const b = req.body || {};
  const patient = db.patients.find((x) => x.id === b.patientId);
  if (!patient) return res.status(404).json({ message: 'Patient not found.' });
  const timestamp = b.timestamp || new Date().toISOString();
  const vitals = { ...(b.vitals || {}) };
  sensorReadings.set(patient.id, { timestamp, vitals });
  res.status(201).json({ ok: true, patientId: patient.id, timestamp });
});

app.get('/api/sensors/:patientId/latest', (req, res) => {
  const reading = sensorReadings.get(req.params.patientId);
  if (!reading) return res.json({ connected: false, reading: null });
  const fresh = Date.now() - new Date(reading.timestamp).getTime() < 15000;
  res.json({ connected: fresh, reading });
});

// ==================== SEED DEMO DATA ====================
function seed() {
  if (db.users.length && db.patients.length) return;

  if (!db.users.length) {
    db.users = [
      { id: 'U-1', name: 'Dr. Meera Nair', role: 'Clinician', aadhaar: '999941057058', mobile: '9876543210', otp: null },
      { id: 'U-2', name: 'Nurse Arjun Rao', role: 'Nurse', aadhaar: '111122223333', mobile: '9123456780', otp: null },
    ];
  }

  if (!db.patients.length) {
    const now = Date.now();
    const mk = (offsetMin, vitals) => {
      const v = { ...vitals };
      v.bmi = calcBMI(v.height, v.weight);
      return {
        id: crypto.randomUUID(),
        measuredAt: new Date(now - offsetMin * 60000).toISOString(),
        source: 'manual',
        vitals: v,
        news2: computeNews2(v),
      };
    };

    const patients = [
      {
        id: 'PT-1001',
        fullName: 'Ananya Sharma',
        age: 34,
        gender: 'Female',
        phone: '9812345670',
        address: '12 Rose Villa, Bandra West, Mumbai',
        conditions: ['Hypertension'],
        medicalHistory: 'Managed hypertension since 2020. No known drug allergies.',
        vitals: [
          { respiratoryRate: 16, heartRate: 82, spo2: 98, temperature: 36.8, height: 162, weight: 58, systolic: 128, diastolic: 82, onOxygen: false, consciousness: 'A' },
        ],
      },
      {
        id: 'PT-1002',
        fullName: 'Rahul Verma',
        age: 58,
        gender: 'Male',
        phone: '9823456781',
        address: '44 Lake Road, Kolkata',
        conditions: ['Type 2 Diabetes', 'COPD'],
        medicalHistory: 'COPD exacerbation in 2023. On inhalers.',
        vitals: [
          { respiratoryRate: 24, heartRate: 104, spo2: 92, temperature: 37.9, height: 172, weight: 84, systolic: 148, diastolic: 94, onOxygen: true, consciousness: 'A' },
        ],
      },
      {
        id: 'PT-1003',
        fullName: 'Fatima Khan',
        age: 71,
        gender: 'Female',
        phone: '9834567892',
        address: '7 Green Park, New Delhi',
        conditions: ['Heart failure', 'Atrial fibrillation'],
        medicalHistory: 'Admitted for decompensated heart failure in 2024.',
        vitals: [
          { respiratoryRate: 27, heartRate: 132, spo2: 90, temperature: 38.4, height: 155, weight: 61, systolic: 88, diastolic: 54, onOxygen: true, consciousness: 'CVPU' },
        ],
      },
      {
        id: 'PT-1004',
        fullName: 'Vikram Singh',
        age: 45,
        gender: 'Male',
        phone: '9845678903',
        address: '89 Hill View, Jaipur',
        conditions: ['Asthma'],
        medicalHistory: 'Seasonal asthma. Uses reliever inhaler as needed.',
        vitals: [
          { respiratoryRate: 19, heartRate: 92, spo2: 95, temperature: 37.2, height: 178, weight: 76, systolic: 132, diastolic: 86, onOxygen: false, consciousness: 'A' },
        ],
      },
    ];

    db.patients = patients.map((p, idx) => ({
      id: p.id,
      fullName: p.fullName,
      age: p.age,
      gender: p.gender,
      phone: p.phone,
      address: p.address,
      conditions: p.conditions,
      medicalHistory: p.medicalHistory,
      registeredOn: new Date(now - (idx + 1) * 86400000).toISOString(),
      records: p.vitals.map((v, i) => mk((p.vitals.length - i) * 30 + idx * 5, v)),
      enquiries: [],
    }));

    // Mirror enquiries into the flat list
    const p1 = db.patients[0];
    const enq = {
      id: crypto.randomUUID(),
      patientId: p1.id,
      patientName: p1.fullName,
      createdAt: new Date(now - 3600000).toISOString(),
      mainComplaint: 'Recurring headaches for the past three days',
      symptoms: 'Dull ache on the left side, mild nausea in the morning',
      duration: '3 days',
      painDescription: 'Throbbing pain, 5/10',
      existingConditions: 'Hypertension',
      currentMedications: 'Amlodipine 5mg once daily',
      allergies: 'Penicillin',
      additionalObservations: 'Blood pressure stable at last check',
      staffRemarks: 'Advised hydration and follow-up in 48 hours',
    };
    p1.enquiries.push(enq);
    db.enquiries.push(enq);
    db.counter = 1004;
  }

  saveDB();
}

loadDB();
seed();

app.listen(PORT, () => {
  console.log(`Smart Patient Monitoring API running on http://localhost:${PORT}`);
  console.log(`Demo login: Aadhaar 999941057058 / mobile 9876543210 / OTP 123456`);
});
