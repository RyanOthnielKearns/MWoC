# MWoC — To-Do

Current state of the project. Work through these roughly top-to-bottom; later items depend on earlier ones.

---

## Done

- [x] Monorepo scaffold (`packages/core`, `packages/cli`, `packages/plugin`)
- [x] Resource schema types: `LocalMachine`, `CloudSubscription`, `RemoteServer`
- [x] Capability tier system: `frontier | mid | local-large | local-small` with `inferTier()` and static model defaults
- [x] Config management: `~/.mwoc/auth.json` (chmod 600), `resources.yaml`, `state.json`
- [x] Resource probing: Ollama (`/api/tags`), vLLM/SGLang (`/v1/models`), Anthropic API, OpenAI API
- [x] CLI: `mwoc init`, `mwoc status`, `mwoc models [--tier]`, `mwoc probe [--resource]`
- [x] CLI: `mwoc auth add/remove/list`, `mwoc resource add/list/remove`
- [x] CLI: `mwoc dash` — browser dashboard at `localhost:18799`; resource cards with tier-coloured models, stats row, auto-polls `/api/state` every 5s, "Probe All" button POSTs `/api/probe`, opens Chrome on launch
- [x] Dashboard: light mode
- [x] Dashboard: model detail panel — click any model row to expand; three sub-panels: Ollama model info, Capabilities (evals), Performance (bench history)
- [x] `mwoc init` guard — detects existing config, warns of overwrite, and requires explicit confirmation; suggests `mwoc resource add` as the safer alternative
- [x] Agent query API: `listResources()`, `listModels()`, `probeAll()`, `buildAgentSummary()`
- [x] OpenClaw plugin: `mwoc_list_models` tool, `mwoc_probe` tool, `mwoc_select_model` skill
- [x] Unit tests: tier mapping, 6/6 pass
- [x] `.gitignore`: `node_modules/`, `dist/`, `*.tsbuildinfo`, `.claude/`
- [x] `docs/` folder: getting-started, CLI reference, resource types, tiers, config, OpenClaw plugin
- [x] `mwoc bench` — benchmark local Ollama models; flags: `--resource`, `--model`, `--runs` (default 3), `--suite` (coding/writing/reasoning/all), `--prompt`, `--compare`, `--list`; results saved to `~/.mwoc/bench/` and surfaced in dashboard model detail panel
- [x] Core utility modules extracted to `packages/core/src/utils/`: `storage`, `http`, `matching`, `time`, `resources`, `common` — consolidates duplicated I/O, HTTP timeout, and formatting logic across the codebase
- [x] HF model ID matching (evals): reads `general.base_model.0.repo_id` from Ollama GGUF metadata for exact matches; falls back to architecture-based HF search query (`general.architecture` split on digit boundaries, e.g. `"gemma4"` → `"gemma 4 instruct"`); always surfaces an Ollama library link for local models as a fallback

---

## Up Next

### Testing gaps
- [ ] Unit tests for `listModels()` and `listResources()` filtering logic (by tier, by availability)
- [ ] Integration test: spin up Ollama locally, call `probeAll()`, assert models come back with correct tiers
- [ ] Manual end-to-end: run `mwoc init` → `mwoc probe` → `mwoc status` → `mwoc models` on real hardware

### OpenClaw plugin
- [ ] Resolve two open questions before wiring the plugin up:
  - **VPN rig reachability**: once VPN is connected, is the vLLM/SGLang port directly reachable over the VPN IP, or does it need an SSH port-forward first?
  - **Probe timing**: should `mwoc_probe` run at OpenClaw agent startup (background service hook) or lazily when the agent calls `mwoc_probe` mid-task?
- [ ] Install the plugin in OpenClaw (`openclaw plugins install ./packages/plugin`) and verify `mwoc_list_models` and `mwoc_probe` appear in the agent's tool list
- [ ] Run `mwoc_select_model` skill with a real task description and confirm the output is sensible

### SSH tunnel support
- [ ] `mwoc init`/`mwoc resource add` collect `sshHost`/`sshUser` for tunnel-access servers but don't set one up — add `mwoc tunnel <server-name>` to run the `ssh -L` invocation automatically

