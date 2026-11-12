"""DIstoHelp — MineArena PS-03 pitch deck generator."""
import copy
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN
from pptx.enum.shapes import MSO_SHAPE
from pptx.oxml.ns import qn
from lxml import etree

# ---------- design system ----------
BG       = RGBColor(0x0A, 0x0F, 0x1E)
PANEL    = RGBColor(0x10, 0x18, 0x30)
PANEL2   = RGBColor(0x16, 0x20, 0x3C)
CARD     = RGBColor(0xF5, 0xF7, 0xFB)
WHITE    = RGBColor(0xFF, 0xFF, 0xFF)
TEXT_L   = RGBColor(0xE7, 0xEA, 0xF3)
MUTED    = RGBColor(0x8B, 0x93, 0xB8)
BRAND    = RGBColor(0x46, 0x5F, 0xFF)
BRAND2   = RGBColor(0x38, 0x41, 0xF5)
TEAL     = RGBColor(0x14, 0xB8, 0xA6)
TEAL2    = RGBColor(0x2D, 0xD4, 0xBF)
AMBER    = RGBColor(0xF5, 0x9E, 0x0B)
RED      = RGBColor(0xEF, 0x44, 0x44)
GREEN    = RGBColor(0x22, 0xC5, 0x5E)

def set_bg(slide, color=BG):
    slide.background.fill.solid()
    slide.background.fill.fore_color.rgb = color

def fill(shape, color, line=None):
    shape.fill.solid()
    shape.fill.fore_color.rgb = color
    if line is None:
        shape.line.fill.background()
    else:
        shape.line.color.rgb = line
        shape.line.width = Pt(1.25)
    shape.shadow.inherit = False
    return shape

def box(slide, x, y, w, h, color, line=None, round_=True, radius=0.08):
    shp = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE if round_ else MSO_SHAPE.RECTANGLE,
                                 Inches(x), Inches(y), Inches(w), Inches(h))
    fill(shp, color, line)
    try:
        shp.adjustments[0] = radius
    except Exception:
        pass
    return shp

def oval(slide, x, y, w, h, color, line=None):
    shp = slide.shapes.add_shape(MSO_SHAPE.OVAL, Inches(x), Inches(y), Inches(w), Inches(h))
    return fill(shp, color, line)

def txt(slide, x, y, w, h, text, size=18, color=TEXT_L, bold=False,
        align=PP_ALIGN.LEFT, font="Calibri", line_spacing=1.0, wrap=True, italic=False):
    if isinstance(text, str):
        text = [(text, size, color, bold, italic)]
    tb = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tb.text_frame.word_wrap = wrap
    tf = tb.text_frame
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    first = True
    for t, s, c, b, it in text:
        p = tf.paragraphs[0] if first else tf.add_paragraph()
        first = False
        p.alignment = align
        p.line_spacing = line_spacing
        r = p.add_run()
        r.text = t
        r.font.size = Pt(s)
        r.font.color.rgb = c
        r.font.bold = b
        r.font.italic = it
        r.font.name = font
    return tb

def header(slide, kicker, title_runs, page_no, total="14"):
    # accent bar + kicker + page
    box(slide, 0.55, 0.42, 0.55, 0.075, TEAL, round_=False)
    txt(slide, 1.25, 0.29, 8.0, 0.3, kicker.upper(), 10.5, MUTED, True)
    txt(slide, 10.55, 0.29, 2.2, 0.3, f"{page_no} / {total}", 10.5, MUTED, True, align=PP_ALIGN.RIGHT)
    txt(slide, 0.55, 0.62, 12.25, 0.9, title_runs, 30, WHITE, True)

def footer(slide, note="Clinical decision support only — not a medical diagnosis system."):
    txt(slide, 0.55, 7.08, 10.5, 0.3, note, 8, RGBColor(0x5A, 0x64, 0x8C), False)
    txt(slide, 10.35, 7.08, 2.4, 0.3, "DIstoHelp · MineArena 1.0 · PS-03", 8, RGBColor(0x5A, 0x64, 0x8C), False, align=PP_ALIGN.RIGHT)

def pill(slide, x, y, w, text, fill_c, text_c=WHITE, size=10.5, bold=True):
    box(slide, x, y, w, 0.28, fill_c, round_=True, radius=0.5)
    txt(slide, x, y + 0.045, w, 0.2, text, size, text_c, bold, align=PP_ALIGN.CENTER)

def arrow(slide, x1, y1, x2, y2, color=BRAND, width=2.4):
    conn = slide.shapes.add_connector(1, Inches(x1), Inches(y1), Inches(x2), Inches(y2))
    conn.line.color.rgb = color
    conn.line.width = Pt(width)
    # arrowhead
    ln = conn.line._get_or_add_ln()
    tail = ln.makeelement(qn('a:tailEnd'), {'type': 'triangle', 'w': 'med', 'len': 'med'})
    ln.append(tail)
    return conn

