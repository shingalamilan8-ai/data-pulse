/* ═══════════════════════════════════════════════════════
   Resume Analyzer — Frontend Module
═══════════════════════════════════════════════════════ */

// Resume Analyzer State
var resumeState = {
  requiredSkills: [],
  uploadedResumes: [],
  analysisResults: [],
  currentSort: { field: 'score', order: 'desc' }
};

// ── Initialize Resume Analyzer ────────────────────────────
function initResumeAnalyzer() {
  setupResumeUploadEvents();
  setupSkillInput();
  setupResumeDragDrop();
}

// ── Preset Skills ─────────────────────────────────────────
function addPresetSkills(skills) {
  skills.forEach(function(skill) {
    var s = skill.toUpperCase();
    if (!resumeState.requiredSkills.includes(s) && resumeState.requiredSkills.length < 20) {
      resumeState.requiredSkills.push(s);
    }
  });
  renderSkillsList();
  showToast('Success', skills.length + ' skills added!');
}

// ── Skill Management ──────────────────────────────────────
function setupSkillInput() {
  var inputs = ['#skillInput', '#skillInputHome'];
  inputs.forEach(function(selector) {
    var el = document.querySelector(selector);
    if (el) {
      el.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          addSkill(selector);
        }
      });
    }
  });
}

function addSkill(selector) {
  selector = selector || '#skillInput';
  var input = document.querySelector(selector);
  if (!input) return;

  var skill = input.value.trim().toUpperCase();
  if (!skill) {
    showToast('Info', 'Please enter a skill name.');
    return;
  }

  if (resumeState.requiredSkills.includes(skill)) {
    showToast('Info', 'This skill is already added.');
    return;
  }

  if (resumeState.requiredSkills.length >= 20) {
    showToast('Info', 'Maximum 20 skills allowed.');
    return;
  }

  resumeState.requiredSkills.push(skill);
  input.value = '';
  renderSkillsList();

  // Show upload zone if skills added
  var uploadZone = document.getElementById('resumeUploadZone');
  if (uploadZone) uploadZone.style.display = 'block';
}

function addSkillHome() {
  addSkill('#skillInputHome');
}

function removeSkill(skill) {
  resumeState.requiredSkills = resumeState.requiredSkills.filter(function(s) { return s !== skill; });
  renderSkillsList();
}

