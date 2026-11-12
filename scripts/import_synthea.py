"""Pick 5 diverse patients from Synthea's FHIR output (scripts/synthea/output/fhir/*.json)
and convert them to the DIstoHelp registry format (backend/app/seed_data/synthea_patients.json).

Usage:
  python scripts/import_synthea.py [output_fhir_dir]
Then restart the backend — seed() prefers this file over the curated profiles.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FHIR_DIR = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "scripts" / "synthea" / "output" / "fhir"
OUT = ROOT / "backend" / "app" / "seed_data" / "synthea_patients.json"

WANT = [  # category -> (match regex, target slot)
    ("copd",       re.compile(r"chronic obstructive pulmonary|copd|chronic obstructive bronchitis|emphysema", re.I), "p01"),
    ("heart_failure", re.compile(r"heart failure|congestive heart|cardiomyopathy", re.I), "p02"),
    ("diabetes",   re.compile(r"type 2 diabetes|type 1 diabetes|diabetes mellitus", re.I), "p03"),
    ("post_op",    re.compile(r"knee replacement|hip replacement|coronary artery bypass|appendectomy|cholecystectomy|status post", re.I), "p04"),
    ("asthma",     re.compile(r"asthma", re.I), "p05"),
]

BETA_BLOCKERS = ("carvedilol", "metoprolol", "atenolol", "bisoprolol", "propranolol", "nebivolol")
# Drop social-determinant / administrative / dental "conditions" — keep clinical ones
DROP_CONDITION_PATTERNS = (
    "education", "employed", "employment", "married", "divorced", "region", "demographic",
    "medication review due", "medication review", "no known", "housing", "income",
    "poverty", "race", "ethnicity", "language", "residence", "labor force",
    "social isolation", "social contact", "intimate partner", "victim of", "violence",
    "criminal record", "alcohol", "substance abuse", "misuses drugs",
    "gingiv", "dental", "tooth", "caries", "carie",
)


def load_bundles():
    for f in sorted(FHIR_DIR.glob("*.json")):
        try:
            bundle = json.loads(f.read_text(encoding="utf-8"))
        except Exception:
            continue
        if bundle.get("resourceType") != "Bundle":
            continue
        yield bundle


def summarize(bundle):
    patient, conditions, medications = None, [], []
    for entry in bundle.get("entry", []):
        res = entry.get("resource", {})
        rt = res.get("resourceType")
        if rt == "Patient":
            patient = res
        elif rt == "Condition":
            disp = ((res.get("code") or {}).get("coding") or [{}])[0].get("display", "")
            cond_status = (res.get("clinicalStatus") or {}).get("coding", [{}])[0].get("code", "active")
            coding = (res.get("code") or {}).get("coding", [{}])[0]
            if disp and not any(p in disp.lower() for p in DROP_CONDITION_PATTERNS) \
                    and not disp.lower().rstrip().endswith("(finding)"):
                conditions.append({"code": str(coding.get("code", "")), "display": disp,
                                   "clinicalStatus": cond_status,
                                   "system": coding.get("system", "http://snomed.info/sct")})
        elif rt == "MedicationRequest":
            med = (res.get("medicationCodeableConcept") or {}).get("coding", [{}])[0]
            disp = med.get("display", "")
            if disp:
                medications.append({"code": str(med.get("code", "")), "display": disp,
                                    "system": med.get("system", "http://www.nlm.nih.gov/research/umls/rxnorm"),
                                    "beta_blocker": any(b in disp.lower() for b in BETA_BLOCKERS)})
    if not patient:
        return None
    birth = patient.get("birthDate", "")
    given_raw = patient.get("name", [{}])[0].get("given", [])
    family_raw = patient.get("name", [{}])[0].get("family", "")
    name = " ".join(tok for tok in ([" ".join(given_raw)] + [family_raw]) if tok).strip()
    name = re.sub(r"\d+", "", name).strip()   # strip embedded uniqueness tokens
    # deduplicate medications by display-name core (keep first; preserves beta_blocker flag)
    seen, meds = set(), []
    def core_key(disp: str) -> str:
        m = list(re.finditer(r"\d+(\.\d+)?\s*(MG|ML|UNT|ACTUAT|HR|G|%)\b", disp, flags=re.I))
        if not m:
            return disp.lower().strip()
        return disp[: m[-1].start()].lower().rstrip(" ,{[").strip()

    for m in medications:
        key = core_key(m["display"])
        if key and key not in seen:
            seen.add(key)
            meds.append(m)
    medications = meds
    conditions = list({c["display"]: c for c in conditions}.values())
    age = None
    if birth:
        import datetime
        today = datetime.date.today()
        bd = datetime.date.fromisoformat(birth[:10])
        age = today.year - bd.year - ((today.month, today.day) < (bd.month, bd.day))
    return {
        "id": patient.get("id", ""),
        "name": name,
        "age": age,
        "gender": patient.get("gender", "other"),
        "dob": birth[:10] if birth else "",
        "conditions": conditions,
        "medications": medications,
    }


def main():
    picked: dict[str, dict] = {}
    for bundle in load_bundles():
        s = summarize(bundle)
        if not s:
            continue
        cond_text = " | ".join(c["display"] for c in s["conditions"])
        for category, pattern, slot in WANT:
            if slot in picked:
                continue
            if pattern.search(cond_text):
                flags = {}
                if slot == "p01":
                    flags["hypercapnia"] = True    # discharged COPD, persistent CO2 retention (clinical assumption)
                if any(m.get("beta_blocker") for m in s["medications"]):
                    flags["beta_blocker"] = True
                s["risk_flags"] = flags
                s["discharge_note"] = (
                    f"Synthea-generated {category.replace('_', ' ')} discharge. "
                    f"Primary condition: {next((c['display'] for c in s['conditions'] if pattern.search(c['display'])), 'see record')}."
                )
                s["phone"] = f"98450 0{slot[1]}001"
                s["address"] = f"Synthea-generated record, slot {slot}"
                s["id"] = slot
                picked[slot] = s
                print(f"{slot} <- {s['name']} ({category})")
    missing = [slot for _, _, slot in WANT if slot not in picked]
    if missing:
        print(f"WARNING: no match for {missing}; generate more patients or widen regexes.")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(list(picked.values()), indent=2)[:200000], encoding="utf-8")
    print(f"Wrote {len(picked)} patients to {OUT}")


if __name__ == "__main__":
    main()
