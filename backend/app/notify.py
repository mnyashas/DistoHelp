"""Emergency notification dispatcher — panic button + outbound delivery.

Providers (select via NOTIFY_PROVIDER env, default 'auto' tries in order):
  msg91           -> real SMS via MSG91 free tier (set MSG91_AUTH_KEY + MSG91_SENDER_ID). India route.
  twilio_whatsapp -> WhatsApp via Twilio Sandbox (set TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN;
                     recipient must message the sandbox's `join <code>` once; free).
  twilio          -> Twilio SMS REST API (set TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM).
  telegram        -> free unlimited via a Telegram bot (set TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID).
  textbelt        -> real SMS, 1 free SMS/day per IP, NO signup (blocked for India).
  screen          -> no delivery; logs locally and renders on dashboard.
"""
import json
import os
from datetime import datetime, timezone

import httpx

from . import config, db

NOTIFY_PROVIDER = os.getenv("NOTIFY_PROVIDER", "auto")  # auto|msg91|twilio_whatsapp|twilio|telegram|textbelt|screen
TIMEOUT = 8.0


def send_emergency(patient_id: str, title: str, message: str) -> list[dict]:
    """Send a panic/emergency notification to every active contact of patient_id.
    Returns per-contact delivery results. Falls back to 'screen' (log-only) on any error."""
    contacts = db.query(
        "SELECT * FROM emergency_contacts WHERE patient_id=? AND active=1 ORDER BY id",
        (patient_id,),
    )
    results = []
    for c in contacts:
        prov = _pick_provider(c)
        res = _send(prov, c["phone"], title, message)
        db.execute(
            "INSERT INTO notifications(patient_id,level,alert_id,message_en,message_hi,message_kn,sent_via,created_at) "
            "VALUES(?,?,?,?,?,?,?,?)",
            (patient_id, "urgent", None, f"{title} - {message}", f"{title} - {message}", f"{title} - {message}",
             f"{prov}:{res['status']}", db.now_iso()),
        )
        results.append({"contact_id": c["id"], "name": c["name"], "relation": c["relation"],
                        "phone": c["phone"], "via": prov, **res})
    return results


def _digits(phone: str) -> str:
    return "".join(ch for ch in (phone or "") if ch.isdigit())


def _e164(phone: str) -> str:
    """Twilio needs strict E.164. '+91 77603 48054' -> '+917760348054'.
    A bare 10-digit number is assumed to be Indian mobile (this deployment's context) -> '+91' prefix."""
    d = _digits(phone)
    if len(d) == 10:
        return f"+91{d}"
    return f"+{d}" if d else (phone or "").strip()


def _msg91_phone(phone: str) -> str:
    """MSG91 v2 API wants digits-only incl. country code, no '+'. India mobiles: 10 digits -> '91' + digits."""
    d = _digits(phone)
    if len(d) == 10:
        d = "91" + d
    return d


def _pick_provider(contact: dict) -> str:
    """'auto' (default) resolves to the first *configured* provider:
    twilio_whatsapp -> msg91 -> twilio -> telegram -> textbelt.
    (Twilio WhatsApp first: it fails loudly when misconfigured, unlike MSG91 submit-time silence.)"""
    pref = (contact.get("via") or "").lower()
    if pref and pref != "auto":
        return pref
    prov = NOTIFY_PROVIDER.lower()
    if prov != "auto":
        return prov
    if os.getenv("TWILIO_ACCOUNT_SID") and os.getenv("TWILIO_AUTH_TOKEN"):
        return "twilio_whatsapp"
    if os.getenv("MSG91_AUTH_KEY"):
        return "msg91"
    if os.getenv("TELEGRAM_BOT_TOKEN"):
        return "telegram"
    return "textbelt"  # works with zero config; 1 free SMS/day (not available for India)