def bar_h(slide, x, y, w, max_w, frac, label, value, fill_c, text_c=TEXT_L, vsize=12, lsize=13.5, bold=True):
    txt(slide, x, y + 0.01, 4.6, 0.26, label, lsize, text_c, True)
    track = box(slide, x, y + 0.32, max_w, 0.30, PANEL2, round_=True, radius=0.5)
    if frac > 0.01:
        box(slide, x, y + 0.32, max_w * frac, 0.30, fill_c, round_=True, radius=0.5)
    txt(slide, x + max_w + 0.12, y + 0.28, 1.6, 0.35, value, vsize, fill_c, True)

def stat(slide, x, y, w, h, big, small, accent=TEAL2):
    box(slide, x, y, w, h, PANEL, round_=True, radius=0.10)
    box(slide, x, y, 0.09, h, accent, round_=False)
    txt(slide, x + 0.22, y + 0.12, w - 0.3, 0.75, big, 34, accent, True)
    txt(slide, x + 0.22, y + h - 0.62, w - 0.35, 0.55, small, 11.5, MUTED, False)

prs = Presentation()
prs.slide_width, prs.slide_height = Inches(13.333), Inches(7.5)
BLANK = prs.slide_layouts[6]

# ============ SLIDE 1 — COVER ============
s = prs.slides.add_slide(BLANK)
set_bg(s, BG)
# big teal arc motif
oval(s, 9.6, -2.4, 6.6, 6.6, RGBColor(0x0E, 0x16, 0x2C))
oval(s, 10.4, -1.6, 5.0, 5.0, RGBColor(0x12, 0x1E, 0x3A))
oval(s, 11.1, -0.9, 3.6, 3.6, BRAND2)
oval(s, 11.75, -0.25, 2.3, 2.3, BRAND)
# ECG line
from pptx.enum.shapes import MSO_SHAPE
ecg = [(0.55,4.55),(1.9,4.55),(2.15,4.05),(2.4,5.05),(2.65,3.55),(2.9,4.55),(4.35,4.55),(4.6,4.15),(4.85,4.95),(5.1,4.55),(6.6,4.55),(6.85,4.35),(7.1,4.75),(7.35,4.55),(9.0,4.55)]
conn = s.shapes.add_connector(1, Inches(0.55), Inches(4.55), Inches(9.0), Inches(4.55))
# draw ECG polyline via freeform instead
fb = s.shapes.build_freeform(Emu(Inches(0.55)), Emu(Inches(4.55)), scale=1)
# (build_freeform API differs; use connector segments)
def polyline(slide, pts, color, width):
    for i in range(len(pts) - 1):
        c = slide.shapes.add_connector(1, Inches(pts[i][0]), Inches(pts[i][1]), Inches(pts[i+1][0]), Inches(pts[i+1][1]))
        c.line.color.rgb = color
        c.line.width = Pt(width)

polyline(s, ecg, TEAL2, 2.6)
txt(s, 0.62, 0.78, 3.0, 0.3, "MINEARENA 1.0 · CODE COMMIT · BIET DAVANGERE", 10.5, TEAL2, True)
txt(s, 0.62, 1.25, 9.0, 2.2, [("DIstoHelp", 66, WHITE, True, False),
                              ("Personalized Post-Discharge\nDeterioration Monitor", 40, TEXT_L, True, False)],
    line_spacing=0.98)
txt(s, 0.62, 3.62, 6.7, 0.75, [("Wearable vitals → personalized NEWS2 → artifact-suppressed, explained alerts. ", 15.5, TEXT_L, False, False),
                               ("FHIR R4, end-to-end.", 15.5, TEAL2, True, False)], line_spacing=1.15)
# tagline block
box(s, 0.62, 5.35, 4.6, 0.36, PANEL, round_=True, radius=0.5)
txt(s, 0.86, 5.435, 4.2, 0.22, "PS-03 · HEALTH-TECH & DIGITAL HEALTH", 11, MUTED, True)
# stack line
txt(s, 0.62, 5.95, 9.0, 0.55, "HAPI FHIR R4 · Synthea · FastAPI · React · PhysioNet BIDMC · NEWS2", 12, MUTED, False)
footer(s, "Track: PS-03 — Personalized Post-Discharge Deterioration Monitor · Demo build (synthetic + PhysioNet data)")

# ============ SLIDE 2 — PROBLEM ============
s = prs.slides.add_slide(BLANK)
set_bg(s, BG)
header(s, "The Problem", [("Patients don't deteriorate in hospital.\n", 30, WHITE, True, False),
                          ("They deteriorate on day 3 at home — unwatched.", 30, TEAL2, True, False)], 2)
