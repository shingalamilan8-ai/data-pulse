/* ═══════════════════════════════════════════════════════
   LexaAi — app.js
   Connects the HTML frontend to the FastAPI backend.
   All AI calls go through /api/* endpoints.
═══════════════════════════════════════════════════════ */

// ── State ─────────────────────────────────────────────
var state = {
  currentPage: 'home',
  currentDash: 'upload',
  sessionId:   null,
  fileLoaded:  false,
  fileName:    '',
  profile:     null,
  preview:     [],
  columns:     [],
  chartsData:  [],
  insights:    '',
  chatHistory: []
};

var API = '';  // relative — same origin as FastAPI

// ── Cursor glow ───────────────────────────────────────
document.addEventListener('mousemove', function(e) {
  var g = document.getElementById('cursorGlow');
  if (g) { g.style.left = e.clientX + 'px'; g.style.top = e.clientY + 'px'; }
});

// ── Navbar scroll ─────────────────────────────────────
window.addEventListener('scroll', function() {
  var nav = document.getElementById('navbar');
  if (nav) nav.classList.toggle('scrolled', window.scrollY > 30);
});

// ── Hamburger ─────────────────────────────────────────
document.getElementById('hamburger').addEventListener('click', function() {
  document.getElementById('mobileMenu').classList.toggle('open');
});

// ── Navigation ────────────────────────────────────────
function navigateTo(page) {
  document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });
  var target = document.getElementById('page-' + page);
  if (target) target.classList.add('active');
  document.querySelectorAll('.nav-link').forEach(function(l) {
    l.classList.toggle('active', l.dataset.page === page);
  });
  state.currentPage = page;
  document.getElementById('mobileMenu').classList.remove('open');
  window.scrollTo(0, 0);
  if (page === 'dashboard') switchDash(state.currentDash);
}

document.querySelectorAll('[data-page]').forEach(function(el) {
  if (el.tagName === 'A' || el.classList.contains('mob-link')) {
    el.addEventListener('click', function(e) { e.preventDefault(); navigateTo(el.dataset.page); });
  }
});

// ── Dashboard panel switching ─────────────────────────
var PANEL_TITLES = {
  upload:   { title: 'Upload Your Dataset',  sub: "CSV or Excel — we'll handle the rest" },
  charts:   { title: 'Generated Charts',     sub: 'AI-selected based on your data'       },
  insights: { title: 'AI Insights',          sub: 'Deep analysis powered by Gemini'      },
  analysis: { title: 'AI Data Chat',         sub: 'Ask anything about your dataset'      },
  summary:  { title: 'Data Summary',         sub: 'Column profiles and data preview'     },
  export:   { title: 'Export',               sub: 'Download reports, CSV, and dashboards'}
};

function switchDash(panelId) {
  document.querySelectorAll('.sidebar-item').forEach(function(i) {
    i.classList.toggle('active', i.dataset.dash === panelId);
  });
  document.querySelectorAll('.dash-panel').forEach(function(p) { p.classList.remove('active'); });
  var panel = document.getElementById('panel-' + panelId);
  if (panel) panel.classList.add('active');
  state.currentDash = panelId;
  var t = PANEL_TITLES[panelId] || { title: panelId, sub: '' };
  document.getElementById('dashTitle').textContent = t.title;
  document.getElementById('dashSub').textContent   = t.sub;

  if (panelId === 'charts'   && state.fileLoaded) renderChartsPanel();
  if (panelId === 'summary'  && state.fileLoaded) renderSummaryPanel();
  if (panelId === 'insights' && state.fileLoaded) renderInsightsPanel();
  if (panelId === 'export'   && state.fileLoaded) renderExportPanel();
}

document.querySelectorAll('.sidebar-item').forEach(function(item) {
  item.addEventListener('click', function(e) { e.preventDefault(); switchDash(item.dataset.dash); });
});

// ══════════════════════════════════════════════════════
//  FILE UPLOAD
// ══════════════════════════════════════════════════════
var uploadZone = document.getElementById('uploadZone');
var fileInput  = document.getElementById('fileInput');

