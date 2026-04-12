# Resource Types

MWoC tracks three kinds of resources. All are declared in `~/.mwoc/resources.yaml` under the `resources` key.

---

## Local machine

A machine running a local inference backend — [Ollama](https://ollama.com), [vLLM](https://docs.vllm.ai), or [SGLang](https://sglang.readthedocs.io). Models are discovered automatically by probing the backend's API — you don't declare them by hand.

**YAML examples:**

Ollama (default port 11434):
```yaml
- type: local
  name: local-ollama
  backend: ollama
  endpoint: http://localhost:11434
  hardwareNotes: "M3 Max, 128GB RAM"   # optional, for your reference
```

vLLM (default port 8000):
```yaml
- type: local
  name: local-vllm
  backend: vllm
  endpoint: http://localhost:8000
  hardwareNotes: "RTX 4090, 24GB VRAM"   # optional, for your reference
```

SGLang (default port 8000):
```yaml
- type: local
  name: local-sglang
  backend: sglang
  endpoint: http://localhost:8000
```

**Fields:**

| Field | Required | Description |
|---|---|---|
| `type` | yes | Must be `local` |
| `name` | yes | Unique name used in CLI commands |
| `backend` | yes | `ollama`, `vllm`, or `sglang` |
| `endpoint` | yes | Base URL of the inference server |
| `hardwareNotes` | no | Free-text notes for your reference |

---

## Cloud subscription

Covers two distinct things that are easy to conflate:

### Web subscriptions (claude.ai, chatgpt.com)

A paid subscription to a chat interface. MWoC tracks these for awareness — you can see them in `mwoc status` — but they cannot be probed or used by agents, since there's no API to call programmatically.

```yaml
- type: cloud
  name: claude-pro
  provider: anthropic
  tier: Pro
  webOnly: true

- type: cloud
  name: chatgpt-edu
  provider: openai
  tier: Edu
  webOnly: true
```

### API access

Access to a provider's API via a key. MWoC probes these to discover available models.

```yaml
- type: cloud
  name: anthropic-api
  provider: anthropic
  tier: API

- type: cloud
  name: openai-api
  provider: openai
  tier: API
```

API keys are stored separately in `~/.mwoc/auth.json`, not in `resources.yaml`. See [Config Files](config.md).

**Fields:**

| Field | Required | Description |
|---|---|---|
| `type` | yes | Must be `cloud` |
| `name` | yes | Unique name used in CLI commands |
| `provider` | yes | `anthropic`, `openai`, `google`, or any string |
| `tier` | no | Human label for the subscription tier (e.g., `Pro`, `Edu`, `API`) |
| `renewalDate` | no | ISO date string — for tracking subscription renewals |
| `rateLimitNotes` | no | Free-text notes on rate limits |
| `webOnly` | no | `true` = web subscription, not probeable |

---

## Remote server

Any machine you have network access to that runs an OpenAI-compatible inference API — a shared GPU machine over VPN, a lab server, or a home box you SSH into. Backends supported: [vLLM](https://docs.vllm.ai) and [SGLang](https://sglang.readthedocs.io).

### Direct access (VPN or private network)

```yaml
- type: server
  name: gpu-rig-1
  backend: vllm
  endpoint: http://10.0.0.1:8000
  accessMethod: direct
  hardwareNotes: "8× A100, 80GB each"  # optional
```

### SSH tunnel

If the inference port isn't directly reachable, you'll need to forward it locally first with `ssh -L`. MWoC stores the SSH connection details for reference but does not set up the tunnel automatically — that's a planned feature.

```yaml
- type: server
  name: lab-server
  backend: sglang
  endpoint: http://localhost:8001    # local forwarded port
  accessMethod: ssh-tunnel
  sshHost: gpu-box.university.edu
  sshUser: rk123
  localPort: 8001
```

**Fields:**

| Field | Required | Description |
|---|---|---|
| `type` | yes | Must be `server` |
| `name` | yes | Unique name used in CLI commands |
| `backend` | yes | `vllm` or `sglang` |
| `endpoint` | yes | Base URL of the OpenAI-compatible API |
| `accessMethod` | yes | `direct` or `ssh-tunnel` |
| `sshHost` | if tunnel | SSH hostname or IP |
| `sshUser` | if tunnel | SSH username |
| `localPort` | no | Local port used by the tunnel (for documentation) |
| `hardwareNotes` | no | Free-text notes on hardware |