txt(s, 0.55, 2.25, 7.1, 0.8, [("Sepsis, heart failure and COPD exacerbations announce themselves ", 15, TEXT_L, False, False), ("4–8 hours before the crash", 15, WHITE, True, False),
                               (" — but nobody is watching the vitals.", 15, TEXT_L, False, False)], line_spacing=1.25)

# three problem cards
cards = [
    ("Late detection", "Average post-discharge death or ICU readmission signs surface hours after they become measurable.", RED, "~50%"),
    ("Alert fatigue", "Naive threshold monitors fire 28–29 alerts/patient/day — clinicians learn to ignore them.", AMBER, "28–29"),
    ("One-size-fits-all scoring", "Standard NEWS2 ignores who the patient is — a COPD patient at SpO₂ 90 is fine, not critical.", BRAND, "0 context"),
]
for i, (t, b, accent, num) in enumerate(cards):
    x = 0.55 + i * 4.32
    box(s, x, 3.15, 3.95, 2.55, PANEL, round_=True, radius=0.10)
    box(s, x, 3.15, 3.95, 0.07, accent, round_=False)
    txt(s, x + 0.25, 3.3, 3.4, 0.35, t.upper(), 11, accent, True)
    txt(s, x + 0.25, 3.68, 3.5, 1.0, b, 12.5, TEXT_L, False, line_spacing=1.2)
    txt(s, x + 0.25, 4.85, 3.4, 0.55, num, 26, accent, True)

# quote strip
box(s, 0.55, 6.0, 12.2, 0.62, PANEL2, round_=True, radius=0.5)
txt(s, 0.85, 6.14, 11.7, 0.35, [("“The challenge is not simply collecting patient vitals — ", 12.5, TEXT_L, False, True),
                                 ("it's intelligently identifying when a reading requires clinical attention.”  — PS-03", 12.5, TEAL2, True, True)])
footer(s)

# ============ SLIDE 3 — SOLUTION ============
s = prs.slides.add_slide(BLANK)
set_bg(s, BG)
header(s, "The Solution", [("One engine. Three superpowers. ", 30, WHITE, True, False)], 3)

pillars = [
    ("01", "Personalize", "Every score knows who the patient is — their conditions, meds and rolling baseline.",
     "COPD → SpO₂ Scale 2 (88–92%)\nBeta-blockers → blunted HR thresholds\nRolling 60-reading z-scores", TEAL),
    ("02", "Filter noise", "Sensor garbage never becomes a clinical alert — it becomes a device event, visibly separate.",
     "Probe removal (SpO₂ 0 + flat HR)\nFlatlines · motion noise · implausible values\n2,934 artifacts suppressed (vs 236 naive)", AMBER),
    ("03", "Explain every alert", "Each alert names the triggering reading, the rule applied, and the profile fact that fired it.",
     "Reading · rule · profile fact · explanation\nWatch → Review → Urgent\nAck / resolve lifecycle + FHIR escalation", BRAND),
]
for i, (n, t, one, three, accent) in enumerate(pillars):
    x = 0.55 + i * 4.32
    box(s, x, 1.55, 3.95, 4.35, PANEL, round_=True, radius=0.10)
    txt(s, x + 0.3, 1.8, 1.2, 0.6, n, 34, accent, True)
    txt(s, x + 0.3, 2.35, 3.4, 0.5, t, 25, WHITE, True)
    txt(s, x + 0.3, 2.95, 3.4, 0.75, one, 12, TEXT_L, False, line_spacing=1.25)
    box(s, x + 0.3, 3.72, 3.35, 0.02, PANEL2, round_=False)
    txt(s, x + 0.3, 3.85, 3.4, 1.8, three, 11.5, TEAL2, False, line_spacing=1.35)

footer(s)

# ============ SLIDE 4 — PRODUCT TOUR (screenshot) ============
s = prs.slides.add_slide(BLANK)
set_bg(s, BG)
header(s, "The Product", [("Two apps. One monitoring engine.", 30, WHITE, True, False)], 4)
s.shapes.add_picture(r"C:/Users/User/AppData/Local/Temp/opencode-browser-xgb5M8/0/screenshot.jpeg",
                     Inches(0.55), Inches(1.6), height=Inches(4.9))
