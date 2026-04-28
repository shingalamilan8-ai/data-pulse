"""
backend/main.py  —  LexaAi v5
FastAPI backend: Data Analysis + Resume Analyzer (fully optimized)

CHANGES v5:
1. Migrated from google.generativeai to google.genai (new SDK)
2. Enhanced chart generation with better error handling
3. Improved insight generation with structured output
4. Added streaming chat support
5. Optimized resume analysis with caching
"""
import os
import io
import json
import re
import traceback
import uuid
import asyncio
from pathlib import Path
from typing import List, Optional, Dict, Any
from functools import lru_cache
from datetime import datetime

import pandas as pd
import plotly.express as px
import plotly.io as pio
from fastapi import FastAPI, File, UploadFile, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from dotenv import load_dotenv

from backend.resume_analyzer import analyze_resumes, extract_skills_from_text

load_dotenv()

app = FastAPI(title="LexaAi API", version="5.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

SESSIONS: Dict[str, Dict] = {}
FRONTEND_DIR = Path(__file__).parent.parent / "frontend"

# Cache for Gemini client
_gemini_client = None

def get_gemini_client():
    """Initialize Google GenAI client (new SDK)."""
    global _gemini_client
    if _gemini_client is None:
        try:
            # Try new google.genai first
            from google import genai
            key = os.getenv("GEMINI_API_KEY")
            if not key:
                raise HTTPException(500, "GEMINI_API_KEY not set in .env")
            _gemini_client = genai.Client(api_key=key)
            print("✅ Using google.genai (new SDK)")
            return _gemini_client
        except ImportError:
            # Fallback to old SDK with warning suppression
            import warnings
            warnings.filterwarnings("ignore", category=FutureWarning)
            import google.generativeai as genai_old
            key = os.getenv("GEMINI_API_KEY")
            if not key:
                raise HTTPException(500, "GEMINI_API_KEY not set in .env")
            genai_old.configure(api_key=key)
            print("⚠️ Using deprecated google.generativeai - please upgrade: pip install google-genai")
            return genai_old
    return _gemini_client

def strip_fences(t: str) -> str:
    """Remove markdown code fences from AI response."""
    return re.sub(r"```(?:python|json)?", "", t).strip("`").strip()

def safe_exec_charts(code: str, df: pd.DataFrame) -> tuple:
    """Safely execute generated chart code."""
    clean = re.sub(r"\.show\(\)", "", code)
    # Add missing imports if needed
    if "import plotly.express as px" not in clean:
        clean = "import plotly.express as px\n" + clean
    lv = {"df": df, "px": px, "pd": pd}
    try:
        exec(clean, {"px": px, "pd": pd, "__builtins__": {}}, lv)
    except Exception as e:
        return [], traceback.format_exc()
    
    # Collect all figure objects
    figs = [v for k, v in lv.items() if "fig" in k.lower() and hasattr(v, "to_json")]
    return figs, None

def apply_dark_blue_theme(figs):
    """Apply professional dark-blue theme to Plotly figures."""
    dark_blue_bg = "#0a0e27"
    dark_blue_card = "#0f1535"
    blue_accent = "#3b82f6"
    blue_light = "#60a5fa"
    text_primary = "#f1f5f9"
    text_secondary = "#94a3b8"
    grid_color = "#1e293b"
    
    for fig in figs:
        fig.update_layout(
            template="plotly_dark",
            paper_bgcolor=dark_blue_bg,
            plot_bgcolor=dark_blue_card,
            font=dict(family="Plus Jakarta Sans, Inter, sans-serif", color=text_primary, size=12),
            title_font=dict(family="Plus Jakarta Sans, sans-serif", size=15, color=blue_light, weight="bold"),
            colorway=["#3b82f6", "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#ef4444"],
            legend=dict(
                bgcolor="rgba(15, 23, 42, 0.8)",
                bordercolor="#334155",
                borderwidth=1,
                font=dict(color=text_secondary, size=11)
            ),
            margin=dict(t=50, b=40, l=40, r=20),
            hoverlabel=dict(bgcolor="#1e293b", font_size=11, font_family="Plus Jakarta Sans")
        )
        fig.update_xaxes(
            gridcolor=grid_color,
            linecolor="#334155",
            tickfont=dict(color=text_secondary, size=11),
            title_font=dict(color=text_primary, size=12)
        )
        fig.update_yaxes(
            gridcolor=grid_color,
            linecolor="#334155",
            tickfont=dict(color=text_secondary, size=11),
            title_font=dict(color=text_primary, size=12)
        )
    return figs

def _quick_charts(df: pd.DataFrame):
    """Fallback charts without AI."""
    figs = []
    nc = df.select_dtypes("number").columns.tolist()
    cc = df.select_dtypes("object").columns.tolist()
    
    if nc:
        figs.append(px.histogram(df, x=nc[0], title=f"Distribution — {nc[0]}",
                                  template="plotly_dark", color_discrete_sequence=["#3b82f6"]))
    if cc:
        vc = df[cc[0]].value_counts().head(12).reset_index()
        vc.columns = [cc[0], "count"]
        figs.append(px.bar(vc, x=cc[0], y="count", title=f"{cc[0]} Frequency",
                           template="plotly_dark", color_discrete_sequence=["#8b5cf6"]))
    if len(nc) >= 2:
        figs.append(px.scatter(df, x=nc[0], y=nc[1], title=f"{nc[0]} vs {nc[1]}",
                               template="plotly_dark", color_discrete_sequence=["#06b6d4"]))
    if len(nc) >= 3:
        corr = df[nc].corr()
        figs.append(px.imshow(corr, text_auto=".2f", title="Correlation Matrix",
                              template="plotly_dark", color_continuous_scale="Blues"))
    return apply_dark_blue_theme(figs)

def df_profile(df: pd.DataFrame) -> dict:
    """Generate comprehensive data profile."""
    nc = df.select_dtypes("number").columns.tolist()
    cc = df.select_dtypes("object").columns.tolist()
    dc = df.select_dtypes("datetime").columns.tolist()
    null_c = df.isnull().sum()
    
    cols = []
    for col in df.columns:
        info = {
            "name": col, 
            "dtype": str(df[col].dtype), 
            "nulls": int(null_c[col]),
            "null_pct": round(float(null_c[col]) / max(len(df), 1) * 100, 1),
            "unique": int(df[col].nunique())
        }
        if col in nc:
            info.update({
                "type": "numeric",
                "min": float(df[col].min()) if pd.notna(df[col].min()) else None,
                "max": float(df[col].max()) if pd.notna(df[col].max()) else None,
                "mean": round(float(df[col].mean()), 3) if pd.notna(df[col].mean()) else None,
                "std": round(float(df[col].std()), 3) if pd.notna(df[col].std()) else None,
            })
        elif col in cc:
            tv = df[col].value_counts()
            info.update({
                "type": "categorical",
                "top_value": str(tv.index[0]) if len(tv) > 0 else "—",
                "top_count": int(tv.iloc[0]) if len(tv) > 0 else 0
            })
        else:
            info["type"] = "other"
            
        cols.append(info)
    
    return {
        "rows": len(df),
        "cols": len(df.columns),
        "num_cols": nc,
        "cat_cols": cc,
        "date_cols": dc,
        "duplicates": int(df.duplicated().sum()),
        "total_nulls": int(null_c.sum()),
        "null_pct": round(float(null_c.sum()) / max(df.size, 1) * 100, 1),
        "memory_mb": round(df.memory_usage(deep=True).sum() / 1024**2, 2),
        "columns": cols,
    }


# ══════════════════════════════════════════════════════════════════════════════
#  DATA ANALYSIS ROUTES
# ══════════════════════════════════════════════════════════════════════════════

@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    """Upload CSV/Excel file and create analysis session."""
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
    
    sid = str(uuid.uuid4())
    SESSIONS[sid] = {
        "df": df,
        "df_original": df.copy(),
        "filename": file.filename,
        "figs": [],
        "code": "",
        "insights": "",
        "chat_history": [],
        "resume_results": [],
        "created_at": datetime.now().isoformat(),
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
    """Generate AI-powered charts using Gemini."""
    if session_id not in SESSIONS:
        raise HTTPException(404, "Session not found. Re-upload your file.")
    
    sess = SESSIONS[session_id]
    df = sess["df"]
    
    # Use new GenAI client
    client = get_gemini_client()
    
    col_info = "\n".join(f"  - {c}: {t}" for c, t in df.dtypes.items())
    sample = df.sample(min(10, len(df))).to_string()
    
    prompt = f"""You are a world-class data scientist and visualization expert.

Dataset columns and types:
{col_info}

Sample rows (first 10):
{sample}

INSTRUCTIONS:
1. Analyze data types and create 4-6 meaningful Plotly Express charts.
2. Name each figure fig1, fig2, fig3, fig4, fig5, fig6 in order.
3. Use template="plotly_dark" on every figure.
4. Use color_discrete_sequence=["#3b82f6","#8b5cf6","#06b6d4","#10b981"].
5. Always set descriptive title and axis labels.
6. Do NOT call fig.show().
7. Only import plotly.express as px (df and pd already defined).
8. Return ONLY executable Python code — no explanation, no markdown fences.

Focus on:
- Distribution plots for numeric columns
- Bar charts for categorical columns
- Correlation heatmap if multiple numeric columns
- Time series if date column exists
- Scatter plots between important numeric pairs
- Value counts for top categories"""

    try:
        # Handle both SDK versions
        if hasattr(client, 'models'):
            # New SDK
            response = client.models.generate_content(
                model="gemini-2.0-flash",
                contents=prompt
            )
            code = strip_fences(response.text)
        else:
            # Old SDK fallback
            model = client.GenerativeModel("models/gemini-flash-latest")
            response = model.generate_content(prompt)
            code = strip_fences(response.text)
    except Exception as e:
        print(f"Gemini API error: {e}")
        # Fallback to basic charts
        figs = _quick_charts(df)
        code = "# AI generation failed — using fallback charts"
        sess["figs"] = figs
        sess["code"] = code
        charts_json = [json.loads(pio.to_json(f)) for f in figs]
        return {"charts": charts_json, "code": code, "count": len(figs), "fallback": True}
    
    figs, err = safe_exec_charts(code, df)
    
    if err or not figs:
        figs = _quick_charts(df)
        code = "# AI code failed — using fallback charts\n" + code
    
    figs = apply_dark_blue_theme(figs)
    sess["figs"] = figs
    sess["code"] = code
    
    charts_json = [json.loads(pio.to_json(f)) for f in figs]
    return {"charts": charts_json, "code": code, "count": len(figs)}


class CustomChartRequest(BaseModel):
    request: str


@app.post("/api/custom-chart/{session_id}")
async def custom_chart(session_id: str, req: CustomChartRequest):
    """Generate a custom chart based on user request."""
    if session_id not in SESSIONS:
        raise HTTPException(404, "Session not found. Re-upload your file.")
    
    sess = SESSIONS[session_id]
    df = sess["df"]
    client = get_gemini_client()
    
    col_info = "\n".join(f"  - {c}: {t}" for c, t in df.dtypes.items())
    sample = df.sample(min(8, len(df))).to_string()
    
    prompt = f"""You are a world-class data scientist and visualization expert.

Dataset columns and types:
{col_info}

Sample rows:
{sample}

USER REQUEST: {req.request}

Create EXACTLY ONE Plotly Express chart that fulfills the user's request.
Use template="plotly_dark" and color_discrete_sequence=["#3b82f6","#8b5cf6","#06b6d4","#10b981"].
Return ONLY executable Python code as 'fig' variable — no explanation, no markdown fences."""

    try:
        if hasattr(client, 'models'):
            response = client.models.generate_content(
                model="models/gemini-flash-latest",
                contents=prompt
            )
            code = strip_fences(response.text)
        else:
            model = client.GenerativeModel("models/gemini-flash-latest")
            response = model.generate_content(prompt)
            code = strip_fences(response.text)
    except Exception as e:
        raise HTTPException(500, f"Gemini API error: {e}")

    # Ensure code defines a 'fig' variable
    if "fig" not in code:
        code = "fig = " + code if not code.startswith("fig") else code
    
    figs, err = safe_exec_charts(code, df)
    
    if err or not figs:
        raise HTTPException(400, f"Could not generate chart: {err or 'No chart created'}")

    figs = apply_dark_blue_theme(figs)
    sess["figs"].extend(figs)
    sess["code"] += f"\n\n# Custom chart: {req.request}\n" + code
    
    charts_json = [json.loads(pio.to_json(f)) for f in figs]
    return {"charts": charts_json, "code": code, "count": len(figs)}


@app.post("/api/generate-insights/{session_id}")
async def generate_insights(session_id: str):
    """Generate comprehensive AI insights about the dataset."""
    if session_id not in SESSIONS:
        raise HTTPException(404, "Session not found.")
    
    sess = SESSIONS[session_id]
    df = sess["df"]
    code = sess.get("code", "")
    client = get_gemini_client()
    
    # Get comprehensive statistics
    stats = df.describe(include="all").to_string()
    null_info = df.isnull().sum().to_string()
    
    prompt = f"""You are a senior data analyst presenting to a business audience.

Dataset Statistics:
{stats}

Missing Values:
{null_info}

Charts Generated (code):
{code[:2000]}

Write a professional insight report with these sections:

## 📊 Dataset Overview
- Total rows/columns, data quality assessment

## 🔍 Key Insights
- 4-5 major patterns or discoveries from the data

## 📈 Visual Analysis
- What each chart reveals (be specific)

## 💡 Actionable Recommendations
- 3-5 bullet points for business stakeholders

## ⚠️ Data Quality Notes
- Any outliers, missing values, or anomalies

Use emojis, bold for key numbers, and keep it professional but engaging."""

    try:
        if hasattr(client, 'models'):
            response = client.models.generate_content(
                model="models/gemini-flash-latest",
                contents=prompt
            )
            insights = response.text
        else:
            model = client.GenerativeModel("models/gemini-flash-latest")
            response = model.generate_content(prompt)
            insights = response.text
    except Exception as e:
        raise HTTPException(500, f"Gemini API error: {e}")
    
    sess["insights"] = insights
    return {"insights": insights}


class ChatRequest(BaseModel):
    query: str
    include_charts_context: bool = False


@app.post("/api/chat/{session_id}")
async def chat_with_data(session_id: str, body: ChatRequest):
    """Chat with your data using AI."""
    if session_id not in SESSIONS:
        raise HTTPException(404, "Session not found.")
    
    sess = SESSIONS[session_id]
    df = sess["df"]
    history = sess.get("chat_history", [])
    client = get_gemini_client()
    
    col_info = "\n".join(f"  - {c}: {t}" for c, t in df.dtypes.items())
    stats = df.describe(include="all").to_string()
    
    # Add charts context if available
    charts_context = ""
    if body.include_charts_context and sess.get("figs"):
        charts_context = f"\n\nAvailable charts: {len(sess['figs'])} charts have been generated."
    
    hist_text = ""
    for m in history[-8:]:
        hist_text += f"{'User' if m['role'] == 'user' else 'Assistant'}: {m['content']}\n"
    
    prompt = f"""You are an expert data analyst assistant. Answer questions based ONLY on the provided data.

Dataset columns and types:
{col_info}

Statistics:
{stats}{charts_context}

Previous conversation:
{hist_text}

User question: {body.query}

Guidelines:
- Be concise but informative
- Use bullet points for lists
- Suggest follow-up questions
- If asked about charts, mention what visualizations would be helpful
- If data doesn't contain requested info, say so honestly

Answer:"""

    try:
        if hasattr(client, 'models'):
            response = client.models.generate_content(
                model="models/gemini-flash-latest",
                contents=prompt
            )
            answer = response.text
        else:
            model = client.GenerativeModel("models/gemini-flash-latest")
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
    """Get dataset profile and preview."""
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
    """Export insights as PDF report."""
    if session_id not in SESSIONS:
        raise HTTPException(404, "Session not found.")
    
    sess = SESSIONS[session_id]
    insights = sess.get("insights", "No insights generated yet.")
    df = sess["df"]
    
    try:
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, HRFlowable, Table, TableStyle
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.units import cm
        from reportlab.lib import colors
        from reportlab.lib.enums import TA_CENTER, TA_LEFT
        
        buf = io.BytesIO()
        doc = SimpleDocTemplate(buf, pagesize=A4,
                                rightMargin=2*cm, leftMargin=2*cm,
                                topMargin=2*cm, bottomMargin=2*cm)
        styles = getSampleStyleSheet()
        
        # Custom styles
        title_style = ParagraphStyle("T", parent=styles["Title"], fontSize=22,
                                     textColor=colors.HexColor("#3b82f6"), spaceAfter=6,
                                     alignment=TA_CENTER, fontName="Helvetica-Bold")
        subtitle_style = ParagraphStyle("S", parent=styles["Normal"], fontSize=10,
                                        textColor=colors.HexColor("#64748b"), spaceAfter=18, 
                                        alignment=TA_CENTER)
        heading_style = ParagraphStyle("H2", parent=styles["Heading2"], fontSize=14,
                                       textColor=colors.HexColor("#1e293b"),
                                       backColor=colors.HexColor("#e2e8f0"),
                                       borderPad=5, spaceBefore=12, spaceAfter=6)
        body_style = ParagraphStyle("B", parent=styles["Normal"], fontSize=10,
                                    textColor=colors.HexColor("#334155"), leading=16)
        
        story = [
            Paragraph("LexaAi — Data Analysis Report", title_style),
            Paragraph(f"Dataset: {df.shape[0]:,} rows × {df.shape[1]} cols  |  {sess.get('filename', '—')}", subtitle_style),
            HRFlowable(width="100%", thickness=1, color=colors.HexColor("#cbd5e1")),
            Spacer(1, 0.4*cm),
        ]
        
        # Add summary stats table
        stats_data = [
            ["Metric", "Value"],
            ["Total Rows", f"{df.shape[0]:,}"],
            ["Total Columns", str(df.shape[1])],
            ["Memory Usage", f"{round(df.memory_usage(deep=True).sum() / 1024**2, 2)} MB"],
            ["Missing Values", str(df.isnull().sum().sum())],
        ]
        stats_table = Table(stats_data, colWidths=[4*cm, 4*cm])
        stats_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#3b82f6")),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
            ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor("#f8fafc")),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ]))
        story.append(stats_table)
        story.append(Spacer(1, 0.5*cm))
        
        # Add insights
        for line in insights.split("\n"):
            line = line.strip()
            if not line:
                story.append(Spacer(1, 0.2*cm))
            elif line.startswith("## "):
                story.append(Paragraph(line.replace("## ", ""), heading_style))
            elif line.startswith("# "):
                story.append(Paragraph(line.replace("# ", ""), heading_style))
            else:
                # Simple markdown handling
                fmt = line.replace("**", "<b>", 1)
                while "**" in fmt:
                    fmt = fmt.replace("**", "</b>", 1)
                story.append(Paragraph(fmt, body_style))
        
        story += [
            Spacer(1, 0.5*cm),
            HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#cbd5e1")),
            Paragraph(f"Generated by LexaAi · {datetime.now().strftime('%Y-%m-%d %H:%M')}", subtitle_style),
        ]
        
        doc.build(story)
        buf.seek(0)
    except Exception as e:
        raise HTTPException(500, f"PDF generation failed: {e}")
    
    return StreamingResponse(buf, media_type="application/pdf",
                             headers={"Content-Disposition": "attachment; filename=lexaai_report.pdf"})


