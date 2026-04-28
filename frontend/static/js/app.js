/* ═══════════════════════════════════════════════════════════════
   LexaAi v5 — Main Application Logic
   Dark Blue Theme | Optimized Performance | Enhanced Features
   
   Features:
   - Data analysis with AI-powered charts
   - Chat interface with data context
   - Custom chart generation
   - PDF/CSV exports
   ═══════════════════════════════════════════════════════════════ */

// ── Global State ──────────────────────────────────────────────
const AppState = {
    currentPage: 'home',
    currentDash: 'upload',
    sessionId: null,
    fileLoaded: false,
    fileName: '',
    profile: null,
    preview: [],
    columns: [],
    chartsData: [],
    code: '',
    insights: '',
    chatHistory: [],
    pendingFile: null,
    analysisTab: 'chat'
};

// API Base URL (relative - same origin)
const API = '';

// DOM Elements Cache
const DOM = {};

// ── Initialize Application ────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    cacheDOMElements();
    attachEventListeners();
    initParticleBackground();
    initNavbarScroll();
    navigateTo('home');
    
    // Update stats counters with animation
    animateCounter('ctr1', 1847, 2000);
    animateCounter('ctr2', 5239, 2000);
    animateCounter('ctr3', 96, 2000);
});

function cacheDOMElements() {
    DOM.particleCanvas = document.getElementById('particleCanvas');
    DOM.navbar = document.getElementById('navbar');
    DOM.hamburger = document.getElementById('hamburger');
    DOM.mobileMenu = document.getElementById('mobileMenu');
    DOM.loadingOverlay = document.getElementById('loadingOverlay');
    DOM.loaderText = document.getElementById('loaderText');
    DOM.toast = document.getElementById('toast');
    
    // Dashboard elements
    DOM.uploadZone = document.getElementById('uploadZone');
    DOM.fileInput = document.getElementById('fileInput');
    DOM.analyzeBtn = document.getElementById('analyzeBtn');
    DOM.fileName = document.getElementById('fileName');
    DOM.fileMeta = document.getElementById('fileMeta');
    DOM.uploadReady = document.getElementById('uploadReady');
    DOM.statusPill = document.getElementById('statusPill');
    
    // Chart elements
    DOM.chartsGrid = document.getElementById('chartsGrid');
    DOM.chartTypeFilter = document.getElementById('chartTypeFilter');
    DOM.chartCount = document.getElementById('chartCount');
    DOM.noChartMsg = document.getElementById('noChartMsg');
    DOM.chartsWrap = document.getElementById('chartsWrap');
    DOM.codeBlock = document.getElementById('codeBlock');
    DOM.codeContent = document.getElementById('codeContent');
    DOM.codeChevron = document.getElementById('codeChevron');
    
    // Chat elements
    DOM.chatMessages = document.getElementById('chatMessages');
    DOM.chatInput = document.getElementById('chatInput');
    DOM.chatSuggestions = document.getElementById('chatSuggestions');
    DOM.insightContent = document.getElementById('insightContent');
    DOM.genInsightsBtn = document.getElementById('genInsightsBtn');
    
    // Custom chart
    DOM.customChartInput = document.getElementById('customChartInput');
}