# right column
rx = 8.0
txt(s, rx, 1.65, 4.7, 0.35, "STAFF WORKSPACE", 11, TEAL2, True)
for item, sub in [("Clinical Dashboard", "risk-sorted cohort, one tap into any patient"),
                  ("Live Monitoring", "always-on telemetry wall — charts stream over WebSocket"),
                  ("Vital Signs", "manual + simulator + BIDMC replay + ESP32 input"),
                  ("Risk Assessment", "NEWS2 with per-patient personalization breakdown"),
                  ("Patient Enquiries", "breathlessness · fever · dizziness intake")]:
    txt(s, rx, 2.02 + [x for x, _ in enumerate([0,1,2,3,4])].index(0), 4.6, 0.28, [(item, 13, WHITE, True, False)], wrap=False)
    # spacing handled manually below
    pass
positions = [2.05, 2.62, 3.19, 3.76, 4.33]
items = [("Clinical Dashboard", "risk-sorted cohort, one tap into any patient"),
         ("Live Monitoring", "always-on telemetry wall — charts stream over WebSocket"),
         ("Vital Signs", "manual + simulator + BIDMC replay + ESP32 input"),
         ("Risk Assessment", "NEWS2 with per-patient personalization breakdown"),
         ("Patient Enquiries", "breathlessness · fever · dizziness intake")]
for (item, sub), y in zip(items, positions):
    txt(s, rx, y, 4.6, 0.28, [(item, 13.5, WHITE, True, False)])
    txt(s, rx, y + 0.22, 4.6, 0.28, sub, 10, MUTED)
txt(s, rx, 5.55, 4.7, 0.28, "PATIENT VIEW (/me)", 11, TEAL2, True)
txt(s, rx, 5.87, 4.7, 0.35, [("Mobile-number login → own vitals, score, alerts — nothing else. ", 12.5, TEXT_L, False, False),
                              ("Print-friendly.", 12.5, MUTED, False, True)])
footer(s)

# ============ SLIDE 5 — HOW IT WORKS ============
s = prs.slides.add_slide(BLANK)
set_bg(s, BG)
header(s, "How It Works", [("From heartbeat to hospital action — in one pipeline", 28, WHITE, True, False)], 5)
steps = [
    ("1", "SENSE", "Phone camera (PPG) · BLE band · ESP32 · simulator · BIDMC replay", TEAL),
    ("2", "VALIDATE", "LOINC-coded FHIR R4 validation on ingest", TEAL),
    ("3", "FILTER", "Artifacts suppressed: probe removal, flatline, motion, implausible", AMBER),
    ("4", "SCORE", "NEWS2 + personalization (Scale 2 · meds · baseline drift · check-ins)", BRAND),
    ("5", "ALERT", "Watch · Review · Urgent — fully explained, ack/resolve lifecycle", RED),
]
y = 1.7
box(s, 0.55, y, 12.25, 0.16, TEAL, round_=False)
for i, (n, t, d, accent) in enumerate(steps):
    x = 0.85 + i * 2.52
    oval(s, x, y - 0.26, 0.52, 0.52, accent)
    txt(s, x, y - 0.17, 0.52, 0.3, n, 15, WHITE, True, align=PP_ALIGN.CENTER)
    txt(s, x - 0.35, y + 0.38, 2.2, 0.3, t, 12.5, WHITE, True)
    txt(s, x - 0.35, y + 0.68, 2.2, 1.6, d, 9.5, MUTED, False, line_spacing=1.22)

# bottom proof row
box(s, 0.55, 5.6, 12.25, 1.0, PANEL, round_=True, radius=0.10)
txt(s, 0.85, 5.72, 11.8, 0.3, [("Every step is ", 13, TEXT_L, False, False), ("hot-swappable at the edges", 13, WHITE, True, False),
                                (" — camera, band, or clinical replay — and every rule leaves an audit trail in FHIR and SQLite.", 13, TEXT_L, False, False)])
txt(s, 0.85, 6.08, 11.8, 0.35, "FHIR Observation → HAPI R4 store → local read-model → WebSocket → dashboard & wrist", 11, TEAL2, True, italic=True)
footer(s)

# ============ SLIDE 6 — PERSONALIZATION ============
s = prs.slides.add_slide(BLANK)
set_bg(s, BG)
header(s, "Personalization", [("The same number means different things to different patients", 28, WHITE, True, False)], 6)
tbl_rows = [
    ("Vital", "Rule", "Without it", "With it"),
    ("SpO₂ 90% · COPD + hypercapnia", "SpO₂ Scale 2", "Critical alert (Scale 1, flunks 3x)", "At target — no alert"),
    ("HR 98 bpm · on metoprolol", "Beta-blocker blunting", "Warning at 91+ bpm", "Normal"),
    ("RR 19 vs patient's 14 baseline", "Rolling baseline (z-score)", "Ignored — below threshold", "Gradual deterioration flagged"),
    ("Breathlessness today", "Symptom check-in +2", "Invisible to monitor", "Score rises — clinician sees it"),
]
col_w = [4.6, 2.15, 2.7, 2.7]
xs = [0.55, 5.15, 7.3, 10.0]
# header row
for (h, w, x) in zip(tbl_rows[0], col_w, xs):
    box(s, x, 1.6, w, 0.42, PANEL2, round_=True, radius=0.25)
    txt(s, x + 0.12, 1.71, w - 0.2, 0.25, h.upper(), 10.5, TEAL2, True)