function renderSkillsList() {
  var containers = ['#skillsList', '#skillsListHome'];
  containers.forEach(function(selector) {
    var container = document.querySelector(selector);
    if (!container) return;

    container.innerHTML = resumeState.requiredSkills.map(function(skill) {
      return '<div class="skill-badge">' +
        skill +
        '<button type="button" onclick="removeSkill(\'' + skill.replace(/'/g, "\\'") + '\')">×</button>' +
        '</div>';
    }).join('');
  });
}

// ── Resume Upload ─────────────────────────────────────────
function setupResumeUploadEvents() {
  // Dashboard upload
  var uploadZone = document.getElementById('resumeUploadZone');
  var fileInput = document.getElementById('resumeFileInput');

  if (uploadZone && fileInput) {
    uploadZone.addEventListener('dragover', function(e) {
      e.preventDefault();
      uploadZone.classList.add('drag-over');
    });
    uploadZone.addEventListener('dragleave', function() {
      uploadZone.classList.remove('drag-over');
    });
    uploadZone.addEventListener('drop', function(e) {
      e.preventDefault();
      uploadZone.classList.remove('drag-over');
      handleResumeFiles(e.dataTransfer.files);
    });
    fileInput.addEventListener('change', function() {
      handleResumeFiles(fileInput.files);
    });
  }

  // Home page upload
  var dropZoneHome = document.getElementById('resumeDropZoneHome');
  var fileInputHome = document.getElementById('resumeInputHome');

  if (dropZoneHome && fileInputHome) {
    dropZoneHome.addEventListener('dragover', function(e) {
      e.preventDefault();
      dropZoneHome.classList.add('drag-over');
    });
    dropZoneHome.addEventListener('dragleave', function() {
      dropZoneHome.classList.remove('drag-over');
    });
    dropZoneHome.addEventListener('drop', function(e) {
      e.preventDefault();
      dropZoneHome.classList.remove('drag-over');
      handleResumeFiles(e.dataTransfer.files);
    });
    fileInputHome.addEventListener('change', function() {
      handleResumeFiles(fileInputHome.files);
    });
  }
}

function setupResumeDragDrop() {
  setupResumeUploadEvents();
}

function handleResumeFiles(files) {
  if (resumeState.requiredSkills.length === 0) {
    showToast('Error', 'Please add skills first!', true);
    return;
  }

  var validFiles = [];
  for (var i = 0; i < files.length && i < 10; i++) {
    var file = files[i];
    var ext = file.name.split('.').pop().toLowerCase();
    if (['pdf', 'docx', 'doc'].includes(ext)) {
      validFiles.push(file);
    }
  }

  if (validFiles.length === 0) {
    showToast('Error', 'Please select valid PDF or DOCX files.', true);
    return;
  }

  resumeState.uploadedResumes = validFiles;
  renderUploadedResumes();

  // Show analyze button
  var analyzeBtn = document.getElementById('analyzeResumesBtn');
  if (analyzeBtn) analyzeBtn.style.display = 'block';

  // Show start analysis button on home page
  var startBtn = document.getElementById('startAnalysisBtn');
  if (startBtn) startBtn.style.display = 'block';
}

function renderUploadedResumes() {
  var previewDash = document.getElementById('resumeFilesPreview');
  var previewHome = document.getElementById('filesPreviewHome');

  var html = resumeState.uploadedResumes.map(function(file, i) {
    return '<div class="resume-file-item">' +
      '<i class="fas fa-file-pdf"></i>' +
      '<p>' + file.name + '</p>' +
      '<p style="font-size:.75rem;color:var(--text-3)">' + (file.size / 1024).toFixed(1) + ' KB</p>' +
      '</div>';
  }).join('');

  if (previewDash) {
    var wrapper = previewDash.parentElement;
    if (wrapper) wrapper.style.display = resumeState.uploadedResumes.length > 0 ? 'block' : 'none';
    previewDash.innerHTML = html;
  }

  if (previewHome) {
    var wrapper = previewHome.parentElement;
    if (wrapper) wrapper.style.display = resumeState.uploadedResumes.length > 0 ? 'block' : 'none';
    previewHome.innerHTML = html;
  }
}

// ── Analysis ──────────────────────────────────────────────
function analyzeResumes() {
  if (resumeState.uploadedResumes.length === 0) {
    showToast('Error', 'Please upload resumes first.', true);
    return;
  }

  showLoader('Processing resumes…');
  var form = new FormData();

  // Add skills
  form.append('skills', JSON.stringify(resumeState.requiredSkills));
  
  // Add job description if provided
  var jobDesc = document.getElementById('jobDesc');
  if (jobDesc && jobDesc.value.trim()) {
    form.append('job_description', jobDesc.value.trim());
  }

  // Add resume files
  resumeState.uploadedResumes.forEach(function(file) {
    form.append('resumes', file);
  });

  fetch(API + '/api/resumes/analyze', {
    method: 'POST',
    body: form
  })
  .then(function(r) { return r.json(); })
  .then(function(data) {
    hideLoader();
    if (data.error) {
      showToast('Error', data.error, true);
      return;
    }

    resumeState.analysisResults = data.results || [];
    
    // Update summary cards if available
    if (data.summary) {
      document.getElementById('totalResumes').textContent = data.summary.total_resumes || 0;
      document.getElementById('highScoreCount').textContent = data.summary.high_score_count || 0;
      document.getElementById('midScoreCount').textContent = data.summary.mid_score_count || 0;
      document.getElementById('avgScore').textContent = (data.summary.avg_score || 0).toFixed(1);
    }
    
    renderAnalysisResults();
    showToast('Success', 'Analysis complete! Resumes scored.');
  })
  .catch(function(err) {
    hideLoader();
    showToast('Error', 'Analysis failed: ' + err.message, true);
  });
}

// ── Screen Resumes (Main Entry Point) ─────────────────────
function screenResumes() {
  if (resumeState.requiredSkills.length === 0) {
    showToast('Error', 'Please add required skills first!', true);
    return;
  }
  if (resumeState.uploadedResumes.length === 0) {
    showToast('Error', 'Please upload resumes first!', true);
    return;
  }
  analyzeResumes();
}

// ── Export Resume PDF ─────────────────────────────────────
function exportResumePDF() {
  if (resumeState.analysisResults.length === 0) {
    showToast('Error', 'No results to export.', true);
    return;
  }
  
  var content = '<html><head><title>Resume Screening Results - LexaAi</title>';
  content += '<style>body{font-family:Plus Jakarta Sans,sans-serif;padding:20px}';
  content += 'h1{color:#2563eb;border-bottom:2px solid #2563eb;padding-bottom:10px}';
  content += 'table{width:100%;border-collapse:collapse;margin-top:20px}';
  content += 'th,td{padding:12px;text-align:left;border-bottom:1px solid #e5e7eb}';
  content += 'th{background:#f3f4f6;font-weight:600}.score-high{color:#16a34a}.score-mid{color:#d97706}.score-low{color:#dc2626}';
  content += '</style></head><body>';
  content += '<h1>Resume Screening Results</h1>';
  content += '<p>Generated by LexaAi on ' + new Date().toLocaleDateString() + '</p>';
  content += '<p><strong>Skills Evaluated:</strong> ' + resumeState.requiredSkills.join(', ') + '</p>';
  content += '<table><thead><tr><th>Rank</th><th>Resume</th><th>Score</th><th>Matched</th><th>Missing</th></tr></thead><tbody>';
  
  resumeState.analysisResults.forEach(function(result, i) {
    var scoreClass = result.ats_score >= 7 ? 'score-high' : (result.ats_score >= 4 ? 'score-mid' : 'score-low');
    content += '<tr><td>' + (i + 1) + '</td><td>' + result.filename + '</td>';
    content += '<td class="' + scoreClass + '">' + (result.ats_score || 0).toFixed(1) + '/10</td>';
    content += '<td>' + (result.matched_skills || []).length + '</td>';
    content += '<td>' + (result.missing_skills || []).length + '</td></tr>';
  });
  
  content += '</tbody></table></body></html>';
  
  var blob = new Blob([content], { type: 'text/html' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'resume_screening_results.html';
  a.click();
  URL.revokeObjectURL(url);
  
  showToast('Success', 'PDF report downloaded!');
}

function startAnalysisHome() {
  if (!state.sessionId) {
    navigateTo('dashboard');
    setTimeout(function() { switchDash('resume-analysis'); }, 300);
    return;
  }
  analyzeResumes();
}

function renderAnalysisResults() {
  var section = document.getElementById('resumeResultsSection');
  if (!section) return;

  if (resumeState.analysisResults.length === 0) {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'block';

  var sortedResults = sortResults(resumeState.analysisResults);
  var tbody = document.getElementById('resumesTableBody');
  if (!tbody) return;

  tbody.innerHTML = sortedResults.map(function(result, i) {
    var score = result.ats_score || 0;
    var scorePercent = (score / 10) * 100;
    var matched = result.matched_skills ? result.matched_skills.length : 0;
    var missing = result.missing_skills ? result.missing_skills.length : 0;

    return '<tr>' +
      '<td><strong>' + escapeHtml(result.filename) + '</strong></td>' +
      '<td>' +
        '<div class="score-cell">' + score.toFixed(1) + '/10</div>' +
        '<div class="score-bar"><div class="score-bar-fill" style="width:' + scorePercent + '%"></div></div>' +
      '</td>' +
      '<td><span style="color:#4caf50">' + matched + ' / ' + (matched + missing) + '</span></td>' +
      '<td><span style="color:#ff5252">' + missing + ' missing</span></td>' +
      '<td><button class="btn-detail" onclick="showResumeDetail(' + i + ')">View</button></td>' +
      '</tr>';
  }).join('');
}

function sortResults(results) {
  var sorted = results.slice();
  var field = resumeState.currentSort.field;
  var order = resumeState.currentSort.order;

  sorted.sort(function(a, b) {
    var aVal = a[field];
    var bVal = b[field];

    if (typeof aVal === 'string') {
      aVal = aVal.toLowerCase();
      bVal = bVal.toLowerCase();
    }

    if (order === 'asc') {
      return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
    } else {
      return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
    }
  });

  return sorted;
}

function sortResumes(field) {
  if (resumeState.currentSort.field === field) {
    resumeState.currentSort.order = resumeState.currentSort.order === 'asc' ? 'desc' : 'asc';
  } else {
    resumeState.currentSort.field = field;
    resumeState.currentSort.order = field === 'score' ? 'desc' : 'asc';
  }
  renderAnalysisResults();
}

function filterByScore() {
  var slider = document.getElementById('scoreFilter');
  var label = document.getElementById('scoreFilterLabel');
  if (!slider || !label) return;

  var minScore = parseFloat(slider.value);
  label.textContent = minScore > 0 ? minScore.toFixed(1) + '+ Score' : 'All Scores';

  var tbody = document.getElementById('resumesTableBody');
  if (!tbody) return;

  tbody.querySelectorAll('tr').forEach(function(row) {
    var scoreCell = row.querySelector('.score-cell');
    if (scoreCell) {
      var score = parseFloat(scoreCell.textContent);
      row.style.display = score >= minScore ? '' : 'none';
    }
  });
}

function showResumeDetail(index) {
  var result = resumeState.analysisResults[index];
  if (!result) return;

  document.getElementById('resumeDetailName').textContent = result.filename;
  document.getElementById('resumeDetailScore').textContent = 'Score: ' + (result.ats_score || 0).toFixed(1) + '/10';

  // Matched skills
  var matchedHtml = (result.matched_skills || []).map(function(skill) {
    return '<span class="skill-tag">' + escapeHtml(skill) + '</span>';
  }).join('');
  document.getElementById('matchedSkillsList').innerHTML = matchedHtml || '<p style="color:var(--text-3)">No matched skills</p>';

  // Missing skills
  var missingHtml = (result.missing_skills || []).map(function(skill) {
    return '<span class="skill-tag missing">' + escapeHtml(skill) + '</span>';
  }).join('');
  document.getElementById('missingSkillsList').innerHTML = missingHtml || '<p style="color:var(--text-3)">All skills matched!</p>';

  // Score breakdown
  var breakdown = result.score_breakdown || {};
  var breakdownHtml = '<div>';
  if (breakdown.exact_matches !== undefined) {
    breakdownHtml += '<div class="breakdown-item"><span class="breakdown-label">Exact Matches</span><span class="breakdown-value">' + breakdown.exact_matches + '%</span></div>';
  }
  if (breakdown.partial_matches !== undefined) {
    breakdownHtml += '<div class="breakdown-item"><span class="breakdown-label">Partial Matches</span><span class="breakdown-value">' + breakdown.partial_matches + '%</span></div>';
  }
  if (breakdown.experience_keywords !== undefined) {
    breakdownHtml += '<div class="breakdown-item"><span class="breakdown-label">Experience Keywords</span><span class="breakdown-value">' + breakdown.experience_keywords + '%</span></div>';
  }
  breakdownHtml += '</div>';
  document.getElementById('scoreBreakdown').innerHTML = breakdownHtml;

  // Open modal
  document.getElementById('resumeDetailModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeResumeDetail() {
  document.getElementById('resumeDetailModal').classList.remove('open');
  document.body.style.overflow = '';
}

function exportResumesCSV() {
  if (resumeState.analysisResults.length === 0) {
    showToast('Info', 'No results to export.');
    return;
  }

  var csv = 'Resume Name,ATS Score,Skills Matched,Missing Skills\n';
  resumeState.analysisResults.forEach(function(result) {
    var matched = (result.matched_skills || []).length;
    var missing = (result.missing_skills || []).length;
    csv += '"' + (result.filename || '').replace(/"/g, '""') + '",' +
           (result.ats_score || 0).toFixed(1) + ',' +
           matched + ',' +
           missing + '\n';
  });

  var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  var link = document.createElement('a');
  link.setAttribute('href', URL.createObjectURL(blob));
  link.setAttribute('download', 'resume_analysis_results.csv');
  link.click();

  showToast('Downloaded', 'Results exported as CSV');
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', initResumeAnalyzer);