function attachEventListeners() {
    // Navigation
    document.querySelectorAll('[data-page]').forEach(el => {
        el.addEventListener('click', (e) => {
            e.preventDefault();
            navigateTo(el.dataset.page);
        });
    });
    
    document.querySelectorAll('.sitem').forEach(el => {
        el.addEventListener('click', () => switchDash(el.dataset.dash));
    });
    
    document.querySelectorAll('.nav-link').forEach(el => {
        el.addEventListener('click', (e) => {
            e.preventDefault();
            navigateTo(el.dataset.page);
        });
    });
    
    // Upload
    if (DOM.uploadZone) {
        DOM.uploadZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            DOM.uploadZone.classList.add('drag-over');
        });
        DOM.uploadZone.addEventListener('dragleave', () => {
            DOM.uploadZone.classList.remove('drag-over');
        });
        DOM.uploadZone.addEventListener('drop', (e) => {
            e.preventDefault();
            DOM.uploadZone.classList.remove('drag-over');
            if (e.dataTransfer.files[0]) handleFileSelect(e.dataTransfer.files[0]);
        });
    }
    
    if (DOM.fileInput) {
        DOM.fileInput.addEventListener('change', () => {
            if (DOM.fileInput.files[0]) handleFileSelect(DOM.fileInput.files[0]);
        });
    }
    
    if (DOM.analyzeBtn) {
        DOM.analyzeBtn.addEventListener('click', () => uploadAndAnalyze());
    }
    
    // Chat
    if (DOM.chatInput) {
        DOM.chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendMessage();
        });
    }
    
    // Custom chart
    if (DOM.customChartInput) {
        DOM.customChartInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') requestCustomChart();
        });
    }
    
    // Chart filter
    if (DOM.chartTypeFilter) {
        DOM.chartTypeFilter.addEventListener('change', filterChartsByType);
    }
}

