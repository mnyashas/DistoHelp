"""PDF patient report — staff export.

Deterministic, server-side: one authenticated GET returns the whole report as
application/pdf. Includes: patient block (single primary discharge condition),
vitals trend chart, NEWS2 history chart, readings table, symptom check-ins,
recent alerts, disclaimer footer. No browser involved.
"""
import io
import re
from datetime import datetime, timezone
from xml.sax.saxutils import escape

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
from matplotlib.ticker import MaxNLocator

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib.colors import HexColor, white
from reportlab.lib.enums import TA_LEFT
from reportlab.platypus import (
    BaseDocTemplate, Frame, PageTemplate, Paragraph, Spacer, Image,
    Table, TableStyle, KeepTogether,
)

from . import compat, db

BRAND = HexColor("#465fff")
BRAND_DARK = HexColor("#2f3fd4")
DARK = HexColor("#0f172a")
TEXT = HexColor("#334155")
MUTED = HexColor("#64748b")
FAINT = HexColor("#94a3b8")
LIGHT = HexColor("#eef1f8")
ROW = HexColor("#f6f7fb")
RED = HexColor("#ef4444")
AMBER = HexColor("#f59e0b")
ORANGE = HexColor("#f97316")
GREEN = HexColor("#22c55e")
LINE = HexColor("#e2e5ee")

S = {}

def _styles():
    if S:
        return S
    S["title"] = ParagraphStyle("title", fontName="Helvetica-Bold", fontSize=20, textColor=DARK, leading=24)
    S["kicker"] = ParagraphStyle("kicker", fontName="Helvetica-Bold", fontSize=8, textColor=BRAND, leading=10, spaceAfter=2)
    S["h2"] = ParagraphStyle("h2", fontName="Helvetica-Bold", fontSize=12.5, textColor=DARK, leading=16, spaceBefore=10, spaceAfter=4)
    S["body"] = ParagraphStyle("body", fontName="Helvetica", fontSize=9, textColor=TEXT, leading=12.5)
    S["small"] = ParagraphStyle("small", fontName="Helvetica", fontSize=7.5, textColor=MUTED, leading=10)
    S["cell"] = ParagraphStyle("cell", fontName="Helvetica", fontSize=7.5, textColor=TEXT, leading=10)
    S["cellb"] = ParagraphStyle("cellb", fontName="Helvetica-Bold", fontSize=7.5, textColor=DARK, leading=10)
    S["kpi_num"] = ParagraphStyle("kpi_num", fontName="Helvetica-Bold", fontSize=16, textColor=DARK, leading=18)
    S["kpi_lbl"] = ParagraphStyle("kpi_lbl", fontName="Helvetica", fontSize=6.8, textColor=FAINT, leading=9)
    return S


_RISK_HEX = {"urgent": "#ef4444", "review": "#f97316", "watch": "#eab308", "none": "#22c55e",
             "high": "#ef4444", "medium": "#f97316", "low-medium": "#eab308", "low": "#22c55e"}


def _matplotlib_risk_color(level):
    return _RISK_HEX.get(str(level).lower(), "#94a3b8")


def _risk_color(level):
    if (c := _RISK_HEX.get(str(level).lower())) is not None:
        return HexColor(c)
    return FAINT


def _parse_ts(iso):
    try:
        dt = datetime.fromisoformat(str(iso).replace("Z", "+00:00"))
        if dt.tzinfo:
            dt = dt.replace(tzinfo=None)
        return dt
    except Exception:
        return None