for i, row in enumerate(tbl_rows[1:]):
    yy = 2.1 + i * 0.92
    bg = PANEL if i % 2 == 0 else RGBColor(0x0E, 0x16, 0x2A)
    box(s, 0.55, yy, 11.95, 0.8, bg, round_=True, radius=0.08)
    for cell, w, x in zip(row, col_w, xs):
        txt(s, x + 0.12, yy + 0.12, w - 0.2, 0.55, cell, 10.5, TEXT_L, False, line_spacing=1.15)
    # accent mark
    oval(s, 10.18, yy + 0.28, 0.24, 0.24, GREEN)
txt(s, 0.55, 6.15, 12.2, 0.35, [("Both Scale-2 and beta-blocker blunting fire on ", 13, TEXT_L, False, False),
                                 ("Beryl, patient p01", 13, WHITE, True, False),
                                 (" — the PS-03 “two personalization rules” bar, exceeded.", 13, TEXT_L, False, False)])
footer(s)

# ============ SLIDE 7 — ARTIFACT SUPPRESSION ============
s = prs.slides.add_slide(BLANK)
set_bg(s, BG)
header(s, "Artifact Suppression", [("The monitor that cries wolf gets unplugged", 28, WHITE, True, False)], 7)
artifacts = [
    ("Probe removal", "SpO₂ 0 + flat heart-rate — classic fingertip-off-sensor signature", "Suppressed"),
    ("Flatline signal", "Identical readings N times — sensor stuck, not a pulse", "Suppressed"),
    ("Motion noise", "|ΔSpO₂| > 8 or |ΔHR| > 40 in one tick — movement artifact", "Suppressed"),
    ("Implausible value", "HR 18 · SpO₂ 140 · Temp 44 — physically impossible", "Suppressed"),
    ("Single-reading blip", "One off-chart reading, everything else normal", "Ignored"),
    ("Missing data", "Device silent >10 min — connectivity alert, NOT clinical", "Escalates"),
]
for i, (t, d, verdict) in enumerate(artifacts):
    y = 1.55 + i * 0.72
    box(s, 0.55, y, 12.25, 0.6, PANEL, round_=True, radius=0.10)
    txt(s, 0.78, y + 0.08, 2.6, 0.24, t.upper(), 11, AMBER, True)
    txt(s, 3.35, y + 0.08, 6.1, 0.26, d, 10, MUTED)
    pill(s, 10.15, y + 0.13, 1.3, verdict, TEAL if verdict == "Suppressed" else (TEAL if verdict == "Ignored" else AMBER), WHITE, 9.5)

txt(s, 0.55, 6.15, 12.2, 0.4, [("They never become alerts. ", 13.5, WHITE, True, False),
                                ("They become ", 13.5, TEXT_L, False, False), ("device events", 13.5, TEAL2, True, False),
                                (" — visible, separate, and excluded from the score.", 13.5, TEXT_L, False, False)])
footer(s)

# ============ SLIDE 8 — EVIDENCE ============
s = prs.slides.add_slide(BLANK)
set_bg(s, BG)
header(s, "The Evidence", [("Earlier detection. Fewer false alarms.", 28, WHITE, True, False)], 8)

# big stat trio
stat(s, 0.55, 1.6, 3.95, 1.65, "516 min", "mean earlier detection on slow deterioration vs naive fixed thresholds (p02–p05)", TEAL2)
stat(s, 4.72, 1.6, 3.95, 1.65, "2,934", "artifact readings suppressed across the replay corpus — zero reached a clinician", TEAL2)
stat(s, 8.9, 1.6, 3.95, 1.65, "0", "false alerts in stable-recovery and artifact scenarios — naive raised 28–29 per patient/day", TEAL2)

# chart 1: detection lead time
bar_h(s, 0.7, 3.6, 6.6, 4.6, 1.0, "Our engine — first alert (slow_deterioration)", "≈ 7–9 h earlier", TEAL2, vsize=12.5)
bar_h(s, 0.7, 4.35, 6.6, 4.6, 0.06, "Naive fixed thresholds — first alert", "baseline", AMBER, vsize=12.5)

# chart 2: false alerts per day
bar_h(s, 7.4, 3.6, 5.4, 3.5, 1.0, "Naive — sensor-artifact scenario", "28 / day", RED, vsize=12.5)
bar_h(s, 7.4, 4.35, 5.4, 3.5, 0.035, "Ours — same scenario", "≈ 0 / day", TEAL2, vsize=12.5)

