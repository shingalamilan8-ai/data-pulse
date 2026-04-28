"""
LexaAi v6 — Final Production Version
- Uses models/gemini-flash-latest consistently
- No sidebar in data analysis: unified chat + charts layout
- Fixed resume modal & consultancy page
- Modern API with better error handling
"""

import os
import io
import json
import re
import uuid
from pathlib import Path
from typing import List, Dict, Any, Optional
from datetime import datetime

import pandas as pd
import plotly.express as px
import plotly.io as pio
from fastapi import FastAPI, File, UploadFile, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from dotenv import load_dotenv

from backend.resume_analyzer import analyze_resumes, extract_skills_from_text

load_dotenv()

app = FastAPI(title="LexaAi", version="6.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

SESSIONS: Dict[str, Dict] = {}
FRONTEND_DIR = Path(__file__).parent.parent / "frontend"

# ------------------------------------------------------------------
# Gemini client (works with both google-genai and google.generativeai)
# ------------------------------------------------------------------
_gemini_client = None

def get_gemini_model():
    global _gemini_client
    if _gemini_client is not None:
        return _gemini_client

    key = os.getenv("GEMINI_API_KEY")
    if not key:
        raise HTTPException(500, "Missing GEMINI_API_KEY in .env")

    # Try new SDK first
    try:
        from google import genai
        client = genai.Client(api_key=key)
        _gemini_client = client
        print("✅ Using google.genai SDK")
        return client
    except ImportError:
        pass

    # Fallback to old SDK
    try:
        import google.generativeai as genai_old
        genai_old.configure(api_key=key)
        _gemini_client = genai_old
        print("⚠️ Using deprecated google.generativeai")
        return genai_old
    except ImportError:
        raise HTTPException(500, "Install google-genai or google-generativeai")

def generate_gemini_content(prompt: str) -> str:
    """Generate text using the correct model name."""
    client = get_gemini_model()
    model_name = "models/gemini-flash-latest"  # definitive name

    try:
        # New SDK
        if hasattr(client, "models"):
            response = client.models.generate_content(model=model_name, contents=prompt)
            return response.text
        # Old SDK
        else:
            model = client.GenerativeModel(model_name)
            response = model.generate_content(prompt)
            return response.text
    except Exception as e:
        raise HTTPException(500, f"Gemini error: {str(e)}")

def strip_fences(text: str) -> str:
    return re.sub(r"```(?:python|json)?", "", text).strip("`").strip()

def safe_exec_charts(code: str, df: pd.DataFrame):
    clean = re.sub(r"\.show\(\)", "", code)
    if "import plotly.express as px" not in clean:
        clean = "import plotly.express as px\n" + clean
    lv = {"df": df, "px": px, "pd": pd}
    try:
        exec(clean, {"px": px, "pd": pd}, lv)
    except Exception as e:
        return [], str(e)
    figs = [v for k, v in lv.items() if "fig" in k.lower() and hasattr(v, "to_json")]
    return figs, None

def apply_modern_theme(figs):
    """Professional dark theme with blue/purple accents."""
    for fig in figs:
        fig.update_layout(
            template="plotly_dark",
            paper_bgcolor="#0f0f1a",
            plot_bgcolor="#1a1a2e",
            font=dict(family="Inter, sans-serif", color="#e0e0e0", size=12),
            title_font=dict(size=16, color="#7c3aed", weight="bold"),
            legend=dict(bgcolor="#1a1a2e", bordercolor="#2d2d44"),
            hoverlabel=dict(bgcolor="#2d2d44", font_size=11),
            margin=dict(t=50, l=40, r=20, b=40),
        )
        fig.update_xaxes(gridcolor="#2d2d44", title_font=dict(color="#a0a0c0"))
        fig.update_yaxes(gridcolor="#2d2d44", title_font=dict(color="#a0a0c0"))
    return figs

def _quick_charts(df: pd.DataFrame):
    figs = []
    nc = df.select_dtypes("number").columns.tolist()
    cc = df.select_dtypes("object").columns.tolist()
    if nc:
        figs.append(px.histogram(df, x=nc[0], title=f"Distribution of {nc[0]}", template="plotly_dark"))
    if cc:
        vc = df[cc[0]].value_counts().head(12).reset_index()
        vc.columns = [cc[0], "count"]
        figs.append(px.bar(vc, x=cc[0], y="count", title=f"Top {cc[0]}", template="plotly_dark"))
    if len(nc) >= 2:
        figs.append(px.scatter(df, x=nc[0], y=nc[1], title=f"{nc[0]} vs {nc[1]}", template="plotly_dark"))
    if len(nc) >= 3:
        corr = df[nc].corr()
        figs.append(px.imshow(corr, text_auto=".2f", title="Correlation Matrix", template="plotly_dark"))
    return apply_modern_theme(figs)

def df_profile(df: pd.DataFrame) -> dict:
    nulls = df.isnull().sum()
    cols = []
    for col in df.columns:
        info = {"name": col, "dtype": str(df[col].dtype), "nulls": int(nulls[col]), "null_pct": round(nulls[col]/len(df)*100,1), "unique": int(df[col].nunique())}
        if col in df.select_dtypes("number").columns:
            info["type"] = "numeric"
            info["min"] = float(df[col].min()) if pd.notna(df[col].min()) else None
            info["max"] = float(df[col].max()) if pd.notna(df[col].max()) else None
            info["mean"] = round(float(df[col].mean()), 3)
        else:
            info["type"] = "categorical"
            tv = df[col].value_counts()
            info["top_value"] = str(tv.index[0]) if len(tv) else "—"
        cols.append(info)
    return {
        "rows": len(df),
        "cols": len(df.columns),
        "num_cols": len(df.select_dtypes("number").columns),
        "cat_cols": len(df.select_dtypes("object").columns),
        "duplicates": int(df.duplicated().sum()),
        "total_nulls": int(nulls.sum()),
        "null_pct": round(nulls.sum() / df.size * 100, 1),
        "memory_mb": round(df.memory_usage(deep=True).sum() / 1024**2, 2),
        "columns": cols,
    }

# ------------------------------------------------------------
# Data analysis endpoints
# ------------------------------------------------------------
@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    ext = Path(file.filename).suffix.lower()
    if ext not in (".csv", ".xlsx", ".xls"):
        raise HTTPException(400, "Only CSV/Excel files")
    contents = await file.read()
    try:
        df = pd.read_csv(io.BytesIO(contents)) if ext == ".csv" else pd.read_excel(io.BytesIO(contents))
    except Exception as e:
        raise HTTPException(400, f"Parse error: {e}")
    sid = str(uuid.uuid4())
    SESSIONS[sid] = {
        "df": df,
        "filename": file.filename,
        "figs": [],
        "code": "",
        "insights": "",
        "chat_history": [],
    }
    return {
        "session_id": sid,
        "filename": file.filename,
        "profile": df_profile(df),
        "preview": df.head(8).fillna("").astype(str).to_dict(orient="records"),
        "columns": df.columns.tolist(),
    }

@app.post("/api/generate-charts/{session_id}")
async def generate_charts(session_id: str):
    if session_id not in SESSIONS:
        raise HTTPException(404, "Session not found")
    sess = SESSIONS[session_id]
    df = sess["df"]
    col_info = "\n".join(f"{c} ({t})" for c, t in df.dtypes.items())
    sample = df.head(8).to_string()
    prompt = f"""You are a data scientist. Dataset columns: {col_info}
Sample rows:
{sample}

Create 4-6 Plotly Express charts (fig1, fig2, ...). Use template='plotly_dark', colorway=['#7c3aed','#3b82f6','#06b6d4','#10b981'].
Include titles and axis labels. Do NOT call .show(). Return ONLY executable Python code.
"""
    try:
        code = generate_gemini_content(prompt)
        code = strip_fences(code)
    except Exception as e:
        figs = _quick_charts(df)
        sess["figs"] = figs
        sess["code"] = "# AI failed, fallback"
        charts_json = [json.loads(pio.to_json(f)) for f in figs]
        return {"charts": charts_json, "code": sess["code"], "count": len(figs), "fallback": True}
    figs, err = safe_exec_charts(code, df)
    if err or not figs:
        figs = _quick_charts(df)
        code = "# Error in AI code\n" + code
    figs = apply_modern_theme(figs)
    sess["figs"] = figs
    sess["code"] = code
    charts_json = [json.loads(pio.to_json(f)) for f in figs]
    return {"charts": charts_json, "code": code, "count": len(figs)}

@app.post("/api/generate-insights/{session_id}")
async def generate_insights(session_id: str):
    if session_id not in SESSIONS:
        raise HTTPException(404, "Session not found")
    sess = SESSIONS[session_id]
    df = sess["df"]
    stats = df.describe(include="all").to_string()
    prompt = f"""Dataset stats:
{stats}
Write a professional insight report with sections: ## Overview, ## Key Patterns, ## Recommendations, ## Data Quality.
Use markdown."""
    insights = generate_gemini_content(prompt)
    sess["insights"] = insights
    return {"insights": insights}

class ChatRequest(BaseModel):
    query: str

@app.post("/api/chat/{session_id}")
async def chat(session_id: str, req: ChatRequest):
    if session_id not in SESSIONS:
        raise HTTPException(404, "Session not found")
    sess = SESSIONS[session_id]
    df = sess["df"]
    hist = sess.get("chat_history", [])[-6:]
    hist_text = "\n".join(f"{m['role']}: {m['content']}" for m in hist)
    col_info = ", ".join(df.columns.tolist())
    prompt = f"""You are a data analyst. Columns: {col_info}
Stats: {df.describe().to_string()}
Previous chat:
{hist_text}
User: {req.query}
Answer concisely, with bullet points if useful."""
    answer = generate_gemini_content(prompt)
    sess["chat_history"].append({"role": "user", "content": req.query})
    sess["chat_history"].append({"role": "assistant", "content": answer})
    return {"answer": answer, "history": sess["chat_history"]}

@app.get("/api/profile/{session_id}")
async def profile(session_id: str):
    if session_id not in SESSIONS:
        raise HTTPException(404, "Session not found")
    df = SESSIONS[session_id]["df"]
    return {"profile": df_profile(df), "preview": df.head(10).fillna("").to_dict(orient="records")}

@app.get("/api/export-csv/{session_id}")
async def export_csv(session_id: str):
    if session_id not in SESSIONS:
        raise HTTPException(404, "Session not found")
    buf = io.StringIO()
    SESSIONS[session_id]["df"].to_csv(buf, index=False)
    buf.seek(0)
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=data.csv"})

@app.get("/api/suggest-questions/{session_id}")
async def suggest_questions(session_id: str):
    if session_id not in SESSIONS:
        raise HTTPException(404, "Session not found")
    cols = SESSIONS[session_id]["df"].columns.tolist()
    prompt = f"Generate 5 insightful questions about a dataset with columns: {', '.join(cols)}. Return ONLY a JSON array of strings."
    try:
        resp = generate_gemini_content(prompt)
        qs = json.loads(strip_fences(resp))
        return {"questions": qs[:5]}
    except:
        return {"questions": ["What are the top trends?", "Any missing values?", "What is the average of numeric columns?", "Which category appears most?", "Any outliers?"]}

# ------------------------------------------------------------
# Resume endpoints (same as before, but ensure modal works)
# ------------------------------------------------------------
@app.post("/api/resumes/analyze")
async def analyze_resumes_endpoint(
    skills: str = Form(...),
    job_description: str = Form(None),
    resumes: List[UploadFile] = File(...),
):
    required_skills = json.loads(skills)
    if job_description:
        extracted = extract_skills_from_text(job_description)
        for s in extracted:
            if s.upper() not in [x.upper() for x in required_skills]:
                required_skills.append(s)
    resume_files = [(rf.filename, await rf.read()) for rf in resumes]
    results = analyze_resumes(resume_files, required_skills)
    # add recommendations
    for r in results:
        score = r["ats_score"]
        if score >= 8:
            r["recommendation"] = "Strong Hire"
        elif score >= 6:
            r["recommendation"] = "Consider"
        elif score >= 4:
            r["recommendation"] = "Maybe"
        else:
            r["recommendation"] = "Pass"
    # summary
    avg = sum(r["ats_score"] for r in results) / len(results) if results else 0
    summary = {
        "total_resumes": len(results),
        "total_skills": len(required_skills),
        "avg_score": round(avg, 1),
        "high_score_count": sum(1 for r in results if r["ats_score"] >= 7),
        "mid_score_count": sum(1 for r in results if 4 <= r["ats_score"] < 7),
        "low_score_count": sum(1 for r in results if r["ats_score"] < 4),
    }
    return {"results": results, "summary": summary}

@app.get("/api/resumes/export-csv/{session_id}")
async def resume_export_csv(session_id: str):
    if session_id not in SESSIONS or "resume_results" not in SESSIONS[session_id]:
        raise HTTPException(404, "No resume results")
    results = SESSIONS[session_id]["resume_results"]
    buf = io.StringIO()
    import csv
    writer = csv.writer(buf)
    writer.writerow(["Rank", "Filename", "ATS Score", "Matched", "Missing", "Recommendation"])
    for i, r in enumerate(results, 1):
        writer.writerow([i, r["filename"], r["ats_score"], len(r.get("matched_skills",[])), len(r.get("missing_skills",[])), r.get("recommendation","")])
    buf.seek(0)
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=resumes.csv"})

@app.post("/api/resumes/save/{session_id}")
async def save_resume_results(session_id: str, data: Dict):
    if session_id not in SESSIONS:
        SESSIONS[session_id] = {}
    SESSIONS[session_id]["resume_results"] = data.get("results", [])
    return {"ok": True}

@app.get("/api/resumes/results/{session_id}")
async def get_resume_results(session_id: str):
    if session_id not in SESSIONS:
        return {"results": []}
    return {"results": SESSIONS[session_id].get("resume_results", [])}

# ------------------------------------------------------------
# Static files & SPA fallback
# ------------------------------------------------------------
app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR / "static")), name="static")
@app.get("/{full_path:path}")
async def serve_spa(full_path: str):
    index = FRONTEND_DIR / "index.html"
    if index.exists():
        return FileResponse(str(index))
    return {"error": "Frontend not found"}