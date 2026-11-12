"""Seed at least 5 synthetic discharge profiles.

Bundled profiles are authored to match Synthea's FHIR R4 output shape
(SNOMED CT conditions, RxNorm medications, LOINC vitals). To regenerate
real ones with Synthea instead:

  scripts/generate_synthea.ps1            # downloads & runs Synthea
  python -m app.seed --from-synthea DIR   # converts export to our registry
"""
from . import config, db, fhir_client

PATIENTS = [
    {
        "id": "p01", "name": "Ramesh Hegde", "age": 68, "gender": "male", "dob": "1958-04-12",
        "conditions": [
            {"code": "13645005", "display": "Chronic obstructive pulmonary disease", "clinicalStatus": "active", "system": "http://snomed.info/sct"},
            {"code": "42343007", "display": "Hypercapnia (elevated arterial CO2)", "clinicalStatus": "active", "system": "http://snomed.info/sct"},
            {"code": "78275009", "display": "Chronic respiratory acidosis", "clinicalStatus": "active", "system": "http://snomed.info/sct"},
        ],
        "medications": [
            {"code": "1244008", "display": "Albuterol nebulizer solution", "beta_blocker": False, "system": "http://www.nlm.nih.gov/research/umls/rxnorm"},
            {"code": "435", "display": "Ipratropium bromide inhalant solution", "beta_blocker": False, "system": "http://www.nlm.nih.gov/research/umls/rxnorm"},
        ],
        "risk_flags": {"hypercapnia": True, "beta_blocker": False, "on_oxygen": True},
        "discharge_note": "Discharged after COPD exacerbation with persistent CO2 retention; continue home O2 at 88-92% target.",
    },
    {
        "id": "p02", "name": "Lakshmi Rao", "age": 72, "gender": "female", "dob": "1954-09-30",
        "conditions": [
            {"code": "84114007", "display": "Heart failure", "clinicalStatus": "active", "system": "http://snomed.info/sct"},
            {"code": "38341003", "display": "Hypertension", "clinicalStatus": "active", "system": "http://snomed.info/sct"},
        ],
        "medications": [
            {"code": "8331", "display": "Carvedilol", "beta_blocker": True, "system": "http://www.nlm.nih.gov/research/umls/rxnorm"},
            {"code": "310429", "display": "Furosemide", "beta_blocker": False, "system": "http://www.nlm.nih.gov/research/umls/rxnorm"},
        ],
        "risk_flags": {"hypercapnia": False, "beta_blocker": True, "on_oxygen": False},
        "discharge_note": "Discharged post-HF decompensation; carvedilol up-titration; daily weights and SpO2 monitoring.",
    },
    {
        "id": "p03", "name": "Ananda Kumar", "age": 59, "gender": "male", "dob": "1967-02-18",
        "conditions": [
            {"code": "44054006", "display": "Type 2 diabetes mellitus", "clinicalStatus": "active", "system": "http://snomed.info/sct"},
            {"code": "709044004", "display": "Chronic kidney disease, stage 3", "clinicalStatus": "active", "system": "http://snomed.info/sct"},
        ],
        "medications": [
            {"code": "6809", "display": "Metformin", "beta_blocker": False, "system": "http://www.nlm.nih.gov/research/umls/rxnorm"},
            {"code": "29046", "display": "Lisinopril", "beta_blocker": False, "system": "http://www.nlm.nih.gov/research/umls/rxnorm"},
        ],
        "risk_flags": {"hypercapnia": False, "beta_blocker": False, "on_oxygen": False},
        "discharge_note": "Discharged after cellulitis treated with IV antibiotics; glucose and renal function follow-up.",
    },
    {
        "id": "p04", "name": "Suresh Gowda", "age": 77, "gender": "male", "dob": "1949-07-25",
        "conditions": [
            {"code": "609588000", "display": "Total knee replacement (post-op)", "clinicalStatus": "active", "system": "http://snomed.info/sct"},
            {"code": "38341003", "display": "Hypertension", "clinicalStatus": "active", "system": "http://snomed.info/sct"},
            {"code": "49436004", "display": "Atrial fibrillation", "clinicalStatus": "active", "system": "http://snomed.info/sct"},
        ],
        "medications": [
            {"code": "6918", "display": "Metoprolol tartrate", "beta_blocker": True, "system": "http://www.nlm.nih.gov/research/umls/rxnorm"},
            {"code": "11289", "display": "Warfarin", "beta_blocker": False, "system": "http://www.nlm.nih.gov/research/umls/rxnorm"},
        ],
        "risk_flags": {"hypercapnia": False, "beta_blocker": True, "on_oxygen": False},
        "discharge_note": "Day-2 post TKR; metoprolol for rate control; DVT prophylaxis; wound checks at D+7.",
    },
    {
        "id": "p05", "name": "Priya Nair", "age": 64, "gender": "female", "dob": "1962-11-08",
        "conditions": [
            {"code": "44054006", "display": "Type 2 diabetes mellitus", "clinicalStatus": "active", "system": "http://snomed.info/sct"},
            {"code": "38341003", "display": "Hypertension", "clinicalStatus": "active", "system": "http://snomed.info/sct"},
            {"code": "195967001", "display": "Asthma", "clinicalStatus": "active", "system": "http://snomed.info/sct"},
        ],
        "medications": [
            {"code": "12023", "display": "Atenolol", "beta_blocker": True, "system": "http://www.nlm.nih.gov/research/umls/rxnorm"},
            {"code": "316700", "display": "Fluticasone-salmeterol inhaler", "beta_blocker": False, "system": "http://www.nlm.nih.gov/research/umls/rxnorm"},
        ],
        "risk_flags": {"hypercapnia": False, "beta_blocker": True, "on_oxygen": False},
        "discharge_note": "Discharged after pneumonia; asthma stable on inhalers; atenolol for BP control.",
    },
]


