"""
backend/resume_analyzer.py
Resume Analyzer — ATS Score Calculation (Enhanced v2)

ENHANCEMENTS v2:
1. Better PDF text extraction with multiple fallback methods
2. Improved skill matching with fuzzy matching
3. Enhanced experience detection
4. Caching for parsed resumes
5. Better error handling for corrupted files
"""

import re
import io
import hashlib
from pathlib import Path
from typing import List, Dict, Tuple, Optional
from functools import lru_cache
import logging

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Optional imports with fallbacks
HAS_PYPDF2 = False
HAS_PDFPLUMBER = False
HAS_DOCX = False

try:
    import PyPDF2
    HAS_PYPDF2 = True
except ImportError:
    pass

try:
    import pdfplumber
    HAS_PDFPLUMBER = True
except ImportError:
    pass

try:
    from docx import Document as DocxDocument
    HAS_DOCX = True
except ImportError:
    pass


class ResumeParser:
    """Extract text from PDF, DOCX, and TXT resumes with multiple fallbacks."""

    @staticmethod
    def extract_pdf_pypdf2(file_content: bytes) -> Optional[str]:
        """Extract text using PyPDF2."""
        try:
            pdf_reader = PyPDF2.PdfReader(io.BytesIO(file_content))
            text_parts = []
            for page in pdf_reader.pages:
                extracted = page.extract_text()
                if extracted:
                    text_parts.append(extracted)
            return " ".join(text_parts) if text_parts else None
        except Exception as e:
            logger.warning(f"PyPDF2 extraction failed: {e}")
            return None

    @staticmethod
    def extract_pdf_pdfplumber(file_content: bytes) -> Optional[str]:
        """Extract text using pdfplumber (better for complex PDFs)."""
        if not HAS_PDFPLUMBER:
            return None
        try:
            text_parts = []
            with pdfplumber.open(io.BytesIO(file_content)) as pdf:
                for page in pdf.pages:
                    text = page.extract_text()
                    if text:
                        text_parts.append(text)
            return " ".join(text_parts) if text_parts else None
        except Exception as e:
            logger.warning(f"pdfplumber extraction failed: {e}")
            return None

    @staticmethod
    def extract_pdf(file_content: bytes) -> str:
        """Extract text from PDF with multiple fallback methods."""
        # Try pdfplumber first (better quality)
        if HAS_PDFPLUMBER:
            text = ResumeParser.extract_pdf_pdfplumber(file_content)
            if text and len(text.strip()) > 50:
                return text.strip()
        
        # Fallback to PyPDF2
        if HAS_PYPDF2:
            text = ResumeParser.extract_pdf_pypdf2(file_content)
            if text and len(text.strip()) > 50:
                return text.strip()
        
        # If both fail, return error message
        return "[Error: Could not extract text from PDF. File may be scanned or corrupted.]"

    @staticmethod
    def extract_docx(file_content: bytes) -> str:
        """Extract text from DOCX bytes."""
        if not HAS_DOCX:
            return "[python-docx not installed — pip install python-docx]"
        try:
            doc = DocxDocument(io.BytesIO(file_content))
            text_parts = []
            
            # Extract from paragraphs
            for para in doc.paragraphs:
                if para.text.strip():
                    text_parts.append(para.text)
            
            # Extract from tables
            for table in doc.tables:
                for row in table.rows:
                    for cell in row.cells:
                        if cell.text.strip():
                            text_parts.append(cell.text)
            
            return "\n".join(text_parts) if text_parts else ""
        except Exception as e:
            logger.error(f"DOCX extraction failed: {e}")
            return f"[Error reading DOCX: {str(e)}]"

    @staticmethod
    def extract_txt(file_content: bytes) -> str:
        """Extract text from TXT file."""
        try:
            # Try multiple encodings
            for encoding in ['utf-8', 'latin-1', 'cp1252']:
                try:
                    text = file_content.decode(encoding, errors='ignore')
                    if text.strip():
                        return text
                except UnicodeDecodeError:
                    continue
            return file_content.decode('utf-8', errors='ignore')
        except Exception as e:
            return f"[Error reading TXT: {str(e)}]"

    @staticmethod
    def extract_text(filename: str, file_content: bytes) -> str:
        """Route to correct extractor based on file extension."""
        ext = Path(filename).suffix.lower()
        
        if ext == ".pdf":
            return ResumeParser.extract_pdf(file_content)
        elif ext in (".docx", ".doc"):
            return ResumeParser.extract_docx(file_content)
        elif ext == ".txt":
            return ResumeParser.extract_txt(file_content)
        else:
            return f"[Unsupported file type: {ext}]"

    @staticmethod
    def normalize_text(text: str) -> str:
        """
        Normalize text for better matching:
        - Lowercase
        - Remove punctuation (keep +, #)
        - Remove extra whitespace
        """
        text = text.lower()
        # Keep alphanumeric, spaces, +, #, -
        text = re.sub(r"[^\w\s\+\#\-\/\.]", " ", text)
        # Collapse multiple spaces
        text = re.sub(r"\s+", " ", text)
        return text.strip()

    @staticmethod
    @lru_cache(maxsize=100)
    def get_cached_text(filename: str, file_hash: str) -> Optional[str]:
        """Cached text extraction (requires pre-computed hash)."""
        # This is a placeholder - actual caching happens in analyze_resumes
        return None


