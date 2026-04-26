"""
backend/main.py  —  LexaAi v4
FastAPI backend: Data Analysis + Resume Analyzer (fully fixed)

BUGS FIXED vs original:
1. Model name "gemini-flash-latest" -> "gemini-1.5-flash" (valid API name)
2. Resume endpoint used wrong parameter types for File uploads
3. apply_dark_theme -> apply_light_theme (blue/light theme)
4. Import path fixed for resume_analyzer
5. Gemini chart prompt updated to use plotly_white template
"""
import os, io, json, re, traceback, uuid
from pathlib import Path
from typing import List, Optional

import pandas as pd
import plotly.express as px
import plotly.io as pio
from fastapi import FastAPI, File, UploadFile, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from dotenv import load_dotenv

from backend.resume_analyzer import analyze_resumes

load_dotenv()

app = FastAPI(title="LexaAi API", version="4.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

SESSIONS: dict = {}
FRONTEND_DIR = Path(__file__).parent.parent / "frontend"


def get_gemini_model():
    import google.generativeai as genai
    key = os.getenv("GEMINI_API_KEY")
    if not key:
        raise HTTPException(500, "GEMINI_API_KEY not set in .env")
    genai.configure(api_key=key)
    # Try stable model names in order
    for name in ["gemini-1.5-flash", "gemini-1.5-flash-latest", "gemini-pro"]:
        try:
            return genai.GenerativeModel(name)
        except Exception:
            continue
    raise HTTPException(500, "Could not initialise Gemini model")


def strip_fences(t: str) -> str:
    return re.sub(r"```(?:python|json)?", "", t).strip("`").strip()


def safe_exec_charts(code: str, df: pd.DataFrame):
    clean = re.sub(r"\.show\(\)", "", code)
    lv = {"df": df, "px": px, "pd": pd}
    try:
        exec(clean, {"px": px, "pd": pd}, lv)
    except Exception:
        return [], traceback.format_exc()
    return [v for k, v in lv.items() if "fig" in k.lower() and hasattr(v, "to_json")], None


def apply_light_theme(figs):
    """Apply clean professional light-blue theme to Plotly figures."""
    for fig in figs:
        fig.update_layout(
            template="plotly_white",
            paper_bgcolor="rgba(0,0,0,0)",
            plot_bgcolor="rgba(241,246,255,0.6)",
            font=dict(family="Plus Jakarta Sans, Inter, sans-serif", color="#1e293b", size=13),
            title_font=dict(family="Plus Jakarta Sans, sans-serif", size=16, color="#0f172a"),
            colorway=["#2563eb", "#3b82f6", "#0ea5e9", "#6366f1", "#8b5cf6", "#06b6d4"],
            legend=dict(bgcolor="rgba(255,255,255,0.9)", bordercolor="#e2e8f0", borderwidth=1),
            margin=dict(t=50, b=40, l=40, r=20),
        )
        fig.update_xaxes(gridcolor="#e2e8f0", linecolor="#cbd5e1")
        fig.update_yaxes(gridcolor="#e2e8f0", linecolor="#cbd5e1")
    return figs


def _quick_charts(df: pd.DataFrame):
    """Fallback charts without AI."""
    figs = []
    nc = df.select_dtypes("number").columns.tolist()
    cc = df.select_dtypes("object").columns.tolist()
    if nc:
        figs.append(px.histogram(df, x=nc[0], title=f"Distribution — {nc[0]}",
                                  template="plotly_white", color_discrete_sequence=["#2563eb"]))
    if cc:
        vc = df[cc[0]].value_counts().head(12).reset_index()
        vc.columns = [cc[0], "count"]
        figs.append(px.bar(vc, x=cc[0], y="count", title=f"{cc[0]} Frequency",
                           template="plotly_white", color_discrete_sequence=["#3b82f6"]))
    if len(nc) >= 2:
        figs.append(px.scatter(df, x=nc[0], y=nc[1], title=f"{nc[0]} vs {nc[1]}",
                               template="plotly_white", color_discrete_sequence=["#0ea5e9"]))
    if len(nc) >= 3:
        corr = df[nc].corr()
        figs.append(px.imshow(corr, text_auto=".2f", title="Correlation Matrix",
                              template="plotly_white", color_continuous_scale="Blues"))
    return apply_light_theme(figs)


def df_profile(df: pd.DataFrame) -> dict:
    nc = df.select_dtypes("number").columns.tolist()
    cc = df.select_dtypes("object").columns.tolist()
    null_c = df.isnull().sum()
    cols = []
    for col in df.columns:
        info = {"name": col, "dtype": str(df[col].dtype), "nulls": int(null_c[col]),
                "null_pct": round(float(null_c[col]) / max(len(df), 1) * 100, 1),
                "unique": int(df[col].nunique())}
        if col in nc:
            info.update({
                "type": "numeric",
                "min": float(df[col].min()) if pd.notna(df[col].min()) else None,
                "max": float(df[col].max()) if pd.notna(df[col].max()) else None,
                "mean": round(float(df[col].mean()), 3) if pd.notna(df[col].mean()) else None,
            })
        else:
            tv = df[col].value_counts()
            info.update({"type": "categorical",
                         "top_value": str(tv.index[0]) if len(tv) > 0 else "—"})
        cols.append(info)
    return {
        "rows": len(df), "cols": len(df.columns), "num_cols": nc, "cat_cols": cc,
        "duplicates": int(df.duplicated().sum()), "total_nulls": int(null_c.sum()),
        "null_pct": round(float(null_c.sum()) / max(df.size, 1) * 100, 1),
        "memory_mb": round(df.memory_usage(deep=True).sum() / 1024**2, 2), "columns": cols,
    }


# ══════════════════════════════════════════════════════════════════════════════
#  DATA ANALYSIS ROUTES
# ══════════════════════════════════════════════════════════════════════════════

@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    ext = Path(file.filename).suffix.lower()
    if ext not in (".csv", ".xlsx", ".xls"):
        raise HTTPException(400, "Only CSV / Excel files are supported.")
    contents = await file.read()
    try:
        df = pd.read_csv(io.BytesIO(contents)) if ext == ".csv" else pd.read_excel(io.BytesIO(contents))
    except Exception as e:
        raise HTTPException(400, f"Could not parse file: {e}")
    sid = str(uuid.uuid4())
    SESSIONS[sid] = {
        "df": df, "df_original": df.copy(), "filename": file.filename,
        "figs": [], "code": "", "insights": "", "chat_history": [], "resume_results": [],
    }
    return {
        "session_id": sid, "filename": file.filename,
        "profile": df_profile(df),
        "preview": df.head(8).fillna("").astype(str).to_dict(orient="records"),
        "columns": df.columns.tolist(),
    }


@app.post("/api/generate-charts/{session_id}")
async def generate_charts(session_id: str):
    if session_id not in SESSIONS:
        raise HTTPException(404, "Session not found. Re-upload your file.")
    sess = SESSIONS[session_id]
    df = sess["df"]
    model = get_gemini_model()
    col_info = "\n".join(f"  - {c}: {t}" for c, t in df.dtypes.items())
    sample = df.sample(min(8, len(df))).to_string()
    prompt = f"""You are a world-class data scientist and visualisation expert.

Dataset columns and types:
{col_info}

Sample rows:
{sample}

INSTRUCTIONS:
1. Analyse data types and pick the BEST chart types.
2. Generate 4-6 distinct Plotly Express charts revealing different insights.
3. Name each figure fig1, fig2, fig3 in order.
4. Use template="plotly_white" on every figure.
5. Use color_discrete_sequence=["#2563eb","#3b82f6","#0ea5e9","#6366f1"] for colors.
6. Always set title and axis labels.
7. Do NOT call fig.show().
8. Only import plotly.express as px (df and pd already defined in scope).
9. Return ONLY executable Python code — no explanation, no markdown fences."""
    try:
        response = model.generate_content(prompt)
        code = strip_fences(response.text)
    except Exception as e:
        raise HTTPException(500, f"Gemini API error: {e}")
    figs, err = safe_exec_charts(code, df)
    if err or not figs:
        figs = _quick_charts(df)
        code = "# AI code failed — showing fallback charts"
    figs = apply_light_theme(figs)
    sess["figs"] = figs
    sess["code"] = code
    sess["insights"] = ""
    charts_json = [json.loads(pio.to_json(f)) for f in figs]
    return {"charts": charts_json, "code": code, "count": len(figs)}


# ── 3. Custom Chart Request ───────────────────────────────────────────────────
class CustomChartRequest(BaseModel):
    request: str

@app.post("/api/custom-chart/{session_id}")
async def custom_chart(session_id: str, req: CustomChartRequest):
    if session_id not in SESSIONS:
        raise HTTPException(404, "Session not found. Re-upload your file.")
    
    sess = SESSIONS[session_id]
    df = sess["df"]
    model = get_gemini_model()
    
    col_info = "\n".join(f"  - {c}: {t}" for c, t in df.dtypes.items())
    sample = df.sample(min(8, len(df))).to_string()
    
    prompt = f"""You are a world-class data scientist and visualisation expert.

Dataset columns and types:
{col_info}

Sample rows:
{sample}

USER REQUEST: {req.request}

INSTRUCTIONS:
1. Create exactly ONE Plotly Express chart based on the user's request.
2. Use template="plotly_white" on the figure.
3. Use color_discrete_sequence=["#2563eb","#3b82f6","#0ea5e9","#6366f1"] for colors.
4. Always set title and axis labels.
5. Do NOT call fig.show().
6. Only import plotly.express as px (df and pd already defined in scope).
7. Return ONLY executable Python code — no explanation, no markdown fences."""

    try:
        response = model.generate_content(prompt)
        code = strip_fences(response.text)
    except Exception as e:
        raise HTTPException(500, f"Gemini API error: {e}")

    figs, err = safe_exec_charts(code, df)
    
    if err or not figs:
        raise HTTPException(400, f"Could not generate chart: {err or 'No chart created'}")

    figs = apply_light_theme(figs)
    
    # Append to existing charts
    sess["figs"].extend(figs)
    sess["code"] += "\n\n# Custom chart\n" + code
    
    charts_json = [json.loads(pio.to_json(f)) for f in figs]
    return {"charts": charts_json, "code": code, "count": len(figs)}


@app.post("/api/generate-insights/{session_id}")
async def generate_insights(session_id: str):
    if session_id not in SESSIONS:
        raise HTTPException(404, "Session not found.")
    sess = SESSIONS[session_id]
    df = sess["df"]
    code = sess.get("code", "")
    model = get_gemini_model()
    prompt = f"""You are a senior business analyst presenting to a C-suite audience.

Dataset statistics:
{df.describe(include="all").to_string()}

Sample data:
{df.sample(min(8, len(df))).to_string()}

Python chart code generated:
{code}

Write a professional insight report:
## Dataset Overview — rows, columns, data quality.
## Key Patterns — what each chart reveals.
## Business Takeaways — 3-5 actionable bullet points.
## Anomalies / Watch-outs — outliers or data quality flags.

Use ## headings, bullet points, and bold key numbers."""
    try:
        response = model.generate_content(prompt)
        insights = response.text
    except Exception as e:
        raise HTTPException(500, f"Gemini API error: {e}")
    sess["insights"] = insights
    return {"insights": insights}


class ChatRequest(BaseModel):
    query: str


@app.post("/api/chat/{session_id}")
async def chat_with_data(session_id: str, body: ChatRequest):
    if session_id not in SESSIONS:
        raise HTTPException(404, "Session not found.")
    sess = SESSIONS[session_id]
    df = sess["df"]
    history = sess.get("chat_history", [])
    model = get_gemini_model()
    col_info = "\n".join(f"  - {c}: {t}" for c, t in df.dtypes.items())
    hist_text = "".join(
        f"{'User' if m['role'] == 'user' else 'Assistant'}: {m['content']}\n"
        for m in history[-6:]
    )
    prompt = f"""You are an expert data analyst assistant.
Dataset columns: {col_info}
Statistics:
{df.describe(include="all").to_string()}
Sample rows:
{df.sample(min(10, len(df))).to_string()}
Conversation:
{hist_text}
User question: {body.query}
Answer clearly and concisely. Use bullet points or tables where helpful."""
    try:
        response = model.generate_content(prompt)
        answer = response.text
    except Exception as e:
        raise HTTPException(500, f"Gemini API error: {e}")
    history.append({"role": "user", "content": body.query})
    history.append({"role": "assistant", "content": answer})
    sess["chat_history"] = history
    return {"answer": answer, "history": history}


@app.get("/api/profile/{session_id}")
async def get_profile(session_id: str):
    if session_id not in SESSIONS:
        raise HTTPException(404, "Session not found.")
    df = SESSIONS[session_id]["df"]
    return {
        "profile": df_profile(df),
        "preview": df.head(10).fillna("").astype(str).to_dict(orient="records"),
        "columns": df.columns.tolist(),
    }


@app.get("/api/export-pdf/{session_id}")
async def export_pdf(session_id: str):
    if session_id not in SESSIONS:
        raise HTTPException(404, "Session not found.")
    sess = SESSIONS[session_id]
    insights = sess.get("insights", "No insights generated yet.")
    df = sess["df"]
    try:
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, HRFlowable
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.units import cm
        from reportlab.lib import colors
        from reportlab.lib.enums import TA_CENTER
        buf = io.BytesIO()
        doc = SimpleDocTemplate(buf, pagesize=A4,
                                rightMargin=2*cm, leftMargin=2*cm,
                                topMargin=2*cm, bottomMargin=2*cm)
        styles = getSampleStyleSheet()
        ts = ParagraphStyle("T", parent=styles["Title"], fontSize=22,
                            textColor=colors.HexColor("#1d4ed8"), spaceAfter=6,
                            alignment=TA_CENTER, fontName="Helvetica-Bold")
        ss = ParagraphStyle("S", parent=styles["Normal"], fontSize=9,
                            textColor=colors.HexColor("#64748b"), spaceAfter=18, alignment=TA_CENTER)
        h2 = ParagraphStyle("H2", parent=styles["Heading2"], fontSize=12,
                            textColor=colors.HexColor("#0f172a"),
                            backColor=colors.HexColor("#eff6ff"),
                            borderPad=5, spaceBefore=12, spaceAfter=6, fontName="Helvetica-Bold")
        bs = ParagraphStyle("B", parent=styles["Normal"], fontSize=9.5,
                            textColor=colors.HexColor("#334155"), leading=16, spaceAfter=6)
        story = [
            Paragraph("LexaAi — Data Analysis Report", ts),
            Paragraph(f"Dataset: {df.shape[0]:,} rows x {df.shape[1]} cols  |  {sess.get('filename', '—')}", ss),
            HRFlowable(width="100%", thickness=1, color=colors.HexColor("#bfdbfe")),
            Spacer(1, 0.4*cm),
        ]
        for line in insights.split("\n"):
            line = line.strip()
            if not line:
                story.append(Spacer(1, 0.2*cm))
            elif line.startswith("## ") or line.startswith("# "):
                story.append(Paragraph(line.lstrip("# "), h2))
            else:
                fmt = line.replace("**", "<b>", 1)
                while "**" in fmt:
                    fmt = fmt.replace("**", "</b>", 1)
                story.append(Paragraph(fmt, bs))
        story += [
            Spacer(1, 0.5*cm),
            HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#bfdbfe")),
            Paragraph("Generated by LexaAi · Powered by Google Gemini", ss),
        ]
        doc.build(story)
        buf.seek(0)
    except Exception as e:
        raise HTTPException(500, f"PDF generation failed: {e}")
    return StreamingResponse(buf, media_type="application/pdf",
                             headers={"Content-Disposition": "attachment; filename=lexaai_report.pdf"})


@app.get("/api/export-csv/{session_id}")
async def export_csv(session_id: str):
    if session_id not in SESSIONS:
        raise HTTPException(404, "Session not found.")
    df = SESSIONS[session_id]["df"]
    buf = io.StringIO()
    df.to_csv(buf, index=False)
    buf.seek(0)
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": "attachment; filename=lexaai_data.csv"})


@app.get("/api/suggest-questions/{session_id}")
async def suggest_questions(session_id: str):
    if session_id not in SESSIONS:
        raise HTTPException(404, "Session not found.")
    df = SESSIONS[session_id]["df"]
    model = get_gemini_model()
    col_info = ", ".join(f"{c} ({t})" for c, t in df.dtypes.items())
    prompt = f"""Given a dataset with columns: {col_info}
Generate exactly 5 insightful, diverse questions an analyst might ask.
Return ONLY a JSON array of 5 strings. Example: ["Q1?","Q2?",...]
No other text."""
    try:
        resp = model.generate_content(prompt)
        text = re.sub(r"```json|```", "", strip_fences(resp.text)).strip()
        questions = json.loads(text)
        return {"questions": questions[:5]}
    except Exception:
        return {"questions": [
            "What are the top 5 rows by the first numeric column?",
            "Which category appears most frequently?",
            "What is the average of each numeric column?",
            "Are there any missing values?",
            "What trends do you see in this data?",
        ]}


# ══════════════════════════════════════════════════════════════════════════════
#  RESUME ANALYZER ROUTES
# ══════════════════════════════════════════════════════════════════════════════

class ResumeAnalyzeRequest(BaseModel):
    skills: List[str]
    job_description: Optional[str] = None

@app.post("/api/resumes/analyze")
async def analyze_resumes_endpoint(
    skills: str = Form(None),
    job_description: str = Form(None),
    resumes: List[UploadFile] = File(None),
):
    """Analyze multiple resumes and calculate ATS scores."""
    if not skills:
        raise HTTPException(400, "Missing skills parameter")
    if not resumes:
        raise HTTPException(400, "No resume files uploaded")

    try:
        required_skills = json.loads(skills)
    except Exception:
        required_skills = []

    if not required_skills:
        raise HTTPException(400, "Please provide at least one required skill")
    if len(resumes) > 10:
        raise HTTPException(400, "Maximum 10 resumes allowed at once")

    # Extract skills from job description if provided
    if job_description:
        extracted_skills = extract_skills_from_text(job_description)
        for skill in extracted_skills:
            if skill not in required_skills:
                required_skills.append(skill)

    resume_files = []
    for rf in resumes:
        content = await rf.read()
        resume_files.append((rf.filename, content))

    try:
        results = analyze_resumes(resume_files, required_skills)
        
        # Add additional metadata
        for result in results:
            result["analyzed_at"] = pd.Timestamp.now().isoformat()
            result["total_skills_evaluated"] = len(required_skills)
        
        return {
            "results": results,
            "summary": {
                "total_resumes": len(results),
                "total_skills": len(required_skills),
                "skills_list": required_skills,
                "avg_score": sum(r.get("ats_score", 0) for r in results) / len(results) if results else 0,
                "top_candidate": results[0]["filename"] if results else None,
                "high_score_count": len([r for r in results if r.get("ats_score", 0) >= 7]),
                "mid_score_count": len([r for r in results if 4 <= r.get("ats_score", 0) < 7]),
                "low_score_count": len([r for r in results if r.get("ats_score", 0) < 4])
            }
        }
    except Exception as e:
        raise HTTPException(500, f"Analysis failed: {str(e)}")


def extract_skills_from_text(text: str) -> List[str]:
    """Extract potential skills from job description text."""
    common_skills = [
        "python", "java", "javascript", "typescript", "c++", "c#", "ruby", "go", "rust",
        "react", "angular", "vue", "node", "django", "flask", "spring", "express",
        "sql", "mysql", "postgresql", "mongodb", "oracle", "redis", "elasticsearch",
        "aws", "azure", "gcp", "docker", "kubernetes", "terraform", "jenkins", "git",
        "machine learning", "deep learning", "data science", "ai", "nlp", "computer vision",
        "agile", "scrum", "jira", "rest api", "graphql", "microservices"
    ]
    text_lower = text.lower()
    found_skills = []
    for skill in common_skills:
        if skill in text_lower:
            found_skills.append(skill.title() if len(skill) > 3 else skill.upper())
    return found_skills[:15]  # Limit to 15 skills


@app.get("/api/resumes/results/{session_id}")
async def get_resume_results(session_id: str):
    if session_id not in SESSIONS:
        raise HTTPException(404, "Session not found")
    results = SESSIONS[session_id].get("resume_results", [])
    return {"results": results, "count": len(results)}


class ResumesRequest(BaseModel):
    results: list


@app.post("/api/resumes/save/{session_id}")
async def save_resume_results(session_id: str, body: ResumesRequest):
    if session_id not in SESSIONS:
        # Allow saving without a data session
        SESSIONS[session_id] = {"resume_results": []}
    SESSIONS[session_id]["resume_results"] = body.results
    return {"message": f"Saved {len(body.results)} resume results"}


@app.get("/api/resumes/export-csv/{session_id}")
async def export_resumes_csv(session_id: str):
    if session_id not in SESSIONS:
        raise HTTPException(404, "Session not found")
    results = SESSIONS[session_id].get("resume_results", [])
    if not results:
        raise HTTPException(400, "No resume results to export")
    rows = ["Resume Name,ATS Score,Matched Skills,Missing Skills,Score %"]
    for r in results:
        fn = r.get("filename", "Unknown").replace('"', '""')
        score = r.get("ats_score", 0)
        matched = len(r.get("matched_skills", []))
        missing = len(r.get("missing_skills", []))
        rows.append(f'"{fn}",{score:.1f},{matched},{missing},{score / 10 * 100:.1f}%')
    csv_content = "\n".join(rows)
    return StreamingResponse(iter([csv_content]), media_type="text/csv",
                             headers={"Content-Disposition": "attachment; filename=resume_analysis.csv"})


@app.delete("/api/resumes/session/{session_id}")
async def clear_resume_session(session_id: str):
    if session_id not in SESSIONS:
        raise HTTPException(404, "Session not found")
    SESSIONS[session_id]["resume_results"] = []
    return {"message": "Resume session cleared"}


# ══════════════════════════════════════════════════════════════════════════════
#  SERVE FRONTEND
# ══════════════════════════════════════════════════════════════════════════════
app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR / "static")), name="static")


@app.get("/{full_path:path}")
async def serve_frontend(full_path: str):
    index = FRONTEND_DIR / "index.html"
    if index.exists():
        return FileResponse(str(index))
    return JSONResponse({"error": "Frontend not found"}, status_code=404)