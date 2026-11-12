// Simulated readings for testing without hardware. Never a real measurement.
const jitter = (base, spread, fallback) => (base ?? fallback) + (Math.random() - 0.5) * spread;

export function simulateReading(last = {}) {
  return {
    respiratoryRate: Math.round(jitter(last.respiratoryRate, 4, 16)),
    heartRate: Math.round(jitter(last.heartRate, 10, 78)),
    spo2: Math.min(100, Math.round(jitter(last.spo2, 3, 97))),
    temperature: Number(jitter(last.temperature, 0.6, 36.8).toFixed(1)),
    systolic: Math.round(jitter(last.systolic, 12, 120)),
    diastolic: Math.round(jitter(last.diastolic, 8, 78)),
  };
}