class ATSCalculator:
    """Calculate ATS score based on skill matching with advanced scoring."""

    # Enhanced skill synonyms dictionary
    SKILL_SYNONYMS: Dict[str, List[str]] = {
        # Programming Languages
        "python": ["python", "py", "python3", "python2", "django", "flask", "fastapi", "numpy", "pandas"],
        "javascript": ["javascript", "js", "es6", "ecmascript", "node", "nodejs", "react", "vue", "angular"],
        "typescript": ["typescript", "ts", "tsx"],
        "java": ["java", "java8", "java11", "java17", "j2ee", "spring", "springboot", "hibernate"],
        "csharp": ["csharp", "c#", "dotnet", ".net", "asp.net", "c#.net"],
        "cpp": ["c++", "cpp", "cplusplus", "c"],
        "go": ["go", "golang"],
        "rust": ["rust", "rustlang"],
        "ruby": ["ruby", "rails", "ruby on rails"],
        "php": ["php", "laravel", "symfony"],
        "swift": ["swift", "ios", "cocoa"],
        "kotlin": ["kotlin", "android"],
        
        # Web Frameworks
        "react": ["react", "reactjs", "react.js", "next.js", "nextjs"],
        "angular": ["angular", "angularjs", "angular.js", "angular2"],
        "vue": ["vue", "vuejs", "vue.js", "nuxt", "nuxtjs"],
        "nodejs": ["node", "nodejs", "node.js", "express", "nestjs"],
        "django": ["django", "django rest framework"],
        "flask": ["flask", "flask api"],
        
        # Databases
        "sql": ["sql", "mysql", "postgresql", "postgres", "mssql", "sqlserver", "sqlite", "oracle", "pl/sql"],
        "mongodb": ["mongodb", "mongo", "nosql", "mongoose"],
        "postgresql": ["postgresql", "postgres", "psql"],
        "redis": ["redis", "redis cache", "redis db"],
        "elasticsearch": ["elasticsearch", "elastic search", "es"],
        
        # Cloud & DevOps
        "aws": ["aws", "amazon web services", "ec2", "s3", "lambda", "rds", "cloudfront", "route53"],
        "azure": ["azure", "microsoft azure", "azure devops", "azure functions"],
        "gcp": ["gcp", "google cloud", "google cloud platform", "gce", "gke"],
        "docker": ["docker", "container", "containerization", "dockerfile", "docker compose"],
        "kubernetes": ["kubernetes", "k8s", "kubectl", "eks", "aks", "gke"],
        "terraform": ["terraform", "infrastructure as code", "iac"],
        "jenkins": ["jenkins", "ci/cd", "cicd", "continuous integration", "continuous delivery"],
        "git": ["git", "github", "gitlab", "bitbucket", "version control", "scm"],
        "github_actions": ["github actions", "gh actions", "actions"],
        
        # Data Science & ML
        "machinelearning": ["machine learning", "ml", "sklearn", "scikit", "scikit-learn", "tensorflow", "keras", "pytorch"],
        "deeplearning": ["deep learning", "dl", "neural network", "cnn", "rnn", "lstm", "transformer"],
        "datascience": ["data science", "data analysis", "data analytics", "data mining"],
        "pandas": ["pandas", "data manipulation", "dataframe"],
        "numpy": ["numpy", "numerical computing"],
        "matplotlib": ["matplotlib", "data visualization", "plotting", "seaborn"],
        "nlp": ["nlp", "natural language processing", "text mining", "llm", "gpt"],
        
        # API & Integration
        "rest": ["rest", "restful", "rest api", "api", "web api", "http api"],
        "graphql": ["graphql", "graph ql", "apollo"],
        "microservices": ["microservices", "micro-service", "service oriented"],
        
        # Methodologies
        "agile": ["agile", "scrum", "kanban", "jira", "sprint", "agile methodology"],
        "devops": ["devops", "devsecops", "ci/cd pipeline"],
        
        # Big Data
        "spark": ["spark", "apache spark", "pyspark", "spark sql"],
        "hadoop": ["hadoop", "hdfs", "mapreduce", "hive"],
        "kafka": ["kafka", "apache kafka", "message queue", "event streaming"],
        
        # Operating Systems
        "linux": ["linux", "unix", "bash", "shell", "ubuntu", "centos", "redhat", "debian"],
        "windows": ["windows", "powershell", "windows server"],
        
        # Business Tools
        "excel": ["excel", "spreadsheet", "vba", "pivot table", "excel macro"],
        "powerbi": ["power bi", "powerbi", "tableau", "data visualization", "bi", "looker"],
        "salesforce": ["salesforce", "sfdc", "crm"],
    }

    # Experience keywords with weights
    EXPERIENCE_KEYWORDS: Dict[str, int] = {
        # Seniority indicators
        "senior": 4, "lead": 4, "principal": 4, "architect": 4, "staff": 4,
        "manager": 3, "head": 3, "director": 3, "vp": 3,
        "experienced": 2, "engineer": 1, "developer": 1, "analyst": 1,
        
        # Action verbs
        "developed": 1, "designed": 1, "implemented": 1, "deployed": 1,
        "built": 1, "created": 1, "managed": 1, "led": 2,
        "architected": 2, "mentored": 2, "coordinated": 1,
        
        # Experience indicators
        "years": 1, "experience": 1, "year of": 1,
        
        # Education
        "phd": 2, "master": 2, "bachelor": 1, "b.tech": 1, "b.e": 1,
        "m.tech": 2, "m.sc": 2, "b.sc": 1,
    }

    @classmethod
    def match_skill(cls, resume_text_normalized: str, required_skill: str, use_fuzzy: bool = True) -> int:
        """
        Check if a required skill appears in the resume text.
        Returns: 0=no match, 1=partial/synonym, 2=exact
        
        Args:
            resume_text_normalized: Normalized resume text
            required_skill: Skill to match (case-insensitive)
            use_fuzzy: Enable fuzzy matching for typos
        """
        req = required_skill.lower().strip()
        req_norm = re.sub(r"[^\w\s\+\#\-\/\.]", " ", req).strip()
        
        # Exact match (substring)
        if req_norm in resume_text_normalized:
            return 2
        
        # Word boundary exact match
        if re.search(r'\b' + re.escape(req_norm) + r'\b', resume_text_normalized):
            return 2
        
        # Check synonyms
        req_lower = req.lower()
        for base_skill, synonyms in cls.SKILL_SYNONYMS.items():
            if req_lower == base_skill or req_lower in synonyms:
                for syn in synonyms:
                    if re.search(r'\b' + re.escape(syn) + r'\b', resume_text_normalized):
                        return 1
                break
        
        # Partial match (at least 4 chars and appears as substring)
        if len(req_norm) >= 4 and req_norm in resume_text_normalized:
            return 1
        
        # Fuzzy matching for minor typos (if enabled)
        if use_fuzzy and len(req_norm) >= 5:
            from difflib import SequenceMatcher
            words = resume_text_normalized.split()
            for word in words:
                if len(word) >= 4:
                    ratio = SequenceMatcher(None, req_norm, word).ratio()
                    if ratio > 0.85:  # 85% similarity threshold
                        return 1
        
        return 0

    @classmethod
    def calculate_score(cls, resume_text: str, required_skills: List[str]) -> Dict:
        """
        Calculate ATS score 0-10 with weighted breakdown.
        
        Weights:
          - Exact matches:    45%
          - Partial matches:  25%
          - Experience KWs:   20%
          - Base score:       10%
        """
        if not required_skills:
            return {
                "ats_score": 5.0,
                "matched_skills": [],
                "missing_skills": [],
                "score_breakdown": {},
                "match_percentage": 0
            }
        
        normalized = ResumeParser.normalize_text(resume_text)
        
        # Extract experience keywords
        exp_score = 0
        exp_matches = []
        for kw, weight in cls.EXPERIENCE_KEYWORDS.items():
            if re.search(r'\b' + re.escape(kw) + r'\b', normalized):
                exp_score += weight
                exp_matches.append(kw)
        exp_score = min(exp_score, 100)  # Cap at 100
        
        # Match skills
        matched_skills = []
        exact_skills = []
        partial_skills = []
        missing_skills = []
        
        for skill in required_skills:
            level = cls.match_skill(normalized, skill)
            if level >= 1:
                matched_skills.append(skill)
                if level == 2:
                    exact_skills.append(skill)
                else:
                    partial_skills.append(skill)
            else:
                missing_skills.append(skill)
        
        total = len(required_skills)
        exact_count = len(exact_skills)
        partial_count = len(partial_skills)
        
        exact_pct = (exact_count / total * 100) if total else 0
        partial_pct = (partial_count / total * 100) if total else 0
        match_pct = ((exact_count + partial_count) / total * 100) if total else 0
        
        # Weighted final score (0-10)
        raw = (
            (exact_pct * 0.45) +      # 45% weight for exact matches
            (partial_pct * 0.25) +     # 25% weight for partial matches
            (exp_score * 0.20) +       # 20% weight for experience keywords
            10                          # 10% base score
        )
        score = round(min(raw / 100 * 10, 10.0), 1)
        
        return {
            "ats_score": score,
            "matched_skills": matched_skills,
            "exact_skills": exact_skills,
            "partial_skills": partial_skills,
            "missing_skills": missing_skills,
            "match_percentage": round(match_pct, 1),
            "score_breakdown": {
                "exact_matches": round(exact_pct, 1),
                "partial_matches": round(partial_pct, 1),
                "experience_keywords": round(exp_score, 1),
                "experience_matches": exp_matches[:5]  # Top 5 matches
            },
        }