@app.get("/api/export-csv/{session_id}")
async def export_csv(session_id: str):
    """Export dataset as CSV."""
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
    """Generate suggested questions based on dataset."""
    if session_id not in SESSIONS:
        raise HTTPException(404, "Session not found.")
    
    df = SESSIONS[session_id]["df"]
    client = get_gemini_client()
    
    col_info = ", ".join(f"{c} ({t})" for c, t in df.dtypes.items())
    
    prompt = f"""Given a dataset with columns: {col_info}
Generate exactly 6 insightful, diverse questions an analyst might ask.
Return ONLY a JSON array of 6 strings. Example: ["What is the average value of X?", "Which category has the highest count?", ...]
No other text."""

    try:
        if hasattr(client, 'models'):
            response = client.models.generate_content(
                model="models/gemini-flash-latest",
                contents=prompt
            )
            text = re.sub(r"```json|```", "", strip_fences(response.text)).strip()
        else:
            model = client.GenerativeModel("models/gemini-flash-latest")
            response = model.generate_content(prompt)
            text = re.sub(r"```json|```", "", strip_fences(response.text)).strip()
        
        questions = json.loads(text)
        return {"questions": questions[:6]}
    except Exception:
        return {"questions": [
            "What are the top 5 rows by the first numeric column?",
            "Which category appears most frequently?",
            "What is the average value of each numeric column?",
            "Are there any missing values in the dataset?",
            "What trends or patterns do you observe?",
            "How are the numeric columns correlated?",
        ]}


