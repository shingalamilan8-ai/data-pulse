"""
backend/main.py
LexaAi — FastAPI backend
Serves the React/HTML frontend AND handles all AI + data API routes.
"""

import os
import io
import json
import re
import traceback
import uuid
from pathlib import Path

import pandas as pd
import plotly.express as px
import plotly.io as pio
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

# ── App setup ─────────────────────────────────────────────────────────────────
app = FastAPI(title="LexaAi API", version="3.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory session store  { session_id: { "df": ..., "figs": ..., ... } }
SESSIONS: dict = {}

FRONTEND_DIR = Path(__file__).parent.parent / "frontend"


# ── Helpers ───────────────────────────────────────────────────────────────────
def get_gemini_model():
    import google.generativeai as genai
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY not set in .env")
    genai.configure(api_key=api_key)
    return genai.GenerativeModel("models/gemini-flash-latest")


def strip_fences(text: str) -> str:
    return re.sub(r"```(?:python)?", "", text).strip("`").strip()


def safe_exec_charts(code: str, df: pd.DataFrame):
    clean = re.sub(r"\.show\(\)", "", code)
    local_vars = {"df": df, "px": px, "pd": pd}
    try:
        exec(clean, {"px": px, "pd": pd}, local_vars)
    except Exception:
        return [], traceback.format_exc()
    figs = [v for k, v in local_vars.items() if "fig" in k.lower() and hasattr(v, "to_json")]
    return figs, None


def apply_dark_theme(figs):
    for fig in figs:
        fig.update_layout(
            template="plotly_dark",
            paper_bgcolor="rgba(0,0,0,0)",
            plot_bgcolor="rgba(10,14,26,0.9)",
            font=dict(family="DM Sans, sans-serif", color="#e8eaf0"),
            title_font=dict(family="Syne, sans-serif", size=15, color="#ffffff"),
        )
    return figs


def df_profile(df: pd.DataFrame) -> dict:
    num_cols = df.select_dtypes("number").columns.tolist()
    cat_cols = df.select_dtypes("object").columns.tolist()
    null_counts = df.isnull().sum()

    columns = []
    for col in df.columns:
        info = {
            "name": col,
            "dtype": str(df[col].dtype),
            "nulls": int(null_counts[col]),
            "null_pct": round(float(null_counts[col]) / max(len(df), 1) * 100, 1),
            "unique": int(df[col].nunique()),
        }
        if col in num_cols:
            info.update({
                "type": "numeric",
                "min": float(df[col].min()) if pd.notna(df[col].min()) else None,
                "max": float(df[col].max()) if pd.notna(df[col].max()) else None,
                "mean": round(float(df[col].mean()), 3) if pd.notna(df[col].mean()) else None,
            })
        else:
            top = df[col].value_counts()
            info.update({
                "type": "categorical",
                "top_value": str(top.index[0]) if len(top) > 0 else "—",
            })
        columns.append(info)

    return {
        "rows": len(df),
        "cols": len(df.columns),
        "num_cols": num_cols,
        "cat_cols": cat_cols,
        "duplicates": int(df.duplicated().sum()),
        "total_nulls": int(null_counts.sum()),
        "null_pct": round(float(null_counts.sum()) / max(df.size, 1) * 100, 1),
        "memory_mb": round(df.memory_usage(deep=True).sum() / 1024**2, 2),
        "columns": columns,
    }


# ══════════════════════════════════════════════════════════════════════════════
#  API ROUTES
# ══════════════════════════════════════════════════════════════════════════════

# ── 1. Upload dataset ─────────────────────────────────────────────────────────
@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    ext = Path(file.filename).suffix.lower()
    if ext not in (".csv", ".xlsx", ".xls"):
        raise HTTPException(400, "Only CSV / Excel files are supported.")

    contents = await file.read()
    try:
        if ext == ".csv":
            df = pd.read_csv(io.BytesIO(contents))
        else:
            df = pd.read_excel(io.BytesIO(contents))
    except Exception as e:
        raise HTTPException(400, f"Could not parse file: {e}")

    session_id = str(uuid.uuid4())
    SESSIONS[session_id] = {
        "df": df,
        "df_original": df.copy(),
        "filename": file.filename,
        "figs": [],
        "code": "",
        "insights": "",
        "chat_history": [],
    }

    profile = df_profile(df)
    # Return preview rows as JSON-safe dicts
    preview = df.head(8).fillna("").astype(str).to_dict(orient="records")

    return {
        "session_id": session_id,
        "filename": file.filename,
        "profile": profile,
        "preview": preview,
        "columns": df.columns.tolist(),
    }


# ── 2. Generate AI charts ─────────────────────────────────────────────────────
@app.post("/api/generate-charts/{session_id}")
async def generate_charts(session_id: str):
    if session_id not in SESSIONS:
        raise HTTPException(404, "Session not found. Re-upload your file.")

    sess = SESSIONS[session_id]
    df   = sess["df"]
    model = get_gemini_model()

    col_info = "\n".join(f"  - {c}: {t}" for c, t in df.dtypes.items())
    sample   = df.sample(min(8, len(df))).to_string()

    prompt = f"""You are a world-class data scientist and visualisation expert.

Dataset columns and types:
{col_info}

Sample rows:
{sample}

INSTRUCTIONS:
1. Analyse data types and pick the BEST chart types.
2. Generate 4–6 distinct Plotly Express charts revealing different insights.
3. Name each figure fig1, fig2, fig3 … in order.
4. Apply dark theme: template="plotly_dark" on every figure.
5. Always set title, axis labels, and color where relevant.
6. Do NOT call fig.show().
7. Import only plotly.express as px and pandas as pd (df is already defined).
8. Return ONLY executable Python code — no explanation, no markdown fences.
"""

    try:
        response = model.generate_content(prompt)
        code = strip_fences(response.text)
    except Exception as e:
        raise HTTPException(500, f"Gemini API error: {e}")

    figs, err = safe_exec_charts(code, df)

    if err or not figs:
        # Fallback: generate basic charts without AI
        figs  = _quick_charts(df)
        code  = "# AI code failed — showing fallback charts"

    figs = apply_dark_theme(figs)
    sess["figs"] = figs
    sess["code"] = code
    sess["insights"] = ""  # clear stale insights

    charts_json = [json.loads(pio.to_json(f)) for f in figs]
    return {"charts": charts_json, "code": code, "count": len(figs)}


# ── 3. Generate insights ──────────────────────────────────────────────────────
@app.post("/api/generate-insights/{session_id}")
async def generate_insights(session_id: str):
    if session_id not in SESSIONS:
        raise HTTPException(404, "Session not found.")

    sess  = SESSIONS[session_id]
    df    = sess["df"]
    code  = sess.get("code", "")
    model = get_gemini_model()

    stats  = df.describe(include="all").to_string()
    sample = df.sample(min(8, len(df))).to_string()

    prompt = f"""You are a senior business analyst presenting to a C-suite audience.

Dataset statistics:
{stats}

Sample data:
{sample}

Python chart code generated:
{code}

Write a professional insight report:
1. **Dataset Overview** — rows, columns, data quality.
2. **Key Patterns** — what each chart reveals.
3. **Business Takeaways** — 3–5 actionable bullet points.
4. **Anomalies / Watch-outs** — outliers or data quality flags.

Use ## headings, bullet points, and bold key numbers.
"""

    try:
        response = model.generate_content(prompt)
        insights = response.text
    except Exception as e:
        raise HTTPException(500, f"Gemini API error: {e}")

    sess["insights"] = insights
    return {"insights": insights}


# ── 4. Chat with data ─────────────────────────────────────────────────────────
class ChatRequest(BaseModel):
    query: str


@app.post("/api/chat/{session_id}")
async def chat_with_data(session_id: str, body: ChatRequest):
    if session_id not in SESSIONS:
        raise HTTPException(404, "Session not found.")

    sess    = SESSIONS[session_id]
    df      = sess["df"]
    history = sess.get("chat_history", [])
    model   = get_gemini_model()

    col_info = "\n".join(f"  - {c}: {t}" for c, t in df.dtypes.items())
    stats    = df.describe(include="all").to_string()
    sample   = df.sample(min(10, len(df))).to_string()

    history_text = ""
    for msg in history[-6:]:
        role = "User" if msg["role"] == "user" else "Assistant"
        history_text += f"{role}: {msg['content']}\n"

    prompt = f"""You are an expert data analyst assistant.

Dataset columns: {col_info}

Statistics:
{stats}

Sample rows:
{sample}

Recent conversation:
{history_text}

User question: {body.query}

Answer clearly and concisely. Use bullet points or tables where helpful.
"""

    try:
        response = model.generate_content(prompt)
        answer   = response.text
    except Exception as e:
        raise HTTPException(500, f"Gemini API error: {e}")

    history.append({"role": "user",      "content": body.query})
    history.append({"role": "assistant", "content": answer})
    sess["chat_history"] = history

    return {"answer": answer, "history": history}


# ── 5. Get dataset profile ────────────────────────────────────────────────────
@app.get("/api/profile/{session_id}")
async def get_profile(session_id: str):
    if session_id not in SESSIONS:
        raise HTTPException(404, "Session not found.")
    df      = SESSIONS[session_id]["df"]
    profile = df_profile(df)
    preview = df.head(10).fillna("").astype(str).to_dict(orient="records")
    return {"profile": profile, "preview": preview, "columns": df.columns.tolist()}


# ── 6. Export PDF ─────────────────────────────────────────────────────────────
@app.get("/api/export-pdf/{session_id}")
async def export_pdf(session_id: str):
    if session_id not in SESSIONS:
        raise HTTPException(404, "Session not found.")

    sess     = SESSIONS[session_id]
    insights = sess.get("insights", "No insights generated yet.")
    df       = sess["df"]

    try:
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, HRFlowable
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.units import cm
        from reportlab.lib import colors
        from reportlab.lib.enums import TA_CENTER

        buffer = io.BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=A4,
                                rightMargin=2*cm, leftMargin=2*cm,
                                topMargin=2*cm, bottomMargin=2*cm)
        styles = getSampleStyleSheet()

        title_style = ParagraphStyle("T", parent=styles["Title"],
                                     fontSize=22, textColor=colors.HexColor("#00ffc8"),
                                     spaceAfter=6, alignment=TA_CENTER, fontName="Helvetica-Bold")
        sub_style   = ParagraphStyle("S", parent=styles["Normal"],
                                     fontSize=9, textColor=colors.HexColor("#8892a4"),
                                     spaceAfter=18, alignment=TA_CENTER)
        h2_style    = ParagraphStyle("H2", parent=styles["Heading2"],
                                     fontSize=12, textColor=colors.HexColor("#ffffff"),
                                     backColor=colors.HexColor("#0f1525"),
                                     borderPad=5, spaceBefore=12, spaceAfter=6,
                                     fontName="Helvetica-Bold")
        body_style  = ParagraphStyle("B", parent=styles["Normal"],
                                     fontSize=9.5, textColor=colors.HexColor("#c8d4e8"),
                                     leading=16, spaceAfter=6)

        story = [
            Paragraph("🧠 LexaAi — Data Analysis Report", title_style),
            Paragraph(f"Dataset: {df.shape[0]:,} rows × {df.shape[1]} columns  |  File: {sess.get('filename','—')}", sub_style),
            HRFlowable(width="100%", thickness=1, color=colors.HexColor("#1e2e48")),
            Spacer(1, 0.4*cm),
        ]

        for line in insights.split("\n"):
            line = line.strip()
            if not line:
                story.append(Spacer(1, 0.2*cm))
            elif line.startswith("## ") or line.startswith("# "):
                story.append(Paragraph(line.lstrip("# "), h2_style))
            else:
                fmt = line.replace("**", "<b>", 1)
                while "**" in fmt:
                    fmt = fmt.replace("**", "</b>", 1)
                story.append(Paragraph(fmt, body_style))

        story += [
            Spacer(1, 0.5*cm),
            HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#1e2e48")),
            Paragraph("Generated by LexaAi · Powered by Google Gemini", sub_style),
        ]

        doc.build(story)
        buffer.seek(0)
    except Exception as e:
        raise HTTPException(500, f"PDF generation failed: {e}")

    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=lexaai_report.pdf"},
    )


