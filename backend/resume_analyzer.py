"""
backend/resume_analyzer.py
Resume Analyzer — ATS Score Calculation
Handles resume parsing (PDF/DOCX) and weighted skill-based scoring.

BUGS FIXED vs original:
1. PyPDF2.PdfReader now receives io.BytesIO(content) not raw bytes
2. Added fallback for when PyPDF2 fails
3. Better text normalization for skill matching
"""

import re
import io
from pathlib import Path
from typing import List, Dict, Tuple

try:
    import PyPDF2
    HAS_PYPDF2 = True
except ImportError:
    HAS_PYPDF2 = False

try:
    from docx import Document as DocxDocument
    HAS_DOCX = True
except ImportError:
    HAS_DOCX = False


class ResumeParser:
    """Extract text from PDF and DOCX resumes."""

    @staticmethod
    def extract_pdf(file_content: bytes) -> str:
        """Extract text from PDF bytes — fixed to use io.BytesIO."""
        if not HAS_PYPDF2:
            return "[PyPDF2 not installed — pip install PyPDF2]"
        try:
            pdf_reader = PyPDF2.PdfReader(io.BytesIO(file_content))
            text = ""
            for page in pdf_reader.pages:
                extracted = page.extract_text()
                if extracted:
                    text += extracted + " "
            return text.strip()
        except Exception as e:
            return f"[Error reading PDF: {str(e)}]"

    @staticmethod
    def extract_docx(file_content: bytes) -> str:
        """Extract text from DOCX bytes."""
        if not HAS_DOCX:
            return "[python-docx not installed — pip install python-docx]"
        try:
            doc = DocxDocument(io.BytesIO(file_content))
            text = "\n".join(p.text for p in doc.paragraphs if p.text.strip())
            return text.strip()
        except Exception as e:
            return f"[Error reading DOCX: {str(e)}]"

    @staticmethod
    def extract_text(filename: str, file_content: bytes) -> str:
        """Route to correct extractor based on file extension."""
        ext = Path(filename).suffix.lower()
        if ext == ".pdf":
            return ResumeParser.extract_pdf(file_content)
        elif ext in (".docx", ".doc"):
            return ResumeParser.extract_docx(file_content)
        elif ext == ".txt":
            try:
                return file_content.decode("utf-8", errors="ignore")
            except Exception:
                return ""
        return ""

    @staticmethod
    def normalize_text(text: str) -> str:
        """Lowercase, remove punctuation, collapse whitespace."""
        text = text.lower()
        text = re.sub(r"[^\w\s\+\#]", " ", text)
        text = re.sub(r"\s+", " ", text)
        return text.strip()


