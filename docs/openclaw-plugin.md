# OpenClaw Plugin

The MWoC OpenClaw plugin exposes your compute registry as tools and a skill that agents can call mid-task. This allows an orchestrating agent to query what resources are available, reason about which model fits a given subtask, and route accordingly — without hardcoding model names or burning frontier budget on tasks that don't need it.

---

## Current status

The plugin is built (in `packages/plugin/`) but not yet installed into OpenClaw. Two questions are still open before installation:

1. **VPN reachability** — when VPN is connected, is the vLLM/SGLang port on remote servers directly reachable over the VPN IP, or does it require an SSH port-forward first? This affects how probe failures are interpreted.
2. **Probe timing** — should MWoC refresh resource state at agent startup (via an OpenClaw background service hook), or lazily only when an agent explicitly calls `mwoc_probe`? Eager is fresher but adds startup latency and will error visibly if VPN isn't connected.

---

## Installation (once ready)

```sh
openclaw plugins install ./packages/plugin
```

Or, once published to npm:

```sh
openclaw plugins install @mwoc/openclaw-plugin
```

The plugin registers under id `mwoc` and declares capabilities: `tools`, `skills`.

---

## Tools

Tools are callable by the agent during task execution.

### `mwoc_list_models`

Returns all available models from the registry, grouped by capability tier with descriptions. The primary tool for an agent to reason about which model to use for a subtask.

**Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `tier` | string | no | Filter to one tier: `frontier`, `mid`, `local-large`, `local-small` |
| `refresh` | boolean | no | If `true`, re-probes all resources before returning. Use before starting a long multi-step task. |

**Returns:** A formatted text block containing:
- State freshness (age of cached data)
- Each tier with its description and model list (model ID + context window where known)
- Any resources that were unavailable at last probe

**When to call it:** At the start of a task when you need to choose a model, or when you haven't called it recently and want fresh data. Avoid calling it on every subtask — the state cache is designed to be read repeatedly without re-probing.

---

### `mwoc_probe`

Re-probes all configured resources and returns fresh availability and model data. Updates the state cache.

**Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `resource` | string | no | Name of a specific resource to probe (e.g. `local-ollama`). Omit to probe all. |

**Returns:** A summary of probe results — one line per resource with status and model count.

**When to call it:** Before starting a long multi-step task where you want to confirm what's currently available, especially if VPN or remote resources may have changed since the last probe.

---

## Skill

Skills are natural-language guided flows that wrap tools.

### `mwoc_select_model`

Given a subtask description, recommends the most cost-efficient model capable of handling it.

**How it works:**

1. Calls `mwoc_list_models` to retrieve available models and tier descriptions
2. Reasons about the subtask against the tier descriptions
3. Returns: the recommended tier, a specific model within that tier, and a one-sentence rationale

The skill instructs the agent to prefer lower tiers unless the task genuinely requires frontier reasoning, long context, or novel synthesis.

**Example invocation:**

> Use the mwoc_select_model skill to pick a model for this subtask: summarize a 500-line Python file and extract all public function signatures.

**Expected output:**

> **Tier:** local-large  
> **Model:** llama3:8b  
> **Rationale:** Structured extraction from a bounded file is well within local-large capability; no frontier judgment required.

---

## Roadmap

- **Resolve open questions** — VPN reachability and probe timing strategy before installation
- **Probe timing** — consider registering as an OpenClaw background service so state is warm at agent startup without blocking
- **Google/Gemini** — add `probeGoogle()` alongside the existing Anthropic and OpenAI probers so Gemini API models appear in the registry
- **`mwoc tunnel <server>`** — CLI helper that runs the `ssh -L` invocation for SSH-tunnel servers, so you don't have to remember the flags
- **npm publish** — publish as `@mwoc/openclaw-plugin` so installation doesn't require a local path