def _chart_vitals(recs):
    """Two stacked panels: SpO2 % (right) vs Temp °C (left) on top; HR & RR below."""
    _styles()
    ts = [r["t"] for r in recs]
    spo2 = [r["spo2"] for r in recs]
    temp = [r["temp"] for r in recs]
    hr = [r["hr"] for r in recs]
    rr = [r["rr"] for r in recs]

    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(7.0, 3.6), dpi=150, sharex=True,
                                   gridspec_kw={"hspace": 0.35})
    fig.patch.set_facecolor("white")
    for ax in (ax1, ax2):
        ax.grid(True, linestyle="-", linewidth=0.4, alpha=0.35)
        ax.spines[["top", "right"]].set_visible(False)

    if any(v is not None for v in spo2):
        ax1.plot(ts, spo2, color="#0ea5e9", marker="o", ms=3, lw=1.6, label="SpO₂ %")
        ax1.set_ylabel("SpO₂ %", color="#0369a1", fontsize=8)
        ax1.set_ylim(min(80, min([v for v in spo2 if v is not None], default=100) - 1), 100)
    ax1t = ax1.twinx()
    ax1t.spines[["top"]].set_visible(False)
    if any(v is not None for v in temp):
        ax1t.plot(ts, temp, color="#a855f7", marker="s", ms=3, lw=1.6, label="Temp °C")
        ax1t.set_ylabel("Temp °C", color="#7e22ce", fontsize=8)
    ax1.set_title("Oxygen & temperature", fontsize=8, color="#0f172a", loc="left")

    if any(v is not None for v in hr):
        ax2.plot(ts, hr, color="#0f766e", marker="o", ms=3, lw=1.6, label="Heart rate")
    if any(v is not None for v in rr):
        ax2.plot(ts, rr, color="#f97316", marker="s", ms=3, lw=1.6, label="Respiratory rate")
    ax2.set_ylabel("bpm / breaths·min⁻¹", fontsize=8)
    ax2.set_title("Heart & respiratory rate", fontsize=8, color="#0f172a", loc="left")
    handles = [plt.Line2D([], [], color="#0f766e", marker="o", ms=3, lw=1.6, label="HR"),
               plt.Line2D([], [], color="#f97316", marker="s", ms=3, lw=1.6, label="RR")]
    ax2.legend(handles=handles, loc="upper left", fontsize=7, frameon=False)
    ax2.xaxis.set_major_locator(MaxNLocator(5))
    ax2.xaxis.set_major_formatter(mdates.DateFormatter("%d %b %H:%M"))
    for lbl in ax2.get_xticklabels():
        lbl.set_rotation(18)
        lbl.set_fontsize(7)

    buf = io.BytesIO()
    fig.savefig(buf, format="png", bbox_inches="tight", facecolor="white")
    plt.close(fig)
    buf.seek(0)
    return buf.read()


def _chart_news2(recs):
    _styles()
    ts = [r["t"] for r in recs]
    vals = [r["news2"] for r in recs]
    colors = [_matplotlib_risk_color(r["level"]) for r in recs]

    fig, ax = plt.subplots(figsize=(7.0, 2.4), dpi=150)
    fig.patch.set_facecolor("white")
    ax.grid(True, axis="y", linestyle="-", linewidth=0.4, alpha=0.35)
    ax.spines[["top", "right", "left"]].set_visible(False)
    ax.axhline(5, color="#f97316", linestyle="--", linewidth=1.0, alpha=0.7)
    ax.axhline(7, color="#ef4444", linestyle="--", linewidth=1.0, alpha=0.7)
    ax.bar(ts, vals, color=colors, width=max(0.6 / max(len(ts), 1), 0.03))
    ax.set_ylabel("NEWS2", fontsize=8)
    ax.set_ylim(0, max(vals + [10]) + 1)
    ax.set_title("NEWS2 trend (dashed lines: 5 = review · 7 = urgent)", fontsize=8, color="#0f172a", loc="left")
    ax.xaxis.set_major_locator(MaxNLocator(5))
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%d %b %H:%M"))
    for lbl in ax.get_xticklabels():
        lbl.set_rotation(18)
        lbl.set_fontsize(7)

    buf = io.BytesIO()
    fig.savefig(buf, format="png", bbox_inches="tight", facecolor="white")
    plt.close(fig)
    buf.seek(0)
    return buf.read()


def _header_footer(canv, doc):
    canv.saveState()
    w, h = A4
    canv.setFillColor(BRAND)
    canv.rect(0, h - 8, w, 8, stroke=0, fill=1)
    canv.setFillColor(MUTED)
    canv.setFont("Helvetica", 6.5)
    canv.drawString(1.6 * cm, 0.75 * cm, "DIstoHelp — clinical decision support only. Not a medical diagnosis system. Reviewed by a clinician.")
    canv.drawRightString(w - 1.6 * cm, 0.75 * cm, f"page {doc.page}")
    canv.restoreState()


