// Panic button + emergency contacts manager.
// Real outbound delivery: the backend dispatches via the configured provider
// (MSG91_AUTH_KEY for India SMS, TWILIO_* for Twilio SMS + Twilio WhatsApp Sandbox,
//  TELEGRAM_BOT_TOKEN, TEXTBELT_KEY — with nothing configured, calls are screen-logged.)
import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, PhoneCall, Plus, Trash2, User, XCircle } from 'lucide-react';
import { api } from '../services/api.js';

const RELATIONS = ['spouse', 'parent', 'child', 'sibling', 'friend', 'doctor', 'caregiver', 'other'];
const VIA = ['auto', 'msg91', 'twilio_whatsapp', 'twilio', 'telegram', 'textbelt'];

export function PanicButton({ patientId, patientName, big = false }) {
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 6000);
    return () => clearTimeout(t);
  }, [confirming]);

  const fire = async () => {
    setSending(true); setError('');
    try {
      const r = await api('/panic', { method: 'POST', body: { patient_id: patientId, note: note.trim() || undefined } });
      setResult(r);
      setConfirming(false); setNote('');
    } catch (e) {
      setError(e.message || 'Panic dispatch failed');
    } finally { setSending(false); }
  };

  return (
    <div className={big ? '' : 'mt-3'}>
      {!result ? (
        !confirming ? (
          <button
            onClick={() => setConfirming(true)}
            className={big
              ? 'flex w-full items-center justify-center gap-3 rounded-3xl border-4 border-red-600 bg-gradient-to-br from-red-500 to-rose-600 px-6 py-6 text-2xl font-black tracking-wide text-white shadow-lg shadow-red-500/30 transition hover:scale-[1.01] active:scale-95'
              : 'flex w-full items-center justify-center gap-2 rounded-xl border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-extrabold uppercase tracking-widest text-red-700 transition hover:bg-red-100'}>
            <AlertTriangle size={big ? 30 : 14} strokeWidth={2.5} /> Panic
          </button>
        ) : (
          <div className="rounded-2xl border-2 border-red-500 bg-red-50 p-3 text-center shadow-lg">
            <p className="flex items-center justify-center gap-2 text-sm font-black uppercase tracking-widest text-red-700">
              <AlertTriangle size={18} /> Confirm panic alert?
            </p>
            <p className="mt-1 text-xs text-red-800">This alerts your care team AND texts every active emergency contact of{' '}<b>{patientName || patientId}</b>.</p>
            <input
              className="input mt-2 !border-red-300 !bg-white text-sm"
              placeholder="Optional note, e.g. severe breathlessness…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              autoFocus
            />
            <div className="mt-2 flex justify-center gap-2">
              <button onClick={fire} disabled={sending}
                className="flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-black uppercase tracking-widest text-white hover:bg-red-700 disabled:opacity-60">
                {sending ? <Loader2 size={16} className="animate-spin" /> : <AlertTriangle size={16} />} Send panic now
              </button>
              <button onClick={() => { setConfirming(false); setNote(''); }}
                className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50">
                Cancel
              </button>
            </div>
            {error && <p className="mt-2 text-xs font-semibold text-red-700">{error}</p>}
          </div>
        )
      ) : (
        <div className="rounded-2xl border-2 border-red-400 bg-red-50 p-4">
          <p className="flex items-center gap-2 font-black uppercase tracking-widest text-red-700">
            <AlertTriangle size={18} /> Panic sent — care team alerted
          </p>
          <p className="mt-1 text-xs text-red-800">
            {result.dispatched === 0
              ? 'No emergency contacts on file — the alert is visible on the staff dashboard only.'
              : `Messaged ${result.dispatched} contact${result.dispatched > 1 ? 's' : ''}:`}
          </p>
          {result.dispatched > 0 && (
            <ul className="mt-2 space-y-1.5 text-sm">
              {result.results.map((r) => (
                <li key={r.contact_id} className="flex items-center justify-between gap-2 rounded-xl bg-white px-3 py-1.5">
                  <span className="min-w-0"><b>{r.name}</b> · {r.relation} · <span className="tabular-nums">{r.phone}</span></span>
                  <span className="flex shrink-0 items-center gap-1.5 text-xs font-bold">
                    {r.status === 'sent'
                      ? <><CheckCircle2 size={15} className="text-emerald-600" /><span className="text-emerald-700">Sent via {r.via}</span></>
                      : r.status === 'submitted'
                        ? <><PhoneCall size={15} className="text-amber-600" /><span className="text-amber-700" title={r.detail}>Submitted via {r.via} — confirm in provider dashboard</span></>
                        : r.status === 'screen'
                          ? <><PhoneCall size={15} className="text-amber-600" /><span className="text-amber-700">Logged — no SMS provider configured</span></>
                          : <><XCircle size={15} className="text-red-600" /><span className="text-red-700" title={r.detail}>Failed: {String(r.detail).slice(0, 60)}</span></>}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <button onClick={() => setResult(null)} className="mt-3 w-full rounded-xl border border-red-200 bg-white py-1.5 text-xs font-bold uppercase tracking-widest text-red-700 hover:bg-red-100">Dismiss</button>
        </div>
      )}
    </div>
  );
}

export function EmergencyContacts({ patientId, patientName }) {
  const [contacts, setContacts] = useState(null);
  const [form, setForm] = useState({ name: '', relation: 'spouse', phone: '', via: 'auto' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = () => api(`/emergency-contacts?patient_id=${encodeURIComponent(patientId)}`)
    .then((d) => setContacts(d.contacts || []))
    .catch((e) => setError(e.message));

  useEffect(() => { setContacts(null); load(); /* eslint-disable-next-line */ }, [patientId]);

  const add = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      await api('/emergency-contacts', { method: 'POST', body: { patient_id: patientId, ...form, phone: form.phone.trim() } });
      setForm({ name: '', relation: 'spouse', phone: '', via: 'auto' });
      load();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  const remove = async (id) => {
    await api(`/emergency-contacts/${id}`, { method: 'DELETE' }).catch(() => {});
    load();
  };

  return (
    <section className="card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-bold"><PhoneCall size={18} className="text-red-500" /> Emergency contacts — {patientName || patientId}</h2>
        <span className="text-[10px] uppercase tracking-widest text-gray-400">via MSG91 · Twilio WhatsApp · Textbelt · Telegram</span>
      </div>
      <p className="mt-1 text-xs text-gray-500">Real outbound SMS/WhatsApp requires the backend started with a provider configured (e.g. <code className="rounded bg-gray-100 px-1">MSG91_AUTH_KEY=…</code> or <code className="rounded bg-gray-100 px-1">TWILIO_ACCOUNT_SID=… TWILIO_AUTH_TOKEN=…</code>). With no provider, sends are logged to the delivery screen — nothing leaves your machine.</p>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_1fr]">
        {/* list */}
        <div className="rounded-2xl border border-gray-100">
          {contacts === null ? (
            <p className="p-4 text-sm text-gray-400">Loading…</p>
          ) : contacts.length === 0 ? (
            <p className="p-4 text-sm text-gray-500">No contacts yet — add the patient's emergency numbers so a panic press reaches them.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {contacts.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-rose-50 text-rose-500"><User size={16} /></span>
                    <span className="min-w-0"><b className="block truncate">{c.name}</b><span className="text-xs text-gray-500">{c.relation} · <span className="tabular-nums">{c.phone}</span> · via {c.via === 'auto' ? 'auto' : c.via}</span></span>
                  </span>
                  <button onClick={() => remove(c.id)} className="rounded-lg p-1.5 text-gray-300 hover:bg-red-50 hover:text-red-500" title="Remove contact"><Trash2 size={16} /></button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* add form */}
        <form onSubmit={add} className="grid content-start gap-2 rounded-2xl border border-dashed border-gray-200 p-3">
          <div className="grid grid-cols-2 gap-2">
            <input className="input" required placeholder="Name, e.g. Meera (wife)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <select className="input" value={form.relation} onChange={(e) => setForm({ ...form, relation: e.target.value })}>
              {RELATIONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <input className="input tracking-wider" required inputMode="tel" placeholder="Phone with country code, e.g. +91 98123 45678"
            value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <select className="input" value={form.via} onChange={(e) => setForm({ ...form, via: e.target.value })}>
              {VIA.map((v) => <option key={v} value={v}>{v === 'auto' ? 'via: auto (server decides)' : `via: ${v}`}</option>)}
            </select>
            <button className="btn-primary !from-red-500 !to-rose-500 !shadow-red-200" disabled={busy} type="submit"><Plus size={16} /> Add</button>
          </div>
          <p className="text-[10px] text-gray-400">Use full international format (+91…) for delivery. WhatsApp delivery: pick <b>twilio_whatsapp</b> and send the sandbox's <b>join &lt;code&gt;</b> once from your WhatsApp before the first test. SMS delivery: pick <b>msg91</b> (India).</p>
        </form>
      </div>
    </section>
  );
}
