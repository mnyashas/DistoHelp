"""Automated clinical team escalation.

Creates a FHIR Flag + CommunicationRequest on the HAPI server and a localized
notification (English / Hindi / Kannada). Delivery is store-and-webhook: set
ESCALATION_WEBHOOK_URL to relay to SMS/WhatsApp (e.g. MSG91, Twilio). Otherwise
the message is stored and visible at GET /api/escalations.
"""
import httpx

from . import config, db, fhir_client, scoring

TEMPLATES = {
    "watch": {
        "en": "Watch: {name} shows early warning signs (NEWS2 {score}). Please review at next visit.",
        "hi": "वॉच: {name} में शुरुआती चेतावनी के संकेत हैं (NEWS2 {score}). कृपया अगली विज़िट में समीक्षा करें।",
        "kn": "ವಾಚ್: {name} ಅವರಲ್ಲಿ ಆರಂಭಿಕ ಎಚ್ಚರಿಕೆ ಚಿಹ್ನೆಗಳಿವೆ (NEWS2 {score}). ದಯವಿಟ್ಟು ಮುಂದಿನ ಭೇಟಿಯಲ್ಲಿ ಪರಿಶೀಲಿಸಿ.",
    },
    "review": {
        "en": "Review required: {name} is deteriorating (NEWS2 {score}). Please review within hours.",
        "hi": "समीक्षा आवश्यक: {name} की हालत बिगड़ रही है (NEWS2 {score}). कृपया कुछ घंटों में समीक्षा करें।",
        "kn": "ಪರಿಶೀಲನೆ ಅಗತ್ಯ: {name} ಅವರ ಸ್ಥಿತಿ ಹದಗೆಡುತ್ತಿದೆ (NEWS2 {score}). ದಯವಿಟ್ಟು ಕೆಲವೇ ಗಂಟೆಗಳಲ್ಲಿ ಪರಿಶೀಲಿಸಿ.",
    },
    "urgent": {
        "en": "URGENT: {name} is critically deteriorating (NEWS2 {score}). Immediate clinical review required.",
        "hi": "तत्काल: {name} की हालत गंभीर रूप से बिगड़ रही है (NEWS2 {score}). तुरंत चिकित्सकीय समीक्षा आवश्यक।",
        "kn": "ತುರ್ತು: {name} ಅವರ ಸ್ಥಿತಿ ಗಂಭೀರವಾಗಿ ಹದಗೆಡುತ್ತಿದೆ (NEWS2 {score}). ತಕ್ಷಣ ವೈದ್ಯಕೀಯ ಪರಿಶೀಲನೆ ಅಗತ್ಯ.",
    },
}


def escalate_alert(alert_id: int) -> dict:
    row = db.query_one("SELECT * FROM alerts WHERE id=?", (alert_id,))
    if not row:
        raise ValueError(f"alert {alert_id} not found")
    patient = scoring.patient_profile(row["patient_id"])
    ref_row = db.query_one("SELECT fhir_ref FROM patients WHERE id=?", (row["patient_id"],))
    fhir_ref_val = (ref_row or {}).get("fhir_ref") or ""
    fhir_patient_id = fhir_ref_val.split("/")[-1] if fhir_ref_val else row["patient_id"]

    tpl = TEMPLATES[row["level"]]
    msg = {k: v.format(name=patient["name"], score=row.get("score_total") or 0) for k, v in tpl.items()}
    title = f"{row['level'].upper()} deterioration alert — {patient['name']}"

    flag_id = fhir_client.create_flag(fhir_patient_id, title, row["explanation"], row["level"])
    cr_id = fhir_client.create_communication_request(fhir_patient_id, msg["en"], row["level"])

    sent_via = "stored"
    if config.ESCALATION_WEBHOOK_URL:
        try:
            httpx.post(config.ESCALATION_WEBHOOK_URL, json={
                "patient_id": row["patient_id"], "patient_name": patient["name"],
                "level": row["level"], "score": row.get("score_total"),
                "message_en": msg["en"], "message_hi": msg["hi"], "message_kn": msg["kn"],
            }, timeout=8.0)
            sent_via = "webhook"
        except Exception:
            sent_via = "webhook_failed"

    cur = db.execute(
        "INSERT INTO notifications(patient_id,level,alert_id,message_en,message_hi,message_kn,sent_via,created_at) "
        "VALUES(?,?,?,?,?,?,?,?)",
        (row["patient_id"], row["level"], alert_id, msg["en"], msg["hi"], msg["kn"], sent_via, db.now_iso()),
    )
    return {
        "notification_id": cur.lastrowid,
        "fhir_flag": f"Flag/{flag_id}" if flag_id else None,
        "fhir_communication_request": f"CommunicationRequest/{cr_id}" if cr_id else None,
        "sent_via": sent_via,
        "messages": msg,
    }


def list_notifications(patient_id: str | None = None, limit: int = 50) -> list[dict]:
    if patient_id:
        return db.query("SELECT * FROM notifications WHERE patient_id=? ORDER BY id DESC LIMIT ?", (patient_id, limit))
    return db.query("SELECT * FROM notifications ORDER BY id DESC LIMIT ?", (limit,))