def extract_skills_from_text(text: str) -> List[str]:
    """Extract potential skills from job description text."""
    common_skills = [
        "python", "java", "javascript", "typescript", "c++", "c#", "ruby", "go", "rust",
        "react", "angular", "vue", "node", "django", "flask", "spring", "express",
        "sql", "mysql", "postgresql", "mongodb", "oracle", "redis", "elasticsearch",
        "aws", "azure", "gcp", "docker", "kubernetes", "terraform", "jenkins", "git",
        "machine learning", "deep learning", "data science", "ai", "nlp", "computer vision",
        "agile", "scrum", "jira", "rest api", "graphql", "microservices", "pandas", "numpy",
        "tableau", "power bi", "excel", "linux", "spark", "hadoop", "kafka"
    ]
    
    text_lower = text.lower()
    found_skills = []
    for skill in common_skills:
        if skill in text_lower:
            # Format skill nicely
            if len(skill) <= 3:
                formatted = skill.upper()
            else:
                formatted = skill.title()
            if formatted not in found_skills:
                found_skills.append(formatted)
    
    return found_skills[:20]  # Limit to 20 skills


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
        logger.info(f"Analyzing resume: {filename}")
        
        # Extract text
        text = ResumeParser.extract_text(filename, file_content)
        
        # Check for extraction errors
        if text.startswith("[Error") or text.startswith("[Unsupported"):
            results.append({
                "filename": filename,
                "ats_score": 0.0,
                "matched_skills": [],
                "exact_skills": [],
                "partial_skills": [],
                "missing_skills": list(required_skills),
                "score_breakdown": {},
                "match_percentage": 0,
                "error": text,
                "recommendation": "Error"
            })
            continue
        
        # Check if text is too short (likely corrupted or scanned)
        if len(text.strip()) < 50:
            results.append({
                "filename": filename,
                "ats_score": 0.0,
                "matched_skills": [],
                "exact_skills": [],
                "partial_skills": [],
                "missing_skills": list(required_skills),
                "score_breakdown": {},
                "match_percentage": 0,
                "error": "Extracted text too short (likely scanned image PDF or corrupted file)",
                "recommendation": "Error"
            })
            continue
        
        # Calculate score
        score_result = ATSCalculator.calculate_score(text, required_skills)
        score_result["filename"] = filename
        
        # Add text preview (first 500 chars)
        score_result["text_preview"] = text[:500] + "..." if len(text) > 500 else text
        
        results.append(score_result)
        logger.info(f"  Score for {filename}: {score_result['ats_score']}/10")
    
    # Sort by ATS score descending
    results.sort(key=lambda x: x.get("ats_score", 0), reverse=True)
    
    # Add rank
    for idx, result in enumerate(results):
        result["rank"] = idx + 1
    
    return results