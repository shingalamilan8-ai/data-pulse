# LexaAi — Intelligent Data Analysis Platform with Resume Analyzer

**LexaAi** is an AI-powered platform for data analysis, visualization, and intelligent resume screening. Built with FastAPI and modern web technologies, it combines:

- **Data Analytics**: Upload CSV/Excel files, get instant AI-generated charts and insights
- **AI Chat**: Ask natural language questions about your data
- **Resume Analyzer**: Screen resumes with ATS scoring and automatic candidate ranking

## 🎨 Features

### Data Analysis Service
- 📊 **Auto Chart Generation**: AI selects optimal chart types (bar, line, pie, scatter, heatmap)
- 📈 **Smart Insights**: Deep analysis powered by Google Gemini AI
- 💬 **Natural Language Chat**: Ask questions about your dataset
- 📥 **Multi-Format Support**: CSV, XLSX, XLS files
- 📄 **PDF Export**: Download professional insight reports
- 💾 **Data Export**: Clean and export your processed data

### Resume Analyzer Service ⭐ NEW
- ⚡ **Fast Screening**: Analyze multiple resumes in seconds
- 🎯 **Skill Matching**: AI-powered ATS scoring system
- 📊 **Detailed Analytics**: See matched/missing skills per resume
- 🔄 **Smart Sorting**: Auto-rank candidates by ATS score (0-10)
- 📥 **Batch Upload**: Process up to 10 resumes at once
- 💾 **Export Results**: Download scoring results as CSV

### Design
- 🎨 **Professional Blue Theme**: Modern, accessible interface with blue color palette
- 📱 **Responsive**: Works on desktop, tablet, and mobile
- ⚡ **Fast & Smooth**: Interactive animations and live updates
- 🌙 **Dark Mode**: Built-in dark theme (blue-based)

## 🚀 Getting Started