# ── 7. Export cleaned CSV ─────────────────────────────────────────────────────
@app.get("/api/export-csv/{session_id}")
async def export_csv(session_id: str):
    if session_id not in SESSIONS:
        raise HTTPException(404, "Session not found.")
    df  = SESSIONS[session_id]["df"]
    buf = io.StringIO()
    df.to_csv(buf, index=False)
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=lexaai_data.csv"},
    )


# ── 8. Save / Load dashboard ──────────────────────────────────────────────────
@app.post("/api/save-dashboard/{session_id}")
async def save_dashboard(session_id: str):
    if session_id not in SESSIONS:
        raise HTTPException(404, "Session not found.")
    figs = SESSIONS[session_id].get("figs", [])
    if not figs:
        raise HTTPException(400, "No charts to save.")
    charts_json = [json.loads(pio.to_json(f)) for f in figs]
    with open("dashboard.json", "w") as f:
        json.dump(charts_json, f)
    return {"message": f"Saved {len(figs)} charts to dashboard.json"}


@app.post("/api/load-dashboard/{session_id}")
async def load_dashboard(session_id: str):
    if session_id not in SESSIONS:
        raise HTTPException(404, "Session not found.")
    try:
        with open("dashboard.json") as f:
            charts_json = json.load(f)
        figs = [pio.from_json(json.dumps(c)) for c in charts_json]
        SESSIONS[session_id]["figs"] = figs
        return {"charts": charts_json, "count": len(figs)}
    except FileNotFoundError:
        raise HTTPException(404, "No saved dashboard found.")


