# My World of Compute (MWoC)

A personal compute registry and agent dispatch layer — tracking every model and resource available to me, and enabling intelligent sub-agent routing to preserve frontier LLM budget.

---

## What This Is

MWoC maintains a structured index of all compute resources I have access to: local hardware, cloud subscriptions, and remote servers. It serves two audiences:

**Me** — so I can see what I have, understand what each resource is capable of, and stay current as the model landscape evolves. Without active maintenance, subscriptions go stale, local models fall behind, and the mental model of "what can I run where" degrades quietly.

**My agents** — so that Claude Code, OpenClaw, and similar orchestrators can query my resource inventory and make cost-aware dispatch decisions. A task requiring frontier reasoning should use frontier compute; a task requiring summarization or formatting should not.

---

## Resource Types

### Local machine
A machine running Ollama (or a compatible backend) locally. Models are discovered automatically by probing the Ollama API at startup.

### Cloud subscriptions
Two distinct things that are easy to conflate:

- **Web subscriptions** (Claude Pro, Claude Max, ChatGPT Plus/Edu) — tracked for human awareness; not directly queryable by agents
- **API access** (Anthropic API, OpenAI API) — probeable, agent-usable; requires an API key stored in `~/.mwoc/auth.json`

### Remote servers
Any machine you have network access to that runs an OpenAI-compatible inference API (vLLM, SGLang, etc.) — a shared GPU machine over VPN, a lab server, a home box you SSH into. Access method can be direct (VPN IP) or via SSH tunnel.

---

## Capability Tiers

Every model in the registry is tagged with a tier. These are used by agents to select the cheapest resource sufficient for a given subtask.

| Tier | Description | Example use |
|------|-------------|-------------|
| `frontier` | Best available reasoning, long context, novel synthesis | Architecture decisions, complex debugging |
| `mid` | Strong general-purpose at lower cost | Drafting, code generation, summarization |
| `local-large` | On-device, no rate limits, moderate capability | Reformatting, structured extraction, iteration |
| `local-small` | Fast, low memory, on-device | Classification, routing, templating |

Tier assignments for well-known models are built in. They can be overridden per-resource in `~/.mwoc/resources.yaml`.

---

## CLI

Installed globally as `mwoc`. All configuration lives in `~/.mwoc/`.

```sh
mwoc init                        # first-run wizard
mwoc probe                       # scan all resources, update state cache
mwoc status                      # table of resources and availability
mwoc models [--tier <tier>]      # list available models, grouped by tier

mwoc resource list               # list declared resources
mwoc resource remove <name>      # remove a resource

mwoc auth add <provider>         # store an API key
mwoc auth remove <provider>      # delete a stored key
mwoc auth list                   # show which providers have a key (masked)
```

---

## Agent Interface (OpenClaw Plugin)

An OpenClaw plugin exposes two tools and a skill to agents:

- **`mwoc_list_models`** — returns all available models grouped by tier with descriptions; used by an agent to reason about which model fits a subtask
- **`mwoc_probe`** — re-probes all resources and returns fresh availability data
- **`mwoc_select_model` skill** — a guided flow that takes a subtask description and recommends the most cost-efficient capable model

---

## Design Principles

- **Agent-first schema** — the resource index is structured so agents can parse and act on it without natural language interpretation
- **Human-readable too** — the same data is easy to read and edit directly (`resources.yaml`)
- **Pull-based freshness** — model availability is queryable at dispatch time, not just statically declared
- **No required server** — the dispatch layer is a library and CLI, not a daemon

---

## Roadmap

- SSH tunnel helper (`mwoc tunnel <server>`) for remote servers that require port-forwarding
- Google/Gemini provider support
- `mwoc auth list` shows key age / last-used metadata
- Automated model release tracking — surface new and deprecated models without manual checking
- Budget/usage metering per provider
- Publish `@mwoc/openclaw-plugin` to npm
