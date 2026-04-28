/* ═══════════════════════════════════════════════════════════════
   LexaAi v5 — Resume Analyzer Module
   Enhanced ATS Resume Screening with Real-time Scoring
   
   Features:
   - Batch resume upload (PDF/DOCX/TXT)
   - AI-powered skill extraction from job descriptions
   - Real-time ATS scoring (0-10)
   - Ranked candidate list with filters
   - Export results (CSV/PDF)
   ═══════════════════════════════════════════════════════════════ */

// Resume Analyzer State
const ResumeState = {
    requiredSkills: [],
    uploadedResumes: [],      // Array of { file, name, size }
    analysisResults: [],
    currentFilter: 'all',     // all, high, mid, low
    isLoading: false,
    currentSort: { field: 'score', order: 'desc' }
};

// DOM Elements Cache
const ResumeDOM = {};

// ── Initialize Resume Analyzer ─────────────────────────────────
function initResumeAnalyzer() {
    cacheResumeElements();
    attachResumeEvents();
    setupResumeDragDrop();
    setupSkillInput();
    loadSavedResults();
}

function cacheResumeElements() {
    ResumeDOM.skillsBox = document.getElementById('skillsBox');
    ResumeDOM.skillInput = document.getElementById('skillInput');
    ResumeDOM.skillsTags = document.getElementById('skillsTags');
    ResumeDOM.jobDesc = document.getElementById('jobDesc');
    ResumeDOM.minScore = document.getElementById('minScore');
    ResumeDOM.minScoreVal = document.getElementById('minScoreVal');
    ResumeDOM.resumeDropZone = document.getElementById('resumeDropZone');
    ResumeDOM.resumeFiles = document.getElementById('resumeFiles');
    ResumeDOM.resumeFileList = document.getElementById('resumeFileList');
    ResumeDOM.screenBtn = document.getElementById('screenBtn');
    ResumeDOM.rresultsEmpty = document.getElementById('rresultsEmpty');
    ResumeDOM.rresultsLoaded = document.getElementById('rresultsLoaded');
    ResumeDOM.rresultsList = document.getElementById('rresultsList');
    ResumeDOM.totalResumes = document.getElementById('totalResumes');
    ResumeDOM.highScoreCount = document.getElementById('highScoreCount');
    ResumeDOM.midScoreCount = document.getElementById('midScoreCount');
    ResumeDOM.avgScore = document.getElementById('avgScore');
    ResumeDOM.rFilter = document.getElementById('rFilter');
    ResumeDOM.resumeDetailModal = document.getElementById('resumeDetailModal');
}

function attachResumeEvents() {
    // Screen button
    if (ResumeDOM.screenBtn) {
        ResumeDOM.screenBtn.addEventListener('click', () => screenResumes());
    }
    
    // Filter change
    if (ResumeDOM.rFilter) {
        ResumeDOM.rFilter.addEventListener('change', (e) => {
            ResumeState.currentFilter = e.target.value;
            filterAndRenderResults();
        });
    }
    
    // Min score filter
    if (ResumeDOM.minScore) {
        ResumeDOM.minScore.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            if (ResumeDOM.minScoreVal) {
                ResumeDOM.minScoreVal.textContent = val > 0 ? `${val}+ Score` : 'Show All';
            }
            filterAndRenderResults();
        });
    }
}

// ── Skill Management ──────────────────────────────────────────
function setupSkillInput() {
    if (!ResumeDOM.skillInput) return;
    
    ResumeDOM.skillInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addCurrentSkill();
        }
    });
    
    // Click on skills box to focus input
    if (ResumeDOM.skillsBox) {
        ResumeDOM.skillsBox.addEventListener('click', () => {
            ResumeDOM.skillInput.focus();
        });
    }
}

function addCurrentSkill() {
    const skill = ResumeDOM.skillInput?.value.trim().toUpperCase();
    if (!skill) return;
    
    if (ResumeState.requiredSkills.includes(skill)) {
        showToast('Info', `"${skill}" is already added`, false);
        return;
    }
    
    if (ResumeState.requiredSkills.length >= 25) {
        showToast('Warning', 'Maximum 25 skills allowed', true);
        return;
    }
    
    ResumeState.requiredSkills.push(skill);
    if (ResumeDOM.skillInput) ResumeDOM.skillInput.value = '';
    renderSkillsTags();
    saveSkillsToStorage();
}