// ── Particle Background ───────────────────────────────────────
function initParticleBackground() {
    if (!DOM.particleCanvas) return;
    
    const canvas = DOM.particleCanvas;
    const ctx = canvas.getContext('2d');
    let particles = [];
    let animationId = null;
    
    function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    
    function createParticles() {
        const particleCount = Math.min(80, Math.floor(window.innerWidth / 20));
        particles = [];
        for (let i = 0; i < particleCount; i++) {
            particles.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                radius: Math.random() * 2 + 1,
                speedX: (Math.random() - 0.5) * 0.3,
                speedY: (Math.random() - 0.5) * 0.2,
                opacity: Math.random() * 0.3 + 0.1
            });
        }
    }
    
    function drawParticles() {
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        particles.forEach(p => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(59, 130, 246, ${p.opacity})`;
            ctx.fill();
            
            // Update position
            p.x += p.speedX;
            p.y += p.speedY;
            
            // Wrap around
            if (p.x < 0) p.x = canvas.width;
            if (p.x > canvas.width) p.x = 0;
            if (p.y < 0) p.y = canvas.height;
            if (p.y > canvas.height) p.y = 0;
        });
        
        animationId = requestAnimationFrame(drawParticles);
    }
    
    window.addEventListener('resize', () => {
        resizeCanvas();
        createParticles();
    });
    
    resizeCanvas();
    createParticles();
    drawParticles();
}

// ── Navigation ───────────────────────────────────────────────
function navigateTo(page) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const target = document.getElementById(`page-${page}`);
    if (target) target.classList.add('active');
    
    document.querySelectorAll('.nav-link').forEach(l => {
        l.classList.toggle('active', l.dataset.page === page);
    });
    
    AppState.currentPage = page;
    if (DOM.mobileMenu) DOM.mobileMenu.classList.remove('open');
    window.scrollTo(0, 0);
    
    if (page === 'dashboard') switchDash(AppState.currentDash);
}

function switchDash(panelId) {
    document.querySelectorAll('.sitem').forEach(i => {
        i.classList.toggle('active', i.dataset.dash === panelId);
    });
    
    document.querySelectorAll('.dash-panel').forEach(p => p.classList.remove('active'));
    const panel = document.getElementById(`panel-${panelId}`);
    if (panel) panel.classList.add('active');
    
    AppState.currentDash = panelId;
    
    const titles = {
        upload: { title: 'Upload Your Dataset', sub: 'CSV or Excel — we\'ll handle the rest' },
        charts: { title: 'AI Generated Charts', sub: 'Interactive visualizations powered by Gemini' },
        analysis: { title: 'AI Analysis', sub: 'Chat with your data & get insights' },
        summary: { title: 'Data Summary', sub: 'Column profiles and data preview' },
        export: { title: 'Export', sub: 'Download reports and data' }
    };
    
    const t = titles[panelId] || { title: panelId, sub: '' };
    const dashTitle = document.getElementById('dashTitle');
    const dashSub = document.getElementById('dashSub');
    if (dashTitle) dashTitle.textContent = t.title;
    if (dashSub) dashSub.textContent = t.sub;
    
    // Render panel content
    if (panelId === 'charts' && AppState.fileLoaded) renderChartsPanel();
    if (panelId === 'summary' && AppState.fileLoaded) renderSummaryPanel();
    if (panelId === 'analysis' && AppState.fileLoaded) renderAnalysisPanel();
    if (panelId === 'export' && AppState.fileLoaded) renderExportPanel();
}

function switchAnalysisTab(tab) {
    AppState.analysisTab = tab;
    document.querySelectorAll('.analysis-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.tab === tab);
    });
    document.querySelectorAll('.analysis-content').forEach(c => {
        c.classList.toggle('active', c.id === `analysis${tab.charAt(0).toUpperCase() + tab.slice(1)}`);
    });
}

// ── File Upload ──────────────────────────────────────────────
function handleFileSelect(file) {
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!['.csv', '.xlsx', '.xls'].includes(ext)) {
        showToast('Error', 'Please upload a CSV or Excel file.', true);
        return;
    }
    
    if (DOM.fileName) DOM.fileName.textContent = file.name;
    if (DOM.fileMeta) DOM.fileMeta.textContent = `${(file.size / 1024).toFixed(1)} KB · ${ext.toUpperCase()}`;
    
    AppState.pendingFile = file;
    AppState.fileName = file.name;
    
    if (DOM.uploadZone) DOM.uploadZone.classList.add('hidden');
    if (DOM.uploadReady) DOM.uploadReady.classList.remove('hidden');
    setStatus('ready', `${file.name} ready`);
}

async function uploadAndAnalyze() {
    if (!AppState.pendingFile) {
        showToast('Error', 'No file selected.', true);
        return;
    }
    
    showLoader('Uploading file...');
    
    const formData = new FormData();
    formData.append('file', AppState.pendingFile);
    
    try {
        const response = await fetch(`${API}/api/upload`, { method: 'POST', body: formData });
        const data = await response.json();
        
        if (!response.ok) throw new Error(data.detail || 'Upload failed');
        
        AppState.sessionId = data.session_id;
        AppState.fileLoaded = true;
        AppState.profile = data.profile;
        AppState.preview = data.preview;
        AppState.columns = data.columns;
        
        setStatus('ready', `${data.filename} loaded`);
        
        // Auto-generate charts
        updateLoaderText('Generating AI charts...');
        await generateCharts();
        
    } catch (err) {
        hideLoader();
        showToast('Upload Failed', err.message, true);
    }
}

// ── Chart Generation ─────────────────────────────────────────
async function generateCharts() {
    if (!AppState.sessionId) {
        showToast('Error', 'Upload a file first.', true);
        return;
    }
    
    showLoader('AI is analyzing your data...');
    
    const steps = [
        { delay: 800, text: 'Analyzing column types...' },
        { delay: 1600, text: 'Selecting optimal chart types...' },
        { delay: 2400, text: 'Generating visualizations...' },
        { delay: 3200, text: 'Finalizing charts...' }
    ];
    
    steps.forEach(step => setTimeout(() => updateLoaderText(step.text), step.delay));
    
    try {
        const response = await fetch(`${API}/api/generate-charts/${AppState.sessionId}`, { method: 'POST' });
        const data = await response.json();
        
        if (!response.ok) throw new Error(data.detail || 'Chart generation failed');
        
        AppState.chartsData = data.charts;
        AppState.code = data.code;
        
        hideLoader();
        
        if (data.fallback) {
            showToast('Info', 'Using fallback charts (AI service optimized)');
        } else {
            showToast('Success', `${data.count} charts generated!`);
        }
        
        switchDash('charts');
        addBotMessage(`📊 I've analyzed your dataset and generated <strong>${data.count} charts</strong>! You can view them in the Charts tab or ask me questions about the data.`);
        
    } catch (err) {
        hideLoader();
        showToast('Chart Error', err.message, true);
    }
}