uploadZone.addEventListener('dragover', function(e) {
  e.preventDefault(); uploadZone.classList.add('drag-over');
});
uploadZone.addEventListener('dragleave', function() {
  uploadZone.classList.remove('drag-over');
});
uploadZone.addEventListener('drop', function(e) {
  e.preventDefault(); uploadZone.classList.remove('drag-over');
  if (e.dataTransfer.files[0]) handleFileSelect(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', function() {
  if (fileInput.files[0]) handleFileSelect(fileInput.files[0]);
});

function handleFileSelect(file) {
  var ext = '.' + file.name.split('.').pop().toLowerCase();
  if (['.csv','.xlsx','.xls'].indexOf(ext) === -1) {
    showToast('Error', 'Please upload a CSV or Excel file.', true); return;
  }
  document.getElementById('fileName').textContent = file.name;
  document.getElementById('fileMeta').textContent =
    (file.size / 1024).toFixed(1) + ' KB · ' + ext.toUpperCase() + ' file';

  // Store for upload
  state._pendingFile = file;
  state.fileName = file.name;

  document.getElementById('uploadZone').classList.add('hidden');
  document.getElementById('uploadInfo').classList.remove('hidden');
  setStatus('ready', file.name + ' ready');
}

document.getElementById('analyzeBtn').addEventListener('click', function() {
  if (!state._pendingFile) { showToast('Error', 'No file selected.', true); return; }
  uploadAndAnalyze(state._pendingFile);
});

async function uploadAndAnalyze(file) {
  showLoader('Uploading file…');
  var form = new FormData();
  form.append('file', file);

  try {
    var res  = await fetch(API + '/api/upload', { method: 'POST', body: form });
    var data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Upload failed');

    state.sessionId = data.session_id;
    state.fileLoaded = true;
    state.profile    = data.profile;
    state.preview    = data.preview;
    state.columns    = data.columns;

    setStatus('ready', data.filename + ' loaded');
    updateLoaderText('Generating AI charts…');

    // Auto-generate charts right after upload
    await generateCharts();

  } catch(err) {
    hideLoader();
    showToast('Upload Failed', err.message, true);
  }
}

// ══════════════════════════════════════════════════════
//  CHART GENERATION
// ══════════════════════════════════════════════════════
async function generateCharts() {
  if (!state.sessionId) { showToast('Error', 'Upload a file first.', true); return; }
  showLoader('AI is crafting your charts…');
  var steps = [
    [600, 'Parsing column types…'],
    [1200,'Detecting best chart types…'],
    [2000,'Generating Plotly visualizations…'],
    [2800,'Finalising…']
  ];
  steps.forEach(function(s) { setTimeout(function() { updateLoaderText(s[1]); }, s[0]); });

  try {
    var res  = await fetch(API + '/api/generate-charts/' + state.sessionId, { method: 'POST' });
    var data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Chart generation failed');

    state.chartsData = data.charts;
    state.code       = data.code;

    hideLoader();
    switchDash('charts');
    addBotMessage('📊 I\'ve analysed your dataset and generated <strong>' + data.count + ' charts</strong>! Head to the Charts tab or ask me anything.');

  } catch(err) {
    hideLoader();
    showToast('Chart Error', err.message, true);
  }
}

function regenerateCharts() { generateCharts(); }

// ── Render charts panel ────────────────────────────────
function renderChartsPanel() {
  if (!state.chartsData || state.chartsData.length === 0) {
    document.getElementById('noChartMsg').classList.remove('hidden');
    document.getElementById('chartsLoaded').classList.add('hidden');
    return;
  }

  document.getElementById('noChartMsg').classList.add('hidden');
  document.getElementById('chartsLoaded').classList.remove('hidden');
  document.getElementById('chartCount').textContent = state.chartsData.length + ' charts';

  var grid = document.getElementById('chartsGrid');
  grid.innerHTML = '';

  state.chartsData.forEach(function(chartJson, i) {
    var wrap = document.createElement('div');
    wrap.className = 'chart-item';
    wrap.dataset.type = guessChartType(chartJson);

    var title = '';
    try { title = chartJson.layout && chartJson.layout.title ? (chartJson.layout.title.text || chartJson.layout.title) : 'Chart ' + (i+1); }
    catch(e) { title = 'Chart ' + (i+1); }

    var typeStr = guessChartType(chartJson);

    wrap.innerHTML =
      '<div class="chart-item-header">' +
        '<span class="chart-item-title">' + title + '</span>' +
        '<span class="chart-type-badge">' + typeStr + '</span>' +
      '</div>' +
      '<div class="chart-canvas-wrap plotly-wrap" id="plotly-' + i + '"></div>';
    grid.appendChild(wrap);

    // Render with Plotly
    try {
      Plotly.newPlot('plotly-' + i, chartJson.data || [], chartJson.layout || {}, {
        responsive: true, displayModeBar: true,
        modeBarButtonsToRemove: ['lasso2d','select2d'],
        toImageButtonOptions: { format: 'png', filename: 'lexaai_chart_' + i }
      });
    } catch(e) {
      document.getElementById('plotly-' + i).innerHTML =
        '<div style="color:#f87171;padding:1rem;font-size:.85rem;">Chart render error: ' + e.message + '</div>';
    }
  });

  // Code section
  if (state.code) {
    document.getElementById('codeContent').textContent = state.code;
  }
}

function guessChartType(chartJson) {
  try {
    var d = chartJson.data;
    if (!d || !d[0]) return 'chart';
    var t = (d[0].type || '').toLowerCase();
    if (t === 'bar')      return 'bar';
    if (t === 'scatter')  return d[0].mode && d[0].mode.includes('lines') ? 'line' : 'scatter';
    if (t === 'pie')      return 'pie';
    if (t === 'heatmap')  return 'heatmap';
    if (t === 'histogram') return 'bar';
    if (t === 'box')      return 'box';
    return t || 'chart';
  } catch(e) { return 'chart'; }
}

// Chart type filter
document.getElementById('chartTypeFilter').addEventListener('change', function() {
  var val = this.value;
  document.querySelectorAll('.chart-item').forEach(function(item) {
    item.style.display = (val === 'all' || item.dataset.type === val) ? '' : 'none';
  });
});

function toggleCode() {
  var block = document.getElementById('codeBlock');
  var chev  = document.getElementById('codeChevron');
  block.classList.toggle('hidden');
  chev.style.transform = block.classList.contains('hidden') ? '' : 'rotate(180deg)';
}

// ══════════════════════════════════════════════════════
//  AI INSIGHTS
// ══════════════════════════════════════════════════════
function renderInsightsPanel() {
  if (!state.sessionId) return;
  document.getElementById('noInsightMsg').classList.add('hidden');
  document.getElementById('insightsLoaded').classList.remove('hidden');
  if (state.insights) renderInsightContent(state.insights);
}

async function generateInsights() {
  if (!state.sessionId) { showToast('Error', 'Upload a file first.', true); return; }
  var btn = document.getElementById('genInsightsBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating…';

  try {
    var res  = await fetch(API + '/api/generate-insights/' + state.sessionId, { method: 'POST' });
    var data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Failed');

    state.insights = data.insights;
    renderInsightContent(data.insights);
    showToast('Done', 'Insights generated successfully!');

  } catch(err) {
    showToast('Error', err.message, true);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-magic"></i> Regenerate Insights';
  }
}

function renderInsightContent(markdown) {
  var container = document.getElementById('insightContent');
  // Simple markdown → HTML conversion
  var html = markdown
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/^## (.+)$/gm, '<h3 class="insight-h2">$1</h3>')
    .replace(/^# (.+)$/gm,  '<h2 class="insight-h1">$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');
  container.innerHTML = '<div class="insight-body"><p>' + html + '</p></div>';
}

// ══════════════════════════════════════════════════════
//  DATA SUMMARY PANEL
// ══════════════════════════════════════════════════════
function renderSummaryPanel() {
  if (!state.profile) return;
  var p = state.profile;

  document.getElementById('noSummaryMsg').classList.add('hidden');
  document.getElementById('summaryLoaded').classList.remove('hidden');

  var cardsData = [
    { label: 'Total Rows',     val: p.rows.toLocaleString() },
    { label: 'Columns',        val: p.cols },
    { label: 'Numeric Cols',   val: p.num_cols.length },
    { label: 'Text Cols',      val: p.cat_cols.length },
    { label: 'Missing Values', val: p.total_nulls },
    { label: 'Duplicates',     val: p.duplicates },
    { label: 'Null %',         val: p.null_pct + '%' },
    { label: 'Memory',         val: p.memory_mb + ' MB' }
  ];

  document.getElementById('summaryCards').innerHTML = cardsData.map(function(c) {
    return '<div class="summary-card">' +
      '<p class="summary-card-label">' + c.label + '</p>' +
      '<p class="summary-card-val">' + c.val + '</p>' +
      '</div>';
  }).join('');

  document.getElementById('rowCount').textContent = '— ' + p.rows + ' rows × ' + p.cols + ' cols';

  // Column profile table
  var cols = p.columns || [];
  var headers = ['Column','Type','Nulls','Unique','Stats'];
  var thead = '<thead><tr>' + headers.map(function(h) { return '<th>' + h + '</th>'; }).join('') + '</tr></thead>';
  var tbody = '<tbody>' + cols.map(function(col) {
    var typeColor = col.type === 'numeric' ? '#00ffc8' : '#f59e0b';
    var stats = col.type === 'numeric'
      ? 'min=' + (col.min||'—') + ' · mean=' + (col.mean||'—') + ' · max=' + (col.max||'—')
      : 'top: ' + (col.top_value||'—');
    return '<tr>' +
      '<td><strong>' + col.name + '</strong></td>' +
      '<td><span style="color:' + typeColor + ';font-family:monospace;font-size:.8rem">' + col.type + '</span></td>' +
      '<td>' + col.nulls + ' (' + col.null_pct + '%)</td>' +
      '<td>' + col.unique + '</td>' +
      '<td style="font-size:.82rem;color:#8892a4">' + stats + '</td>' +
      '</tr>';
  }).join('') + '</tbody>';
  document.getElementById('dataTable').innerHTML = thead + tbody;

  // Preview rows
  if (state.preview && state.preview.length > 0) {
    // handled above — data table already shows column profiles
    // Show raw preview below
    var previewCols = Object.keys(state.preview[0]);
    var pHead = '<thead><tr>' + previewCols.map(function(c) { return '<th>' + c + '</th>'; }).join('') + '</tr></thead>';
    var pBody = '<tbody>' + state.preview.map(function(row) {
      return '<tr>' + previewCols.map(function(c) { return '<td>' + (row[c]||'') + '</td>'; }).join('') + '</tr>';
    }).join('') + '</tbody>';

    var previewWrap = document.querySelector('.data-preview-wrap');
    if (previewWrap) {
      previewWrap.innerHTML =
        '<h3 class="preview-title">Raw Data Preview <span id="rowCount">— first 8 rows</span></h3>' +
        '<div class="table-scroll"><table class="data-table">' + pHead + pBody + '</table></div>';
    }
  }
}

// ══════════════════════════════════════════════════════
//  EXPORT PANEL
// ══════════════════════════════════════════════════════
function renderExportPanel() {
  if (!state.sessionId) return;
  var p = state.profile;

  var summary = document.getElementById('sessionSummary');
  summary.style.display = 'block';

  var cards = [
    { label: 'Dataset',  val: p ? p.rows.toLocaleString() + ' × ' + p.cols : '—' },
    { label: 'Charts',   val: state.chartsData.length },
    { label: 'Insights', val: state.insights ? '✅ Ready' : '⏳ Pending' },
    { label: 'Chat Msgs',val: Math.floor(state.chatHistory.length / 2) + ' turns' }
  ];

  document.getElementById('exportSummaryCards').innerHTML = cards.map(function(c) {
    return '<div class="summary-card">' +
      '<p class="summary-card-label">' + c.label + '</p>' +
      '<p class="summary-card-val">' + c.val + '</p>' +
      '</div>';
  }).join('');
}

async function exportPDF() {
  if (!state.sessionId) { showToast('Error', 'No session active.', true); return; }
  if (!state.insights)  { showToast('Info', 'Generate insights first!'); return; }
  var btn = document.getElementById('exportPdfBtn');
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Building PDF…';
  btn.disabled  = true;
  try {
    var res = await fetch(API + '/api/export-pdf/' + state.sessionId);
    if (!res.ok) throw new Error('PDF generation failed');
    var blob = await res.blob();
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    a.href   = url; a.download = 'lexaai_report.pdf'; a.click();
    URL.revokeObjectURL(url);
    showToast('Downloaded', 'PDF report saved to your downloads.');
  } catch(err) {
    showToast('Error', err.message, true);
  } finally {
    btn.innerHTML = '<i class="fas fa-download"></i> Download PDF';
    btn.disabled  = false;
  }
}

async function exportCSV() {
  if (!state.sessionId) { showToast('Error', 'No session active.', true); return; }
  var btn = document.getElementById('exportCsvBtn');
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Preparing…';
  btn.disabled  = true;
  try {
    var res  = await fetch(API + '/api/export-csv/' + state.sessionId);
    if (!res.ok) throw new Error('CSV export failed');
    var blob = await res.blob();
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    a.href   = url; a.download = 'lexaai_data.csv'; a.click();
    URL.revokeObjectURL(url);
    showToast('Downloaded', 'CSV file saved to your downloads.');
  } catch(err) {
    showToast('Error', err.message, true);
  } finally {
    btn.innerHTML = '<i class="fas fa-download"></i> Download CSV';
    btn.disabled  = false;
  }
}

async function saveDashboard() {
  if (!state.sessionId) { showToast('Error', 'No session active.', true); return; }
  try {
    var res  = await fetch(API + '/api/save-dashboard/' + state.sessionId, { method: 'POST' });
    var data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Save failed');
    showToast('Saved', data.message);
  } catch(err) { showToast('Error', err.message, true); }
}

async function loadDashboard() {
  if (!state.sessionId) { showToast('Error', 'Upload a file first.', true); return; }
  try {
    var res  = await fetch(API + '/api/load-dashboard/' + state.sessionId, { method: 'POST' });
    var data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Load failed');
    state.chartsData = data.charts;
    showToast('Loaded', data.count + ' charts restored.');
    switchDash('charts');
  } catch(err) { showToast('Error', err.message, true); }
}

// ══════════════════════════════════════════════════════
//  AI CHAT
// ══════════════════════════════════════════════════════
var chatInput = document.getElementById('chatInput');
chatInput.addEventListener('keydown', function(e) { if (e.key === 'Enter') sendMessage(); });

function sendMessage() {
  var text = chatInput.value.trim();
  if (!text) return;
  chatInput.value = '';
  addUserMessage(text);
  addTypingIndicator();

  if (!state.sessionId) {
    removeTypingIndicator();
    addBotMessage('Please upload a dataset first before asking questions!');
    return;
  }

  fetch(API + '/api/chat/' + state.sessionId, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: text })
  })
  .then(function(r) { return r.json(); })
  .then(function(data) {
    removeTypingIndicator();
    if (data.detail) {
      addBotMessage('❌ ' + data.detail);
    } else {
      state.chatHistory = data.history;
      addBotMessage(simpleMarkdown(data.answer));
    }
  })
  .catch(function(err) {
    removeTypingIndicator();
    addBotMessage('❌ Network error: ' + err.message);
  });
}

