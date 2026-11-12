"""Demo seed: recent monitoring history + one enquiry per patient so the merged
frontend opens with live-looking charts and lists. Synthetic, deterministic;
p02 trends upward (the PS-03 slow-deterioration narrative)."""
from datetime import datetime, timedelta, timezone

from . import db
from .compat import full_news2

_RECORDS = {
    "p01": [  # COPD, SpO2 Scale 2, home O2 — stable on target 88-92%
        {"respiratoryRate": 17, "heartRate": 86, "spo2": 90, "temperature": 36.6, "systolic": 128, "diastolic": 76, "height": 172, "weight": 66, "onOxygen": True},
        {"respiratoryRate": 18, "heartRate": 84, "spo2": 91, "temperature": 36.5, "systolic": 126, "diastolic": 74, "height": 172, "weight": 66, "onOxygen": True},
        {"respiratoryRate": 17, "heartRate": 88, "spo2": 89, "temperature": 36.7, "systolic": 130, "diastolic": 78, "height": 172, "weight": 66, "onOxygen": True},
        {"respiratoryRate": 17, "heartRate": 84, "spo2": 90, "temperature": 36.6, "systolic": 127, "diastolic": 75, "height": 172, "weight": 66, "onOxygen": True},
    ],
    "p02": [  # heart failure, carvedilol — gentle deterioration
        {"respiratoryRate": 17, "heartRate": 76, "spo2": 96, "temperature": 36.5, "systolic": 142, "diastolic": 84, "height": 158, "weight": 71, "onOxygen": False},
        {"respiratoryRate": 20, "heartRate": 85, "spo2": 95, "temperature": 36.7, "systolic": 134, "diastolic": 79, "height": 158, "weight": 71, "onOxygen": False},
        {"respiratoryRate": 23, "heartRate": 92, "spo2": 94, "temperature": 37.3, "systolic": 124, "diastolic": 74, "height": 158, "weight": 72, "onOxygen": False},
        {"respiratoryRate": 25, "heartRate": 99, "spo2": 92, "temperature": 38.2, "systolic": 112, "diastolic": 66, "height": 158, "weight": 74, "onOxygen": False},
    ],
    "p03": [  # T2DM + CKD — stable
        {"respiratoryRate": 14, "heartRate": 78, "spo2": 97, "temperature": 36.7, "systolic": 126, "diastolic": 77, "height": 170, "weight": 84, "onOxygen": False},
        {"respiratoryRate": 15, "heartRate": 76, "spo2": 97, "temperature": 36.6, "systolic": 124, "diastolic": 76, "height": 170, "weight": 84, "onOxygen": False},
        {"respiratoryRate": 14, "heartRate": 79, "spo2": 96, "temperature": 36.8, "systolic": 125, "diastolic": 78, "height": 170, "weight": 84, "onOxygen": False},
        {"respiratoryRate": 14, "heartRate": 80, "spo2": 97, "temperature": 36.7, "systolic": 127, "diastolic": 79, "height": 170, "weight": 84, "onOxygen": False},
    ],
    "p04": [  # post-TKR, metoprolol, post-op fever — resolving
        {"respiratoryRate": 15, "heartRate": 80, "spo2": 96, "temperature": 37.6, "systolic": 138, "diastolic": 82, "height": 168, "weight": 79, "onOxygen": False},
        {"respiratoryRate": 15, "heartRate": 78, "spo2": 95, "temperature": 37.3, "systolic": 134, "diastolic": 80, "height": 168, "weight": 79, "onOxygen": False},
        {"respiratoryRate": 14, "heartRate": 74, "spo2": 96, "temperature": 37.0, "systolic": 131, "diastolic": 78, "height": 168, "weight": 79, "onOxygen": False},
        {"respiratoryRate": 14, "heartRate": 72, "spo2": 97, "temperature": 36.8, "systolic": 129, "diastolic": 77, "height": 168, "weight": 79, "onOxygen": False},
    ],
    "p05": [  # T2DM + asthma + atenolol — stable
        {"respiratoryRate": 15, "heartRate": 70, "spo2": 97, "temperature": 36.6, "systolic": 124, "diastolic": 75, "height": 161, "weight": 69, "onOxygen": False},
        {"respiratoryRate": 16, "heartRate": 74, "spo2": 96, "temperature": 36.7, "systolic": 126, "diastolic": 77, "height": 161, "weight": 69, "onOxygen": False},
        {"respiratoryRate": 15, "heartRate": 71, "spo2": 97, "temperature": 36.5, "systolic": 123, "diastolic": 74, "height": 161, "weight": 69, "onOxygen": False},
        {"respiratoryRate": 15, "heartRate": 76, "spo2": 96, "temperature": 36.8, "systolic": 127, "diastolic": 78, "height": 161, "weight": 69, "onOxygen": False},
    ],
}