### CLI polish
- [ ] Web-only resources (`claude-pro`, `chatgpt-edu`) show status `unknown` in `mwoc status`, which implies a probe failure; add a distinct `web` status rendered in grey. (The dashboard already labels these as "web subscription" in the resource cards, but the CLI table still shows `unknown`.)

### Provider coverage
- [ ] Google/Gemini: probing not yet implemented — add `probeGoogle()` analogous to `probeAnthropic()` using the Gemini models API

### Benchmarking extensions
- [ ] `benchmarkOpenAICompatible()` in `bench.ts` for vLLM/SGLang and cloud API backends — currently only Ollama is supported. For OpenAI-compatible streaming, measure TTFT via `Date.now()` on first chunk and track token count from the `usage` field in the final chunk.

---

## Public Eval Access — Problem Statement

> This section documents the design space for surfacing model capability data. It is open for discussion; no implementation is committed yet.

### What we've tried

The current eval pipeline (`packages/core/src/evals.ts`) attempts three resolution paths when a model detail panel opens:

1. **GGUF-embedded repo ID** — reads `general.base_model.0.repo_id` from Ollama's `/api/show` `model_info` payload. When present, this gives a direct HuggingFace repo reference with no search required. In practice, most quantized GGUFs in the Ollama library omit this field — only a minority of GGUF authors include the provenance metadata.

2. **HuggingFace search API** — constructs a query from the model's `general.architecture` (e.g. `"gemma4"` → `"gemma 4 instruct"`), POSTs to `https://huggingface.co/api/models?search=…&sort=downloads`, and takes `results[0]`. When a match is found, `fetchHFEvals()` then requests `evalResults` from the model's HF metadata. In practice this fails for two reasons: (a) the HF eval API only contains data for models that were evaluated *through HF's own evaluation infrastructure* — the overwhelming majority of community uploads and almost all Google/Meta base models have no `evalResults` in their API response, (b) the search itself is fuzzy and can land on the wrong model if the name isn't unique.

3. **Chatbot Arena ELO** — fetches the LMSYS leaderboard from `api.wulong.dev` and fuzzy-matches by model name. Covers only the small subset of models with enough crowd votes to appear in the arena — strong for frontier API models (GPT-4, Claude, Gemini), essentially empty for any local/quantized model.

**Net result for a typical local model like `gemma4:31b`**: the HF search returns the right repo but that repo has no `evalResults`; the arena leaderboard has no row for it. Capabilities shows as empty.

### Why this is structurally hard

- **Naming mismatches**: Ollama uses tag-format IDs (`gemma4:31b`); HuggingFace uses org-prefixed paths (`google/gemma-4-27b-it`); Arena uses freeform display names. These three namespaces have no shared key.
- **GGUF provenance is opt-in**: there is no standard requiring GGUF authors to embed the source model reference. The `general.base_model.*` fields are a convention, not a spec.
- **HF eval data is sparse**: HuggingFace's `evalResults` API field is populated only when a model is submitted to the Open LLM Leaderboard or runs through HF's inference evaluations pipeline. Widely-used models like Llama 3.x and Gemma 4 have their evals published as blog posts and papers, not in the `evalResults` API field.
- **Recency**: newly released models (e.g. Gemma 4) are on HuggingFace but have no community eval data yet. The problem is worst for the models users are most likely to want capability info on.

### Candidate data sources