### Prerequisites
- Python 3.8+
- pip (Python package manager)
- Google Gemini API key ([Get one here](https://ai.google.dev))

### Installation

1. **Clone or extract the project**:
   ```bash
   cd lexaai
   ```

2. **Create virtual environment**:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. **Install dependencies**:
   ```bash
   pip install -r backend/requirements.txt
   ```

4. **Set up environment variables**:
   Create a `.env` file in the project root:
   ```
   GEMINI_API_KEY=your_api_key_here
   ```

5. **Run the server**:
   ```bash
   python -m uvicorn backend.main:app --reload
   ```

6. **Open in browser**:
   Navigate to `http://localhost:8000`

## 📁 Project Structure

```
lexaai/
├── frontend/
│   ├── index.html                          # Single-page app with all features
│   ├── static/
│   │   ├── css/
│   │   │   └── style.css                  # Professional blue theme
│   │   └── js/
│   │       ├── app.js                     # Main app logic
│   │       └── resume-analyzer.js         # Resume Analyzer module
│
├── backend/
│   ├── main.py                           # FastAPI server & routes
│   ├── resume_analyzer.py                # Resume parsing & ATS scoring
│   ├── requirements.txt                  # Python dependencies
│   └── __pycache__/
│
├── .env                                  # Environment variables
├── .gitignore
└── README.md
```

## 🔌 API Endpoints

### Data Analysis
- `POST /api/upload` — Upload CSV/Excel file
- `POST /api/generate-charts/{session_id}` — Generate charts
- `POST /api/generate-insights/{session_id}` — Get AI insights
- `POST /api/chat/{session_id}` — Chat with data
- `GET /api/profile/{session_id}` — Get data profile
- `GET /api/export-pdf/{session_id}` — Download PDF report
- `GET /api/export-csv/{session_id}` — Download clean CSV
- `POST /api/save-dashboard/{session_id}` — Save charts to JSON
- `POST /api/load-dashboard/{session_id}` — Restore saved charts
- `GET /api/suggest-questions/{session_id}` — AI-generated questions

### Resume Analyzer
- `POST /api/resumes/analyze` — Upload and analyze resumes
  ```json
  Form Data:
  {
    "skills": JSON string of skills array,
    "resumes": Multiple files (PDF/DOCX)
  }
  ```

- `GET /api/resumes/results/{session_id}` — Get stored results
- `POST /api/resumes/save/{session_id}` — Save results to session
- `GET /api/resumes/export-csv/{session_id}` — Export as CSV
- `DELETE /api/resumes/session/{session_id}` — Clear session

## 🎯 Usage Guide

### Data Analysis Workflow
1. **Home Page**: Click "Upload & Analyze" or "Launch App"
2. **Upload**: Drag-drop or browse CSV/Excel files
3. **Generate**: AI automatically creates charts and insights
4. **Explore**:
   - **Charts Tab**: View and interact with generated visualizations
   - **AI Insights**: Read deep analytical summaries
   - **AI Chat**: Ask questions in natural language
   - **Data Summary**: See column profiles and statistics
   - **Export**: Download PDF reports or clean CSV

### Resume Analyzer Workflow
1. **Define Skills**: Enter required skills for the role
2. **Upload Resumes**: Drag-drop PDF/DOCX files (max 10)
3. **Analyze**: Click "Analyze Resumes & Calculate ATS"
4. **Review Results**:
   - View ATS scores (0-10 scale)
   - See matched and missing skills
   - Sort by score to identify top candidates
   - Click "View" for detailed breakdown
5. **Export**: Download results as CSV for your ATS system

## 🧮 ATS Scoring Algorithm

The Resume Analyzer uses a weighted skill-matching algorithm:

- **Exact Skill Matches** (40% weight): Direct match with required skills
- **Partial Matches** (25% weight): Synonym and related skill matches
- **Experience Keywords** (20% weight): Years of experience, job titles, etc.
- **Base Score** (15% weight): Minimum score for attempting resume

**Score Range**: 0-10 (1 decimal place)
- 9.0-10.0: Excellent match
- 7.0-8.9: Good match
- 5.0-6.9: Moderate match
- 3.0-4.9: Weak match
- 0-2.9: Poor match

### Supported Formats
- **Resumes**: PDF, DOCX, DOC files
- **Skills**: Any text-based skill name (synonyms auto-matched)

## 🔒 Privacy & Security

- **No Data Storage**: Files are processed in-memory only
- **No Permanent Records**: Resumes are never stored on disk
- **Session-Based**: Data cleared when session ends
- **NDA Protected**: Perfect for confidential hiring

## 🎨 Color Theme

LexaAi uses a professional blue color palette:

- **Primary Dark**: #0d2847 (Deep blue backgrounds)
- **Accent**: #3b9cff (Sky blue highlights)
- **Text**: #f0f4f9 (Light blue-white)
- **Subtle**: #a0b4c8 (Muted blue-gray)

All UI elements maintain consistency across pages and use accessible contrast ratios.

## 🛠️ Technology Stack

### Frontend
- **HTML5**: Semantic markup
- **CSS3**: Modern styling with CSS variables, gradients, animations
- **JavaScript (Vanilla)**: No frameworks, lightweight and fast
- **Plotly.js**: Interactive charts and visualizations

### Backend
- **FastAPI**: Modern async Python web framework
- **pandas**: Data processing and analysis
- **plotly**: Chart generation
- **google-generativeai**: Gemini AI for insights and analysis
- **PyPDF2**: PDF parsing for resumes
- **python-docx**: DOCX parsing for resumes
- **reportlab**: PDF report generation

### Deployment Ready
- Works with any WSGI/ASGI server (Gunicorn, Uvicorn)
- Environment-based configuration
- Stateless design (easy to scale horizontally)

## 📊 Example Usage

### Data Analysis
```
1. Upload sales_data.csv
2. AI generates 5 charts automatically
3. Get insights: "Revenue up 24%, Q3 shows strongest growth"
4. Export PDF report for stakeholders
```

### Resume Screening
```
1. Set skills: Python, React, AWS, Docker
2. Upload 5 resumes (PDF/DOCX)
3. Get scores: 
   - john_resume.pdf: 8.5/10 ✅ (4 matched, 0 missing)
   - sarah_resume.pdf: 7.2/10 ✅ (3 matched, 1 missing)
   - mike_resume.pdf: 4.1/10 ❌ (2 matched, 2 missing)
4. Export results.csv and import to your ATS
```

## 🐛 Troubleshooting

### "GEMINI_API_KEY not set"
- Ensure `.env` file exists with valid API key
- Restart the server: `Ctrl+C` then run uvicorn again

### PDF/DOCX parsing issues
- Ensure file is not corrupted
- Try converting to different format
- Check file permissions

### Charts not displaying
- Clear browser cache (Ctrl+Shift+Delete)
- Check browser console for errors (F12)
- Ensure Plotly library loaded (check network tab)

### Slow analysis
- Reduce dataset size for testing
- Check internet connection for API calls
- Use simpler data patterns for initial test

### Port already in use
```bash
# Use a different port:
python -m uvicorn backend.main:app --reload --port 8080
# Then visit: http://localhost:8080
```

## 📈 Performance Tips

1. **For Data Analysis**:
   - Keep CSV files under 100MB
   - Use reasonable number of columns (< 50)
   - Pre-clean data before upload

2. **For Resume Analysis**:
   - Keep skill list under 20 items
   - Upload 5-10 resumes at a time
   - Ensure resumes are text-based (not image scans)

## 🔄 Pages & Navigation

1. **Home** — Landing page with features overview
2. **Dashboard** — Main analysis interface with 6 panels
   - Upload Data
   - Charts
   - AI Insights
   - AI Chat
   - Data Summary
   - Export
   - Resume Analyzer (NEW)
3. **Services** — Feature comparison and pricing
4. **Consultancy** — Meet expert consultants
5. **Resume Analyzer** — Dedicated resume screening interface

## 📝 Environment Variables

```env
# .env file in project root
GEMINI_API_KEY=your_actual_api_key_here
```

No other configuration needed!

## 🎉 What's New in v2.0

- ✨ Complete blue color theme redesign
- 🆕 Resume Analyzer service with ATS scoring
- 📊 Weighted skill-matching algorithm
- 🔄 Batch resume processing (up to 10)
- 💾 Results export as CSV
- 📱 Improved responsive design
- ⚡ Interactive live animations
- 🎯 Enhanced UI/UX across all pages

## 🚀 Future Roadmap

- 🤖 ML-based resume matching
- 👥 Candidate comparison tools
- 📧 Email integration
- ☁️ Cloud storage support
- 🔐 User authentication & team management
- 📊 Advanced analytics dashboard
- 🌍 Multi-language support

## 📄 License

This project is provided as-is. Modify and use freely for personal and commercial purposes!

## 🤝 Support

For issues or questions:
1. Check the troubleshooting section above
2. Review FastAPI docs: http://localhost:8000/docs
3. Check browser console (F12) for error messages
4. Verify all dependencies: `pip list`

---

**Built with ❤️ for data professionals and recruiters.**

Powered by FastAPI, Google Gemini AI, and modern web technologies.

**LexaAi v2.0** — Your complete data analysis and resume screening platform.