_ENQUIRIES = {
    "p01": ("Reduced exercise tolerance and morning cough", "Classical COPD pattern, stable on current inhalers", "2 weeks",
            "", "COPD, hypercapnia", "Albuterol nebulizer solution, ipratropium bromide", "Penicillin (rash)",
            "Adherent to home O2; SpO2 88-92% on device", "Reinforced inhaler technique; review in 2 weeks"),
    "p02": ("Breathlessness on exertion, worse at night", "Breathlessness on stairs; now sleeps propped on 3 pillows", "3 days",
            "", "Heart failure, hypertension", "Carvedilol, furosemide", "No known allergies",
            "Reports ankle swelling; weight up 3 kg this week", "Diuretic review scheduled urgently"),
    "p03": ("Increasing thirst and nocturia", "Polyuria and thirst for 1 week", "1 week",
            "", "T2DM, CKD stage 3", "Metformin, lisinopril", "None",
            "Home glucose log reads elevated; needs HbA1c and renal panel", "Dose adjustment review booked"),
    "p04": ("Knee pain on walking; some dizziness", "", "1 week",
            "Pain 3/10 on ambulation, throbbing", "Atrial fibrillation, hypertension, TKR post-op", "Metoprolol, warfarin",
            "Ibuprofen (GI upset)", "INR due; wound healing well", "Check INR; tolerating metoprolol otherwise"),
    "p05": ("Wheeze after exertion; chest tightness", "Occasional wheeze climbing stairs", "1 month",
            "Chest tightness, no pain", "T2DM, hypertension, asthma", "Atenolol, fluticasone-salmeterol",
            "None", "Asthma action plan reviewed; good inhaler technique", "Follow up in 4 weeks"),
}


def seed_monitoring() -> None:
    if db.query_one("SELECT COUNT(*) AS n FROM monitoring_records")["n"] > 0:
        return
    offsets = [21, 15, 7, 2]  # hours ago, oldest first
    for pid, records in _RECORDS.items():
        flags_row = db.query_one("SELECT risk_flags FROM patients WHERE id=?", (pid,))
        hypercapnia = bool((db.loads(flags_row["risk_flags"]) or {}).get("hypercapnia")) if flags_row else False
        for off, v in zip(offsets, records):
            measured = (datetime.now(timezone.utc) - timedelta(hours=off)).isoformat(timespec="seconds")
            vv = dict(v)
            h, w = vv.get("height"), vv.get("weight")
            if h and w:
                vv["bmi"] = round(w / ((h / 100.0) ** 2), 1)
            news2 = full_news2(vv, hypercapnia=hypercapnia)
            db.execute(
                "INSERT INTO monitoring_records(patient_id,source,measured_at,vitals,news2,created_at) "
                "VALUES(?,?,?,?,?,?)",
                (pid, "manual", measured, db.dumps(vv), db.dumps(news2), db.now_iso()))
        latest = db.query_one(
            "SELECT vitals FROM monitoring_records WHERE patient_id=? ORDER BY id DESC LIMIT 1", (pid,))
        latest_v = db.loads(latest["vitals"])
        for loinc, key, disp, unit in (("8867-4", "heartRate", "Heart rate", "/min"),
                                       ("2708-6", "spo2", "Oxygen saturation", "%"),
                                       ("9279-1", "respiratoryRate", "Respiratory rate", "/min"),
                                       ("8310-5", "temperature", "Body temperature", "Cel")):
            db.execute(
                "INSERT INTO observations(patient_id,loinc,display,value,unit,effective_time,source,artifact,created_at) "
                "VALUES(?,?,?,?,?,?,?,NULL,?)",
                (pid, loinc, disp, latest_v[key], unit,
                 datetime.now(timezone.utc).isoformat(timespec="seconds"), "seed", db.now_iso()))
        enq = _ENQUIRIES.get(pid)
        if enq:
            db.execute(
                "INSERT INTO enquiries(patient_id,main_complaint,symptoms,duration,pain_description,"
                "existing_conditions,current_medications,allergies,additional_observations,staff_remarks,created_at) "
                "VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                (pid, *enq[:9],
                 (datetime.now(timezone.utc) - timedelta(hours=16)).isoformat(timespec="seconds")))