async function regenerateCharts() {
    await generateCharts();
}

async function requestCustomChart() {
    if (!AppState.sessionId) {
        showToast('Error', 'Upload a file first.', true);
        return;
    }
    
    const input = document.getElementById('customChartInput');
    const request = input?.value.trim();
    
    if (!request) {
        showToast('Error', 'Please describe the chart you want.', true);
        return;
    }
    
    showLoader('Creating custom chart...');
    
    try {
        const response = await fetch(`${API}/api/custom-chart/${AppState.sessionId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ request })
        });
        
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || 'Chart generation failed');
        
        AppState.chartsData = [...AppState.chartsData, ...data.charts];
        if (input) input.value = '';
        
        hideLoader();
        renderChartsPanel();
        showToast('Success', 'Custom chart generated!');
        
    } catch (err) {
        hideLoader();
        showToast('Chart Error', err.message, true);
    }
}

function renderChartsPanel() {
    if (!AppState.chartsData || AppState.chartsData.length === 0) {
        if (DOM.noChartMsg) DOM.noChartMsg.classList.remove('hidden');
        if (DOM.chartsWrap) DOM.chartsWrap.classList.add('hidden');
        return;
    }
    
    if (DOM.noChartMsg) DOM.noChartMsg.classList.add('hidden');
    if (DOM.chartsWrap) DOM.chartsWrap.classList.remove('hidden');
    if (DOM.chartCount) DOM.chartCount.textContent = `${AppState.chartsData.length} charts`;
    
    if (!DOM.chartsGrid) return;
    DOM.chartsGrid.innerHTML = '';
    
    AppState.chartsData.forEach((chartJson, i) => {
        const chartDiv = document.createElement('div');
        chartDiv.className = 'chart-item';
        chartDiv.dataset.type = guessChartType(chartJson);
        
        let title = `Chart ${i + 1}`;
        try {
            if (chartJson.layout?.title?.text) title = chartJson.layout.title.text;
            else if (chartJson.layout?.title) title = chartJson.layout.title;
        } catch (e) {}
        
        const typeStr = guessChartType(chartJson);
        
        chartDiv.innerHTML = `
            <div class="chart-item-header">
                <span class="chart-item-title">${escapeHtml(title)}</span>
                <span class="chart-type-badge">${typeStr}</span>
            </div>
            <div class="plotly-wrap" id="plotly-${i}"></div>
        `;
        
        DOM.chartsGrid.appendChild(chartDiv);
        
        // Render with Plotly
        try {
            Plotly.newPlot(`plotly-${i}`, chartJson.data || [], chartJson.layout || {}, {
                responsive: true,
                displayModeBar: true,
                modeBarButtonsToRemove: ['lasso2d', 'select2d'],
                toImageButtonOptions: { format: 'png', filename: `lexaai_chart_${i + 1}` }
            });
        } catch (e) {
            document.getElementById(`plotly-${i}`).innerHTML = 
                `<div style="color: var(--coral); padding: 1rem;">Chart render error: ${e.message}</div>`;
        }
    });
    
    // Display code
    if (AppState.code && DOM.codeContent) {
        DOM.codeContent.textContent = AppState.code;
    }
}

function guessChartType(chartJson) {
    try {
        const data = chartJson.data;
        if (!data || !data[0]) return 'chart';
        
        const type = (data[0].type || '').toLowerCase();
        const typeMap = {
            'bar': 'bar', 'histogram': 'bar',
            'scatter': data[0].mode?.includes('lines') ? 'line' : 'scatter',
            'pie': 'pie', 'heatmap': 'heatmap', 'box': 'box'
        };
        
        return typeMap[type] || type || 'chart';
    } catch (e) {
        return 'chart';
    }
}

function filterChartsByType() {
    const filterValue = DOM.chartTypeFilter?.value;
    document.querySelectorAll('.chart-item').forEach(item => {
        if (!filterValue || filterValue === 'all' || item.dataset.type === filterValue) {
            item.style.display = '';
        } else {
            item.style.display = 'none';
        }
    });
}

function toggleCode() {
    if (DOM.codeBlock) DOM.codeBlock.classList.toggle('hidden');
    if (DOM.codeChevron) {
        DOM.codeChevron.style.transform = DOM.codeBlock?.classList.contains('hidden') ? '' : 'rotate(180deg)';
    }
}

// ── AI Insights ──────────────────────────────────────────────
async function generateInsights() {
    if (!AppState.sessionId) {
        showToast('Error', 'Upload a file first.', true);
        return;
    }
    
    const btn = DOM.genInsightsBtn;
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';
    }
    
    try {
        const response = await fetch(`${API}/api/generate-insights/${AppState.sessionId}`, { method: 'POST' });
        const data = await response.json();
        
        if (!response.ok) throw new Error(data.detail || 'Failed');
        
        AppState.insights = data.insights;
        renderInsightContent(data.insights);
        showToast('Success', 'Insights generated!');
        
    } catch (err) {
        showToast('Error', err.message, true);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-magic"></i> Regenerate Insights';
        }
    }
}

function renderInsightContent(markdown) {
    if (!DOM.insightContent) return;
    
    let html = markdown
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/^## (.*)$/gm, '<h2>$1</h2>')
        .replace(/^### (.*)$/gm, '<h3>$1</h3>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/^- (.*)$/gm, '<li>$1</li>')
        .replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>')
        .replace(/\n\n/g, '</p><p>')
        .replace(/\n/g, '<br>');
    
    DOM.insightContent.innerHTML = `<div class="insight-body">${html}</div>`;
}

function renderAnalysisPanel() {
    if (!AppState.sessionId) return;
    
    const noMsg = document.getElementById('noAnalysisMsg');
    const wrap = document.getElementById('analysisWrap');
    
    if (noMsg) noMsg.classList.add('hidden');
    if (wrap) wrap.classList.remove('hidden');
    
    if (AppState.insights && AppState.analysisTab === 'insights') {
        renderInsightContent(AppState.insights);
    }
}

// ── Data Summary ─────────────────────────────────────────────
function renderSummaryPanel() {
    if (!AppState.profile) return;
    
    const p = AppState.profile;
    const noMsg = document.getElementById('noSummaryMsg');
    const wrap = document.getElementById('summaryWrap');
    
    if (noMsg) noMsg.classList.add('hidden');
    if (wrap) wrap.classList.remove('hidden');
    
    // Summary cards
    const cardsContainer = document.getElementById('summaryCards');
    if (cardsContainer) {
        const cards = [
            { label: 'Total Rows', val: p.rows.toLocaleString() },
            { label: 'Columns', val: p.cols },
            { label: 'Numeric Cols', val: p.num_cols?.length || 0 },
            { label: 'Text Cols', val: p.cat_cols?.length || 0 },
            { label: 'Missing Values', val: p.total_nulls },
            { label: 'Duplicates', val: p.duplicates },
            { label: 'Null %', val: `${p.null_pct}%` },
            { label: 'Memory', val: `${p.memory_mb} MB` }
        ];
        
        cardsContainer.innerHTML = cards.map(c => `
            <div class="summary-card">
                <div class="summary-card-label">${c.label}</div>
                <div class="summary-card-val">${c.val}</div>
            </div>
        `).join('');
    }
    
    // Column profiles table
    const dataTable = document.getElementById('dataTable');
    if (dataTable && p.columns) {
        const headers = ['Column', 'Type', 'Nulls', 'Unique', 'Stats'];
        const thead = `<thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>`;
        
        const tbody = `<tbody>${p.columns.map(col => {
            const typeColor = col.type === 'numeric' ? '#10b981' : '#f59e0b';
            let stats = col.type === 'numeric'
                ? `min: ${col.min || '—'} · mean: ${col.mean || '—'} · max: ${col.max || '—'}`
                : `top: ${col.top_value || '—'}`;
            
            return `<tr>
                <td><strong>${escapeHtml(col.name)}</strong></td>
                <td><span style="color:${typeColor};font-size:0.75rem">${col.type}</span></td>
                <td>${col.nulls} (${col.null_pct}%)</td>
                <td>${col.unique}</td>
                <td style="font-size:0.75rem;color:var(--text-tertiary)">${escapeHtml(stats)}</td>
            </tr>`;
        }).join('')}</tbody>`;
        
        dataTable.innerHTML = thead + tbody;
    }
    
    // Preview table
    const previewTable = document.getElementById('previewTable');
    if (previewTable && AppState.preview?.length) {
        const cols = Object.keys(AppState.preview[0]);
        const thead = `<thead><tr>${cols.map(c => `<th>${escapeHtml(c)}</th>`).join('')}</tr></thead>`;
        const tbody = `<tbody>${AppState.preview.map(row => `
            <tr>${cols.map(c => `<td>${escapeHtml(String(row[c] || ''))}</td>`).join('')}</tr>
        `).join('')}</tbody>`;
        
        previewTable.innerHTML = thead + tbody;
    }
}

// ── Export Functions ─────────────────────────────────────────
function renderExportPanel() {
    if (!AppState.sessionId) return;
    
    const summary = document.getElementById('expSummary');
    if (summary) summary.style.display = 'block';
    
    const cardsContainer = document.getElementById('exportSummaryCards');
    if (cardsContainer) {
        const cards = [
            { label: 'Dataset', val: AppState.profile ? `${AppState.profile.rows} × ${AppState.profile.cols}` : '—' },
            { label: 'Charts', val: AppState.chartsData.length },
            { label: 'Insights', val: AppState.insights ? '✅ Ready' : '⏳ Pending' },
            { label: 'Messages', val: `${Math.floor(AppState.chatHistory.length / 2)} turns` }
        ];
        
        cardsContainer.innerHTML = cards.map(c => `
            <div class="summary-card">
                <div class="summary-card-label">${c.label}</div>
                <div class="summary-card-val">${c.val}</div>
            </div>
        `).join('');
    }
}

async function exportPDF() {
    if (!AppState.sessionId) {
        showToast('Error', 'No session active.', true);
        return;
    }
    if (!AppState.insights) {
        showToast('Info', 'Generate insights first!');
        return;
    }
    
    const btn = document.getElementById('exportPdfBtn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Building PDF...';
    }
    
    try {
        const response = await fetch(`${API}/api/export-pdf/${AppState.sessionId}`);
        if (!response.ok) throw new Error('PDF generation failed');
        
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'lexaai_report.pdf';
        a.click();
        URL.revokeObjectURL(url);
        
        showToast('Success', 'PDF report downloaded!');
    } catch (err) {
        showToast('Error', err.message, true);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-download"></i> Download PDF';
        }
    }
}

async function exportCSV() {
    if (!AppState.sessionId) {
        showToast('Error', 'No session active.', true);
        return;
    }
    
    const btn = document.getElementById('exportCsvBtn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Preparing CSV...';
    }
    
    try {
        const response = await fetch(`${API}/api/export-csv/${AppState.sessionId}`);
        if (!response.ok) throw new Error('CSV export failed');
        
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'lexaai_data.csv';
        a.click();
        URL.revokeObjectURL(url);
        
        showToast('Success', 'CSV file downloaded!');
    } catch (err) {
        showToast('Error', err.message, true);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-download"></i> Download CSV';
        }
    }
}

// ── AI Chat Functions ────────────────────────────────────────
async function sendMessage() {
    const input = DOM.chatInput;
    const text = input?.value.trim();
    if (!text) return;
    
    if (input) input.value = '';
    addUserMessage(text);
    
    if (!AppState.sessionId) {
        addBotMessage('⚠️ Please upload a dataset first before asking questions!');
        return;
    }
    
    addTypingIndicator();
    
    try {
        const response = await fetch(`${API}/api/chat/${AppState.sessionId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: text, include_charts_context: true })
        });
        
        const data = await response.json();
        removeTypingIndicator();
        
        if (data.detail) {
            addBotMessage(`❌ ${data.detail}`);
        } else {
            AppState.chatHistory = data.history;
            addBotMessage(formatMarkdown(data.answer));
        }
    } catch (err) {
        removeTypingIndicator();
        addBotMessage(`❌ Network error: ${err.message}`);
    }
}