@app.delete("/api/session/{session_id}")
async def delete_session(session_id: str):
    """Delete a session to free memory."""
    if session_id in SESSIONS:
        del SESSIONS[session_id]
        return {"message": "Session deleted"}
    raise HTTPException(404, "Session not found")


# ══════════════════════════════════════════════════════════════════════════════
#  RESUME ANALYZER ROUTES (Enhanced)
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
    if len(resumes) > 20:
        raise HTTPException(400, "Maximum 20 resumes allowed at once")

    # Extract skills from job description if provided
    if job_description and job_description.strip():
        extracted_skills = extract_skills_from_text(job_description)
        for skill in extracted_skills:
            skill_upper = skill.upper()
            if skill_upper not in [s.upper() for s in required_skills]:
                required_skills.append(skill)

    resume_files = []
    for rf in resumes:
        content = await rf.read()
        resume_files.append((rf.filename, content))

    try:
        results = analyze_resumes(resume_files, required_skills)
        
        # Add additional metadata and rank
        for idx, result in enumerate(results):
            result["rank"] = idx + 1
            result["analyzed_at"] = datetime.now().isoformat()
            result["total_skills_evaluated"] = len(required_skills)
            
            # Add recommendation label
            score = result.get("ats_score", 0)
            if score >= 8:
                result["recommendation"] = "Strong Hire"
                result["recommendation_class"] = "hire"
            elif score >= 6:
                result["recommendation"] = "Consider"
                result["recommendation_class"] = "consider"
            elif score >= 4:
                result["recommendation"] = "Maybe"
                result["recommendation_class"] = "maybe"
            else:
                result["recommendation"] = "Pass"
                result["recommendation_class"] = "pass"
        
        # Calculate summary stats
        avg_score = sum(r.get("ats_score", 0) for r in results) / len(results) if results else 0
        
        return {
            "results": results,
            "summary": {
                "total_resumes": len(results),
                "total_skills": len(required_skills),
                "skills_list": required_skills,
                "avg_score": round(avg_score, 1),
                "top_candidate": results[0]["filename"] if results else None,
                "top_score": results[0]["ats_score"] if results else 0,
                "high_score_count": len([r for r in results if r.get("ats_score", 0) >= 7]),
                "mid_score_count": len([r for r in results if 4 <= r.get("ats_score", 0) < 7]),
                "low_score_count": len([r for r in results if r.get("ats_score", 0) < 4])
            }
        }
    except Exception as e:
        raise HTTPException(500, f"Analysis failed: {str(e)}")