function sendSuggestion(text) { chatInput.value = text; sendMessage(); }

async function loadAISuggestions() {
  if (!state.sessionId) { showToast('Info', 'Upload a file to get AI suggestions.'); return; }
  var btn = document.getElementById('suggestAiBtn');
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
  try {
    var res  = await fetch(API + '/api/suggest-questions/' + state.sessionId);
    var data = await res.json();
    var sugg = document.getElementById('chatSuggestions');
    // Remove old AI-generated chips
    sugg.querySelectorAll('.ai-chip').forEach(function(c) { c.remove(); });
    (data.questions || []).forEach(function(q) {
      var btn = document.createElement('button');
      btn.className   = 'suggestion-chip ai-chip';
      btn.textContent = q;
      btn.onclick     = function() { sendSuggestion(q); };
      sugg.insertBefore(btn, document.getElementById('suggestAiBtn'));
    });
    showToast('Done', 'AI suggestions loaded!');
  } catch(err) { showToast('Error', err.message, true); }
  finally { btn.innerHTML = '<i class="fas fa-magic"></i> AI Questions'; }
}

function addBotMessage(html) {
  var row = document.createElement('div');
  row.className = 'chat-row';
  row.innerHTML =
    '<div class="chat-avatar bot"><i class="fas fa-robot"></i></div>' +
    '<div class="chat-bubble bot">' + html + '</div>';
  var msgs = document.getElementById('chatMessages');
  msgs.appendChild(row);
  msgs.scrollTop = msgs.scrollHeight;
}