function sendSuggestion(text) {
    const input = DOM.chatInput;
    if (input) input.value = text;
    sendMessage();
}

async function loadAISuggestions() {
    if (!AppState.sessionId) {
        showToast('Info', 'Upload a file to get AI suggestions.');
        return;
    }
    
    const btn = document.getElementById('suggestAiBtn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    }
    
    try {
        const response = await fetch(`${API}/api/suggest-questions/${AppState.sessionId}`);
        const data = await response.json();
        
        const suggestions = data.questions || [
            'What are the key insights from this data?',
            'Which columns have the most missing values?',
            'What is the distribution of numeric columns?',
            'Are there any outliers in the data?',
            'What correlations can you find?'
        ];
        
        const container = DOM.chatSuggestions;
        if (container) {
            // Remove old AI suggestions
            container.querySelectorAll('.ai-chip').forEach(c => c.remove());
            
            suggestions.forEach(q => {
                const chip = document.createElement('button');
                chip.className = 'chip ai-chip';
                chip.textContent = q.length > 40 ? q.substring(0, 37) + '...' : q;
                chip.onclick = () => sendSuggestion(q);
                container.insertBefore(chip, document.getElementById('suggestAiBtn'));
            });
        }
        
        showToast('Success', 'AI suggestions loaded!');
    } catch (err) {
        showToast('Error', err.message, true);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-magic"></i> AI Questions';
        }
    }
}

