## Dashboard

Next.js app serving `localhost:3000` for GPU status — both web UI and REST API.

### Login Flow

The dashboard is token-protected. Access is guarded by `GPU_ACCESS_TOKEN` environment variable.

1. Navigate to `localhost:3000`
2. Enter your token in the "Access token" field
3. Click "Unlock" or press Enter
4. Token is validated against `/api/gpus` endpoint
5. On success, token is stored in `localStorage` with 24-hour TTL
6. Dashboard auto-polls GPU data every 2 minutes

### Web UI

Shows a `MachineCard` component displaying:

- GPU count and availability (free/in-use)
- Per-GPU: utilization %, memory (used/total GB), temperature
- Data freshness indicator (shows "stale" if data > 5 min old)
- Lock button to clear stored token and return to login screen

### API Endpoints

#### GET `/api/gpus`

Requires `x-access-token` header matching `GPU_ACCESS_TOKEN`.

**Query Parameters:**

- `format=json` (default) — JSON object
- `format=text` — Markdown table

**Examples:**

```bash
# JSON format (default)
curl "localhost:3000/api/gpus" \
  -H "x-access-token: f84956ca147cd1ad73105254fa4622761a5428ed2dcc9e918104784a1d909afb"

# Text/markdown format
curl "localhost:3000/api/gpus?format=text" \
  -H "x-access-token: f84956ca147cd1ad73105254fa4622761a5428ed2dcc9e918104784a1d909afb"
```

**JSON Response:**

```json
{
  "gpus": [
    {
      "index": 0,
      "name": "H100",
      "utilization": 42,
      "memory_used": 40960,
      "memory_total": 81920,
      "temperature": 56,
      "free": false
    }
  ],
  "updatedAt": "2026-04-14T10:30:15Z"
}
```

**Text Response (Markdown Table):**

```
# virgil — GPU state
_updated 2026-04-14T10:30:15Z_

| GPU | name | util | VRAM used | VRAM total | temp | status |
|-----|------|------|-----------|------------|------|--------|
| 0 | H100 | 42% | 40.0 GB | 80 GB | 56°C | in use |
```

**Data Source:** GPU state is pulled from Upstash Redis key `gpu:state`. The key must be populated by an external monitor/cron job that runs on the GPU machine and pushes updates via Redis REST API.