def _send(provider: str, phone: str, title: str, message: str) -> dict:
    body = f"{title}\n{message}\n- DIstoHelp"
    if provider == "textbelt":
        return _send_textbelt(phone, body)
    if provider == "telegram":
        return _send_telegram(phone, body)
    if provider == "msg91":
        return _send_msg91(phone, body)
    if provider == "twilio":
        return _send_twilio(phone, body)
    if provider == "twilio_whatsapp":
        return _send_twilio_whatsapp(phone, body)
    # screen / unknown / auto with nothing configured
    return {"status": "screen", "detail": "no provider configured — delivery simulated"}


def _send_textbelt(phone: str, body: str) -> dict:
    key = os.getenv("TEXTBELT_KEY", "textbelt")
    try:
        r = httpx.post("https://textbelt.com/text", data={"phone": phone, "message": body, "key": key},
                       timeout=TIMEOUT)
        j = r.json()
        if j.get("success"):
            return {"status": "sent", "detail": f"textbelt id={j.get('textId')}"}
        return {"status": "failed", "detail": j.get("error", "unknown textbelt error")}
    except Exception as e:
        return {"status": "failed", "detail": str(e)}


def _send_telegram(phone: str, body: str) -> dict:
    token = os.getenv("TELEGRAM_BOT_TOKEN")
    chat_id = os.getenv("TELEGRAM_CHAT_ID")
    if not token or not chat_id:
        return {"status": "failed", "detail": "TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not set"}
    try:
        r = httpx.post(f"https://api.telegram.org/bot{token}/sendMessage",
                       json={"chat_id": chat_id, "text": body}, timeout=TIMEOUT)
        j = r.json()
        return {"status": "sent" if j.get("ok") else "failed", "detail": str(j.get("description", ""))}
    except Exception as e:
        return {"status": "failed", "detail": str(e)}


def _send_twilio_whatsapp(phone: str, body: str) -> dict:
    """Twilio WhatsApp. Two modes:
    1) ContentSid (approved content template, e.g. hospital-approved alert template) —
       set TWILIO_WA_CONTENT_SID. Optional TWILIO_WA_CONTENT_VARIABLES as raw JSON,
       e.g. {"1": "p02 Denis Isaac Herman needs urgent review"} — passed verbatim.
    2) Free-form Body — only works with the WhatsApp Sandbox or inside a 24h session window;
       default From is the shared sandbox number +14155238886, override with TWILIO_WA_FROM.
    Recipient must have opted in (sent the sandbox join, or a completed WhatsApp session),
    otherwise Twilio rejects with a 630xx error which is surfaced verbatim."""
    sid = os.getenv("TWILIO_ACCOUNT_SID")
    tok = os.getenv("TWILIO_AUTH_TOKEN")
    from_ = os.getenv("TWILIO_WA_FROM", "+14155238886")   # Twilio WhatsApp Sandbox shared number
    content_sid = os.getenv("TWILIO_WA_CONTENT_SID")
    content_vars = os.getenv("TWILIO_WA_CONTENT_VARIABLES")  # raw JSON string, optional
    if not (sid and tok):
        return {"status": "failed", "detail": "TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN not set"}
    from_wa = from_ if from_.lower().startswith("whatsapp:") else f"whatsapp:{from_}"
    to = _e164(phone)
    to_wa = to if to.lower().startswith("whatsapp:") else f"whatsapp:{to}"
    data = {"To": to_wa, "From": from_wa}
    if content_sid:
        data["ContentSid"] = content_sid
        if content_vars:
            data["ContentVariables"] = content_vars
    else:
        data["Body"] = body
    try:
        r = httpx.post(f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json",
                       data=data, auth=(sid, tok), timeout=TIMEOUT)
        try:
            j = r.json()
        except Exception:
            return {"status": "failed", "detail": f"HTTP {r.status_code}: {r.text[:120]}"}
        if r.status_code in (200, 201):
            sid_ref = j.get("sid", "")
            return {"status": "sent", "detail": f"twilio whatsapp sid={sid_ref}"}
        msg = j.get("message", j.get("code", "unknown twilio error"))
        if r.status_code == 63016 or "63016" in str(j.get("code", "")):
            msg = f"recipient has not joined your Twilio WhatsApp sandbox yet (send 'join <code>' from their WhatsApp to your sandbox number). Twilio says: {msg}"
        return {"status": "failed", "detail": msg}
    except Exception as e:
        return {"status": "failed", "detail": str(e)}


