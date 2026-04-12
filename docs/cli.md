# CLI Reference

All commands are available as `mwoc <command>`. Run `mwoc --help` or `mwoc <command> --help` for usage at any time.

---

## `mwoc init`

First-run setup wizard. Walks through declaring resources and storing credentials interactively. Saves results to `~/.mwoc/resources.yaml` and `~/.mwoc/auth.json`.

Re-running `mwoc init` when resources are already configured displays a warning and requires explicit confirmation before proceeding, because the entire resource list is replaced. To add a single resource after initial setup, use `mwoc resource add` instead.

---

## `mwoc probe`

Contacts all declared resources and updates `~/.mwoc/state.json` with the results.

```
mwoc probe [--resource <name>]
```

**Options:**

| Option | Description |
|---|---|
| `--resource <name>` | Probe only the named resource. Name must match an entry in `resources.yaml`. |

Without `--resource`, all declared resources are probed in parallel. Resources that are unreachable within 8 seconds are marked `unavailable` — the command does not fail.

---

## `mwoc status`

Displays a table of all probed resources: name, type, status, model count, and a short notes field.

```
mwoc status
```

No options. Reads from the state cache — run `mwoc probe` first. The header shows how long ago the state was last updated.

**Status values:**

| Status | Meaning |
|---|---|
| `available` | Resource was reachable and returned model data |
| `unavailable` | Resource was unreachable or returned an error |
| `unknown` | Resource cannot be probed (e.g. web-only subscription, unsupported provider) |

---

## `mwoc models`

Lists all available models from the state cache, grouped by capability tier.

```
mwoc models [--tier <tier>]
```

**Options:**

| Option | Description |
|---|---|
| `--tier <tier>` | Filter to one tier: `frontier`, `mid`, `local-large`, or `local-small` |

Context window sizes are shown in thousands (e.g., `128k ctx`) where the provider reports them. Only models from resources with `available` status are shown.

---

## `mwoc auth`

Manages API credentials stored in `~/.mwoc/auth.json`.

### `mwoc auth add <provider>`

Prompts for an API key and saves it for the named provider.

```sh
mwoc auth add anthropic
mwoc auth add openai
```

If a key already exists for that provider, this replaces it.

### `mwoc auth remove <provider>`

Deletes the stored credential for the named provider.

```sh
mwoc auth remove anthropic
```

### `mwoc auth list`

Shows which providers have a stored credential. The key is partially masked — only the first 8 characters are visible.

```sh
mwoc auth list
```

---

## `mwoc resource`

Manages the resource list in `~/.mwoc/resources.yaml`.

### `mwoc resource add`

Interactive wizard to append a single resource without touching the rest of the config. Prompts for resource type (local / cloud / server) and the appropriate fields, then appends the new entry to `~/.mwoc/resources.yaml`.

```sh
mwoc resource add
```

If the name you choose already exists in the resource list, the command exits with an error and does not modify the file.

### `mwoc resource list`

Lists all declared resources: name, type, and endpoint or provider.

```sh
mwoc resource list
```

### `mwoc resource remove <name>`

Removes a resource entry by name. Does not automatically remove any associated credential — if the resource had an API key, also run `mwoc auth remove <provider>`.

```sh
mwoc resource remove anthropic-api
```

The name must match exactly as shown in `mwoc resource list`.

---

## `mwoc dash`

Opens a live browser dashboard at `http://localhost:18799`.

```
mwoc dash
```

No options. The command starts a local HTTP server on port 18799 and opens Chrome. The dashboard has two tabs:

**Resources** — shows each declared resource as a card: name, type, status, model count, and last-probed time. A "Probe all" button re-runs `mwoc probe` and refreshes the page.

**Models** — sortable table of all models from available resources, with columns for tier, context window, and resource name. Click any row to expand an accordion showing:

- **Hardware / Ollama metadata** — architecture, parameter size, quantisation, format, family (sourced from `/api/show`)
- **Academic benchmarks** — self-reported eval scores fetched from HuggingFace (MMLU, HumanEval, GSM8K, etc.) with a direct link to the model card
- **Chatbot Arena ELO** — community ranking from the Arena leaderboard, where available
- **Performance** — link to `mwoc bench` results when available; stub CTA otherwise

Eval and metadata fetches are cached in `~/.mwoc/evals/` with a 24-hour TTL.

---

## `mwoc bench`

Benchmarks a local Ollama model by running it through a suite of prompts and measuring token throughput.

```
mwoc bench [options]
mwoc bench --list
mwoc bench --compare <id1> <id2>
```

**Options:**

| Option | Default | Description |
|---|---|---|
| `--resource <name>` | first available local resource | Target resource (must be `type: local`) |
| `--model <id>` | all models on resource | Specific model ID |
| `--runs <n>` | `3` | Iterations per prompt |
| `--suite <name>` | `all` | Prompt suite (see below) |
| `--prompt <text>` | — | Single custom prompt (overrides `--suite`) |
| `--list` | — | List saved bench runs |
| `--compare <id1> <id2>` | — | Compare two saved runs side-by-side |

`mwoc bench` only works with Ollama-backed local resources (`type: local`, `backend: ollama`). vLLM, SGLang, cloud, and server resources are not supported — the command exits with a clear error if a non-Ollama resource is named.

If `--model` is omitted and more than 3 models exist on the resource, you are asked to confirm before proceeding.

The model must appear in the last probed state for that resource. If it doesn't, the command exits with a hint to run `mwoc probe` first.

**Prompt suites:**

| Suite | Prompts |
|---|---|
| `all` | All 6 built-in prompts (default) |
| `coding` | TypeScript deep-clone function; Python BST with tests |
| `writing` | Emergence essay; declining-a-meeting email |
| `reasoning` | 8-balls balance puzzle; minimum-cost apples problem |
| `quick` | `coding-1` only — single prompt, fast baseline |

**Live output** shows each run as it completes (token count, wall time, tok/s), followed by a per-prompt aggregate (mean ± stddev), and a final summary block with overall speed, memory footprint, and the path the result was saved to.

Results are stored in `~/.mwoc/bench/` as JSON files named by timestamp, resource, and model.

### `mwoc bench --list`

Tabular list of all saved bench runs: ID prefix, model, resource, suite, runs/prompt, mean generation speed, and date.

### `mwoc bench --compare <id1> <id2>`

Side-by-side comparison of two saved runs. Shows generation speed, prompt-eval speed, load time, and memory for both runs, with a Δ column coloured green (B is faster/smaller) or red (B is slower/larger). Warns if the two runs used different suites.
