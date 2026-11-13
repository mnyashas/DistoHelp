// Pan-dashboard emergency layer — listens to the same /ws/live feed the monitor uses.
// A review/urgent alert (or a panic press) anywhere in the hospital:
//   • red siren banner pinned to the top of the screen
//   • full-viewport red edge pulse
//   • two-tone siren until silenced or dismissed
//   • dismiss = acknowledge the alert (POST /alerts/:id/ack) — persists, one tap
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Siren, Volume2, VolumeX, X, ChevronRight } from 'lucide-react';
import { api } from '../services/api.js';
import { wsUrlForLive } from '../pages/Live.jsx';

const CRITICAL = new Set(['review', 'urgent']);

export default function EmergencyOverlay() {
  const [pending, setPending] = useState([]);   // active critical alerts awaiting attention
  const [muted, setMuted] = useState(false);
  const ctxRef = useRef(null);

  const merge = (incoming) => {
    setPending((prev) => {
      const map = new Map(prev.map((a) => [a.id, a]));
      for (const a of incoming) if (a?.id != null) map.set(a.id, a);
      return [...map.values()];
    });
  };

  // initial load: whatever is on fire right now
  useEffect(() => {
    api('/alerts?status=active&limit=30')
      .then((d) => merge((d.alerts || []).filter((a) => CRITICAL.has(a.level))))
      .catch(() => {});
  }, []);

  // live socket — a fresh alert from ANY patient adds itself
  useEffect(() => {
    let ws, retry;
    const connect = () => {
      ws = new WebSocket(wsUrlForLive());
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === 'alert' && CRITICAL.has(msg.data?.level)) {
            merge([msg.data]);
          }
        } catch { /* ignore */ }
      };
      ws.onclose = () => { retry = setTimeout(connect, 1500); };
    };
    connect();
    return () => { clearTimeout(retry); ws && ws.close(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // siren — two alternating tones, until silenced/dismissed
  useEffect(() => {
    if (!pending.length || muted) return undefined;
    let interval;
    try {
      ctxRef.current ||= new (window.AudioContext || window.webkitAudioContext)();
      const ctx = ctxRef.current;
      if (ctx.state === 'suspended') ctx.resume();
      const beep = () => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sawtooth';
        o.connect(g); g.connect(ctx.destination);
        const t = ctx.currentTime;
        o.frequency.setValueAtTime(880, t);
        o.frequency.setValueAtTime(620, t + 0.45);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.30, t + 0.05);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
        o.start(t); o.stop(t + 0.92);
      };
      beep();
      interval = setInterval(beep, 950);
    } catch { /* audio unavailable */ }
    return () => clearInterval(interval);
  }, [pending.length, muted]);

  const dismiss = async (id) => {
    setPending((prev) => prev.filter((a) => a.id !== id));
    await api(`/alerts/${id}/ack`, { method: 'POST' }).catch(() => {});
  };
  const dismissAll = async () => {
    const ids = pending.map((a) => a.id);
    setPending([]);
    await Promise.all(ids.map((id) => api(`/alerts/${id}/ack`, { method: 'POST' }).catch(() => {})));
  };

  if (!pending.length) return null;
  const isPanic = (a) => a.source === 'panic';
  const n = pending.length;

  return (
    <>
      {/* soft full-viewport red edge pulse */}
      <div aria-hidden className="panic-edge fixed inset-0 z-40" />

      {/* siren bar */}
      <div className="panic-bar fixed inset-x-0 top-0 z-50 text-white shadow-[0_10px_40px_rgba(220,38,38,0.45)]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-2.5 md:px-6">
          <Siren size={26} className="panic-siren shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black uppercase tracking-[0.18em] leading-tight">
              {n} active emergency{n > 1 ? 's' : ''}
            </p>
            <p className="truncate text-xs font-medium text-red-50">
              {pending.slice(0, 4).map((a) => isPanic(a)
                ? `${a.patient_name || a.patient_id} pressed the PANIC button`
                : `${a.patient_name || a.patient_id} — ${a.level?.toUpperCase()} alert`).join(' · ')}
              {pending.length > 4 && ` · +${pending.length - 4} more`}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {pending.slice(0, 3).map((a) => (
              <Link
                key={a.id}
                to={`/patients/${a.patient_id}?tab=live`}
                className="hidden items-center gap-1 rounded-lg bg-white/20 px-2 py-1.5 text-[11px] font-bold text-white backdrop-blur transition hover:bg-white/30 sm:inline-flex"
              >
                {a.patient_id} <ChevronRight size={12} />
              </Link>
            ))}
            <button
              className="rounded-lg p-2 text-white/90 transition hover:bg-white/20"
              onClick={() => setMuted((m) => !m)}
              title={muted ? 'Unmute siren' : 'Silence siren'}
              aria-label={muted ? 'Unmute siren' : 'Silence siren'}
            >
              {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
            <button
              className="rounded-lg p-2 text-white/90 transition hover:bg-white/20"
              onClick={dismissAll}
              title="Dismiss all — acknowledge"
              aria-label="Dismiss all"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* per-patient dismiss buttons — bounded height; storms don't take over the screen */}
        <div className="mx-auto flex max-h-24 max-w-7xl items-center gap-2 overflow-y-auto border-t border-white/25 px-4 py-1.5 md:px-6">
          {pending.slice(0, 16).map((a) => (
            <div key={a.id} className="flex shrink-0 items-center gap-2 rounded-lg bg-black/20 py-1 pl-2 pr-1 text-[11px] font-semibold text-white">
              <Siren size={12} />
              <span className="max-w-48 truncate">
                {isPanic(a) ? `${a.patient_name || a.patient_id} — PANIC` : `${a.patient_name || a.patient_id} — ${a.level}`}
              </span>
              <button
                onClick={() => dismiss(a.id)}
                className="rounded bg-white/20 p-1 transition hover:bg-white/30"
                title="Acknowledge & dismiss"
                aria-label={`Acknowledge ${a.patient_name || a.patient_id}`}
              >
                <X size={13} />
              </button>
            </div>
          ))}
          {pending.length > 16 && (
            <span className="shrink-0 rounded-lg bg-black/30 px-3 py-1.5 text-[11px] font-black text-white">
              +{pending.length - 16} more
            </span>
          )}
        </div>
      </div>
    </>
  );
}
