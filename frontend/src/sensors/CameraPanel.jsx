import { useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle2, AlertTriangle } from 'lucide-react';
import { CameraPpg } from './cameraPpg.js';

// Real fingertip pulse measurement via the phone camera (PPG).
// Uses rear camera + torch; readout is a genuine BPM computed on-device.
export default function CameraPanel({ onReading, onSave, saving }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const ppgRef = useRef(null);
  const waveRef = useRef(null);
  const [state, setState] = useState('idle'); // idle | waiting | locked | error
  const [bpm, setBpm] = useState(null);
  const [quality, setQuality] = useState(0);
  const [err, setErr] = useState('');

  useEffect(() => () => ppgRef.current?.stop(), []);

  const start = async () => {
    setErr('');
    try {
      const ppg = new CameraPpg(videoRef.current, canvasRef.current);
      ppg.onUpdate = ({ bpm, quality, waveform }) => {
        setBpm(bpm);
        setQuality(quality);
        setState(bpm ? 'locked' : 'waiting');
        if (bpm) onReading?.({ heartRate: bpm });
        drawWave(waveRef.current, waveform, bpm ? '#465fff' : '#475569');
      };
      ppgRef.current = ppg;
      await ppg.start();
      setState('waiting');
    } catch (e) {
      setErr(e.message || 'Camera unavailable — check permissions (needs rear camera + good light).');
      setState('error');
    }
  };

  const stop = () => { ppgRef.current?.stop(); setState('idle'); setBpm(null); setQuality(0); };

  return (
    <div className="rounded-xl border border-brand-200 bg-brand-50/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Camera size={18} className="text-brand-600" />
          <h3 className="font-semibold text-gray-900">CAMERA PULSE (REAL MEASUREMENT)</h3>
        </div>
        {state === 'idle' ? (
          <button className="btn-primary" onClick={start}><Camera size={16} /> Measure pulse</button>
        ) : (
          <button className="btn-ghost" onClick={stop}>Stop</button>
        )}
      </div>

      {err && <p className="mt-2 flex items-center gap-2 text-sm text-red-600"><AlertTriangle size={16} /> {err}</p>}

      <div className="mt-3 grid gap-3 md:grid-cols-[auto_1fr_auto] md:items-center">
        <div className="relative h-36 w-36 overflow-hidden rounded-xl bg-gray-900">
          <video ref={videoRef} className="h-full w-full object-cover opacity-80" muted playsInline />
          <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[9px] uppercase text-gray-300">finger on lens</span>
        </div>
        <div>
          <canvas ref={waveRef} width={320} height={96} className="w-full rounded-lg bg-gray-900" />
          <canvas ref={canvasRef} width={160} height={120} className="hidden" />
        </div>
        <div className="text-center md:w-28">
          <p className="text-5xl font-black tabular-nums text-gray-900">{bpm ?? '––'}</p>
          <p className="text-[10px] uppercase tracking-widest text-gray-500">bpm · camera</p>
          <div className="mt-1 h-2 w-full overflow-hidden rounded bg-gray-200">
            <div className="h-full bg-brand-500 transition-all" style={{ width: `${Math.round(quality * 100)}%` }} />
          </div>
          <p className="mt-1 text-[9px] uppercase text-gray-400">signal quality</p>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-gray-500">
          {state === 'locked'
            ? 'Locked on — real photoplethysmography (PPG) from your fingertip.'
            : 'Cover the rear camera completely with a fingertip in good light. Keep still.'}
        </p>
        <button className="btn-primary" disabled={!bpm || saving} onClick={() => onSave?.({ heartRate: bpm })}>
          <CheckCircle2 size={16} /> Save pulse reading
        </button>
      </div>
    </div>
  );
}

function drawWave(canvas, data, color) {
  if (!canvas || !data || data.length < 4) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, w, h);
  const max = Math.max(...data.map((v) => Math.abs(v)), 1);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.shadowColor = color;
  ctx.shadowBlur = 6;
  ctx.beginPath();
  data.forEach((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h / 2 + (v / max) * (h / 2 - 6);
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  });
  ctx.stroke();
}
