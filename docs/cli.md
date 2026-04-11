# CLI Reference

All commands are available as `mwoc <command>`. Run `mwoc --help` or `mwoc <command> --help` for usage at any time.

---

## `mwoc init`

First-run setup wizard. Walks through declaring resources and storing credentials interactively. Saves results to `~/.mwoc/resources.yaml` and `~/.mwoc/auth.json`.

Re-running `mwoc init` overwrites the current resource list. To add a single resource after initial setup, edit `~/.mwoc/resources.yaml` directly or use `mwoc auth add` for credentials.

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
