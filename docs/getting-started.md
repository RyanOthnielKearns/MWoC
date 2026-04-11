# Getting Started

## Prerequisites

- **Node.js 22.14 or later** — required by the build toolchain and CLI runtime
- **Ollama** (optional) — if you want to register a local model backend; must be running before `mwoc probe`

---

## Installation

MWoC is a monorepo. Install dependencies from the root, then link the CLI globally:

```sh
npm install
cd packages/cli && npm link
cd ../..
```

Verify:

```sh
mwoc --version
```

---

## First run: `mwoc init`

The init wizard walks you through declaring your resources and storing credentials. Run it once:

```sh
mwoc init
```

The wizard has four sections:

### 1. Local machine

MWoC silently pings `http://localhost:11434` to check whether Ollama is running. If it finds Ollama, it asks whether to add it — no endpoint question needed. If Ollama isn't at the default address, it asks whether it's running elsewhere and collects the endpoint from you.

### 2. Anthropic

This section covers two separate things:

- **Claude Pro / Max / Team** — your claude.ai subscription. Tracked for awareness; agents cannot call it directly. No API key needed or asked for.
- **Anthropic API** — a separate paid service with its own key. If you have one, MWoC stores it in `~/.mwoc/auth.json` (mode 600) and will use it to probe available models.

### 3. OpenAI

Same pattern as Anthropic:

- **ChatGPT** — your chatgpt.com subscription. Tracked for awareness only.
- **OpenAI API** — separate service, requires an API key.

### 4. Remote servers

A remote server is any machine you have network access to that runs an OpenAI-compatible inference API — a shared GPU machine over VPN, a lab server, a home box you SSH into. You can add as many as you have.

For each server, the wizard asks:
- A name (e.g., `gpu-rig-1`)
- The inference API endpoint URL (e.g., `http://10.0.0.1:8000`)
- How you reach it: **direct** (reachable over VPN or private network) or **SSH tunnel** (you port-forward locally first)
- If SSH tunnel: the SSH hostname and username

---

## First probe

After `mwoc init`, scan all your declared resources:

```sh
mwoc probe
```

MWoC will contact each resource (Ollama's `/api/tags`, cloud provider `/v1/models`, vLLM's `/v1/models`) with an 8-second timeout per resource. Resources that are unreachable are marked unavailable — this is not an error, it just means they weren't reachable at probe time (e.g., VPN not connected).

Results are cached to `~/.mwoc/state.json`. View them with:

```sh
mwoc status    # resource-level view
mwoc models    # model-level view, grouped by tier
```

---

## Keeping state fresh

The probe results don't auto-refresh. Re-run `mwoc probe` any time your setup changes, or to check whether a previously-unavailable resource has come back. To refresh a single resource without reprobing everything:

```sh
mwoc probe --resource local-ollama
```

The name must match a resource declared in `~/.mwoc/resources.yaml`. See `mwoc resource list` for the names.

---

## Adding resources after setup

To add a single resource without re-running `mwoc init`, use:

```sh
mwoc resource add
```

This runs the same interactive prompts for one resource and appends the result to `~/.mwoc/resources.yaml`. Re-running `mwoc init` is also possible, but it replaces the entire resource list — you will be warned and asked to confirm before any changes are made.