def build_report(patient_id: str):
    _styles()
    row = db.query_one("SELECT * FROM patients WHERE id=?", (patient_id,))
    if not row:
        return None, None
    patient = compat._patient_summary(row)  # reuse: name/age/gender/phone/primaryCondition/latest
    primary = compat._primary_condition(row)
    discharge_note = (row.get("medical_history") or "").strip()

    rec_rows = db.query(
        "SELECT * FROM monitoring_records WHERE patient_id=? ORDER BY id ASC", (patient_id,))
    recs = []
    for r in rec_rows:
        v = db.loads(r["vitals"]) or {}
        n2 = db.loads(r["news2"]) or {}
        risk = (n2.get("risk") or {}) if isinstance(n2.get("risk"), dict) else {}
        recs.append({
            "t": _parse_ts(r["measured_at"]),
            "hr": v.get("heartRate"), "rr": v.get("respiratoryRate"),
            "spo2": v.get("spo2"), "temp": v.get("temperature"),
            "sys": v.get("systolic"), "dia": v.get("diastolic"),
            "news2": n2.get("total"), "level": (risk.get("level") or n2.get("risk_level") or "none"),
            "source": r["source"],
        })
    recs = [r for r in recs if r["t"] is not None]
    last10 = recs[-10:][::-1]

    alerts = db.query(
        "SELECT level, score_total, explanation, status, created_at FROM alerts "
        "WHERE patient_id=? ORDER BY id DESC LIMIT 8", (patient_id,))
    checkins = db.query(
        "SELECT breathlessness, fever, dizziness, created_at FROM checkins "
        "WHERE patient_id=? ORDER BY id DESC LIMIT 6", (patient_id,))
    notif_count = db.query_one(
        "SELECT COUNT(*) AS n FROM notifications WHERE patient_id=?", (patient_id,))["n"]

    story = []
    story.append(Paragraph("DISTOHELP — POST-DISCHARGE REPORT", S["kicker"]))
    story.append(Paragraph(escape(patient["fullName"]), S["title"]))
    meta = f"{escape(patient_id)} · {patient.get('age')} yrs · {escape(str(patient.get('gender') or ''))}"
    if patient.get("phone"):
        meta += f" · {escape(str(patient['phone']))}"
    story.append(Paragraph(meta, S["small"]))
    story.append(Spacer(1, 6))

    # primary condition band
    cond_text = escape(primary or "No discharge condition recorded")
    story.append(Table(
        [[Paragraph("<b>PRIMARY CONDITION (PRE-DISCHARGE)</b><br/><font size=13><b>" + cond_text + "</b></font>", S["body"])]],
        colWidths=[16.5 * cm],
        style=TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), HexColor("#fff7e6")),
            ("BOX", (0, 0), (-1, -1), 0.8, HexColor("#fbbf24")),
            ("LEFTPADDING", (0, 0), (-1, -1), 10), ("RIGHTPADDING", (0, 0), (-1, -1), 10),
            ("TOPPADDING", (0, 0), (-1, -1), 7), ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ]),
    ))

    if discharge_note:
        story.append(Spacer(1, 4))
        story.append(Paragraph("Discharge note", S["h2"]))
        story.append(Paragraph(escape(discharge_note), S["body"]))

    # KPI strip
    latest = recs[-1] if recs else None
    news2_val = latest["news2"] if latest else "—"
    level = str(latest["level"]).upper() if latest else "—"
    k = [
        ("NEWS2", str(news2_val)),
        ("RISK", level),
        ("READINGS", str(len(recs))),
        ("ALERT MSGS SENT", str(notif_count)),
    ]
    kpi = Table(
        [[Paragraph(f"<font size=16><b>{escape(str(v))}</b></font>", S["kpi_num"]) for _, v in k],
         [Paragraph(escape(l), S["kpi_lbl"]) for l, _ in k]],
        colWidths=[4.12 * cm] * 4,
        style=TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), LIGHT),
            ("LEFTPADDING", (0, 0), (-1, -1), 10),
            ("RIGHTPADDING", (0, 0), (-1, -1), 10),
            ("TOPPADDING", (0, 0), (-1, 0), 7), ("BOTTOMPADDING", (0, 0), (-1, 0), 0),
            ("TOPPADDING", (0, 1), (-1, 1), 0), ("BOTTOMPADDING", (0, 1), (-1, 1), 7),
        ]),
    )
    story.append(Spacer(1, 6))
    story.append(kpi)

    # charts
    if len(recs) >= 2:
        story.append(Paragraph("Vitals trend", S["h2"]))
        story.append(Image(io.BytesIO(_chart_vitals(recs)), width=16.5 * cm, height=8.3 * cm))
        story.append(Paragraph("NEWS2 history", S["h2"]))
        story.append(Image(io.BytesIO(_chart_news2(recs)), width=16.5 * cm, height=5.6 * cm))
    else:
        story.append(Paragraph("Vitals trend / NEWS2 history", S["h2"]))
        story.append(Paragraph("Not enough stored readings yet — charts appear after the second reading is saved.", S["body"]))

    # readings table
    story.append(Paragraph("Recent readings", S["h2"]))
    head = ["Date", "HR", "SpO₂", "RR", "Temp", "BP", "NEWS2", "Level"]
    body = [[Paragraph(f"<b>{h}</b>", S["cellb"]) for h in head]]
    for r in last10:
        bp = f"{r['sys']}/{r['dia']}" if r["sys"] is not None else "—"
        cells = [r["t"].strftime("%d %b %H:%M"),
                 _f(r["hr"]), f"{_f(r['spo2'])}%", _f(r["rr"]), f"{_f(r['temp'], 1)}°C", bp,
                 _f(r["news2"]), str(r["level"]).upper()]
        body.append([Paragraph(str(c), S["cell"]) for c in cells])
    t = Table(body, colWidths=[3.4 * cm, 1.7 * cm, 1.9 * cm, 1.7 * cm, 1.9 * cm, 1.9 * cm, 1.8 * cm, 2.1 * cm], repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), BRAND),
        ("TEXTCOLOR", (0, 0), (-1, 0), white),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [white, ROW]),
        ("LINEBELOW", (0, 0), (-1, -1), 0.4, LINE),
        ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(t)

    # check-ins
    if checkins:
        story.append(Paragraph("Symptom check-ins", S["h2"]))
        head = ["Date", "Breathlessness", "Fever", "Dizziness"]
        body = [[Paragraph(f"<b>{h}</b>", S["cellb"]) for h in head]]
        for c in checkins:
            def lv(v):
                return ["none", "mild", "severe"][v] if v in (0, 1, 2) else str(v)
            created = _parse_ts(c["created_at"])
            body.append([
                Paragraph(created.strftime("%d %b %H:%M") if created else "—", S["cell"]),
                Paragraph(lv(c["breathlessness"]), S["cell"]),
                Paragraph("yes" if c["fever"] else "no", S["cell"]),
                Paragraph(lv(c["dizziness"]), S["cell"]),
            ])
        t = Table(body, colWidths=[4 * cm, 4 * cm, 3.5 * cm, 4.5 * cm], repeatRows=1)
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), BRAND),
            ("TEXTCOLOR", (0, 0), (-1, 0), white),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [white, ROW]),
            ("LINEBELOW", (0, 0), (-1, -1), 0.4, LINE),
            ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]))
        story.append(t)

    # alerts
    if alerts:
        story.append(Paragraph("Recent alerts", S["h2"]))
        body = [["When", "Level", "Score", "Explanation"]]
        for a in alerts:
            when = _parse_ts(a["created_at"])
            body.append([
                when.strftime("%d %b %H:%M") if when else "—",
                str(a["level"]).upper(),
                str(a["score_total"]) if a["score_total"] is not None else "—",
                (a["explanation"] or "")[:170],
            ])
        t = Table(
            [[Paragraph(f"<b>{h}</b>", S["cellb"]) for h in body[0]]] +
            [[Paragraph(str(c), S["cell"]) for c in row_] for row_ in body[1:]],
            colWidths=[2.4 * cm, 1.8 * cm, 1.5 * cm, 10.8 * cm], repeatRows=1)
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), BRAND),
            ("TEXTCOLOR", (0, 0), (-1, 0), white),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [white, ROW]),
            ("LINEBELOW", (0, 0), (-1, -1), 0.4, LINE),
            ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]))
        story.append(t)
    else:
        story.append(Paragraph("Recent alerts", S["h2"]))
        story.append(Paragraph("None recorded.", S["body"]))

    story.append(Spacer(1, 14))
    story.append(Paragraph(
        f"Generated {datetime.now(timezone.utc).strftime('%d %b %Y, %H:%M UTC')} · DIstoHelp · "
        "clinical decision support, not a medical diagnosis system. All alerts must be reviewed by a qualified clinician.",
        S["small"]))

    buf = io.BytesIO()
    doc = BaseDocTemplate(buf, pagesize=A4,
                          leftMargin=1.6 * cm, rightMargin=1.6 * cm,
                          topMargin=1.4 * cm, bottomMargin=1.35 * cm,
                          title=f"DIstoHelp report — {patient_id}",
                          author="DIstoHelp")
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="f")
    doc.addPageTemplates([PageTemplate(id="one", frames=[frame], onPage=_header_footer)])
    doc.build(story)
    buf.seek(0)

    safe_name = re.sub(r"[^A-Za-z0-9_-]+", "_", patient["fullName"]).strip("_") or patient_id
    filename = f"DIstoHelp_{safe_name}_{patient_id}.pdf"
    return buf.read(), filename


def _f(v, digits=0):
    if v is None:
        return "—"
    try:
        return f"{float(v):.{digits}f}" if digits else str(int(round(float(v))))
    except Exception:
        return str(v)