def _fhir_patient_resource(p: dict) -> dict:
    family, given = p["name"].split()[-1], " ".join(p["name"].split()[:-1])
    return {
        "resourceType": "Patient",
        "id": p["id"],
        "name": [{"family": family, "given": [given]}],
        "gender": p["gender"],
        "birthDate": p["dob"],
        "extension": [{
            "url": "http://distohelp.local/discharge-note",
            "valueString": p["discharge_note"],
        }],
    }


def seed(post_to_hapi: bool = True) -> list[str]:
    seeded = []
    for p in PATIENTS:
        exists = db.query_one("SELECT id FROM patients WHERE id=?", (p["id"],))
        if exists:
            seeded.append(p["id"])
            continue
        fhir_ref = None
        if post_to_hapi and fhir_client.health_check():
            pid = fhir_client.create_resource("Patient", _fhir_patient_resource(p))
            if pid:
                fhir_ref = f"Patient/{pid}"
                for c in p["conditions"]:
                    fhir_client.create_resource("Condition", {
                        "resourceType": "Condition",
                        "clinicalStatus": {"coding": [{
                            "system": "http://terminology.hl7.org/CodeSystem/condition-clinical",
                            "code": c["clinicalStatus"]}]},
                        "code": {"coding": [{"system": c["system"], "code": c["code"], "display": c["display"]}]},
                        "subject": {"reference": fhir_ref},
                    })
                for m in p["medications"]:
                    fhir_client.create_resource("MedicationRequest", {
                        "resourceType": "MedicationRequest",
                        "status": "active",
                        "intent": "order",
                        "medicationCodeableConcept": {"coding": [{"system": m["system"], "code": m["code"], "display": m["display"]}]},
                        "subject": {"reference": fhir_ref},
                    })
        db.execute(
            "INSERT INTO patients(id,name,age,gender,dob,fhir_ref,conditions,medications,risk_flags,created_at) "
            "VALUES(?,?,?,?,?,?,?,?,?,?)",
            (p["id"], p["name"], p["age"], p["gender"], p["dob"], fhir_ref,
             db.dumps(p["conditions"]), db.dumps(p["medications"]), db.dumps(p["risk_flags"]), db.now_iso()),
        )
        seeded.append(p["id"])
    db.execute("INSERT OR REPLACE INTO settings(key,value) VALUES('patients_seeded',?)", ("yes",))
    return seeded