def _send_msg91(phone: str, message: str) -> dict:
    key = os.getenv("MSG91_AUTH_KEY")
    sender = os.getenv("MSG91_SENDER_ID", "DISTOHLP")
    route = os.getenv("MSG91_ROUTE", "4")           # 4 = transactional
    template = os.getenv("MSG91_TEMPLATE_ID")
    var_key = os.getenv("MSG91_VAR_KEY", "VAR1")    # name of the variable inside YOUR flow template
    if not key:
        return {"status": "failed", "detail": "MSG91_AUTH_KEY not set"}
    to = _msg91_phone(phone)
    if template:
        # v5 Flow API (DLT-compliant). NOTE: MSG91 never validates credentials at submit time;
        # a "success" here means "queued", delivery is confirmed only in the MSG91 dashboard / DLR webhook.
        # Your MSG91 Flow template must contain one variable (default key VAR1) holding the full message.
        try:
            r = httpx.post(
                "https://api.msg91.com/api/v5/flow",
                json={"template_id": template, "short_url": "0",
                      "recipients": [{"mobiles": to, var_key: message}]},
                headers={"authkey": key, "Content-Type": "application/json"}, timeout=TIMEOUT)
            try:
                j = r.json()
            except Exception:
                return {"status": "failed", "detail": f"HTTP {r.status_code}: {r.text[:120]}"}
            if r.status_code == 401:
                return {"status": "failed", "detail": f"MSG91 rejected the authkey (401): {j.get('message', '')}"}
            if str(j.get("type", "")).lower() == "success":
                rid = j.get("request_id") or j.get("message")
                return {"status": "submitted",
                        "detail": f"queued with MSG91 (request id {rid}); delivery is visible in the MSG91 dashboard"}
            return {"status": "failed", "detail": str(j)}
        except Exception as e:
            return {"status": "failed", "detail": str(e)}
    # Raw v2 sendsms — accepts submissions WITHOUT validating the authkey, so “success” only
    # means “accepted”, never “delivered”. Delivery is visible only in the MSG91 dashboard.
    try:
        payload = {
            "authkey": key,
            "sender": sender,
            "route": route,
            "country": "91",
            "sms": [{"message": message, "to": [to]}],
        }
        r = httpx.post("https://control.msg91.com/api/v2/sendsms",
                       json=payload, headers={"Content-Type": "application/json"}, timeout=TIMEOUT)
        j = r.json()
        if str(j.get("type")).lower() == "success":
            return {"status": "submitted",
                    "detail": f"queued with MSG91 (request id {j.get('message')}) — v2 does NOT validate your key; "
                              f"confirm delivery in the MSG91 dashboard"}
        return {"status": "failed", "detail": str(j)}
    except Exception as e:
        return {"status": "failed", "detail": str(e)}


def _send_twilio(phone: str, body: str) -> dict:
    sid = os.getenv("TWILIO_ACCOUNT_SID")
    tok = os.getenv("TWILIO_AUTH_TOKEN")
    from_ = os.getenv("TWILIO_FROM")
    if not (sid and tok and from_):
        return {"status": "failed", "detail": "TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM not set"}
    try:
        r = httpx.post(f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json",
                       data={"To": _e164(phone), "From": from_, "Body": body},
                       auth=(sid, tok), timeout=TIMEOUT)
        j = r.json()
        return {"status": "sent" if r.status_code in (200, 201) else "failed",
                "detail": j.get("status", j.get("message", ""))}
    except Exception as e:
        return {"status": "failed", "detail": str(e)}
