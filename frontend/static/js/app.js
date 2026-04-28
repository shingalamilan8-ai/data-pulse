// Global state
let state = {
  sessionId: null,
  fileLoaded: false,
  chartsData: [],
  code: '',
  insights: '',
  currentDashTab: 'chat'
};

const API = '';

// DOM elements
let uploadZone, fileInput, analyzeBtn, fileNameSpan, fileMetaSpan, uploadReady;
let chartsGrid, chartCount, chartFilter, codeBlock, codeContent;
let chatMessages, chatInput, sendChatBtn, suggestionsDiv;
let insightsPanel, genInsightsBtn, insightContent;
let dashStatus;

function cacheElements() {
  uploadZone = document.getElementById('uploadZone');
  fileInput = document.getElementById('fileInput');
  analyzeBtn = document.getElementById('analyzeBtn');
  fileNameSpan = document.getElementById('fileName');
  fileMetaSpan = document.getElementById('fileMeta');
  uploadReady = document.getElementById('uploadReady');
  chartsGrid = document.getElementById('chartsGrid');
  chartCount = document.getElementById('chartCount');
  chartFilter = document.getElementById('chartFilter');
  codeBlock = document.getElementById('codeBlock');
  codeContent = document.getElementById('codeContent');
  chatMessages = document.getElementById('chatMessages');
  chatInput = document.getElementById('chatInput');
  sendChatBtn = document.getElementById('sendChatBtn');
  suggestionsDiv = document.getElementById('suggestions');
  insightsPanel = document.getElementById('insightsPanel');
  genInsightsBtn = document.getElementById('genInsightsBtn');
  insightContent = document.getElementById('insightContent');
  dashStatus = document.getElementById('dashStatus');
}

window.onload = () => {
  cacheElements();
  attachEvents();
  animateStats();
  navigateTo('home');
};

function attachEvents() {
  document.querySelectorAll('[data-page]').forEach(el => el.addEventListener('click', (e) => { e.preventDefault(); navigateTo(el.dataset.page); }));
  if (uploadZone) {
    uploadZone.addEventListener('dragover', e => e.preventDefault());
    uploadZone.addEventListener('drop', e => { e.preventDefault(); const file = e.dataTransfer.files[0]; if(file) handleFile(file); });
    uploadZone.querySelector('.file-label')?.addEventListener('click', () => fileInput.click());
  }
  if (fileInput) fileInput.addEventListener('change', () => { if(fileInput.files[0]) handleFile(fileInput.files[0]); });
  if (analyzeBtn) analyzeBtn.addEventListener('click', () => uploadAndAnalyze());
  if (sendChatBtn) sendChatBtn.addEventListener('click', sendMessage);
  if (chatInput) chatInput.addEventListener('keypress', e => { if(e.key === 'Enter') sendMessage(); });
  if (genInsightsBtn) genInsightsBtn.addEventListener('click', generateInsights);
  if (chartFilter) chartFilter.addEventListener('change', filterCharts);
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => switchAnalysisTab(tab.dataset.tab));
  });
}

function navigateTo(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(`page-${page}`).classList.add('active');
  document.querySelectorAll('.nav-links a').forEach(a => a.classList.toggle('active', a.dataset.page === page));
  if (page === 'dashboard' && state.fileLoaded) refreshDashboardUI();
}

function handleFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (!['csv','xlsx','xls'].includes(ext)) { showToast('Only CSV/Excel', true); return; }
  fileNameSpan.textContent = file.name;
  fileMetaSpan.textContent = `${(file.size/1024).toFixed(1)} KB`;
  uploadReady.classList.remove('hidden');
  uploadZone.classList.add('hidden');
  state.pendingFile = file;
  dashStatus.innerText = `📄 ${file.name} ready`;
}