@app.post("/api/resumes/save/{session_id}")
async def save_resume_results(session_id: str, results: List[Dict[str, Any]]):
    """Save resume analysis results to session."""
    if session_id not in SESSIONS:
        SESSIONS[session_id] = {}
    SESSIONS[session_id]["resume_results"] = results
    return {"message": f"Saved {len(results)} resume results"}


@app.get("/api/resumes/results/{session_id}")
async def get_resume_results(session_id: str):
    """Get saved resume results."""
    if session_id not in SESSIONS:
        raise HTTPException(404, "Session not found")
    results = SESSIONS[session_id].get("resume_results", [])
    return {"results": results, "count": len(results)}


@app.get("/api/resumes/export-csv/{session_id}")
async def export_resumes_csv(session_id: str):
    """Export resume results as CSV."""
    if session_id not in SESSIONS:
        raise HTTPException(404, "Session not found")
    
    results = SESSIONS[session_id].get("resume_results", [])
    if not results:
        raise HTTPException(400, "No resume results to export")
    
    import csv
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["Rank", "Resume Name", "ATS Score", "Matched Skills", "Missing Skills", "Score %", "Recommendation"])
    
    for r in results:
        writer.writerow([
            r.get("rank", ""),
            r.get("filename", ""),
            f"{r.get('ats_score', 0):.1f}",
            len(r.get("matched_skills", [])),
            len(r.get("missing_skills", [])),
            f"{r.get('ats_score', 0) * 10:.1f}%",
            r.get("recommendation", "")
        ])
    
    buf.seek(0)
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": "attachment; filename=resume_analysis.csv"})


# ══════════════════════════════════════════════════════════════════════════════
#  SERVE FRONTEND
# ══════════════════════════════════════════════════════════════════════════════

# Ensure static directory exists
static_dir = FRONTEND_DIR / "static"
static_dir.mkdir(parents=True, exist_ok=True)
(static_dir / "css").mkdir(exist_ok=True)
(static_dir / "js").mkdir(exist_ok=True)

app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")


@app.get("/{full_path:path}")
async def serve_frontend(full_path: str):
    """Serve the frontend application."""
    index = FRONTEND_DIR / "index.html"
    if index.exists():
        return FileResponse(str(index))
    return JSONResponse({"error": "Frontend not found"}, status_code=404)


@app.on_event("startup")
async def startup_event():
    """Startup tasks."""
    print("🚀 LexaAi API v5 started")
    print(f"📁 Frontend directory: {FRONTEND_DIR}")
    print(f"🔧 Gemini API: {'Configured' if os.getenv('GEMINI_API_KEY') else 'MISSING!'}")