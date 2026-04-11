import http from "node:http";
import { exec } from "node:child_process";
import chalk from "chalk";
import { getResourceState, probeAll } from "@mwoc/core";

const PORT = 18799;

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
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
      font-size: 13px;
      min-height: 100vh;
    }
    header {
      border-bottom: 1px solid var(--border);
      padding: 14px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
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
    .stats-row { display: flex; border-bottom: 1px solid var(--border); }
    .stat {
      flex: 1;
      padding: 12px 24px;
      border-right: 1px solid var(--border);
    }
    .stat:last-child { border-right: none; }
    .stat-value { font-size: 22px; font-weight: 700; color: #fff; }
    .stat-label { font-size: 11px; color: var(--text-dim); margin-top: 2px; }
    .main { padding: 24px; }
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
    .tier-dot.frontier  { background: var(--frontier); }
    .tier-dot.mid       { background: var(--mid); }
    .tier-dot.local-large { background: var(--local-large); }
    .tier-dot.local-small { background: var(--local-small); }
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
    .card-endpoint {
      font-size: 11px;
      color: var(--text-dim);
      margin-bottom: 10px;
      word-break: break-all;
    }
    .divider { border: none; border-top: 1px solid var(--border); margin: 10px 0; }
    .models-list { display: flex; flex-direction: column; gap: 5px; }
    .model-row { display: flex; align-items: center; gap: 7px; font-size: 11px; }
    .model-id { color: var(--text); }
    .model-ctx { color: var(--text-dim); }
    .no-models { font-size: 11px; color: var(--text-dim); font-style: italic; }
    .error-msg { font-size: 11px; color: var(--unavailable); margin-top: 8px; opacity: 0.85; }
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
    footer {
      border-top: 1px solid var(--border);
      padding: 10px 24px;
      font-size: 11px;
      color: var(--text-dim);
      display: flex;
      justify-content: space-between;
      position: sticky;
      bottom: 0;
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

  <div class="stats-row">
    <div class="stat"><div class="stat-value" id="stat-total">—</div><div class="stat-label">Resources</div></div>
    <div class="stat"><div class="stat-value" id="stat-available">—</div><div class="stat-label">Available</div></div>
    <div class="stat"><div class="stat-value" id="stat-models">—</div><div class="stat-label">Models</div></div>
    <div class="stat"><div class="stat-value" id="stat-frontier">—</div><div class="stat-label">Frontier</div></div>
  </div>

  <div class="main">
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

  <footer>
    <span>mwoc dash — localhost:${port}</span>
    <span id="refresh-countdown">Refreshes in 5s</span>
  </footer>

  <script>
    let countdown = 5;
    let countdownTimer = null;

    function formatAge(iso) {
      const diffMs = Date.now() - new Date(iso).getTime();
      const mins = Math.floor(diffMs / 60000);
      if (mins < 1) return 'just now';
      if (mins < 60) return mins + 'm ago';
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) return hrs + 'h ago';
      return Math.floor(hrs / 24) + 'd ago';
    }

    function esc(str) {
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function render(state) {
      if (!state) {
        document.getElementById('resource-grid').innerHTML =
          '<div class="empty-state"><h2>No state found</h2><p>Run <code>mwoc probe</code> to scan your resources.</p></div>';
        document.getElementById('last-probed').textContent = 'Never probed';
        ['stat-total','stat-available','stat-models','stat-frontier'].forEach(id => {
          document.getElementById(id).textContent = '0';
        });
        return;
      }

      document.getElementById('last-probed').textContent = 'Probed ' + formatAge(state.probedAt);

      const available = state.resources.filter(r => r.status === 'available');
      const allModels = available.flatMap(r => r.models);
      const frontierCount = allModels.filter(m => m.tier === 'frontier').length;

      document.getElementById('stat-total').textContent = state.resources.length;
      document.getElementById('stat-available').textContent = available.length;
      document.getElementById('stat-models').textContent = allModels.length;
      document.getElementById('stat-frontier').textContent = frontierCount;

      const grid = document.getElementById('resource-grid');
      if (state.resources.length === 0) {
        grid.innerHTML = '<div class="empty-state"><h2>No resources declared</h2><p>Run <code>mwoc init</code> to set up resources.</p></div>';
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
              const ctx = m.contextWindow
                ? ' <span class="model-ctx">(' + (m.contextWindow / 1000).toFixed(0) + 'k)</span>'
                : '';
              return '<div class="model-row">'
                + '<div class="tier-dot ' + esc(m.tier) + '"></div>'
                + '<span class="model-id">' + esc(m.modelId) + '</span>'
                + ctx
                + '</div>';
            }).join('')
          : '';

        const emptyModels = r.models.length === 0
          ? '<hr class="divider"><div class="no-models">'
            + (status === 'unavailable' ? 'Unreachable' : 'No models discovered')
            + '</div>'
          : '';

        const errorHtml = r.error && status === 'unavailable'
          ? '<div class="error-msg">' + esc(r.error.slice(0, 90)) + '</div>'
          : '';

        return '<div class="resource-card ' + status + '">'
          + '<div class="card-header">'
          +   '<div><div class="card-name">' + esc(res.name) + '</div>'
          +   '<div class="card-type">' + esc(typeLabel) + '</div></div>'
          +   '<span class="status-badge ' + status + '">' + esc(status) + '</span>'
          + '</div>'
          + '<div class="card-endpoint">' + esc(endpoint) + '</div>'
          + modelsHtml
          + emptyModels
          + errorHtml
          + '</div>';
      }).join('');
    }

    async function fetchState() {
      const res = await fetch('/api/state');
      const state = await res.json();
      render(state);
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
        const state = await res.json();
        render(state);
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

export async function startDashboard(): Promise<void> {
  const html = buildHtml(PORT);

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);

    if (url.pathname === "/" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }

    if (url.pathname === "/api/state" && req.method === "GET") {
      const state = getResourceState();
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify(state));
      return;
    }

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

    res.writeHead(404);
    res.end("Not found");
  });

  server.listen(PORT, "127.0.0.1", () => {
    const dashUrl = `http://localhost:${PORT}`;
    console.log(chalk.bold("\nMWoC Dashboard"));
    console.log(`  ${chalk.cyan(dashUrl)}\n`);
    console.log(chalk.dim("Press Ctrl+C to stop.\n"));

    // Try Chrome first, fall back to the system default browser
    const openCmd = process.platform === "darwin"
      ? `open -a "Google Chrome" "${dashUrl}" 2>/dev/null || open "${dashUrl}"`
      : process.platform === "win32"
        ? `start "" "${dashUrl}"`
        : `xdg-open "${dashUrl}"`;

    exec(openCmd);
  });

  // Keep process running until Ctrl+C
  await new Promise<void>((resolve) => {
    process.on("SIGINT", () => {
      server.close();
      console.log(chalk.dim("\nDashboard stopped."));
      resolve();
    });
  });
}