function addPresetSkills(skills) {
    let added = 0;
    skills.forEach(skill => {
        const upperSkill = skill.toUpperCase();
        if (!ResumeState.requiredSkills.includes(upperSkill) && ResumeState.requiredSkills.length < 25) {
            ResumeState.requiredSkills.push(upperSkill);
            added++;
        }
    });
    
    renderSkillsTags();
    saveSkillsToStorage();
    
    if (added > 0) {
        showToast('Success', `${added} skills added!`);
    } else {
        showToast('Info', 'Skills already added or limit reached');
    }
}

function removeSkill(skill) {
    ResumeState.requiredSkills = ResumeState.requiredSkills.filter(s => s !== skill);
    renderSkillsTags();
    saveSkillsToStorage();
}

function renderSkillsTags() {
    if (!ResumeDOM.skillsTags) return;
    
    if (ResumeState.requiredSkills.length === 0) {
        ResumeDOM.skillsTags.innerHTML = '<span style="color: var(--text-tertiary); font-size: 0.8rem;">Type skills and press Enter...</span>';
        return;
    }
    
    ResumeDOM.skillsTags.innerHTML = ResumeState.requiredSkills.map(skill => `
        <div class="skill-tag">
            ${escapeHtml(skill)}
            <button type="button" onclick="removeSkill('${escapeHtml(skill).replace(/'/g, "\\'")}')">×</button>
        </div>
    `).join('');
}

// ── Resume Upload ─────────────────────────────────────────────
function setupResumeDragDrop() {
    if (!ResumeDOM.resumeDropZone) return;
    
    ResumeDOM.resumeDropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        ResumeDOM.resumeDropZone.classList.add('drag-over');
    });
    
    ResumeDOM.resumeDropZone.addEventListener('dragleave', () => {
        ResumeDOM.resumeDropZone.classList.remove('drag-over');
    });
    
    ResumeDOM.resumeDropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        ResumeDOM.resumeDropZone.classList.remove('drag-over');
        handleResumeFiles(Array.from(e.dataTransfer.files));
    });
    
    if (ResumeDOM.resumeFiles) {
        ResumeDOM.resumeFiles.addEventListener('change', (e) => {
            handleResumeFiles(Array.from(e.target.files));
        });
    }
}

function handleResumeFiles(files) {
    if (ResumeState.requiredSkills.length === 0) {
        showToast('Warning', 'Please add required skills first!', true);
        return;
    }
    
    const validExtensions = ['pdf', 'docx', 'doc', 'txt'];
    const validFiles = [];
    const MAX_SIZE = 10 * 1024 * 1024; // 10MB
    
    for (const file of files) {
        const ext = file.name.split('.').pop().toLowerCase();
        if (!validExtensions.includes(ext)) {
            showToast('Warning', `${file.name}: Unsupported format`, true);
            continue;
        }
        
        if (file.size > MAX_SIZE) {
            showToast('Warning', `${file.name}: Exceeds 10MB limit`, true);
            continue;
        }
        
        if (ResumeState.uploadedResumes.length + validFiles.length >= 20) {
            showToast('Warning', 'Maximum 20 resumes allowed', true);
            break;
        }
        
        validFiles.push({
            file: file,
            name: file.name,
            size: file.size,
            ext: ext
        });
    }
    
    if (validFiles.length === 0) return;
    
    ResumeState.uploadedResumes = [...ResumeState.uploadedResumes, ...validFiles];
    renderUploadedResumes();
    saveResumesToStorage();
    
    showToast('Success', `${validFiles.length} resume(s) uploaded`);
}

function renderUploadedResumes() {
    if (!ResumeDOM.resumeFileList) return;
    
    if (ResumeState.uploadedResumes.length === 0) {
        ResumeDOM.resumeFileList.innerHTML = '';
        return;
    }
    
    ResumeDOM.resumeFileList.innerHTML = ResumeState.uploadedResumes.map((item, index) => `
        <div class="resume-file-item">
            <i class="fas fa-file-${item.ext === 'pdf' ? 'pdf' : (item.ext === 'docx' ? 'word' : 'alt')}"></i>
            <div class="rfile-meta">
                <p>${escapeHtml(item.name)}</p>
                <p style="font-size: 0.7rem; color: var(--text-tertiary)">${(item.size / 1024).toFixed(1)} KB</p>
            </div>
            <button class="rfile-rm" onclick="removeResume(${index})">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `).join('');
}