# ── 9. Suggest questions ──────────────────────────────────────────────────────
@app.get("/api/suggest-questions/{session_id}")
async def suggest_questions(session_id: str):
    if session_id not in SESSIONS:
        raise HTTPException(404, "Session not found.")
    df    = SESSIONS[session_id]["df"]
    model = get_gemini_model()
    col_info = ", ".join(f"{c} ({t})" for c, t in df.dtypes.items())
    prompt = f"""Given a dataset with columns: {col_info}

Generate exactly 5 insightful, diverse questions an analyst might ask.
Return ONLY a JSON array of 5 strings. Example: ["Q1?", "Q2?", ...]
No other text."""
    try:
        resp = model.generate_content(prompt)
        text = strip_fences(resp.text)
        text = re.sub(r"```json|```", "", text).strip()
        questions = json.loads(text)
        return {"questions": questions[:5]}
    except Exception:
        return {"questions": [
            "What are the top 5 rows by the first numeric column?",
            "Which category appears most frequently?",
            "What is the average of each numeric column?",
            "Are there any missing values?",
            "What trends do you see in this data?"
        ]}


# ── Fallback quick charts ──────────────────────────────────────────────────────
def _quick_charts(df: pd.DataFrame):
    figs = []
    num_cols = df.select_dtypes("number").columns.tolist()
    cat_cols = df.select_dtypes("object").columns.tolist()

    if num_cols:
        figs.append(px.histogram(df, x=num_cols[0], title=f"Distribution of {num_cols[0]}",
                                  template="plotly_dark", color_discrete_sequence=["#00ffc8"]))
    if cat_cols:
        vc = df[cat_cols[0]].value_counts().head(15).reset_index()
        vc.columns = [cat_cols[0], "count"]
        figs.append(px.bar(vc, x=cat_cols[0], y="count",
                           title=f"{cat_cols[0]} Distribution", template="plotly_dark",
                           color_discrete_sequence=["#0066ff"]))
    if len(num_cols) >= 2:
        figs.append(px.scatter(df, x=num_cols[0], y=num_cols[1],
                               title=f"{num_cols[0]} vs {num_cols[1]}",
                               template="plotly_dark", color_discrete_sequence=["#7c3aed"]))
    if len(num_cols) >= 3:
        corr = df[num_cols].corr()
        figs.append(px.imshow(corr, text_auto=".2f", title="Correlation Matrix",
                              template="plotly_dark", color_continuous_scale="RdBu_r"))
    return figs


# ══════════════════════════════════════════════════════════════════════════════
#  STATIC FILES — serve frontend
# ══════════════════════════════════════════════════════════════════════════════
# Serve CSS and JS
app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR / "static")), name="static")

# Catch-all: serve index.html for any non-API route
@app.get("/{full_path:path}")
async def serve_frontend(full_path: str):
    index = FRONTEND_DIR / "index.html"
    if index.exists():
        return FileResponse(str(index))
    return JSONResponse({"error": "Frontend not found"}, status_code=404)