// ── Chat UI Helpers ──────────────────────────────────────────
function addBotMessage(html) {
    const msgs = DOM.chatMessages;
    if (!msgs) return;
    
    const row = document.createElement('div');
    row.className = 'chat-row';
    row.innerHTML = `
        <div class="chat-av bot"><i class="fas fa-robot"></i></div>
        <div class="chat-bub bot">${html}</div>
    `;
    msgs.appendChild(row);
    msgs.scrollTop = msgs.scrollHeight;
}

function addUserMessage(text) {
    const msgs = DOM.chatMessages;
    if (!msgs) return;
    
    const row = document.createElement('div');
    row.className = 'chat-row user';
    row.innerHTML = `
        <div class="chat-av user"><i class="fas fa-user"></i></div>
        <div class="chat-bub user">${escapeHtml(text)}</div>
    `;
    msgs.appendChild(row);
    msgs.scrollTop = msgs.scrollHeight;
}

function addTypingIndicator() {
    const msgs = DOM.chatMessages;
    if (!msgs) return;
    
    const row = document.createElement('div');
    row.className = 'chat-row';
    row.id = 'typingIndicator';
    row.innerHTML = `
        <div class="chat-av bot"><i class="fas fa-robot"></i></div>
        <div class="chat-bub bot">
            <div class="typing-dots"><span></span><span></span><span></span></div>
        </div>
    `;
    msgs.appendChild(row);
    msgs.scrollTop = msgs.scrollHeight;
}