function removeResume(index) {
    ResumeState.uploadedResumes.splice(index, 1);
    renderUploadedResumes();
    saveResumesToStorage();
    
    // Clear results if resumes were analyzed
    if (ResumeState.analysisResults.length > 0) {
        ResumeState.analysisResults = [];
        renderResults();
    }
}

function clearAllResumes() {
    ResumeState.uploadedResumes = [];
    renderUploadedResumes();
    saveResumesToStorage();
}

// ── Resume Analysis (Core) ────────────────────────────────────
async function screenResumes() {
    // Validation
    if (ResumeState.requiredSkills.length === 0) {
        showToast('Error', 'Please add at least one required skill', true);
        return;
    }
    
    if (ResumeState.uploadedResumes.length === 0) {
        showToast('Error', 'Please upload at least one resume', true);
        return;
    }
    
    if (ResumeState.isLoading) return;
    
    ResumeState.isLoading = true;
    if (ResumeDOM.screenBtn) {
        ResumeDOM.screenBtn.disabled = true;
        ResumeDOM.screenBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analyzing Resumes...';
    }
    
    showLoader('Analyzing resumes with AI...');
    
    const formData = new FormData();
    formData.append('skills', JSON.stringify(ResumeState.requiredSkills));
    
    if (ResumeDOM.jobDesc && ResumeDOM.jobDesc.value.trim()) {
        formData.append('job_description', ResumeDOM.jobDesc.value.trim());
    }
    
    ResumeState.uploadedResumes.forEach(item => {
        formData.append('resumes', item.file);
    });
    
    try {
        const response = await fetch('/api/resumes/analyze', {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.detail || data.error || 'Analysis failed');
        }
        
        ResumeState.analysisResults = data.results || [];
        
        // Update summary stats
        if (data.summary) {
            if (ResumeDOM.totalResumes) ResumeDOM.totalResumes.textContent = data.summary.total_resumes || 0;
            if (ResumeDOM.highScoreCount) ResumeDOM.highScoreCount.textContent = data.summary.high_score_count || 0;
            if (ResumeDOM.midScoreCount) ResumeDOM.midScoreCount.textContent = data.summary.mid_score_count || 0;
            if (ResumeDOM.avgScore) ResumeDOM.avgScore.textContent = (data.summary.avg_score || 0).toFixed(1);
        }
        
        renderResults();
        saveResultsToStorage();
        
        showToast('Success', `Analyzed ${ResumeState.analysisResults.length} resumes!`);
        
    } catch (err) {
        console.error('Analysis error:', err);
        showToast('Error', err.message, true);
    } finally {
        ResumeState.isLoading = false;
        if (ResumeDOM.screenBtn) {
            ResumeDOM.screenBtn.disabled = false;
            ResumeDOM.screenBtn.innerHTML = '<i class="fas fa-magic"></i> Analyze & Score All Resumes';
        }
        hideLoader();
    }
}

function renderResults() {
    if (!ResumeDOM.rresultsList) return;
    
    const hasResults = ResumeState.analysisResults.length > 0;
    
    if (ResumeDOM.rresultsEmpty) {
        ResumeDOM.rresultsEmpty.classList.toggle('hidden', hasResults);
    }
    if (ResumeDOM.rresultsLoaded) {
        ResumeDOM.rresultsLoaded.classList.toggle('hidden', !hasResults);
    }
    
    if (!hasResults) return;
    
    filterAndRenderResults();
}

function filterAndRenderResults() {
    let filtered = [...ResumeState.analysisResults];
    
    // Apply score filter
    const minScore = ResumeDOM.minScore ? parseFloat(ResumeDOM.minScore.value) : 0;
    if (minScore > 0) {
        filtered = filtered.filter(r => (r.ats_score || 0) >= minScore);
    }
    
    // Apply category filter
    switch (ResumeState.currentFilter) {
        case 'high':
            filtered = filtered.filter(r => (r.ats_score || 0) >= 7);
            break;
        case 'mid':
            filtered = filtered.filter(r => {
                const score = r.ats_score || 0;
                return score >= 4 && score < 7;
            });
            break;
        case 'low':
            filtered = filtered.filter(r => (r.ats_score || 0) < 4);
            break;
        default:
            break;
    }
    
    // Sort results
    filtered.sort((a, b) => {
        let aVal = a[ResumeState.currentSort.field];
        let bVal = b[ResumeState.currentSort.field];
        
        if (ResumeState.currentSort.field === 'filename') {
            aVal = (aVal || '').toLowerCase();
            bVal = (bVal || '').toLowerCase();
        }
        
        if (ResumeState.currentSort.order === 'asc') {
            return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
        } else {
            return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
        }
    });
    
    renderResultCards(filtered);
}

