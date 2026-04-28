import re
import io
from pathlib import Path
from typing import List, Dict, Tuple, Optional
from difflib import SequenceMatcher
import logging

logger = logging.getLogger(__name__)

try:
    import PyPDF2
    HAS_PYPDF2 = True
except:
    HAS_PYPDF2 = False

try:
    import pdfplumber
    HAS_PDFPLUMBER = True
except:
    HAS_PDFPLUMBER = False

try:
    from docx import Document
    HAS_DOCX = True
except:
    HAS_DOCX = False


class ResumeParser:
    @staticmethod
    def extract_pdf_pypdf2(content: bytes) -> Optional[str]:
        try:
            reader = PyPDF2.PdfReader(io.BytesIO(content))
            return " ".join(page.extract_text() or "" for page in reader.pages)
        except:
            return None

    @staticmethod
    def extract_pdf_pdfplumber(content: bytes) -> Optional[str]:
        if not HAS_PDFPLUMBER:
            return None
        try:
            with pdfplumber.open(io.BytesIO(content)) as pdf:
                return " ".join(page.extract_text() or "" for page in pdf.pages)
        except:
            return None

    @staticmethod
    def extract_pdf(content: bytes) -> str:
        text = None
        if HAS_PDFPLUMBER:
            text = ResumeParser.extract_pdf_pdfplumber(content)
        if not text and HAS_PYPDF2:
            text = ResumeParser.extract_pdf_pypdf2(content)
        return text.strip() if text else "[Error: Could not extract text]"

    @staticmethod
    def extract_docx(content: bytes) -> str:
        if not HAS_DOCX:
            return "[Error: python-docx not installed]"
        try:
            doc = Document(io.BytesIO(content))
            return "\n".join(p.text for p in doc.paragraphs if p.text.strip())
        except Exception as e:
            return f"[Error: {e}]"

    @staticmethod
    def extract_txt(content: bytes) -> str:
        for enc in ['utf-8', 'latin-1', 'cp1252']:
            try:
                return content.decode(enc)
            except:
                continue
        return content.decode('utf-8', errors='ignore')

    @staticmethod
    def extract_text(filename: str, content: bytes) -> str:
        ext = Path(filename).suffix.lower()
        if ext == ".pdf":
            return ResumeParser.extract_pdf(content)
        elif ext in (".docx", ".doc"):
            return ResumeParser.extract_docx(content)
        elif ext == ".txt":
            return ResumeParser.extract_txt(content)
        return "[Unsupported file type]"

    @staticmethod
    def normalize(text: str) -> str:
        text = text.lower()
        text = re.sub(r"[^\w\s\+#\-/\.]", " ", text)
        text = re.sub(r"\s+", " ", text)
        return text.strip()