box(s, 0.55, 5.35, 12.25, 0.78, PANEL, round_=True, radius=0.10)
txt(s, 0.82, 5.5, 11.8, 0.3, [("Method: ", 11.5, TEAL2, True, False),
                               ("deterministic replay of 24 h, 1-min ticks, seed 42, over 5 Synthea patients × 4 scenarios — ", 11.5, TEXT_L, False, False),
                               ("naive = fixed HR > 120 · SpO₂ < 92 · RR > 24 · Temp > 38.3.", 11.5, MUTED, False, False)], line_spacing=1.3)
txt(s, 0.82, 5.9, 11.8, 0.25, "Report: POST /api/scenarios/evaluate · stored in DB · reproducible on demand", 9.5, MUTED, False, italic=True)
footer(s)

# ============ SLIDE 9 — FHIR / SPEC ============
s = prs.slides.add_slide(BLANK)
set_bg(s, BG)
header(s, "FHIR R4 — Compliant, Not Claimed", [("Real interoperability, verified, stored in HAPI", 28, WHITE, True, False)], 9)
left_items = [
    ("R4 Vital Signs Observations", "LOINC 8867-4 · 2708-6 · 9279-1 · 8310-5 — validated with fhir.resources before storage"),
    ("HAPI FHIR R4 server", "Live now (public sandbox hapi.fhir.org/baseR4) · Docker deploy included for local/private"),
    ("Escalation as FHIR resources", "Flag + CommunicationRequest created on HAPI for every escalation — Kannada & Hindi text included"),
    ("5 Synthea cohorts", "250-patient population generated with real Synthea → 5 clinically-diverse discharges picked"),
]
for i, (t, d) in enumerate(left_items):
    y = 1.6 + i * 1.18
    box(s, 0.55, y, 6.1, 1.0, PANEL, round_=True, radius=0.10)
    box(s, 0.55, y, 0.07, 1.0, TEAL, round_=False)
    txt(s, 0.8, y + 0.12, 5.6, 0.3, t, 12.5, WHITE, True)
    txt(s, 0.8, y + 0.38, 5.6, 0.5, d, 10, MUTED, False, line_spacing=1.22)

# right: LOINC table
box(s, 7.0, 1.6, 5.75, 4.9, PANEL2, round_=True, radius=0.10)
txt(s, 7.3, 1.78, 5.2, 0.3, "WHAT'S STORED", 11, TEAL2, True)
loinc = [("8867-4", "Heart rate", "Observation · beats/min"),
         ("2708-6", "SpO₂", "Observation · % (Scale 1/2)"),
         ("9279-1", "Respiratory rate", "Observation · breaths/min"),
         ("8310-5", "Body temperature", "Observation · °C (synthesized)")]
for i, (code, name, d) in enumerate(loinc):
    y = 2.25 + i * 1.02
    box(s, 7.3, y, 5.15, 0.85, PANEL, round_=True, radius=0.08)
    txt(s, 7.48, y + 0.09, 1.4, 0.5, code, 17, TEAL2, True)
    txt(s, 8.75, y + 0.09, 3.6, 0.3, name, 12, WHITE, True)
    txt(s, 8.75, y + 0.35, 3.6, 0.3, d, 9.5, MUTED)
footer(s, "FHIR R4 compliance verified: Observations accepted and stored by HAPI; Flag / CommunicationRequest round-trips confirmed")

# ============ SLIDE 10 — PS-03 CHECKLIST ============
s = prs.slides.add_slide(BLANK)
set_bg(s, BG)
header(s, "PS-03 — Every Requirement, Mapped", [("Mandatory walkthrough, line by line", 28, WHITE, True, False)], 10)
rows = [
    ("3.1", "FHIR R4 ingestion · LOINC vitals · HAPI R4 store", "DONE"),
    ("3.2", "Virtual wearable simulator + BIDMC replay", "DONE"),
    ("3.3", "≥5 Synthea discharge profiles driving personalized scoring", "DONE"),
    ("3.4", "NEWS2 + ≥2 personalization rules (we have 4)", "DONE"),
    ("3.5", "Artifact detection & false-alert suppression", "DONE"),
    ("3.6", "Clinician dashboard: vitals, trends, scores, explained Watch/Review/Urgent", "DONE"),
    ("3.7", "Scenario replay + performance report vs naive thresholds", "DONE"),
    ("H1", "Patient-facing symptom check-in (breathlessness · fever · dizziness) → score", "DONE"),
    ("H2", "Escalation to team — FHIR Flag/CommunicationRequest · Hindi/Kannada", "DONE"),
    ("H3", "Missing-data (device silence) alerts — separate from clinical", "DONE"),
]
col_w = [0.8, 9.0, 2.0]
for i, (req, desc, status) in enumerate(rows):
    y = 1.55 + i * 0.485
    box(s, 0.55, y, 12.25, 0.42, PANEL if i % 2 == 0 else RGBColor(0x0E, 0x16, 0x2A), round_=True, radius=0.3)
    txt(s, 0.72, y + 0.08, 0.6, 0.25, req, 10.5, TEAL2, True)
    txt(s, 1.45, y + 0.08, 8.9, 0.25, desc, 10.5, TEXT_L)
    pill(s, 10.35, y + 0.075, 1.3, status, GREEN, RGBColor(0x06, 0x2B, 0x14), 9.5)