function removeTypingIndicator() {
    const el = document.getElementById('typingIndicator');
    if (el) el.remove();
}

function formatMarkdown(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/^## (.*)$/gm, '<strong>$1</strong>')
        .replace(/^- (.*)$/gm, '• $1')
        .replace(/\n/g, '<br>');
}

// ── Utility Functions ────────────────────────────────────────
function setStatus(type, text) {
    const pill = DOM.statusPill;
    if (!pill) return;
    
    const dot = pill.querySelector('.sdot');
    if (dot) {
        dot.className = `sdot ${type}`;
    }
    pill.innerHTML = `<span class="sdot ${type}"></span> ${text}`;
}

function showLoader(text) {
    if (DOM.loaderText) DOM.loaderText.textContent = text || 'Processing...';
    if (DOM.loadingOverlay) DOM.loadingOverlay.classList.remove('hidden');
}

function updateLoaderText(text) {
    if (DOM.loaderText) DOM.loaderText.textContent = text;
}

function hideLoader() {
    if (DOM.loadingOverlay) DOM.loadingOverlay.classList.add('hidden');
}

function showToast(title, msg, isError = false) {
    const toast = DOM.toast;
    if (!toast) return;
    
    const icon = toast.querySelector('.toast-icon');
    const titleEl = toast.querySelector('strong');
    const msgEl = toast.querySelector('p');
    
    if (icon) {
        icon.className = `toast-icon ${isError ? 'fas fa-times-circle error' : 'fas fa-check-circle success'}`;
    }
    if (titleEl) titleEl.textContent = title || (isError ? 'Error' : 'Success');
    if (msgEl) msgEl.textContent = msg || '';
    
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 4000);
}