class ATSCalculator:
    SYNONYMS = {
        "python": ["python", "py", "django", "flask", "fastapi", "numpy", "pandas"],
        "sql": ["sql", "mysql", "postgresql", "postgres", "sqlite", "mssql"],
        "aws": ["aws", "amazon web services", "ec2", "s3", "lambda"],
        "docker": ["docker", "container", "dockerfile"],
        "kubernetes": ["kubernetes", "k8s", "kubectl"],
        "react": ["react", "reactjs", "react.js"],
        "javascript": ["javascript", "js", "es6"],
        "java": ["java", "j2ee", "spring", "springboot"],
        "c++": ["c++", "cpp", "cplusplus"],
        "machine learning": ["machine learning", "ml", "sklearn", "tensorflow", "keras", "pytorch"],
        "excel": ["excel", "spreadsheet", "vba"],
        "tableau": ["tableau", "power bi", "data visualization"],
        "project management": ["project management", "agile", "scrum", "jira", "trello"],
    }

    EDUCATION_LEVEL = {
        "phd": 10, "doctorate": 10,
        "master": 8, "masters": 8, "mba": 8,
        "bachelor": 6, "b.tech": 6, "b.e": 6, "b.sc": 6,
        "associate": 4, "diploma": 4,
        "high school": 2
    }

    @classmethod
    def match_skill(cls, text: str, skill: str) -> int:
        skill_norm = skill.lower()
        if re.search(r'\b' + re.escape(skill_norm) + r'\b', text):
            return 2
        for base, syns in cls.SYNONYMS.items():
            if skill_norm == base or skill_norm in syns:
                for s in syns:
                    if re.search(r'\b' + re.escape(s) + r'\b', text):
                        return 1
                break
        for word in text.split():
            if len(word) >= 4 and SequenceMatcher(None, skill_norm, word).ratio() >= 0.8:
                return 1
        return 0

    @classmethod
    def extract_experience_years(cls, text: str) -> int:
        patterns = [
            r'(\d+)\s*(?:years?|yrs?)\s*(?:of)?\s*experience',
            r'experience\s*:\s*(\d+)',
            r'(\d+)\+?\s*years?'
        ]
        total = 0
        for pat in patterns:
            matches = re.findall(pat, text, re.IGNORECASE)
            for m in matches:
                total += int(m)
        return min(total, 30)

    @classmethod
    def extract_education_score(cls, text: str) -> int:
        highest = 0
        for degree, score in cls.EDUCATION_LEVEL.items():
            if re.search(r'\b' + degree + r'\b', text, re.IGNORECASE):
                highest = max(highest, score)
        return highest

    @classmethod
    def calculate_score(cls, resume_text: str, required_skills: List[str]) -> Dict:
        normalized = ResumeParser.normalize(resume_text)
        exact = 0
        partial = 0
        for skill in required_skills:
            match = cls.match_skill(normalized, skill)
            if match == 2:
                exact += 1
            elif match == 1:
                partial += 1
        total_skills = len(required_skills)
        skill_score = ((exact + partial * 0.5) / total_skills) * 100 if total_skills else 0

        years = cls.extract_experience_years(normalized)
        exp_score = min(years * 3, 100)

        edu_score = cls.extract_education_score(normalized) * 10

        has_sections = any(s in normalized for s in ["summary", "experience", "education", "skills"])
        format_score = 80 if has_sections else 30

        total_raw = (skill_score * 0.55) + (exp_score * 0.20) + (edu_score * 0.15) + (format_score * 0.10)
        final_score = round(min(total_raw / 10, 10.0), 1)

        matched_skills = [s for s in required_skills if cls.match_skill(normalized, s) >= 1]
        exact_skills = [s for s in required_skills if cls.match_skill(normalized, s) == 2]
        partial_skills = [s for s in required_skills if cls.match_skill(normalized, s) == 1]
        missing_skills = [s for s in required_skills if cls.match_skill(normalized, s) == 0]
        match_pct = round(((exact + partial*0.5)/total_skills)*100, 1) if total_skills else 0

        return {
            "ats_score": final_score,
            "matched_skills": matched_skills,
            "exact_skills": exact_skills,
            "partial_skills": partial_skills,
            "missing_skills": missing_skills,
            "match_percentage": match_pct,
            "score_breakdown": {
                "skills_score": round(skill_score, 1),
                "experience_years": years,
                "education_score": edu_score,
                "format_score": format_score
            }
        }


def extract_skills_from_text(text: str) -> List[str]:
    common = [
        "python", "sql", "aws", "docker", "kubernetes", "react", "javascript", "java",
        "machine learning", "excel", "tableau", "project management", "c++", "pandas"
    ]
    found = []
    for skill in common:
        if skill in text.lower():
            found.append(skill.title())
    return list(dict.fromkeys(found))[:20]


def analyze_resumes(resumes: List[Tuple[str, bytes]], required_skills: List[str]) -> List[Dict]:
    results = []
    for filename, content in resumes:
        text = ResumeParser.extract_text(filename, content)
        if len(text.strip()) < 50:
            results.append({
                "filename": filename,
                "ats_score": 0.0,
                "matched_skills": [],
                "missing_skills": required_skills,
                "error": "Could not extract text"
            })
            continue
        score_data = ATSCalculator.calculate_score(text, required_skills)
        score_data["filename"] = filename
        results.append(score_data)
    results.sort(key=lambda x: x["ats_score"], reverse=True)
    for i, r in enumerate(results, 1):
        r["rank"] = i
    return results