| Source | Mechanism | Coverage | Reliability |
|---|---|---|---|
| HF `evalResults` API | Already implemented | Very sparse — HF-evaluated models only | High for what's there; usually empty |
| [Open LLM Leaderboard](https://huggingface.co/spaces/open-llm-leaderboard/open-llm-leaderboard) | HF Datasets API — the leaderboard publishes results as a dataset at `open-llm-leaderboard/results` | Good for open-weight models that were submitted | Structured, versioned, but requires submission |
| Chatbot Arena (LMSYS) | Already implemented via `api.wulong.dev` | Frontier + popular models only | Good for ranking; no task-specific scores |
| [Artificial Analysis](https://artificialanalysis.ai) | No public API; structured HTML scraping is fragile | Broad: quality + speed for many models | No stable API |
| [Papers With Code](https://paperswithcode.com) | REST API at `paperswithcode.com/api/v1/` — has a `/results/` endpoint keyed by paper/method | Good for benchmark-published models | Requires linking model → paper |
| `mwoc bench` (in-house) | Already implemented — local Ollama throughput timing | Ollama-only; throughput only, not quality | 100% reliable for what it measures |
| User-specified benchmarks | Not yet implemented — see below | Whatever the user provides | Authoritative |

### Most promising directions

**Option 1 — Open LLM Leaderboard dataset**

The HF Open LLM Leaderboard publishes all results as a public dataset: `open-llm-leaderboard/results`. Each entry has model ID, benchmark name, and score. This can be queried via the HF Datasets API:
```
GET https://huggingface.co/datasets/open-llm-leaderboard/results/...
```
Coverage is better than `evalResults` on individual model repos, and the dataset is versioned. The main constraint: only models that were explicitly submitted to the leaderboard appear, and submission requires running the full HELM/Eleuther eval harness — so quantized community variants are usually absent unless the original author submitted them.

**Option 2 — User-specified benchmark annotations**

The most reliable path for local models is letting users record benchmark results they have observed or run themselves. This could take two forms:

*Inline in `resources.yaml`:*
```yaml
resources:
  - type: local
    name: macbook-ollama
    backend: ollama
    endpoint: http://localhost:11434
    modelAnnotations:
      gemma4:31b:
        benchmarks:
          - name: MMLU
            score: 0.742
            source: "own run, lm-eval-harness 2025-03"
          - name: HumanEval
            score: 0.61
            source: "https://huggingface.co/google/gemma-4-27b-it"
```

*Via `mwoc bench annotate`:*
A subcommand that prompts for benchmark name, score, and source URL and writes the annotation to `resources.yaml`. The dashboard Capabilities panel would then render these alongside (or instead of) any fetched HF data.

This approach is opt-in, explicit, and authoritative — the user knows exactly where the numbers came from. It also composites well with the existing `mwoc bench` throughput results, giving the model detail panel a complete picture: throughput from in-house runs, quality benchmarks from user annotations or fetched data.

**Option 3 — Ollama model page scrape (limited)**

`https://ollama.com/library/gemma4` contains a description and parameter stats. It does not currently publish benchmark scores, but does link to the original model source (often a HuggingFace repo or paper). This link could be extracted and used as a higher-confidence starting point for HF resolution than the current text search.

---

## Parking Lot (later)

- **Dashboard enhancements**:
  - Ollama running models: hit `/api/ps` and show which models are currently loaded into VRAM
  - GPU utilization on remote servers: SSH to `nvidia-smi` or deploy a lightweight sidecar
  - Hardware specs per resource (VRAM, CPU, RAM) — surfaced via `/api/show` for Ollama or a sidecar for vLLM rigs
  - Push model (SSE from a local daemon) instead of 5s polling
- Automated model release tracking (poll Anthropic/OpenAI/HuggingFace changelogs, surface diffs as a `mwoc update` command)
- **Budget/usage metering per provider** — for API resources, accumulate `total_cost_usd` from Claude Agent SDK result messages; for web subscriptions (Claude Pro/Max), scrape `claude.ai/settings/usage` via headless Playwright. The scraping approach is proven viable by [claude-usage-tool](https://github.com/IgniteStudiosLtd/claude-usage-tool) (Electron, MIT), which navigates to `claude.ai/settings/usage` using existing session cookies, waits for the page to render, and extracts usage % and reset time via `/(\d+)%\s*used/i` and `/Resets?[^\n]*/i`. A MWoC implementation would use Playwright (lighter than Electron) with the same cookie-reuse strategy. Inherently fragile — Anthropic can restructure the page at any time — so treat as best-effort.
- VPN connectivity pre-check before attempting to probe remote servers
- Multi-user awareness on shared servers (queue depth, active sessions)
- Publish `@mwoc/openclaw-plugin` to npm
