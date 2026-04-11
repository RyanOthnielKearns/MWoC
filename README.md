# My World of Compute (MWoC)

A personal compute registry and agent dispatch layer — tracking every model and hardware resource available to me, and enabling intelligent sub-agent routing to preserve frontier LLM budget.

---

## What This Is

MWoC maintains a structured index of all compute resources I have access to: local hardware, cloud subscriptions, and remote GPU rigs. It serves two audiences:

**Me** — so I can see what I have, understand what each resource is capable of, and stay current as the model landscape evolves. Without active maintenance, subscriptions go stale, local models fall behind, and the mental model of "what can I run where" degrades quietly.

**My agents** — so that Claude Code, OpenClaw, and similar orchestrators can query my resource inventory and make cost-aware dispatch decisions. A task requiring frontier reasoning should use frontier compute; a task requiring summarization or formatting should not.

---

## Resource Categories

### Local Machine
- Hardware specs (CPU, GPU, RAM, storage)
- Supported model families and max parameter sizes
- Inference backends (e.g., Ollama, llama.cpp, LM Studio)
- Currently loaded / available models

### Cloud Subscriptions
- Provider, tier, and rate limits
- Available models per tier
- Remaining session budget (where queryable)
- Renewal cadence and deprecation schedule

### Remote GPU Rigs (VPN)
- Connection details and access method
- Hardware specs per rig
- Inference stack and available models
- Latency and throughput characteristics

---

## Two Core Use Cases

### 1. Human Awareness Layer

A living document / dashboard answering:
- What do I have right now?
- What am I paying for vs. actually using?
- What's coming out that I should care about? (frontier model releases, open-source checkpoints, deprecations)
- Is anything I rely on being sunset?

This layer should surface diffs — when a model gets updated, deprecated, or superseded — so the stack doesn't silently atrophy.

### 2. Agent Dispatch Layer

A machine-readable interface that orchestrators can call to:
- Enumerate available backends by capability tier
- Select the cheapest resource sufficient for a given subtask
- Check budget / rate-limit headroom before dispatching
- Fall back gracefully (e.g., local model when frontier session is exhausted)

The goal is to break a complex task into a directed graph of subtasks, tag each with a required capability level, and route each to the appropriate compute — preserving frontier budget for the steps that genuinely require it.

---

## Capability Tiers (Draft)

| Tier | Description | Example Use |
|------|-------------|-------------|
| `frontier` | Best available reasoning, coding, long context | Architecture decisions, complex debugging, novel synthesis |
| `mid` | Strong general-purpose, lower cost | Drafting, code generation, summarization |
| `local-large` | On-device, no rate limits, moderate capability | Iteration, reformatting, structured extraction |
| `local-small` | Fast, low memory, on-device | Classification, routing decisions, templating |

---

## Design Principles

- **Agent-first schema**: the resource index should be structured so agents can parse and act on it without natural language interpretation
- **Human-readable too**: the same data should be easy for me to read and edit directly
- **Pull-based freshness**: model availability and rate limits should be queryable at dispatch time, not just statically declared
- **Minimal dependencies**: the dispatch layer should not require a running server if it can be a library or CLI tool

---

## Status

Early scaffolding. Resource inventory not yet populated. Dispatch interface not yet designed.