function closeToast() {
    if (DOM.toast) DOM.toast.classList.remove('show');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function animateCounter(elementId, targetValue, duration) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    let start = 0;
    const increment = targetValue / (duration / 16);
    const isPercent = elementId === 'ctr3';
    
    const timer = setInterval(() => {
        start += increment;
        if (start >= targetValue) {
            element.textContent = isPercent ? `${Math.floor(targetValue)}%` : Math.floor(targetValue).toLocaleString();
            clearInterval(timer);
        } else {
            element.textContent = isPercent ? `${Math.floor(start)}%` : Math.floor(start).toLocaleString();
        }
    }, 16);
}

function initNavbarScroll() {
    window.addEventListener('scroll', () => {
        if (DOM.navbar) {
            DOM.navbar.classList.toggle('scrolled', window.scrollY > 30);
        }
    });
}

// Hamburger menu
if (DOM.hamburger) {
    DOM.hamburger.addEventListener('click', () => {
        if (DOM.mobileMenu) DOM.mobileMenu.classList.toggle('open');
    });
}

// ── Consultancy Modal ────────────────────────────────────────
function openModal(name, role) {
    const modal = document.getElementById('consultModal');
    const nameEl = document.getElementById('modalName');
    const roleEl = document.getElementById('modalRole');
    
    if (nameEl) nameEl.textContent = name;
    if (roleEl) roleEl.textContent = role;
    if (modal) {
        modal.classList.add('open');
        document.body.style.overflow = 'hidden';
    }
}

function closeModal() {
    const modal = document.getElementById('consultModal');
    if (modal) {
        modal.classList.remove('open');
        document.body.style.overflow = '';
    }
}

function submitModal(e) {
    e.preventDefault();
    closeModal();
    showToast('Request Sent!', "You'll receive an email with meeting details within 24 hours.");
}

// Close modal on outside click
document.getElementById('consultModal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModal();
});

// Export for use in other files
window.navigateTo = navigateTo;
window.switchDash = switchDash;
window.switchAnalysisTab = switchAnalysisTab;
window.generateInsights = generateInsights;
window.regenerateCharts = regenerateCharts;
window.requestCustomChart = requestCustomChart;
window.exportPDF = exportPDF;
window.exportCSV = exportCSV;
window.sendMessage = sendMessage;
window.sendSuggestion = sendSuggestion;
window.loadAISuggestions = loadAISuggestions;
window.toggleCode = toggleCode;
window.openModal = openModal;
window.closeModal = closeModal;
window.submitModal = submitModal;