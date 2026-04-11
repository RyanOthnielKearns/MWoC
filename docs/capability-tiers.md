# Capability Tiers

Every model in the MWoC registry is tagged with one of four capability tiers. Tiers are used by agents to select the cheapest resource sufficient for a given subtask, and by `mwoc models --tier` for filtering.

---

## Tier definitions

| Tier | Description |
|---|---|
| `frontier` | Best available reasoning, long-context understanding, and novel synthesis. Use for architecture decisions, complex debugging, and tasks that require judgment across large codebases. |
| `mid` | Strong general-purpose capability at lower cost. Use for drafting, code generation, structured summarization, and multi-step reasoning that doesn't require frontier judgment. |
| `local-large` | On-device inference, no rate limits, moderate capability. Use for iteration, reformatting, structured extraction, and tasks where privacy or latency matter. |
| `local-small` | Fast, low memory, on-device. Use for classification, routing decisions, templating, and any task where speed matters more than depth. |

---

## How tiers are assigned

When MWoC probes a resource and discovers models, it assigns a tier to each model using a prefix-matching lookup against a built-in table. The longest matching prefix wins, and matching is case-insensitive. If no prefix matches, the model is assigned `local-large` (conservative default).

User overrides take precedence over built-in assignments. See [Overriding tiers](#overriding-tiers) below.

---

## Built-in tier assignments

### Anthropic

| Prefix | Tier |
|---|---|
| `claude-opus` | `frontier` |
| `claude-sonnet` | `mid` |
| `claude-haiku` | `local-large` |

### OpenAI

| Prefix | Tier |
|---|---|
| `gpt-4o`, `gpt-4-turbo`, `gpt-4` | `frontier` |
| `o1`, `o3`, `o4` | `frontier` |
| `gpt-3.5` | `mid` |

### Google

| Prefix | Tier |
|---|---|
| `gemini-2.5-pro`, `gemini-2.0-flash-thinking` | `frontier` |
| `gemini-2.5-flash`, `gemini-2.0-flash`, `gemini-1.5-pro` | `mid` |
| `gemini-1.5-flash` | `local-large` |

### Open-source (large, 30B+)

| Prefix | Tier |
|---|---|
| `llama-3.1-405b` | `frontier` |
| `llama-3.3-70b`, `llama-3.1-70b`, `llama3:70b`, `llama3.1:70b` | `mid` |
| `mixtral:8x22b` | `mid` |
| `qwen2.5:72b`, `deepseek-r1:70b` | `mid` |
| `gemma3:27b` | `mid` |

### Open-source (medium, 7B–32B)

| Prefix | Tier |
|---|---|
| `mixtral:8x7b`, `qwen2.5:32b`, `deepseek-r1:32b` | `local-large` |
| `llama3:8b`, `llama-3.1:8b`, `mistral`, `mistral:7b` | `local-large` |
| `phi4`, `gemma2:9b`, `gemma2`, `gemma3:12b` | `local-large` |
| `qwen2.5:7b`, `deepseek-r1:8b` | `local-large` |

### Open-source (small, <7B)

| Prefix | Tier |
|---|---|
| `phi3:mini`, `phi3` | `local-small` |
| `gemma2:2b`, `gemma3:1b`, `gemma3:4b` | `local-small` |
| `llama-3.2:3b`, `llama-3.2:1b`, `llama3.2:3b` | `local-small` |
| `qwen2.5:3b`, `deepseek-r1:1.5b` | `local-small` |
| `smollm` | `local-small` |

---

## Overriding tiers

Add a `tierOverrides` key to `~/.mwoc/resources.yaml`. Overrides are matched the same way as built-in assignments — longest matching prefix wins, case-insensitive — but they take precedence over the built-in table.

```yaml
resources:
  - ...

tierOverrides:
  # Promote a specific model
  my-finetune-70b: frontier

  # Demote a whole family
  claude-sonnet: local-large

  # Override by exact model ID
  llama3.1:8b-instruct-q8_0: mid
```

Overrides are applied globally across all resources — they're not scoped to a particular backend.