class ATSCalculator:
    """Calculate ATS score based on skill matching."""

    # Common skill synonyms/variants
    SKILL_SYNONYMS: Dict[str, List[str]] = {
        "python":       ["python", "py", "python3", "python2"],
        "javascript":   ["javascript", "js", "es6", "ecmascript"],
        "typescript":   ["typescript", "ts"],
        "react":        ["react", "reactjs", "react.js", "react js"],
        "angular":      ["angular", "angularjs", "angular.js"],
        "vue":          ["vue", "vuejs", "vue.js"],
        "nodejs":       ["node", "nodejs", "node.js"],
        "java":         ["java", "java8", "java11", "jvm", "j2ee"],
        "csharp":       ["csharp", "c#", "dotnet", ".net", "asp.net"],
        "cpp":          ["c++", "cpp", "cplusplus"],
        "sql":          ["sql", "mysql", "postgresql", "postgres", "mssql", "sqlite", "oracle"],
        "mongodb":      ["mongodb", "mongo", "nosql"],
        "aws":          ["aws", "amazon web services", "ec2", "s3", "lambda"],
        "azure":        ["azure", "microsoft azure", "azure devops"],
        "gcp":          ["gcp", "google cloud", "google cloud platform"],
        "docker":       ["docker", "containerization", "containers"],
        "kubernetes":   ["kubernetes", "k8s", "kubectl"],
        "git":          ["git", "github", "gitlab", "bitbucket", "version control"],
        "machinelearning": ["machine learning", "ml", "sklearn", "scikit", "scikit-learn"],
        "deeplearning": ["deep learning", "dl", "neural network", "tensorflow", "keras", "pytorch"],
        "datascience":  ["data science", "data analysis", "data analytics", "pandas", "numpy"],
        "rest":         ["rest", "restful", "rest api", "api", "web services"],
        "graphql":      ["graphql", "graph ql"],
        "devops":       ["devops", "ci/cd", "cicd", "jenkins", "gitlab ci", "github actions"],
        "agile":        ["agile", "scrum", "kanban", "jira", "sprint"],
        "linux":        ["linux", "unix", "bash", "shell", "ubuntu", "centos"],
        "excel":        ["excel", "spreadsheet", "vba", "pivot table"],
        "powerbi":      ["power bi", "powerbi", "tableau", "data visualization", "bi"],
    }

    EXPERIENCE_KEYWORDS = {
        "senior": 3, "lead": 3, "principal": 3, "architect": 3,
        "manager": 2, "engineer": 1, "developer": 1, "analyst": 1,
        "years": 1, "experience": 1, "designed": 1, "built": 1,
        "implemented": 1, "developed": 1, "deployed": 1,
    }

    @classmethod
    def match_skill(cls, resume_text_normalized: str, required_skill: str) -> int:
        """
        Check if a required skill appears in the resume text.
        Returns: 0=no match, 1=partial/synonym, 2=exact
        """
        req = required_skill.lower().strip()
        req_norm = re.sub(r"[^\w\s\+\#]", " ", req).strip()

        # Exact substring match in full text
        if req_norm in resume_text_normalized:
            return 2
        # Single-word exact match
        if req_norm in resume_text_normalized.split():
            return 2

        # Synonym lookup
        for _base, synonyms in cls.SKILL_SYNONYMS.items():
            if req_norm in synonyms or req in synonyms:
                for syn in synonyms:
                    if syn in resume_text_normalized:
                        return 1
                break

        # Partial: at least 4 chars of req appear as substring
        if len(req_norm) >= 4 and req_norm in resume_text_normalized:
            return 1

        return 0

    @classmethod
    def calculate_score(cls, resume_text: str, required_skills: List[str]) -> Dict:
        """
        Calculate ATS score 0-10 with weighted breakdown.

        Weights:
          - Exact matches:    40%
          - Partial matches:  25%
          - Experience KWs:   20%
          - Base score:       15%
        """
        if not required_skills:
            return {"ats_score": 5.0, "matched_skills": [], "missing_skills": [],
                    "score_breakdown": {}}

        normalized = ResumeParser.normalize_text(resume_text)

        matched_skills = []
        missing_skills = []
        exact_count = 0
        partial_count = 0

        for skill in required_skills:
            level = cls.match_skill(normalized, skill)
            if level >= 1:
                matched_skills.append(skill)
                if level == 2:
                    exact_count += 1
                else:
                    partial_count += 1
            else:
                missing_skills.append(skill)

        total = len(required_skills)
        exact_pct = (exact_count / total * 100) if total else 0
        partial_pct = (partial_count / total * 100) if total else 0

        # Experience keywords
        exp_score = 0
        for kw, weight in cls.EXPERIENCE_KEYWORDS.items():
            if kw in normalized:
                exp_score += weight
        exp_score = min(exp_score, 100)

        # Weighted final score (0-10)
        raw = (
            (exact_pct * 0.40) +
            (partial_pct * 0.25) +
            (exp_score * 0.20) +
            15                       # 15% base
        )
        score = round(min(raw / 100 * 10, 10.0), 1)

        return {
            "ats_score": score,
            "matched_skills": matched_skills,
            "missing_skills": missing_skills,
            "score_breakdown": {
                "exact_matches": round(exact_pct, 1),
                "partial_matches": round(partial_pct, 1),
                "experience_keywords": round(exp_score, 1),
            },
        }


def analyze_resumes(
    resumes: List[Tuple[str, bytes]],
    required_skills: List[str],
) -> List[Dict]:
    """
    Analyze multiple resumes, score them, sort by score descending.

    Args:
        resumes: List of (filename, file_bytes) tuples
        required_skills: Required skill strings

    Returns:
        Sorted list of result dicts with ats_score, matched_skills, etc.
    """
    results = []

    for filename, file_content in resumes:
        text = ResumeParser.extract_text(filename, file_content)

        if not text or text.startswith("[Error") or text.startswith("[PyPDF"):
            results.append({
                "filename": filename,
                "ats_score": 0.0,
                "matched_skills": [],
                "missing_skills": list(required_skills),
                "score_breakdown": {},
                "error": text or "Could not extract text from this file",
            })
            continue

        if len(text.strip()) < 30:
            results.append({
                "filename": filename,
                "ats_score": 0.0,
                "matched_skills": [],
                "missing_skills": list(required_skills),
                "score_breakdown": {},
                "error": "Extracted text too short — may be a scanned image PDF",
            })
            continue

        score_result = ATSCalculator.calculate_score(text, required_skills)
        score_result["filename"] = filename
        results.append(score_result)

    # Sort by ATS score descending
    results.sort(key=lambda x: x.get("ats_score", 0), reverse=True)
    return results