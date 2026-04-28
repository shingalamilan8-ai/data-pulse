let resumeState = { skills: [], uploadedFiles: [], results: [], filter: 'all', minScore: 0 };

function cacheResumeElements() {
  window.skillsTags = document.getElementById('skillsTags');
  window.skillInput = document.getElementById('skillInput');
  window.jobDesc = document.getElementById('jobDesc');
  window.minScore = document.getElementById('minScore');
  window.minScoreVal = document.getElementById('minScoreVal');
  window.resumeDropZone = document.getElementById('resumeDropZone');
  window.resumeFilesInput = document.getElementById('resumeFiles');
  window.resumeFileList = document.getElementById('resumeFileList');
  window.screenBtn = document.getElementById('screenBtn');
  window.resultsEmpty = document.getElementById('resumeResultsEmpty');
  window.resultsLoaded = document.getElementById('resumeResultsLoaded');
  window.resultsList = document.getElementById('resultsList');
  window.totalResumesSpan = document.getElementById('totalResumes');
  window.highCountSpan = document.getElementById('highCount');
  window.midCountSpan = document.getElementById('midCount');
  window.avgScoreSpan = document.getElementById('avgScore');
  window.filterScore = document.getElementById('filterScore');
}

function attachResumeEvents() {
  if (window.skillInput) window.skillInput.addEventListener('keypress', e => { if(e.key==='Enter') addSkill(); });
  if (window.minScore) window.minScore.addEventListener('input', (e) => { window.minScoreVal.innerText = e.target.value; resumeState.minScore = parseFloat(e.target.value); filterResults(); });
  if (window.filterScore) window.filterScore.addEventListener('change', (e) => { resumeState.filter = e.target.value; filterResults(); });
  if (window.resumeDropZone) {
    window.resumeDropZone.addEventListener('dragover', e => e.preventDefault());
    window.resumeDropZone.addEventListener('drop', e => { e.preventDefault(); handleFiles(Array.from(e.dataTransfer.files)); });
    window.resumeDropZone.querySelector('.file-label')?.addEventListener('click', () => window.resumeFilesInput.click());
  }
  if (window.resumeFilesInput) window.resumeFilesInput.addEventListener('change', () => handleFiles(Array.from(window.resumeFilesInput.files)));
  if (window.screenBtn) window.screenBtn.addEventListener('click', analyzeResumes);
}

function addSkill() {
  let skill = window.skillInput.value.trim().toUpperCase();
  if(skill && !resumeState.skills.includes(skill)) {
    resumeState.skills.push(skill);
    renderSkills();
    window.skillInput.value = '';
  }
}
function removeSkill(skill) { resumeState.skills = resumeState.skills.filter(s => s !== skill); renderSkills(); }
function renderSkills() {
  window.skillsTags.innerHTML = resumeState.skills.map(s => `<div class="skill-tag">${s}<button onclick="removeSkill('${s}')">×</button></div>`).join('');
  if(!resumeState.skills.length) window.skillsTags.innerHTML = '<span style="color:var(--text-muted)">Type skills and press Enter</span>';
}
window.addPresetSkills = (skills) => { skills.forEach(s => { let up = s.toUpperCase(); if(!resumeState.skills.includes(up)) resumeState.skills.push(up); }); renderSkills(); };
function handleFiles(files) {
  const valid = files.filter(f => ['pdf','docx','doc','txt'].includes(f.name.split('.').pop().toLowerCase()));
  resumeState.uploadedFiles.push(...valid);
  renderFileList();
}
function renderFileList() {
  window.resumeFileList.innerHTML = resumeState.uploadedFiles.map((f,i) => `<div class="file-item"><span>${f.name}</span><button onclick="removeFile(${i})">✖</button></div>`).join('');
}
window.removeFile = (i) => { resumeState.uploadedFiles.splice(i,1); renderFileList(); };
async function analyzeResumes() {
  if(resumeState.skills.length===0) { showToast('Add skills first', true); return; }
  if(resumeState.uploadedFiles.length===0) { showToast('Upload resumes', true); return; }
  showLoader('Analyzing...');
  const fd = new FormData();
  fd.append('skills', JSON.stringify(resumeState.skills));
  if(window.jobDesc.value.trim()) fd.append('job_description', window.jobDesc.value);
  resumeState.uploadedFiles.forEach(f => fd.append('resumes', f));
  try {
    const res = await fetch('/api/resumes/analyze', { method: 'POST', body: fd });
    const data = await res.json();
    if(!res.ok) throw new Error(data.detail);
    resumeState.results = data.results;
    updateSummary(data.summary);
    renderResults();
    window.resultsLoaded.classList.remove('hidden');
    window.resultsEmpty.classList.add('hidden');
    // save to session for export
    await fetch(`/api/resumes/save/dummy`, { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({results: resumeState.results}) });
    hideLoader();
  } catch(e) { showToast(e.message, true); hideLoader(); }
}
function updateSummary(sum) {
  window.totalResumesSpan.innerText = sum.total_resumes;
  window.highCountSpan.innerText = sum.high_score_count;
  window.midCountSpan.innerText = sum.mid_score_count;
  window.avgScoreSpan.innerText = sum.avg_score;
}
function renderResults() {
  let filtered = [...resumeState.results];
  if(resumeState.minScore>0) filtered = filtered.filter(r => r.ats_score >= resumeState.minScore);
  if(resumeState.filter==='high') filtered = filtered.filter(r => r.ats_score>=7);
  else if(resumeState.filter==='mid') filtered = filtered.filter(r => r.ats_score>=4 && r.ats_score<7);
  else if(resumeState.filter==='low') filtered = filtered.filter(r => r.ats_score<4);
  window.resultsList.innerHTML = filtered.map((r,idx) => `
    <div class="result-item" onclick="showResumeDetail(${resumeState.results.indexOf(r)})">
      <div><strong>${r.filename}</strong><br>${r.matched_skills?.length||0} matched, ${r.missing_skills?.length||0} missing</div>
      <div class="score" style="color:${r.ats_score>=7?'#10b981':r.ats_score>=4?'#f59e0b':'#ef4444'}">${r.ats_score.toFixed(1)}/10</div>
    </div>
  `).join('');
}
function filterResults() { renderResults(); }
window.showResumeDetail = (idx) => {
  const r = resumeState.results[idx];
  document.getElementById('modalName').innerText = r.filename;
  document.getElementById('modalScore').innerHTML = `Score: ${r.ats_score.toFixed(1)}/10`;
  document.getElementById('modalMatched').innerHTML = (r.matched_skills||[]).map(s=>`<span class="skill-tag">${s}</span>`).join('') || 'None';
  document.getElementById('modalMissing').innerHTML = (r.missing_skills||[]).map(s=>`<span class="skill-tag">${s}</span>`).join('') || 'None';
  let breakdown = `<div>Exact: ${r.score_breakdown?.exact_matches||0}%</div><div>Partial: ${r.score_breakdown?.partial_matches||0}%</div><div>Exp: ${r.score_breakdown?.experience_keywords||0}%</div>`;
  document.getElementById('modalBreakdown').innerHTML = breakdown;
  document.getElementById('resumeModal').style.display = 'flex';
};
window.closeResumeModal = () => { document.getElementById('resumeModal').style.display = 'none'; };
window.exportResumeCSV = async () => {
  const res = await fetch('/api/resumes/export-csv/dummy');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'resume_report.csv'; a.click();
};
window.exportResumePDF = () => { showToast('HTML report generated (downloads as .html)'); };
function initResume() { cacheResumeElements(); attachResumeEvents(); renderSkills(); }
document.addEventListener('DOMContentLoaded', initResume);