function renderResultCards(results) {
    if (!ResumeDOM.rresultsList) return;
    
    if (results.length === 0) {
        ResumeDOM.rresultsList.innerHTML = `
            <div class="rresults-empty" style="margin-top: 1rem;">
                <i class="fas fa-filter"></i>
                <h3>No resumes match the current filter</h3>
                <p>Try adjusting your score filter or clearing the selection</p>
            </div>
        `;
        return;
    }
    
    ResumeDOM.rresultsList.innerHTML = results.map((result, idx) => {
        const score = result.ats_score || 0;
        const matchedCount = result.matched_skills?.length || 0;
        const missingCount = result.missing_skills?.length || 0;
        const totalSkills = ResumeState.requiredSkills.length;
        const matchPercentage = result.match_percentage || Math.round((matchedCount / totalSkills) * 100);
        
        let scoreClass = '';
        let recommendationBadge = '';
        
        if (score >= 8) {
            scoreClass = 'score-high';
            recommendationBadge = '<span class="rec-pill hire">Strong Hire</span>';
        } else if (score >= 6) {
            scoreClass = 'score-mid-high';
            recommendationBadge = '<span class="rec-pill consider">Consider</span>';
        } else if (score >= 4) {
            scoreClass = 'score-mid';
            recommendationBadge = '<span class="rec-pill maybe">Maybe</span>';
        } else {
            scoreClass = 'score-low';
            recommendationBadge = '<span class="rec-pill pass">Pass</span>';
        }
        
        // Determine rank badge
        let rankBadge = '';
        if (idx === 0) rankBadge = '🥇';
        else if (idx === 1) rankBadge = '🥈';
        else if (idx === 2) rankBadge = '🥉';
        else rankBadge = `${idx + 1}`;
        
        return `
            <div class="rresult-item" data-score="${score}">
                <div class="rresult-left">
                    <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.25rem;">
                        <span class="rresult-rank" style="font-size: 0.85rem; font-weight: 700; color: var(--text-tertiary); min-width: 28px;">${rankBadge}</span>
                        <strong style="font-size: 0.95rem;">${escapeHtml(result.filename)}</strong>
                        ${recommendationBadge}
                    </div>
                    <div class="rresult-meta">
                        <span>✅ ${matchedCount} matched</span>
                        <span style="margin: 0 0.5rem">•</span>
                        <span>❌ ${missingCount} missing</span>
                        <span style="margin: 0 0.5rem">•</span>
                        <span>📊 ${matchPercentage}% match</span>
                    </div>
                    <div class="rresult-progress" style="margin-top: 0.5rem;">
                        <div class="rc-score-bar" style="height: 4px; background: var(--border); border-radius: 2px; overflow: hidden;">
                            <div class="rc-score-bar-fill" style="width: ${matchPercentage}%; height: 100%; background: linear-gradient(90deg, var(--blue-primary), var(--purple)); border-radius: 2px;"></div>
                        </div>
                    </div>
                </div>
                <div class="rresult-right">
                    <div class="rresult-score ${scoreClass}">${score.toFixed(1)}<span style="font-size: 0.7rem;">/10</span></div>
                    <button class="btn-detail" onclick="showResumeDetail(${ResumeState.analysisResults.indexOf(result)})">
                        <i class="fas fa-eye"></i> Details
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// ── Resume Detail Modal ───────────────────────────────────────
function showResumeDetail(index) {
    const result = ResumeState.analysisResults[index];
    if (!result) return;
    
    const modal = ResumeDOM.resumeDetailModal;
    if (!modal) return;
    
    // Set modal content
    const nameEl = document.getElementById('rdName');
    const scoreEl = document.getElementById('rdScore');
    const matchedContainer = document.getElementById('rdMatched');
    const missingContainer = document.getElementById('rdMissing');
    const breakdownContainer = document.getElementById('rdBreakdown');
    
    if (nameEl) nameEl.textContent = result.filename;
    if (scoreEl) scoreEl.textContent = `Score: ${(result.ats_score || 0).toFixed(1)}/10`;
    
    // Matched skills
    if (matchedContainer) {
        const matchedSkills = result.matched_skills || [];
        if (matchedSkills.length > 0) {
            matchedContainer.innerHTML = matchedSkills.map(skill => `
                <div class="rd-tag m"><i class="fas fa-check" style="font-size: 0.7rem;"></i> ${escapeHtml(skill)}</div>
            `).join('');
        } else {
            matchedContainer.innerHTML = '<p style="color: var(--text-tertiary);">No matched skills found</p>';
        }
    }
    
    // Missing skills
    if (missingContainer) {
        const missingSkills = result.missing_skills || [];
        if (missingSkills.length > 0) {
            missingContainer.innerHTML = missingSkills.map(skill => `
                <div class="rd-tag x"><i class="fas fa-times" style="font-size: 0.7rem;"></i> ${escapeHtml(skill)}</div>
            `).join('');
        } else {
            missingContainer.innerHTML = '<p style="color: var(--green);">✨ All required skills matched!</p>';
        }
    }
    
    // Score breakdown
    if (breakdownContainer && result.score_breakdown) {
        const breakdown = result.score_breakdown;
        breakdownContainer.innerHTML = `
            <div class="breakdown-row">
                <span>Exact Matches</span>
                <span>${breakdown.exact_matches || 0}%</span>
            </div>
            <div class="breakdown-row">
                <span>Partial Matches</span>
                <span>${breakdown.partial_matches || 0}%</span>
            </div>
            <div class="breakdown-row">
                <span>Experience Keywords</span>
                <span>${breakdown.experience_keywords || 0}%</span>
            </div>
            <div class="breakdown-row" style="border-top: 1px solid var(--border); margin-top: 0.5rem; padding-top: 0.5rem;">
                <span><strong>Final Score</strong></span>
                <span><strong>${(result.ats_score || 0).toFixed(1)}/10</strong></span>
            </div>
        `;
    }
    
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeResumeModal() {
    const modal = ResumeDOM.resumeDetailModal;
    if (modal) {
        modal.classList.remove('open');
        document.body.style.overflow = '';
    }
}

// Close modal on outside click
if (ResumeDOM.resumeDetailModal) {
    ResumeDOM.resumeDetailModal.addEventListener('click', (e) => {
        if (e.target === ResumeDOM.resumeDetailModal) {
            closeResumeModal();
        }
    });
}

// ── Export Functions ──────────────────────────────────────────
async function exportResumeCSV() {
    if (ResumeState.analysisResults.length === 0) {
        showToast('Info', 'No results to export', true);
        return;
    }
    
    showLoader('Preparing CSV...');
    
    try {
        // Create CSV content
        const headers = ['Rank', 'Resume Name', 'ATS Score', 'Matched Skills Count', 'Missing Skills Count', 'Match Percentage', 'Recommendation', 'Matched Skills', 'Missing Skills'];
        const rows = ResumeState.analysisResults.map((r, idx) => [
            idx + 1,
            r.filename,
            (r.ats_score || 0).toFixed(1),
            r.matched_skills?.length || 0,
            r.missing_skills?.length || 0,
            r.match_percentage || 0,
            r.recommendation || '',
            (r.matched_skills || []).join('; '),
            (r.missing_skills || []).join('; ')
        ]);
        
        const csvContent = [headers, ...rows].map(row => 
            row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
        ).join('\n');
        
        // Download
        const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `resume_analysis_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        
        showToast('Success', 'CSV exported successfully!');
    } catch (err) {
        showToast('Error', 'Failed to export CSV', true);
    } finally {
        hideLoader();
    }
}

async function exportResumePDF() {
    if (ResumeState.analysisResults.length === 0) {
        showToast('Info', 'No results to export', true);
        return;
    }
    
    showLoader('Generating PDF...');
    
    try {
        const html = generatePDFHTML();
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `resume_report_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.html`;
        a.click();
        URL.revokeObjectURL(url);
        
        showToast('Success', 'Report generated! (HTML format)');
    } catch (err) {
        showToast('Error', 'Failed to generate report', true);
    } finally {
        hideLoader();
    }
}

function generatePDFHTML() {
    const date = new Date().toLocaleString();
    const skillsList = ResumeState.requiredSkills.join(', ');
    
    let resultsHtml = '';
    ResumeState.analysisResults.forEach((r, idx) => {
        const score = r.ats_score || 0;
        let scoreColor = '#10b981';
        if (score < 4) scoreColor = '#f97316';
        else if (score < 7) scoreColor = '#f59e0b';
        
        resultsHtml += `
            <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 12px;">${idx + 1}</td>
                <td style="padding: 12px; font-weight: 600;">${escapeHtml(r.filename)}</td>
                <td style="padding: 12px; text-align: center; color: ${scoreColor}; font-weight: 700;">${score.toFixed(1)}/10</td>
                <td style="padding: 12px; text-align: center;">${r.matched_skills?.length || 0}</td>
                <td style="padding: 12px; text-align: center;">${r.missing_skills?.length || 0}</td>
                <td style="padding: 12px; text-align: center;">${r.match_percentage || 0}%</td>
                <td style="padding: 12px;">${r.recommendation || '-'}</td>
            </tr>
        `;
    });
    
    return `<!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>Resume Analysis Report - LexaAi</title>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
                font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                background: #f0f5ff;
                padding: 40px;
                line-height: 1.5;
            }
            .container {
                max-width: 1200px;
                margin: 0 auto;
                background: white;
                border-radius: 16px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.08);
                overflow: hidden;
            }
            .header {
                background: linear-gradient(135deg, #1e3a5f, #0f172a);
                color: white;
                padding: 30px 40px;
            }
            .header h1 { font-size: 28px; margin-bottom: 8px; }
            .header p { opacity: 0.8; font-size: 14px; }
            .content { padding: 30px 40px; }
            .summary-cards {
                display: grid;
                grid-template-columns: repeat(4, 1fr);
                gap: 20px;
                margin-bottom: 30px;
            }
            .card {
                background: #f8fafc;
                border-radius: 12px;
                padding: 20px;
                text-align: center;
                border: 1px solid #e2e8f0;
            }
            .card-value { font-size: 32px; font-weight: 800; color: #2563eb; }
            .card-label { font-size: 12px; color: #64748b; margin-top: 4px; text-transform: uppercase; }
            .skills-section {
                background: #f8fafc;
                border-radius: 12px;
                padding: 20px;
                margin-bottom: 30px;
                border: 1px solid #e2e8f0;
            }
            .skills-title { font-weight: 700; margin-bottom: 12px; color: #1e293b; }
            .skills-list { display: flex; flex-wrap: wrap; gap: 8px; }
            .skill-badge {
                background: #e0e7ff;
                color: #4338ca;
                padding: 4px 12px;
                border-radius: 20px;
                font-size: 12px;
                font-weight: 500;
            }
            table {
                width: 100%;
                border-collapse: collapse;
                margin-top: 20px;
            }
            th {
                background: #f1f5f9;
                padding: 12px;
                text-align: left;
                font-weight: 600;
                font-size: 13px;
                color: #475569;
                border-bottom: 2px solid #e2e8f0;
            }
            td { padding: 12px; font-size: 13px; }
            .footer {
                background: #f8fafc;
                padding: 20px 40px;
                text-align: center;
                font-size: 12px;
                color: #64748b;
                border-top: 1px solid #e2e8f0;
            }
            @media print {
                body { background: white; padding: 0; }
                .container { box-shadow: none; }
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>📄 LexaAi Resume Analysis Report</h1>
                <p>Generated on ${date}</p>
            </div>
            <div class="content">
                <div class="summary-cards">
                    <div class="card">
                        <div class="card-value">${ResumeState.analysisResults.length}</div>
                        <div class="card-label">Total Resumes</div>
                    </div>
                    <div class="card">
                        <div class="card-value">${ResumeState.requiredSkills.length}</div>
                        <div class="card-label">Skills Evaluated</div>
                    </div>
                    <div class="card">
                        <div class="card-value">${ResumeState.analysisResults.filter(r => (r.ats_score || 0) >= 7).length}</div>
                        <div class="card-label">High Score (≥7)</div>
                    </div>
                    <div class="card">
                        <div class="card-value">${(ResumeState.analysisResults.reduce((sum, r) => sum + (r.ats_score || 0), 0) / ResumeState.analysisResults.length).toFixed(1)}</div>
                        <div class="card-label">Average Score</div>
                    </div>
                </div>
                
                <div class="skills-section">
                    <div class="skills-title">📋 Required Skills (${ResumeState.requiredSkills.length})</div>
                    <div class="skills-list">
                        ${skillsList.split(', ').map(s => `<span class="skill-badge">${escapeHtml(s)}</span>`).join('')}
                    </div>
                </div>
                
                <h3 style="margin-bottom: 16px;">🏆 Ranked Candidates</h3>
                <table>
                    <thead>
                        <tr>
                            <th>Rank</th>
                            <th>Resume Name</th>
                            <th>ATS Score</th>
                            <th>Matched</th>
                            <th>Missing</th>
                            <th>Match %</th>
                            <th>Recommendation</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${resultsHtml}
                    </tbody>
                </table>
            </div>
            <div class="footer">
                <p>Generated by LexaAi — AI-Powered Resume Screening Platform</p>
                <p style="margin-top: 4px;">This is an auto-generated report. For more details, visit the LexaAi dashboard.</p>
            </div>
        </div>
    </body>
    </html>`;
}

// ── Storage Functions (Local) ─────────────────────────────────
function saveSkillsToStorage() {
    try {
        localStorage.setItem('lexaai_resume_skills', JSON.stringify(ResumeState.requiredSkills));
    } catch (e) {}
}

function saveResumesToStorage() {
    // Don't store actual file data, just metadata
    const resumeMeta = ResumeState.uploadedResumes.map(r => ({
        name: r.name,
        size: r.size,
        ext: r.ext
    }));
    try {
        localStorage.setItem('lexaai_resume_metadata', JSON.stringify(resumeMeta));
    } catch (e) {}
}

function saveResultsToStorage() {
    try {
        localStorage.setItem('lexaai_resume_results', JSON.stringify(ResumeState.analysisResults));
    } catch (e) {}
}

function loadSavedResults() {
    try {
        const savedSkills = localStorage.getItem('lexaai_resume_skills');
        if (savedSkills) {
            ResumeState.requiredSkills = JSON.parse(savedSkills);
            renderSkillsTags();
        }
        
        const savedResults = localStorage.getItem('lexaai_resume_results');
        if (savedResults) {
            ResumeState.analysisResults = JSON.parse(savedResults);
            renderResults();
        }
    } catch (e) {}
}

function clearAllData() {
    if (confirm('Are you sure you want to clear all skills, uploaded resumes, and results?')) {
        ResumeState.requiredSkills = [];
        ResumeState.uploadedResumes = [];
        ResumeState.analysisResults = [];
        ResumeState.currentFilter = 'all';
        
        renderSkillsTags();
        renderUploadedResumes();
        renderResults();
        
        if (ResumeDOM.jobDesc) ResumeDOM.jobDesc.value = '';
        if (ResumeDOM.minScore) ResumeDOM.minScore.value = 0;
        if (ResumeDOM.minScoreVal) ResumeDOM.minScoreVal.textContent = 'Show All';
        
        localStorage.removeItem('lexaai_resume_skills');
        localStorage.removeItem('lexaai_resume_metadata');
        localStorage.removeItem('lexaai_resume_results');
        
        showToast('Success', 'All data cleared');
    }
}

// ── Sort Functions ────────────────────────────────────────────
function sortResumes(field) {
    if (ResumeState.currentSort.field === field) {
        ResumeState.currentSort.order = ResumeState.currentSort.order === 'asc' ? 'desc' : 'asc';
    } else {
        ResumeState.currentSort.field = field;
        ResumeState.currentSort.order = field === 'score' ? 'desc' : 'asc';
    }
    filterAndRenderResults();
}

// Export for global access
window.initResumeAnalyzer = initResumeAnalyzer;
window.addPresetSkills = addPresetSkills;
window.removeSkill = removeSkill;
window.screenResumes = screenResumes;
window.showResumeDetail = showResumeDetail;
window.closeResumeModal = closeResumeModal;
window.removeResume = removeResume;
window.clearAllResumes = clearAllResumes;
window.clearAllData = clearAllData;
window.exportResumeCSV = exportResumeCSV;
window.exportResumePDF = exportResumePDF;
window.sortResumes = sortResumes;

// Auto-initialize when page loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initResumeAnalyzer);
} else {
    initResumeAnalyzer();
}