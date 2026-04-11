import http from "node:http";
import { exec } from "node:child_process";
import chalk from "chalk";
import {
  getResourceState,
  probeAll,
  fetchModelEvals,
  fetchOllamaModelInfo,
  listBenchRuns,
  loadBenchRun,
} from "@mwoc/core";
import type { StateCache } from "@mwoc/core";

const PORT = 18799;

// ---------------------------------------------------------------------------
// HTML template
// ---------------------------------------------------------------------------

function buildHtml(port: number): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MWoC Dashboard</title>
  <style>
    :root {
      --bg: #0d1117;
      --surface: #161b22;
      --surface2: #1c2128;
      --border: #30363d;
      --text: #c9d1d9;
      --text-dim: #8b949e;
      --frontier: #a78bfa;
      --mid: #60a5fa;
      --local-large: #34d399;
      --local-small: #6b7280;
      --available: #22c55e;
      --unavailable: #ef4444;
      --unknown: #f59e0b;
      --accent: #a78bfa;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
      font-size: 13px;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }

    /* ── Header ── */
    header {
      border-bottom: 1px solid var(--border);
      padding: 14px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
    }
    .logo { font-size: 15px; font-weight: 700; color: #fff; letter-spacing: -0.3px; }
    .logo span { color: var(--frontier); }
    .header-right { display: flex; align-items: center; gap: 14px; }
    .last-probed { color: var(--text-dim); font-size: 11px; }
    .probing-indicator { font-size: 11px; color: var(--frontier); display: none; }
    .btn {
      background: var(--surface);
      border: 1px solid var(--border);
      color: var(--text);
      padding: 5px 12px;
      cursor: pointer;
      font-family: inherit;
      font-size: 12px;
      border-radius: 4px;
      transition: border-color 0.15s, color 0.15s;
    }
    .btn:hover { border-color: var(--frontier); color: var(--frontier); }
    .btn:disabled { opacity: 0.45; cursor: not-allowed; }

    /* ── Tab bar ── */
    .tab-bar {
      display: flex;
      border-bottom: 1px solid var(--border);
      padding: 0 24px;
      flex-shrink: 0;
    }
    .tab {
      padding: 10px 16px;
      font-size: 12px;
      color: var(--text-dim);
      cursor: pointer;
      border-bottom: 2px solid transparent;
      margin-bottom: -1px;
      transition: color 0.15s, border-color 0.15s;
    }
    .tab:hover { color: var(--text); }
    .tab.active { color: var(--accent); border-bottom-color: var(--accent); }

    /* ── Stats row ── */
    .stats-row { display: flex; border-bottom: 1px solid var(--border); flex-shrink: 0; }
    .stat {
      flex: 1;
      padding: 12px 24px;
      border-right: 1px solid var(--border);
      cursor: default;
    }
    .stat:last-child { border-right: none; }
    .stat.clickable { cursor: pointer; }
    .stat.clickable:hover .stat-value { color: var(--accent); }
    .stat-value { font-size: 22px; font-weight: 700; color: #fff; transition: color 0.15s; }
    .stat-label { font-size: 11px; color: var(--text-dim); margin-top: 2px; }

    /* ── Main content ── */
    .main { padding: 24px; flex: 1; overflow-y: auto; }
    .section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
    }
    .section-title {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: var(--text-dim);
    }
    .tier-legend { display: flex; gap: 14px; flex-wrap: wrap; }
    .legend-item { display: flex; align-items: center; gap: 5px; font-size: 11px; color: var(--text-dim); }
    .tier-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
    .tier-dot.frontier   { background: var(--frontier); }
    .tier-dot.mid        { background: var(--mid); }
    .tier-dot.local-large { background: var(--local-large); }
    .tier-dot.local-small { background: var(--local-small); }

    /* ── Resource cards ── */
    .resource-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 12px;
    }
    .resource-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-left-width: 3px;
      border-radius: 6px;
      padding: 14px 16px;
    }
    .resource-card.available   { border-left-color: var(--available); }
    .resource-card.unavailable { border-left-color: var(--unavailable); }
    .resource-card.unknown     { border-left-color: var(--unknown); }
    .card-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      margin-bottom: 10px;
    }
    .card-name { font-weight: 600; color: #fff; font-size: 13px; }
    .card-type { font-size: 10px; color: var(--text-dim); margin-top: 2px; }
    .status-badge {
      font-size: 10px;
      padding: 2px 7px;
      border-radius: 3px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      flex-shrink: 0;
    }
    .status-badge.available   { background: rgba(34,197,94,0.12);  color: var(--available); }
    .status-badge.unavailable { background: rgba(239,68,68,0.12);  color: var(--unavailable); }
    .status-badge.unknown     { background: rgba(245,158,11,0.12); color: var(--unknown); }
    .card-endpoint { font-size: 11px; color: var(--text-dim); margin-bottom: 10px; word-break: break-all; }
    .divider { border: none; border-top: 1px solid var(--border); margin: 10px 0; }
    .models-list { display: flex; flex-direction: column; gap: 5px; }
    .model-row-inline { display: flex; align-items: center; gap: 7px; font-size: 11px; }
    .model-id-text { color: var(--text); }
    .model-ctx { color: var(--text-dim); }
    .no-models { font-size: 11px; color: var(--text-dim); font-style: italic; }
    .error-msg { font-size: 11px; color: var(--unavailable); margin-top: 8px; opacity: 0.85; }

    /* ── Models list view ── */
    .models-table {
      width: 100%;
      border-collapse: collapse;
    }
    .models-table thead tr {
      border-bottom: 1px solid var(--border);
    }
    .models-table th {
      text-align: left;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: var(--text-dim);
      padding: 6px 12px;
      user-select: none;
      transition: color 0.15s;
    }
    .models-table th:first-child { padding-left: 4px; }
    .models-table th:hover { color: var(--text); }
    .model-list-row {
      border-bottom: 1px solid var(--border);
      cursor: pointer;
      transition: background 0.1s;
    }
    .model-list-row:hover { background: var(--surface); }
    .model-list-row.expanded { background: var(--surface); }
    .model-list-row td {
      padding: 9px 12px;
      font-size: 12px;
      vertical-align: middle;
    }
    .model-list-row td:first-child { padding-left: 4px; }
    .model-name-cell {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .expand-arrow {
      font-size: 10px;
      color: var(--text-dim);
      width: 12px;
      display: inline-block;
      transition: transform 0.15s;
    }
    .expand-arrow.open { transform: rotate(90deg); }
    .tier-badge {
      font-size: 10px;
      padding: 1px 6px;
      border-radius: 3px;
      font-weight: 600;
    }
    .tier-badge.frontier   { background: rgba(167,139,250,0.15); color: var(--frontier); }
    .tier-badge.mid        { background: rgba(96,165,250,0.15);  color: var(--mid); }
    .tier-badge.local-large { background: rgba(52,211,153,0.15); color: var(--local-large); }
    .tier-badge.local-small { background: rgba(107,114,128,0.15); color: var(--local-small); }
    .source-cell { color: var(--text-dim); font-size: 11px; }
    .ctx-cell { color: var(--text-dim); font-size: 11px; }

    /* ── Accordion detail row ── */
    .detail-row { display: none; }
    .detail-row.open { display: table-row; }
    .detail-cell {
      padding: 0 !important;
      border-bottom: 2px solid var(--border);
    }
    .detail-inner {
      padding: 16px 20px 20px;
      background: var(--surface2);
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 20px;
    }
    .detail-section { }
    .detail-section-title {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: var(--text-dim);
      margin-bottom: 10px;
      border-bottom: 1px solid var(--border);
      padding-bottom: 6px;
    }
    .detail-kv { display: flex; flex-direction: column; gap: 5px; }
    .detail-kv-row { display: flex; justify-content: space-between; gap: 8px; font-size: 11px; }
    .detail-key { color: var(--text-dim); flex-shrink: 0; }
    .detail-val { color: var(--text); text-align: right; word-break: break-all; }
    .eval-table { width: 100%; font-size: 11px; border-collapse: collapse; }
    .eval-table td { padding: 3px 0; }
    .eval-table td:last-child { text-align: right; color: var(--text); }
    .eval-table td:first-child { color: var(--text-dim); }
    .eval-score { font-weight: 600; }
    .elo-block { margin-bottom: 12px; }
    .elo-score { font-size: 20px; font-weight: 700; color: var(--text); }
    .elo-sub { font-size: 11px; color: var(--text-dim); margin-top: 2px; }
    .hf-match { font-size: 10px; color: var(--text-dim); margin-bottom: 10px; }
    .hf-match a { color: var(--accent); text-decoration: none; }
    .hf-match a:hover { text-decoration: underline; }
    .detail-empty { font-size: 11px; color: var(--text-dim); font-style: italic; }
    .bench-stub {
      font-size: 11px;
      color: var(--text-dim);
      padding: 6px 10px;
      background: rgba(107,114,128,0.08);
      border: 1px solid var(--border);
      border-radius: 4px;
    }
    .bench-stub code {
      color: var(--text);
      background: rgba(255,255,255,0.06);
      padding: 1px 5px;
      border-radius: 3px;
      font-family: inherit;
    }
    .bench-metric { }
    .bench-toks { font-size: 20px; font-weight: 700; color: var(--text); }
    .bench-toks-label { font-size: 11px; color: var(--text-dim); margin-top: 2px; }
    .bench-meta { font-size: 11px; color: var(--text-dim); margin-top: 8px; }
    .bench-mem { font-size: 11px; color: var(--text-dim); margin-top: 4px; }
    .bench-history { width: 100%; font-size: 11px; border-collapse: collapse; margin-top: 10px; }
    .bench-history td { padding: 3px 0; }
    .bench-history td:last-child { text-align: right; color: var(--text); }
    .bench-history td:first-child { color: var(--text-dim); }
    .bench-history td:nth-child(2) { color: var(--text-dim); padding: 0 8px; }
    .skeleton {
      height: 11px;
      background: linear-gradient(90deg, var(--surface) 25%, var(--surface2) 50%, var(--surface) 75%);
      background-size: 200% 100%;
      border-radius: 3px;
      margin-bottom: 5px;
      animation: shimmer 1.4s infinite;
    }
    @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

    /* ── Empty / loading states ── */
    .empty-state { text-align: center; padding: 56px 24px; color: var(--text-dim); }
    .empty-state h2 { color: var(--text); margin-bottom: 6px; font-size: 16px; }
    .empty-state code {
      background: var(--surface);
      border: 1px solid var(--border);
      padding: 1px 6px;
      border-radius: 3px;
      font-family: inherit;
    }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
    .pulse { animation: pulse 1.4s ease-in-out infinite; }

    /* ── Footer ── */
    footer {
      border-top: 1px solid var(--border);
      padding: 10px 24px;
      font-size: 11px;
      color: var(--text-dim);
      display: flex;
      justify-content: space-between;
      flex-shrink: 0;
      background: var(--bg);
    }
  </style>
</head>
<body>
  <header>
    <div class="logo">My World of <span>Compute</span></div>
    <div class="header-right">
      <span class="last-probed" id="last-probed">Loading…</span>
      <span class="probing-indicator" id="probing-indicator">⟳ Probing…</span>
      <button class="btn" id="probe-btn" onclick="triggerProbe()">Probe All</button>
    </div>
  </header>

  <div class="tab-bar">
    <div class="tab active" id="tab-resources" onclick="switchTab('resources')">Resources</div>
    <div class="tab" id="tab-models" onclick="switchTab('models')">Models</div>
  </div>

  <div class="stats-row">
    <div class="stat"><div class="stat-value" id="stat-total">—</div><div class="stat-label">Resources</div></div>
    <div class="stat"><div class="stat-value" id="stat-available">—</div><div class="stat-label">Available</div></div>
    <div class="stat clickable" id="stat-models-card" onclick="switchTab('models')">
      <div class="stat-value" id="stat-models">—</div><div class="stat-label">Models</div>
    </div>
    <div class="stat"><div class="stat-value" id="stat-frontier">—</div><div class="stat-label">Frontier</div></div>
  </div>

  <div class="main" id="main">
    <!-- Resources view -->
    <div id="view-resources">
      <div class="section-header">
        <span class="section-title">Resources</span>
        <div class="tier-legend">
          <div class="legend-item"><div class="tier-dot frontier"></div>Frontier</div>
          <div class="legend-item"><div class="tier-dot mid"></div>Mid</div>
          <div class="legend-item"><div class="tier-dot local-large"></div>Local-large</div>
          <div class="legend-item"><div class="tier-dot local-small"></div>Local-small</div>
        </div>
      </div>
      <div class="resource-grid" id="resource-grid">
        <div class="empty-state"><div class="pulse">Loading…</div></div>
      </div>
    </div>

    <!-- Models view -->
    <div id="view-models" style="display:none">
      <div class="section-header">
        <span class="section-title">All Models</span>
        <div class="tier-legend">
          <div class="legend-item"><div class="tier-dot frontier"></div>Frontier</div>
          <div class="legend-item"><div class="tier-dot mid"></div>Mid</div>
          <div class="legend-item"><div class="tier-dot local-large"></div>Local-large</div>
          <div class="legend-item"><div class="tier-dot local-small"></div>Local-small</div>
        </div>
      </div>
      <div id="models-table-container">
        <div class="empty-state"><div class="pulse">Loading…</div></div>
      </div>
    </div>
  </div>

  <footer>
    <span>mwoc dash — localhost:${port}</span>
    <span id="refresh-countdown">Refreshes in 5s</span>
  </footer>

  <script>
    // ── State ──────────────────────────────────────────────────────────────
    let currentState = null;
    let currentView = 'resources';
    let expandedRow = null;       // modelKey of the currently open accordion
    let expandCache = {};         // modelKey → { info, evals } (session cache)
    let sortState = { col: 'tier', dir: 'asc' };
    let countdown = 5;
    let countdownTimer = null;

    // ── Utilities ─────────────────────────────────────────────────────────
    function esc(s) {
      return String(s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function formatAge(iso) {
      const d = Date.now() - new Date(iso).getTime();
      const m = Math.floor(d / 60000);
      if (m < 1) return 'just now';
      if (m < 60) return m + 'm ago';
      const h = Math.floor(m / 60);
      if (h < 24) return h + 'h ago';
      return Math.floor(h / 24) + 'd ago';
    }
    function modelKey(modelId, resourceName) {
      return resourceName + '/' + modelId;
    }

    // ── Tab switching ──────────────────────────────────────────────────────
    function switchTab(view) {
      currentView = view;
      document.getElementById('tab-resources').classList.toggle('active', view === 'resources');
      document.getElementById('tab-models').classList.toggle('active', view === 'models');
      document.getElementById('view-resources').style.display = view === 'resources' ? '' : 'none';
      document.getElementById('view-models').style.display = view === 'models' ? '' : 'none';
      if (view === 'models' && currentState) renderModels(currentState);
    }

    // ── Stats ──────────────────────────────────────────────────────────────
    function updateStats(state) {
      if (!state) {
        ['stat-total','stat-available','stat-models','stat-frontier'].forEach(id => {
          document.getElementById(id).textContent = '0';
        });
        document.getElementById('last-probed').textContent = 'Never probed';
        return;
      }
      document.getElementById('last-probed').textContent = 'Probed ' + formatAge(state.probedAt);
      const available = state.resources.filter(r => r.status === 'available');
      const allModels = available.flatMap(r => r.models);
      document.getElementById('stat-total').textContent = state.resources.length;
      document.getElementById('stat-available').textContent = available.length;
      document.getElementById('stat-models').textContent = allModels.length;
      document.getElementById('stat-frontier').textContent = allModels.filter(m => m.tier === 'frontier').length;
    }

    // ── Resources view ─────────────────────────────────────────────────────
    function renderResources(state) {
      const grid = document.getElementById('resource-grid');
      if (!state) {
        grid.innerHTML = '<div class="empty-state"><h2>No state found</h2><p>Run <code>mwoc probe</code> to scan your resources.</p></div>';
        return;
      }
      if (state.resources.length === 0) {
        grid.innerHTML = '<div class="empty-state"><h2>No resources declared</h2><p>Run <code>mwoc resource add</code> to add one.</p></div>';
        return;
      }
      grid.innerHTML = state.resources.map(r => {
        const status = r.status;
        const res = r.resource;
        const typeLabel = res.type === 'local' ? 'local'
          : res.type === 'server' ? 'server'
          : (res.webOnly ? 'web subscription' : 'cloud api');
        const endpoint = res.type === 'local' ? res.endpoint
          : res.type === 'server' ? res.endpoint
          : res.provider;
        const modelsHtml = r.models.length > 0
          ? '<hr class="divider">' + r.models.map(m => {
              const ctx = m.contextWindow ? ' <span class="model-ctx">(' + (m.contextWindow/1000).toFixed(0) + 'k)</span>' : '';
              return '<div class="model-row-inline"><div class="tier-dot ' + esc(m.tier) + '"></div>'
                + '<span class="model-id-text">' + esc(m.modelId) + '</span>' + ctx + '</div>';
            }).join('') : '';
        const emptyModels = r.models.length === 0
          ? '<hr class="divider"><div class="no-models">'
            + (status === 'unavailable' ? 'Unreachable' : 'No models discovered') + '</div>' : '';
        const errorHtml = r.error && status === 'unavailable'
          ? '<div class="error-msg">' + esc(r.error.slice(0, 90)) + '</div>' : '';
        return '<div class="resource-card ' + status + '">'
          + '<div class="card-header"><div><div class="card-name">' + esc(res.name) + '</div>'
          + '<div class="card-type">' + esc(typeLabel) + '</div></div>'
          + '<span class="status-badge ' + status + '">' + esc(status) + '</span></div>'
          + '<div class="card-endpoint">' + esc(endpoint) + '</div>'
          + modelsHtml + emptyModels + errorHtml + '</div>';
      }).join('');
    }

    // ── Sorting ────────────────────────────────────────────────────────────
    function setSort(col) {
      if (sortState.col === col) {
        sortState.dir = sortState.dir === 'asc' ? 'desc' : 'asc';
      } else {
        sortState.col = col;
        // Default directions: context descending (largest first), others ascending
        sortState.dir = col === 'context' ? 'desc' : 'asc';
      }
      if (currentState) renderModels(currentState);
    }

    function sortArrow(col) {
      if (sortState.col !== col) return ' <span style="opacity:0.3">↕</span>';
      return sortState.dir === 'asc' ? ' <span style="opacity:0.8">▲</span>' : ' <span style="opacity:0.8">▼</span>';
    }

    // ── Models view ────────────────────────────────────────────────────────
    function renderModels(state) {
      const container = document.getElementById('models-table-container');
      if (!state) {
        container.innerHTML = '<div class="empty-state"><h2>No state found</h2><p>Run <code>mwoc probe</code> first.</p></div>';
        return;
      }
      const tierOrder = ['frontier', 'mid', 'local-large', 'local-small'];
      const allModels = state.resources
        .filter(r => r.status === 'available')
        .flatMap(r => r.models.map(m => ({ ...m, resourceName: r.resource.name, resourceType: r.resource.type })));

      // Apply sort
      allModels.sort((a, b) => {
        let cmp = 0;
        if (sortState.col === 'tier') {
          cmp = tierOrder.indexOf(a.tier) - tierOrder.indexOf(b.tier);
        } else if (sortState.col === 'model') {
          cmp = a.modelId.localeCompare(b.modelId);
        } else if (sortState.col === 'source') {
          cmp = a.resourceName.localeCompare(b.resourceName);
        } else if (sortState.col === 'context') {
          cmp = (a.contextWindow ?? 0) - (b.contextWindow ?? 0);
        }
        return sortState.dir === 'asc' ? cmp : -cmp;
      });

      if (allModels.length === 0) {
        container.innerHTML = '<div class="empty-state"><h2>No models available</h2><p>Run <code>mwoc probe</code> to discover models.</p></div>';
        return;
      }

      let rows = '';
      for (const m of allModels) {
        const key = modelKey(m.modelId, m.resourceName);
        const safeKey = esc(key);
        const ctx = m.contextWindow ? (m.contextWindow/1000).toFixed(0) + 'k' : '—';
        const isOpen = expandedRow === key;
        // Bug fix: use esc(JSON.stringify(...)) so inner " become &quot; inside the onclick attribute
        const onclickArgs = esc(JSON.stringify(key)) + ', ' + esc(JSON.stringify(m.modelId)) + ', ' + esc(JSON.stringify(m.resourceName));
        rows += '<tr class="model-list-row' + (isOpen ? ' expanded' : '') + '" onclick="toggleExpand(' + onclickArgs + ')" id="mrow-' + safeKey + '">'
          + '<td><div class="model-name-cell">'
          + '<span class="expand-arrow' + (isOpen ? ' open' : '') + '">▶</span>'
          + '<div class="tier-dot ' + esc(m.tier) + '"></div>'
          + '<span>' + esc(m.modelId) + '</span>'
          + '</div></td>'
          + '<td><span class="tier-badge ' + esc(m.tier) + '">' + esc(m.tier) + '</span></td>'
          + '<td class="source-cell">' + esc(m.resourceName) + '</td>'
          + '<td class="ctx-cell">' + ctx + '</td>'
          + '</tr>';
        rows += '<tr class="detail-row' + (isOpen ? ' open' : '') + '" id="drow-' + safeKey + '">'
          + '<td class="detail-cell" colspan="4">'
          + '<div class="detail-inner" id="detail-inner-' + safeKey + '">'
          + (isOpen && expandCache[key] ? renderDetailContent(m, expandCache[key]) : skeletonDetail())
          + '</div></td></tr>';
      }

      container.innerHTML = '<table class="models-table">'
        + '<thead><tr>'
        + '<th onclick="setSort(\\'model\\')" style="cursor:pointer">Model' + sortArrow('model') + '</th>'
        + '<th onclick="setSort(\\'tier\\')" style="cursor:pointer">Tier' + sortArrow('tier') + '</th>'
        + '<th onclick="setSort(\\'source\\')" style="cursor:pointer">Source' + sortArrow('source') + '</th>'
        + '<th onclick="setSort(\\'context\\')" style="cursor:pointer">Context' + sortArrow('context') + '</th>'
        + '</tr></thead>'
        + '<tbody>' + rows + '</tbody></table>';
    }

    function skeletonDetail() {
      return '<div class="detail-section"><div class="detail-section-title">Metadata</div>'
        + '<div class="skeleton" style="width:80%"></div><div class="skeleton" style="width:60%"></div><div class="skeleton" style="width:70%"></div></div>'
        + '<div class="detail-section"><div class="detail-section-title">Capabilities</div>'
        + '<div class="skeleton" style="width:90%"></div><div class="skeleton" style="width:50%"></div><div class="skeleton" style="width:75%"></div></div>'
        + '<div class="detail-section"><div class="detail-section-title">Performance</div>'
        + '<div class="skeleton" style="width:80%"></div></div>';
    }

    function renderDetailContent(model, cache) {
      const info = cache.info;
      const evals = cache.evals;

      // ── Metadata section ──
      let metaHtml = '<div class="detail-section"><div class="detail-section-title">Metadata</div><div class="detail-kv">';
      if (info && !info.error) {
        metaHtml += kvRow('Family', info.family);
        metaHtml += kvRow('Parameters', info.parameterSize);
        metaHtml += kvRow('Quantization', info.quantizationLevel);
        metaHtml += kvRow('Format', info.format);
      }
      if (model.contextWindow) metaHtml += kvRow('Context', (model.contextWindow/1000).toFixed(0) + 'k tokens');
      if (model.description) metaHtml += kvRow('Tier description', model.description);
      if (!info && !model.contextWindow && !model.description) {
        metaHtml += '<div class="detail-empty">No metadata available</div>';
      }
      metaHtml += '</div></div>';

      // ── Capabilities section ──
      let capsHtml = '<div class="detail-section"><div class="detail-section-title">Capabilities</div>';
      if (evals && !evals.error) {
        if (evals.hfModelId) {
          capsHtml += '<div class="hf-match">Matched to: <a href="https://huggingface.co/' + esc(evals.hfModelId) + '" target="_blank">' + esc(evals.hfModelId) + '</a>'
            + (evals.hfMatchConfidence === 'auto' ? ' <span style="opacity:0.6">(auto)</span>' : '') + '</div>';
        }
        if (evals.arenaELO) {
          const elo = evals.arenaELO;
          capsHtml += '<div class="elo-block">'
            + '<div class="elo-score">' + (elo.score !== null ? elo.score.toFixed(0) : '—') + '</div>'
            + '<div class="elo-sub">Chatbot Arena ELO'
            + (elo.ci !== null ? ' ±' + elo.ci.toFixed(0) : '')
            + ' · rank #' + elo.rank
            + (elo.votes !== null ? ' · ' + elo.votes.toLocaleString() + ' votes' : '')
            + '</div></div>';
        }
        if (evals.hfEvals && evals.hfEvals.length > 0) {
          capsHtml += '<table class="eval-table">';
          for (const e of evals.hfEvals) {
            const score = (e.metricValue * (e.metricValue <= 1 ? 100 : 1)).toFixed(1) + '%';
            capsHtml += '<tr><td>' + esc(e.datasetName) + '</td><td class="eval-score">' + score + '</td></tr>';
          }
          capsHtml += '</table>';
        }
        if (!evals.arenaELO && (!evals.hfEvals || evals.hfEvals.length === 0)) {
          if (!evals.hfModelId) {
            capsHtml += '<div class="detail-empty">No HuggingFace match found for this model.</div>';
          } else {
            capsHtml += '<div class="detail-empty">No eval results found on HuggingFace or Chatbot Arena.</div>';
          }
        }
      } else if (evals && evals.error) {
        capsHtml += '<div class="detail-empty">Could not fetch eval data: ' + esc(evals.error) + '</div>';
      } else {
        capsHtml += '<div class="detail-empty">Loading…</div>';
      }
      capsHtml += '</div>';

      // ── Performance section ──
      let perfHtml = '<div class="detail-section"><div class="detail-section-title">Performance</div>';
      const bench = cache.bench;
      if (!bench) {
        perfHtml += '<div class="detail-empty">Loading…</div>';
      } else if (bench.error) {
        perfHtml += '<div class="detail-empty">Could not fetch bench data: ' + esc(bench.error) + '</div>';
      } else if (!bench.runs || bench.runs.length === 0) {
        perfHtml += '<div class="bench-stub">No benchmark data.&nbsp; Run <code>mwoc bench</code> to measure token throughput and latency.</div>';
      } else {
        const summary = bench.runs[0];
        const latest = bench.latest;
        perfHtml += '<div class="bench-metric">';
        if (summary.meanGenerationTokensPerSec !== null) {
          perfHtml += '<div class="bench-toks">' + summary.meanGenerationTokensPerSec.toFixed(1)
            + '<span style="font-size:13px;font-weight:400;color:var(--text-dim)"> tok/s</span></div>'
            + '<div class="bench-toks-label">generation throughput</div>';
        }
        if (latest && latest.memory) {
          const mem = latest.memory;
          const proc = mem.processor !== 'unknown' ? mem.processor.toUpperCase() : null;
          const modelGB = mem.modelSizeBytes ? (mem.modelSizeBytes / 1073741824).toFixed(1) + ' GB' : null;
          if (proc || modelGB) {
            perfHtml += '<div class="bench-mem">';
            if (proc) perfHtml += proc;
            if (proc && modelGB) perfHtml += ' · ';
            if (modelGB) perfHtml += 'model ' + modelGB;
            perfHtml += '</div>';
          }
        }
        perfHtml += '<div class="bench-meta">' + esc(summary.suite) + ' suite'
          + ' · ' + summary.runsPerPrompt + ' run' + (summary.runsPerPrompt !== 1 ? 's' : '') + '/prompt'
          + ' · ' + formatAge(summary.timestamp) + '</div>';
        perfHtml += '</div>';
        if (bench.runs.length > 1) {
          perfHtml += '<table class="bench-history">';
          for (const r of bench.runs.slice(0, 5)) {
            const tps = r.meanGenerationTokensPerSec !== null ? r.meanGenerationTokensPerSec.toFixed(1) + ' tok/s' : '—';
            perfHtml += '<tr><td>' + formatAge(r.timestamp) + '</td><td>' + esc(r.suite) + '</td><td>' + tps + '</td></tr>';
          }
          perfHtml += '</table>';
        }
      }
      perfHtml += '</div>';

      return metaHtml + capsHtml + perfHtml;
    }

    function kvRow(key, val) {
      return '<div class="detail-kv-row"><span class="detail-key">' + esc(key) + '</span><span class="detail-val">' + esc(val) + '</span></div>';
    }

    // ── Accordion expand/collapse ──────────────────────────────────────────
    async function toggleExpand(key, modelId, resourceName) {
      const drow = document.getElementById('drow-' + key);
      const mrow = document.getElementById('mrow-' + key);
      const arrow = mrow ? mrow.querySelector('.expand-arrow') : null;

      if (expandedRow === key) {
        // Collapse
        expandedRow = null;
        if (drow) drow.classList.remove('open');
        if (mrow) mrow.classList.remove('expanded');
        if (arrow) arrow.classList.remove('open');
        return;
      }

      // Close previous
      if (expandedRow) {
        const prev = document.getElementById('drow-' + expandedRow);
        const prevRow = document.getElementById('mrow-' + expandedRow);
        if (prev) prev.classList.remove('open');
        if (prevRow) {
          prevRow.classList.remove('expanded');
          const prevArrow = prevRow.querySelector('.expand-arrow');
          if (prevArrow) prevArrow.classList.remove('open');
        }
      }

      expandedRow = key;
      if (drow) drow.classList.add('open');
      if (mrow) mrow.classList.add('expanded');
      if (arrow) arrow.classList.add('open');

      // If already cached, just render
      if (expandCache[key]) {
        const inner = document.getElementById('detail-inner-' + key);
        const model = findModel(modelId, resourceName);
        if (inner && model) inner.innerHTML = renderDetailContent(model, expandCache[key]);
        return;
      }

      // Show skeleton, then fetch
      const inner = document.getElementById('detail-inner-' + key);
      if (inner) inner.innerHTML = skeletonDetail();

      const model = findModel(modelId, resourceName);
      const [infoRes, evalsRes, benchRes] = await Promise.allSettled([
        fetch('/api/model-info?modelId=' + encodeURIComponent(modelId) + '&resourceName=' + encodeURIComponent(resourceName)).then(r => r.json()),
        fetch('/api/evals?modelId=' + encodeURIComponent(modelId) + '&resourceName=' + encodeURIComponent(resourceName)).then(r => r.json()),
        fetch('/api/bench?modelId=' + encodeURIComponent(modelId) + '&resourceName=' + encodeURIComponent(resourceName)).then(r => r.json()),
      ]);

      expandCache[key] = {
        info: infoRes.status === 'fulfilled' ? infoRes.value : { error: infoRes.reason?.message ?? 'failed' },
        evals: evalsRes.status === 'fulfilled' ? evalsRes.value : { error: evalsRes.reason?.message ?? 'failed' },
        bench: benchRes.status === 'fulfilled' ? benchRes.value : { error: benchRes.reason?.message ?? 'failed' },
      };

      // Only re-render if this row is still open
      if (expandedRow === key) {
        const innerNow = document.getElementById('detail-inner-' + key);
        if (innerNow && model) innerNow.innerHTML = renderDetailContent(model, expandCache[key]);
      }
    }

    function findModel(modelId, resourceName) {
      if (!currentState) return null;
      const res = currentState.resources.find(r => r.resource.name === resourceName);
      if (!res) return null;
      const m = res.models.find(m => m.modelId === modelId);
      if (!m) return null;
      return { ...m, resourceName, resourceType: res.resource.type };
    }

    // ── Data fetching ──────────────────────────────────────────────────────
    async function fetchState() {
      const res = await fetch('/api/state');
      currentState = await res.json();
      updateStats(currentState);
      if (currentView === 'resources') renderResources(currentState);
      else renderModels(currentState);
    }

    async function triggerProbe() {
      const btn = document.getElementById('probe-btn');
      const indicator = document.getElementById('probing-indicator');
      btn.disabled = true;
      indicator.style.display = 'inline';
      clearInterval(countdownTimer);
      document.getElementById('refresh-countdown').textContent = 'Probing…';
      try {
        const res = await fetch('/api/probe', { method: 'POST' });
        currentState = await res.json();
        updateStats(currentState);
        expandedRow = null;
        expandCache = {};
        if (currentView === 'resources') renderResources(currentState);
        else renderModels(currentState);
      } catch (e) {
        console.error('Probe failed:', e);
      } finally {
        btn.disabled = false;
        indicator.style.display = 'none';
        startCountdown();
      }
    }

    function startCountdown() {
      countdown = 5;
      document.getElementById('refresh-countdown').textContent = 'Refreshes in 5s';
      clearInterval(countdownTimer);
      countdownTimer = setInterval(async () => {
        countdown--;
        if (countdown <= 0) {
          document.getElementById('refresh-countdown').textContent = 'Refreshing…';
          try { await fetchState(); } catch (e) { /* ignore */ }
          startCountdown();
        } else {
          document.getElementById('refresh-countdown').textContent = 'Refreshes in ' + countdown + 's';
        }
      }, 1000);
    }

    fetchState().then(() => startCountdown()).catch(() => startCountdown());
  </script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------

function getResourceFromState(state: StateCache | null, resourceName: string) {
  return state?.resources.find((r) => r.resource.name === resourceName) ?? null;
}

export async function startDashboard(): Promise<void> {
  const html = buildHtml(PORT);

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);

    // ── GET / ──────────────────────────────────────────────────────────────
    if (url.pathname === "/" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }

    // ── GET /api/state ─────────────────────────────────────────────────────
    if (url.pathname === "/api/state" && req.method === "GET") {
      const state = getResourceState();
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify(state));
      return;
    }

    // ── POST /api/probe ────────────────────────────────────────────────────
    if (url.pathname === "/api/probe" && req.method === "POST") {
      try {
        const state = await probeAll();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(state));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: String(err) }));
      }
      return;
    }

    // ── GET /api/model-info ────────────────────────────────────────────────
    if (url.pathname === "/api/model-info" && req.method === "GET") {
      const modelId = url.searchParams.get("modelId");
      const resourceName = url.searchParams.get("resourceName");
      if (!modelId || !resourceName) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "modelId and resourceName are required" }));
        return;
      }
      const state = getResourceState();
      const probedResource = getResourceFromState(state, resourceName);
      if (!probedResource || probedResource.resource.type !== "local") {
        // Not an Ollama resource — no /api/show data available
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "model-info only available for local Ollama resources" }));
        return;
      }
      const info = await fetchOllamaModelInfo(
        (probedResource.resource as { endpoint: string }).endpoint,
        modelId,
      );
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(info ?? { error: "Could not fetch model info from Ollama" }));
      return;
    }

    // ── GET /api/evals ─────────────────────────────────────────────────────
    if (url.pathname === "/api/evals" && req.method === "GET") {
      const modelId = url.searchParams.get("modelId");
      const resourceName = url.searchParams.get("resourceName");
      if (!modelId || !resourceName) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "modelId and resourceName are required" }));
        return;
      }
      const state = getResourceState();
      const probedResource = getResourceFromState(state, resourceName);
      if (!probedResource) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: `Resource "${resourceName}" not found in state` }));
        return;
      }
      try {
        const evalData = await fetchModelEvals(modelId, probedResource.resource);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(evalData));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: String(err) }));
      }
      return;
    }

    // ── GET /api/bench ─────────────────────────────────────────────────────
    if (url.pathname === "/api/bench" && req.method === "GET") {
      const modelId = url.searchParams.get("modelId");
      const resourceName = url.searchParams.get("resourceName");
      if (!modelId || !resourceName) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "modelId and resourceName are required" }));
        return;
      }
      const allRuns = listBenchRuns();
      const runs = allRuns.filter(
        (r) => r.modelId === modelId && r.resourceName === resourceName,
      );
      let latest = null;
      if (runs.length > 0) {
        try {
          latest = loadBenchRun(runs[0].id);
        } catch {
          // not critical — summaries are still returned
        }
      }
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify({ runs, latest }));
      return;
    }

    res.writeHead(404);
    res.end("Not found");
  });

  server.listen(PORT, "127.0.0.1", () => {
    const dashUrl = `http://localhost:${PORT}`;
    console.log(chalk.bold("\nMWoC Dashboard"));
    console.log(`  ${chalk.cyan(dashUrl)}\n`);
    console.log(chalk.dim("Press Ctrl+C to stop.\n"));

    const openCmd = process.platform === "darwin"
      ? `open -a "Google Chrome" "${dashUrl}" 2>/dev/null || open "${dashUrl}"`
      : process.platform === "win32"
        ? `start "" "${dashUrl}"`
        : `xdg-open "${dashUrl}"`;
    exec(openCmd);
  });

  await new Promise<void>((resolve) => {
    process.on("SIGINT", () => {
      server.close();
      console.log(chalk.dim("\nDashboard stopped."));
      resolve();
    });
  });
}