footer(s, "All mandatory requirements satisfied · 3 hint features complete · Judges' criteria: detection lead time · alert efficiency · false-alert suppression · FHIR compliance · explainability")

# ============ SLIDE 11 — DEPLOYED TODAY ============
s = prs.slides.add_slide(BLANK)
set_bg(s, BG)
header(s, "Deployed Today, Verified Live", [("Not a mock. Serving real traffic, now.", 28, WHITE, True, False)], 11)
cards = [
    ("Render (cloud)", "FastAPI backend + static frontend, always-on", "https://distohelp-ps03-api.onrender.com", TEAL),
    ("Cloudflare Tunnel", "Public kiosk URL, phone-as-wearable wired to it", "https://……trycloudflare.com", TEAL),
    ("Always-on streams", "All 5 patients streaming from boot (autostream)", "verified live in browser", TEAL),
    ("BIDMC replay", "PhysioNet ICU recordings — real human deterioration", "/api/bidmc/replay · 53 records", TEAL),
]
for i, (t, d, ref, accent) in enumerate(cards):
    x = 0.55 + (i % 2) * 6.25
    y = 1.6 + (i // 2) * 2.05
    box(s, x, y, 5.9, 1.75, PANEL, round_=True, radius=0.10)
    box(s, x, y, 0.07, 1.75, TEAL, round_=False)
    txt(s, x + 0.25, y + 0.18, 5.4, 0.3, t.upper(), 11, TEAL2, True)
    txt(s, x + 0.25, y + 0.48, 5.4, 0.45, d, 11.5, TEXT_L, False, line_spacing=1.25)
    txt(s, x + 0.25, y + 1.15, 5.4, 0.3, ref, 9.5, MUTED, False, italic=True)

box(s, 0.55, 5.85, 12.25, 0.75, PANEL2, round_=True, radius=0.5)
txt(s, 0.9, 6.02, 11.5, 0.4, [("Verified: ", 12, TEAL2, True, False),
                               ("HTTPS 200 · HAPI sandbox live · WebSocket frames flowing · patient portal signs in on phone · QR codes printed", 12, TEXT_L, False, False)])
footer(s)

# ============ SLIDE 12 — ARCHITECTURE ============
s = prs.slides.add_slide(BLANK)
set_bg(s, BG)
header(s, "Architecture", [("Deliberately boring. Dependable under pressure.", 28, WHITE, True, False)], 12)
def arch_box(x, y, w, h, title, sub, accent):
    box(s, x, y, w, h, PANEL, round_=True, radius=0.10)
    box(s, x, y, w, 0.06, accent, round_=False)
    txt(s, x + 0.15, y + 0.12, w - 0.3, 0.3, title, 12, WHITE, True)
    txt(s, x + 0.15, y + 0.42, w - 0.3, h - 0.5, sub, 8.5, MUTED, False, line_spacing=1.18)

arch_box(0.55, 1.75, 2.9, 1.45, "WEARABLE", "Phone camera · BLE band · ESP32 + MAX30102 · simulator · BIDMC replay", TEAL)
arch_box(3.85, 1.75, 2.5, 1.45, "INGEST API", "FHIR R4 validation\nLOINC-coded Observations", BRAND)
arch_box(6.75, 1.75, 2.5, 1.45, "ARTIFACT FILTER", "Probe removal · flatline\nmotion · implausible · missing", AMBER)
arch_box(9.65, 1.75, 3.1, 1.45, "NEWS2 ENGINE", "Scale 1 / 2 · meds blunting\nrolling baselines · check-ins", BRAND)

arrow(s, 3.45, 2.47, 3.85, 2.47, TEAL2)
arrow(s, 6.35, 2.47, 6.75, 2.47, TEAL2)
arrow(s, 9.25, 2.47, 9.65, 2.47, TEAL2)
arrow(s, 11.2, 3.2, 11.2, 4.05, TEAL2)

arch_box(0.55, 4.35, 3.6, 1.35, "HAPI FHIR R4", "System of record · Observations · Flag / CommunicationRequest", TEAL)
arch_box(4.55, 4.35, 3.6, 1.35, "READ MODEL", "SQLite · decisions, alerts, baselines, check-ins — sub-50 ms reads", BRAND)
arch_box(8.55, 4.35, 4.2, 1.35, "DASHBOARD + PATIENT APP", "Live Monitoring · risk queue · explained alerts · wrist kiosk", BRAND)
arrow(s, 8.15, 2.47, 2.35, 4.35, TEAL2)   # FHIR store draws from ingest too (approx curve) — straight diagonal for simplicity
arrow(s, 4.15, 5.0, 4.55, 5.0, TEAL2)
arrow(s, 8.15, 5.0, 8.55, 5.0, TEAL2)
txt(s, 0.55, 6.05, 12.2, 0.3, "Async HAPI worker flushes transaction bundles off the hot path — monitoring never blocks on FHIR server latency.", 10, MUTED, italic=True)
footer(s)

# ============ SLIDE 13 — DEMO FLOW ============
s = prs.slides.add_slide(BLANK)
set_bg(s, BG)
header(s, "The 90-Second Demo", [("Scripted for the room, not for the slides", 28, WHITE, True, False)], 13)
beats = [
    ("0:00", "Sign in — staff the hospital, patient the ward"),
    ("0:10", "Open /live — all five Synthea patients streaming, p02 flagged HIGH RISK"),
    ("0:25", "Tap Live waveforms — real-time HR · SpO₂ · RR · NEWS2 trend, SMA-5 smoothed"),
    ("0:40", "Finger on phone camera — real pulse enters the same pipeline; artifacts suppressed"),
    ("0:55", "Start slow_deterioration on p02 — watch review → urgent with full explanation on screen"),
    ("1:10", "Tap Acknowledge → escalate — FHIR Flag lands on HAPI; Kannada SMS on the wire"),
    ("1:25", "POST /api/scenarios/evaluate — 516-minute lead-time report, printed live"),
]
for i, (t, d) in enumerate(beats):
    y = 1.6 + i * 0.62
    oval(s, 0.6, y, 0.62, 0.44, PANEL2)
    txt(s, 0.6, y + 0.075, 0.62, 0.25, t, 10.5, TEAL2, True, align=PP_ALIGN.CENTER)
    txt(s, 1.5, y + 0.055, 10.9, 0.3, d, 12.5, TEXT_L)
    if i < len(beats) - 1:
        # thin divider
        box(s, 1.5, y + 0.48, 10.9, 0.012, PANEL2, round_=False)
footer(s)

# ============ SLIDE 14 — WHY WE WIN / CLOSE ============
s = prs.slides.add_slide(BLANK)
set_bg(s, BG)
oval(s, 8.6, -2.4, 7.0, 7.0, RGBColor(0x0E, 0x16, 0x2C))
oval(s, 9.6, -1.4, 5.0, 5.0, RGBColor(0x12, 0x1E, 0x3A))
box(s, 0.6, 0.95, 0.55, 0.075, TEAL, round_=False)
txt(s, 0.6, 1.15, 3.0, 0.3, "WHY THIS WINS", 11, TEAL2, True)
txt(s, 0.6, 1.45, 11.5, 1.9, [("The only entrant that ships\n", 44, WHITE, True, False),
                              ("compliance, evidence and a working product — ", 44, TEXT_L, True, False),
                              ("in one demo.", 44, TEAL2, True, False)], line_spacing=0.95)
win = [
    ("FHIR R4 is proven, not promised", "Real HAPI store, validated on ingest, FHIR-native escalations"),
    ("False-alert suppression is measured", "2,934 artifacts caught vs 236 noisy naive alerts"),
    ("Explainability built in", "Every alert: reading · rule · profile fact — no black box"),
    ("It runs right now", "Render URL, Cloudflare kiosk, phone-as-wearable, BIDMC replay — all live"),
]
for i, (t, d) in enumerate(win):
    y = 3.85 + i * 0.62
    oval(s, 0.62, y + 0.02, 0.3, 0.3, GREEN)
    txt(s, 1.05, y, 10.5, 0.25, t, 15, WHITE, True)
    txt(s, 1.05, y + 0.22, 10.5, 0.22, d, 10.5, MUTED)
txt(s, 0.6, 6.45, 11.5, 0.45, [("Monitor continuously. Detect deterioration early. Reduce false alerts. Prioritize patient safety. ", 16.5, TEAL2, True, True)])
footer(s, "Synthea-generated synthetic cohort · PhysioNet BIDMC (open access) · No real patient data · Clinical decision support only")

prs.save(r"C:\Users\User\Documents\Default Project\DIstoHelp\DIstoHelp_PS-03.pptx")
print("Saved DIstoHelp_PS-03.pptx")
