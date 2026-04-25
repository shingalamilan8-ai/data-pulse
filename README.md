# 🧠 LexaAi — Intelligent Data Analysis Platform

A full-stack AI data analyst app.
**FastAPI** backend + **Vanilla JS / HTML** frontend (no React needed).
Powered by **Google Gemini**.

---

## 📁 Project Structure

```
lexaai/
│
├── backend/
│   ├── main.py              ← FastAPI app (all API routes + static file serving)
│   └── requirements.txt     ← Python dependencies
│
├── frontend/
│   ├── index.html           ← Single-page app (all 4 pages)
│   └── static/
│       ├── css/
│       │   └── style.css    ← Full design system
│       └── js/
│           └── app.js       ← All frontend logic + API calls
│
├── .env.example             ← Copy to .env and add your API key
├── .gitignore
└── README.md
```

---

## ⚙️ Setup & Run

### Step 1 — Prerequisites
- Python 3.10+ installed
- A Gemini API key from https://aistudio.google.com/

### Step 2 — Clone / extract project
```bash
cd lexaai
```

### Step 3 — Create virtual environment (recommended)
```bash
python -m venv venv

# Windows:
venv\Scripts\activate

# Mac/Linux:
source venv/bin/activate
```

### Step 4 — Install dependencies
```bash
pip install -r backend/requirements.txt
```

### Step 5 — Configure API key
```bash
# Copy the example env file
cp .env.example .env

# Open .env and replace the placeholder:
# GEMINI_API_KEY=your_actual_key_here
```

### Step 6 — Run the server
```bash
# From the lexaai/ root directory:
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

### Step 7 — Open in browser
```
http://localhost:8000
```

That's it. One command, one URL. 🎉

---

## 🚀 What You Can Do

| Feature | How |
|---|---|
| Upload CSV/Excel | Dashboard → Upload Data → Browse Files |
| Generate AI Charts | Upload → Click "Generate Analysis & Charts" |
| AI Insights Report | Dashboard → AI Insights → Generate Insights |
| Chat with Data | Dashboard → AI Chat → Ask anything |
| Data Column Profile | Dashboard → Data Summary |
| Download PDF Report | Dashboard → Export → Download PDF |
| Download Cleaned CSV | Dashboard → Export → Download CSV |
| Save/Load Dashboard | Dashboard → Export → Save/Load Charts |
| Book a Consultant | Consultancy page → Connect button |

---

## 🔧 API Endpoints (FastAPI)

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/upload` | Upload CSV/Excel, get session_id |
| POST | `/api/generate-charts/{id}` | Generate AI Plotly charts |
| POST | `/api/generate-insights/{id}` | Generate text insights |
| POST | `/api/chat/{id}` | Chat with dataset |
| GET  | `/api/profile/{id}` | Dataset profile/stats |
| GET  | `/api/export-pdf/{id}` | Download PDF report |
| GET  | `/api/export-csv/{id}` | Download cleaned CSV |
| POST | `/api/save-dashboard/{id}` | Save charts to JSON |
| POST | `/api/load-dashboard/{id}` | Load charts from JSON |
| GET  | `/api/suggest-questions/{id}` | AI-generated questions |

Interactive API docs at: `http://localhost:8000/docs`

---

## 🛠️ Troubleshooting

**`GEMINI_API_KEY not set`** → Make sure `.env` exists in the `lexaai/` root with your key.

**`ModuleNotFoundError`** → Run `pip install -r backend/requirements.txt` again inside your venv.

**Charts not rendering** → Open browser DevTools console for JS errors. Ensure Plotly CDN loaded.

**Port 8000 in use** → Change port: `uvicorn backend.main:app --reload --port 8080`

---

## 🔄 Running on a different port
```bash
uvicorn backend.main:app --reload --port 8080
# Then visit: http://localhost:8080
```