function addUserMessage(text) {
  var row = document.createElement('div');
  row.className = 'chat-row user';
  row.innerHTML =
    '<div class="chat-avatar user"><i class="fas fa-user"></i></div>' +
    '<div class="chat-bubble user">' + escapeHtml(text) + '</div>';
  var msgs = document.getElementById('chatMessages');
  msgs.appendChild(row);
  msgs.scrollTop = msgs.scrollHeight;
}

function addTypingIndicator() {
  var row = document.createElement('div');
  row.className = 'chat-row'; row.id = 'typingIndicator';
  row.innerHTML =
    '<div class="chat-avatar bot"><i class="fas fa-robot"></i></div>' +
    '<div class="chat-bubble bot"><div class="typing-dots"><span></span><span></span><span></span></div></div>';
  var msgs = document.getElementById('chatMessages');
  msgs.appendChild(row);
  msgs.scrollTop = msgs.scrollHeight;
}

function removeTypingIndicator() {
  var el = document.getElementById('typingIndicator');
  if (el) el.remove();
}

// ── Simple markdown renderer ───────────────────────────
function simpleMarkdown(text) {
  return text
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^## (.+)$/gm, '<strong>$1</strong>')
    .replace(/^# (.+)$/gm,  '<strong>$1</strong>')
    .replace(/^- (.+)$/gm,  '• $1')
    .replace(/\n/g, '<br>');
}

function escapeHtml(text) {
  return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ══════════════════════════════════════════════════════
//  CONSULTANCY MODAL
// ══════════════════════════════════════════════════════
function openConsultModal(name, title) {
  document.getElementById('modalConsultName').textContent  = 'Connect with ' + name;
  document.getElementById('modalConsultTitle').textContent = title;
  document.getElementById('consultModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeConsultModal() {
  document.getElementById('consultModal').classList.remove('open');
  document.body.style.overflow = '';
}
document.getElementById('consultModal').addEventListener('click', function(e) {
  if (e.target === this) closeConsultModal();
});
function submitConsult(e) {
  e.preventDefault(); closeConsultModal();
  showToast('Request Sent!', "You'll receive an email with meeting details within 24 hours.");
}

// ══════════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════════
function setStatus(type, text) {
  var pill = document.getElementById('statusPill');
  pill.innerHTML = '<span class="status-dot ' + type + '"></span> ' + text;
}

function showLoader(text) {
  document.getElementById('loaderText').textContent = text || 'Loading…';
  document.getElementById('loadingOverlay').classList.remove('hidden');
}
function updateLoaderText(text) {
  var el = document.getElementById('loaderText');
  if (el) el.textContent = text;
}
function hideLoader() {
  document.getElementById('loadingOverlay').classList.add('hidden');
}

function showToast(title, msg, isError) {
  var toast = document.getElementById('toastSuccess');
  document.getElementById('toastTitle').textContent = title || 'Done';
  document.getElementById('toastMsg').textContent   = msg || '';
  toast.style.borderColor = isError ? 'rgba(248,113,113,.4)' : 'rgba(0,255,100,.3)';
  toast.classList.add('show');
  setTimeout(function() { toast.classList.remove('show'); }, 4500);
}
function closeToast() { document.getElementById('toastSuccess').classList.remove('show'); }

// ── Init ──────────────────────────────────────────────
navigateTo('home');