async function uploadAndAnalyze() {
  if (!state.pendingFile) return;
  showLoader('Uploading...');
  const fd = new FormData();
  fd.append('file', state.pendingFile);
  try {
    const res = await fetch(`${API}/api/upload`, { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail);
    state.sessionId = data.session_id;
    state.fileLoaded = true;
    dashStatus.innerText = `✅ ${data.filename}`;
    await generateCharts();
  } catch(e) { showToast(e.message, true); hideLoader(); }
}

async function generateCharts() {
  showLoader('AI generating charts...');
  try {
    const res = await fetch(`${API}/api/generate-charts/${state.sessionId}`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail);
    state.chartsData = data.charts;
    state.code = data.code;
    renderCharts();
    document.getElementById('chartsSection').classList.remove('hidden');
    hideLoader();
    // auto insights
    await generateInsights();
    addBotMessage(`✅ Generated ${data.count} charts! Ask me anything about the data.`);
  } catch(e) { showToast(e.message, true); hideLoader(); }
}

function renderCharts() {
  if (!state.chartsData.length) return;
  chartsGrid.innerHTML = '';
  state.chartsData.forEach((chart, i) => {
    const card = document.createElement('div');
    card.className = 'chart-card';
    card.dataset.type = guessType(chart);
    const title = chart.layout?.title?.text || `Chart ${i+1}`;
    card.innerHTML = `<div class="chart-card-header"><b>${title}</b><span class="badge">${card.dataset.type}</span></div><div id="plot-${i}" class="plotly-wrap"></div>`;
    chartsGrid.appendChild(card);
    Plotly.newPlot(`plot-${i}`, chart.data, chart.layout, { responsive: true, displayModeBar: true });
  });
  chartCount.innerText = `${state.chartsData.length} charts`;
  if (state.code) codeContent.innerText = state.code;
}

function guessType(chart) {
  const type = chart.data?.[0]?.type || 'scatter';
  if (type === 'bar') return 'bar';
  if (type === 'scatter') return chart.data[0].mode?.includes('lines') ? 'line' : 'scatter';
  if (type === 'pie') return 'pie';
  return 'chart';
}

function filterCharts() {
  const val = chartFilter.value;
  document.querySelectorAll('.chart-card').forEach(c => {
    if (val === 'all' || c.dataset.type === val) c.style.display = '';
    else c.style.display = 'none';
  });
}

function toggleCode() { codeBlock.classList.toggle('hidden'); }

async function generateInsights() {
  if (!state.sessionId) return;
  showLoader('Generating insights...');
  try {
    const res = await fetch(`${API}/api/generate-insights/${state.sessionId}`, { method: 'POST' });
    const data = await res.json();
    state.insights = data.insights;
    insightContent.innerHTML = markedToHtml(data.insights);
    insightsPanel.classList.remove('hidden');
    hideLoader();
  } catch(e) { hideLoader(); showToast(e.message, true); }
}

function markedToHtml(md) {
  return md.replace(/^## (.*)$/gm, '<h2>$1</h2>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
}

async function sendMessage() {
  const q = chatInput.value.trim();
  if (!q || !state.sessionId) return;
  addUserMessage(q);
  chatInput.value = '';
  showLoader('Thinking...');
  try {
    const res = await fetch(`${API}/api/chat/${state.sessionId}`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({query: q}) });
    const data = await res.json();
    addBotMessage(data.answer);
    hideLoader();
  } catch(e) { hideLoader(); addBotMessage('Error: ' + e.message); }
}

function addBotMessage(text) {
  const div = document.createElement('div'); div.className = 'message bot'; div.innerHTML = text.replace(/\n/g,'<br>');
  chatMessages.appendChild(div); chatMessages.scrollTop = chatMessages.scrollHeight;
}
function addUserMessage(text) {
  const div = document.createElement('div'); div.className = 'message user'; div.innerText = text;
  chatMessages.appendChild(div); chatMessages.scrollTop = chatMessages.scrollHeight;
}

function switchAnalysisTab(tab) {
  state.currentDashTab = tab;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  document.getElementById('chatPanel').classList.toggle('active', tab === 'chat');
  document.getElementById('insightsPanel').classList.toggle('active', tab === 'insights');
}

function refreshDashboardUI() {
  // if needed
}

async function loadSuggestions() {
  if (!state.sessionId) return;
  const res = await fetch(`${API}/api/suggest-questions/${state.sessionId}`);
  const data = await res.json();
  suggestionsDiv.innerHTML = data.questions.map(q => `<button onclick="sendSuggestion('${q.replace(/'/g,"\\'")}')">${q}</button>`).join('');
}
window.sendSuggestion = (q) => { chatInput.value = q; sendMessage(); };

function showToast(msg, isErr) {
  const toast = document.getElementById('toast');
  toast.querySelector('span').innerText = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}
function showLoader(txt) { document.getElementById('loaderText').innerText = txt; document.getElementById('loader').classList.remove('hidden'); }
function hideLoader() { document.getElementById('loader').classList.add('hidden'); }
function animateStats() {
  let c1=0, c2=0, c3=0;
  const int = setInterval(() => {
    if(c1<1847) c1+=37; if(c2<5239) c2+=105; if(c3<96) c3+=2;
    document.getElementById('stat1').innerText = Math.min(c1,1847);
    document.getElementById('stat2').innerText = Math.min(c2,5239);
    document.getElementById('stat3').innerText = Math.min(c3,96)+'%';
    if(c1>=1847 && c2>=5239 && c3>=96) clearInterval(int);
  }, 30);
}

window.regenerateCharts = generateCharts;
window.toggleCode = toggleCode;