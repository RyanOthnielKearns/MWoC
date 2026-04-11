# My World of Compute (MWoC)

A personal compute registry and agent dispatch layer. MWoC tracks every LLM resource you have access to — local hardware, cloud subscriptions, and remote servers — and exposes that inventory to both you and your AI agents.

---

## Two interfaces, one registry

**Human awareness.** The `mwoc` CLI gives you a live view of what you have, what's reachable, and which models are available at each capability tier. Run `mwoc probe` to refresh, `mwoc status` to inspect.

**Agent dispatch.** An OpenClaw plugin exposes MWoC's registry as tools agents can call mid-task. Rather than always routing to a frontier model, an agent can query MWoC for the cheapest resource capable of handling a given subtask — preserving frontier budget for work that genuinely needs it.

---

## Documentation

| Document | Contents |
|---|---|
| [Getting Started](getting-started.md) | Installation, first-run wizard, first probe |
| [CLI Reference](cli.md) | All `mwoc` commands and options |
| [Resource Types](resource-types.md) | Local machine, cloud subscriptions, remote servers |
| [Capability Tiers](capability-tiers.md) | Tier system, built-in model mappings, user overrides |
| [Config Files](config.md) | `~/.mwoc/` layout: `auth.json`, `resources.yaml`, `state.json` |
| [OpenClaw Plugin](openclaw-plugin.md) | Tools, skill, installation, roadmap |

---

## Roadmap

- `mwoc tunnel <server>` — SSH port-forward helper for remote servers
- Google/Gemini provider support
- Automated model release tracking — surface new and deprecated models
- Budget/usage metering per provider
- Publish `@mwoc/openclaw-plugin` to npm
