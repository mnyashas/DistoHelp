"""Emergency notification dispatcher — panic button + outbound delivery.

Providers (select via NOTIFY_PROVIDER env, default 'auto' tries in order):
  textbelt  -> real SMS to any number, 1 free SMS/day per IP, NO signup. Best for live demos.
  telegram  -> free unlimited via a Telegram bot (set TELEGRAM_BOT_TOKEN). Needs /start from the contact.
  msg91     -> real SMS (or WhatsApp) via MSG91 free tier (set MSG91_AUTH_KEY + MSG91_SENDER_ID).
  twilio    -> Twilio REST API (set TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM).
  screen    -> no delivery; logs locally and renders on dashboard. Default if nothing is configured.
"""
import json
import os
from datetime import datetime, timezone

import httpx

from . import config, db

NOTIFY_PROVIDER = os.getenv("NOTIFY_PROVIDER", "auto")  # auto|textbelt|telegram|msg91|twilio|screen
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
            (patient_id, "urgent", None, f"{title} — {message}", f"{title} — {message}", f"{title} — {message}",
             f"{prov}:{res['status']}", db.now_iso()),
        )
        results.append({"contact_id": c["id"], "name": c["name"], "relation": c["relation"],
                        "phone": c["phone"], "via": prov, **res})
    return results


def _pick_provider(contact: dict) -> str:
    """'auto' (default) resolves to the first configured provider:
    telegram (free, unlimited) -> msg91 (free tier, real SMS) -> twilio -> textbelt (free, 1/day)."""
    pref = (contact.get("via") or "").lower()
    if pref and pref != "auto":
        return pref
    prov = NOTIFY_PROVIDER.lower()
    if prov != "auto":
        return prov
    if os.getenv("TELEGRAM_BOT_TOKEN"):
        return "telegram"
    if os.getenv("MSG91_AUTH_KEY"):
        return "msg91"
    if os.getenv("TWILIO_ACCOUNT_SID"):
        return "twilio"
    return "textbelt"  # works with zero config; 1 free SMS/day


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


def _send_msg91(phone: str, body: str) -> dict:
    key = os.getenv("MSG91_AUTH_KEY")
    sender = os.getenv("MSG91_SENDER_ID", "DISTOHLP")
    route = os.getenv("MSG91_ROUTE", "4")           # 4 = transactional
    template = os.getenv("MSG91_TEMPLATE_ID")
    if not key:
        return {"status": "failed", "detail": "MSG91_AUTH_KEY not set"}
    try:
        payload = {
            "authkey": key,
            "sender": sender,
            "route": route,
            "country": "91",
            "sms": [{"message": body, "to": [phone]}],
        }
        if template:
            payload["DLT_TE_ID"] = template
        r = httpx.post("https://control.msg91.com/api/v2/sendsms",
                       json=payload, headers={"Content-Type": "application/json"}, timeout=TIMEOUT)
        j = r.json()
        return {"status": "sent" if str(j.get("type")).lower() == "success" else "failed",
                "detail": str(j)}
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
                       data={"To": phone, "From": from_, "Body": body},
                       auth=(sid, tok), timeout=TIMEOUT)
        j = r.json()
        return {"status": "sent" if r.status_code in (200, 201) else "failed",
                "detail": j.get("status", j.get("message", ""))}
    except Exception as e:
        return {"status": "failed", "detail": str(e)}
