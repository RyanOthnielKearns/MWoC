// src/types.ts
var TIER_ORDER = [
  "frontier",
  "mid",
  "local-large",
  "local-small"
];

// src/tiers.ts
var DEFAULT_TIER_MAP = [
  // Anthropic
  { prefix: "claude-opus", tier: "frontier" },
  { prefix: "claude-sonnet", tier: "mid" },
  { prefix: "claude-haiku", tier: "local-large" },
  // OpenAI
  { prefix: "gpt-4o", tier: "frontier" },
  { prefix: "gpt-4-turbo", tier: "frontier" },
  { prefix: "gpt-4", tier: "frontier" },
  { prefix: "gpt-3.5", tier: "mid" },
  { prefix: "o1", tier: "frontier" },
  { prefix: "o3", tier: "frontier" },
  { prefix: "o4", tier: "frontier" },
  // Google
  { prefix: "gemini-2.0-flash-thinking", tier: "frontier" },
  { prefix: "gemini-2.0-flash", tier: "mid" },
  { prefix: "gemini-2.5-pro", tier: "frontier" },
  { prefix: "gemini-2.5-flash", tier: "mid" },
  { prefix: "gemini-1.5-pro", tier: "mid" },
  { prefix: "gemini-1.5-flash", tier: "local-large" },
  // Large open-source
  { prefix: "llama-3.3-70b", tier: "mid" },
  { prefix: "llama-3.1-70b", tier: "mid" },
  { prefix: "llama-3.1-405b", tier: "frontier" },
  { prefix: "llama-3:70b", tier: "mid" },
  { prefix: "llama3:70b", tier: "mid" },
  { prefix: "mixtral:8x22b", tier: "mid" },
  { prefix: "mixtral:8x7b", tier: "local-large" },
  { prefix: "qwen2.5:72b", tier: "mid" },
  { prefix: "qwen2.5:32b", tier: "local-large" },
  { prefix: "deepseek-r1:70b", tier: "mid" },
  { prefix: "deepseek-r1:32b", tier: "local-large" },
  // Small open-source
  { prefix: "llama-3.2:3b", tier: "local-small" },
  { prefix: "llama-3.2:1b", tier: "local-small" },
  { prefix: "llama3:8b", tier: "local-large" },
  { prefix: "llama-3.1:8b", tier: "local-large" },
  { prefix: "llama3.2:3b", tier: "local-small" },
  { prefix: "mistral:7b", tier: "local-large" },
  { prefix: "mistral", tier: "local-large" },
  { prefix: "phi3:mini", tier: "local-small" },
  { prefix: "phi3", tier: "local-small" },
  { prefix: "phi4", tier: "local-large" },
  { prefix: "gemma2:2b", tier: "local-small" },
  { prefix: "gemma2:9b", tier: "local-large" },
  { prefix: "gemma2", tier: "local-large" },
  { prefix: "gemma3:1b", tier: "local-small" },
  { prefix: "gemma3:4b", tier: "local-small" },
  { prefix: "gemma3:12b", tier: "local-large" },
  { prefix: "gemma3:27b", tier: "mid" },
  { prefix: "qwen2.5:7b", tier: "local-large" },
  { prefix: "qwen2.5:3b", tier: "local-small" },
  { prefix: "deepseek-r1:8b", tier: "local-large" },
  { prefix: "deepseek-r1:1.5b", tier: "local-small" },
  { prefix: "smollm", tier: "local-small" }
];
var TIER_DESCRIPTIONS = {
  frontier: "Best available reasoning, long-context understanding, and novel synthesis. Use for architecture decisions, complex debugging, and tasks that require judgment across large codebases.",
  mid: "Strong general-purpose capability at lower cost. Use for drafting, code generation, structured summarization, and multi-step reasoning that doesn't require frontier judgment.",
  "local-large": "On-device inference, no rate limits, moderate capability. Use for iteration, reformatting, structured extraction, and tasks where privacy or latency matter.",
  "local-small": "Fast, low-memory, on-device. Use for classification, routing decisions, templating, and any task where speed matters more than depth."
};
function inferTier(modelId, overrides) {
  const normalized = modelId.toLowerCase();
  if (overrides) {
    const exactOverride = overrides[modelId] ?? overrides[normalized];
    if (exactOverride) return exactOverride;
    for (const [prefix, tier] of Object.entries(overrides)) {
      if (normalized.startsWith(prefix.toLowerCase())) return tier;
    }
  }
  const sorted = [...DEFAULT_TIER_MAP].sort(
    (a, b) => b.prefix.length - a.prefix.length
  );
  for (const { prefix, tier } of sorted) {
    if (normalized.startsWith(prefix.toLowerCase())) return tier;
  }
  return "local-large";
}
function tierDescription(tier) {
  return TIER_DESCRIPTIONS[tier];
}

// src/config.ts
import fs from "fs";
import path from "path";
import os from "os";
import yaml from "js-yaml";
var MWOC_DIR = path.join(os.homedir(), ".mwoc");
var AUTH_FILE = path.join(MWOC_DIR, "auth.json");
var RESOURCES_FILE = path.join(MWOC_DIR, "resources.yaml");
var STATE_FILE = path.join(MWOC_DIR, "state.json");
function ensureMwocDir() {
  if (!fs.existsSync(MWOC_DIR)) {
    fs.mkdirSync(MWOC_DIR, { recursive: true, mode: 448 });
  }
}
function loadAuth() {
  if (!fs.existsSync(AUTH_FILE)) return {};
  const raw = fs.readFileSync(AUTH_FILE, "utf-8");
  return JSON.parse(raw);
}
function saveAuth(auth) {
  ensureMwocDir();
  fs.writeFileSync(AUTH_FILE, JSON.stringify(auth, null, 2), {
    mode: 384,
    encoding: "utf-8"
  });
}
function getApiKey(provider) {
  const auth = loadAuth();
  if (auth[provider]?.apiKey) return auth[provider].apiKey;
  const envMap = {
    anthropic: "ANTHROPIC_API_KEY",
    openai: "OPENAI_API_KEY",
    google: "GOOGLE_API_KEY"
  };
  const envVar = envMap[provider.toLowerCase()];
  if (envVar && process.env[envVar]) return process.env[envVar];
  return void 0;
}
var DEFAULT_RESOURCES_CONFIG = {
  resources: []
};
function loadResourcesConfig() {
  if (!fs.existsSync(RESOURCES_FILE)) return DEFAULT_RESOURCES_CONFIG;
  const raw = fs.readFileSync(RESOURCES_FILE, "utf-8");
  return yaml.load(raw);
}
function saveResourcesConfig(config) {
  ensureMwocDir();
  fs.writeFileSync(RESOURCES_FILE, yaml.dump(config), { encoding: "utf-8" });
}

// src/probes.ts
var PROBE_TIMEOUT_MS = 8e3;
function timestamp() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
async function fetchWithTimeout(url, init = {}) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}
async function probeOllama(resource, tierOverrides) {
  const url = `${resource.endpoint.replace(/\/$/, "")}/api/tags`;
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const models = data.models.map((m) => ({
      modelId: m.name,
      tier: inferTier(m.name, tierOverrides),
      description: `Ollama model: ${m.name}${m.details?.parameter_size ? ` (${m.details.parameter_size})` : ""}`
    }));
    return {
      resource,
      status: "available",
      models,
      probedAt: timestamp()
    };
  } catch (err) {
    return {
      resource,
      status: "unavailable",
      models: [],
      probedAt: timestamp(),
      error: String(err)
    };
  }
}
async function probeOpenAICompatible(endpoint, apiKey, resourceName, tierOverrides) {
  const url = `${endpoint.replace(/\/$/, "")}/v1/models`;
  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
  const res = await fetchWithTimeout(url, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  const data = await res.json();
  return data.data.map((m) => ({
    modelId: m.id,
    tier: inferTier(m.id, tierOverrides),
    contextWindow: m.context_window,
    description: `${resourceName}: ${m.id}`
  }));
}
async function probeRemoteRig(resource, tierOverrides) {
  try {
    const models = await probeOpenAICompatible(
      resource.endpoint,
      void 0,
      resource.name,
      tierOverrides
    );
    return { resource, status: "available", models, probedAt: timestamp() };
  } catch (err) {
    return {
      resource,
      status: "unavailable",
      models: [],
      probedAt: timestamp(),
      error: String(err)
    };
  }
}
async function probeAnthropic(resource, tierOverrides) {
  const apiKey = getApiKey("anthropic");
  if (!apiKey) {
    return {
      resource,
      status: "unknown",
      models: [],
      probedAt: timestamp(),
      error: "No API key configured. Run: mwoc auth add anthropic"
    };
  }
  try {
    const res = await fetchWithTimeout("https://api.anthropic.com/v1/models", {
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const models = data.data.map((m) => ({
      modelId: m.id,
      tier: inferTier(m.id, tierOverrides),
      contextWindow: m.context_window,
      description: `Anthropic (${resource.tier ?? "subscription"}): ${m.id}`
    }));
    return { resource, status: "available", models, probedAt: timestamp() };
  } catch (err) {
    return {
      resource,
      status: "unavailable",
      models: [],
      probedAt: timestamp(),
      error: String(err)
    };
  }
}
async function probeOpenAI(resource, tierOverrides) {
  const apiKey = getApiKey("openai");
  if (!apiKey) {
    return {
      resource,
      status: "unknown",
      models: [],
      probedAt: timestamp(),
      error: "No API key configured. Run: mwoc auth add openai"
    };
  }
  try {
    const models = await probeOpenAICompatible(
      "https://api.openai.com",
      apiKey,
      resource.name,
      tierOverrides
    );
    return { resource, status: "available", models, probedAt: timestamp() };
  } catch (err) {
    return {
      resource,
      status: "unavailable",
      models: [],
      probedAt: timestamp(),
      error: String(err)
    };
  }
}
async function probeResource(resource, tierOverrides) {
  if (resource.type === "local") {
    if (resource.backend === "ollama") return probeOllama(resource, tierOverrides);
    return {
      resource,
      status: "unknown",
      models: [],
      probedAt: timestamp(),
      error: `Unsupported local backend: ${resource.backend}`
    };
  }
  if (resource.type === "remote") {
    return probeRemoteRig(resource, tierOverrides);
  }
  if (resource.type === "cloud") {
    if (resource.provider === "anthropic") return probeAnthropic(resource, tierOverrides);
    if (resource.provider === "openai") return probeOpenAI(resource, tierOverrides);
    return {
      resource,
      status: "unknown",
      models: [],
      probedAt: timestamp(),
      error: `Unsupported cloud provider: ${resource.provider}`
    };
  }
  return {
    resource,
    status: "unknown",
    models: [],
    probedAt: timestamp(),
    error: "Unknown resource type"
  };
}

// src/registry.ts
import fs2 from "fs";
function loadState() {
  if (!fs2.existsSync(STATE_FILE)) return null;
  try {
    return JSON.parse(fs2.readFileSync(STATE_FILE, "utf-8"));
  } catch {
    return null;
  }
}
function saveState(state) {
  ensureMwocDir();
  fs2.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), {
    encoding: "utf-8"
  });
}
async function probeAll(options) {
  const config = loadResourcesConfig();
  const resources = options?.resourceName ? config.resources.filter((r) => r.name === options.resourceName) : config.resources;
  const results = await Promise.all(
    resources.map((r) => probeResource(r, config.tierOverrides))
  );
  let finalResults = results;
  if (options?.resourceName) {
    const existing = loadState();
    if (existing) {
      const updated = existing.resources.filter(
        (r) => r.resource.name !== options.resourceName
      );
      finalResults = [...updated, ...results];
    }
  }
  const state = {
    probedAt: (/* @__PURE__ */ new Date()).toISOString(),
    resources: finalResults
  };
  saveState(state);
  return state;
}
function getResourceState() {
  return loadState();
}
function listResources(filter) {
  const state = loadState();
  if (!state) return [];
  let results = state.resources;
  if (filter?.available !== void 0) {
    results = results.filter(
      (r) => filter.available ? r.status === "available" : r.status !== "available"
    );
  }
  if (filter?.tier) {
    results = results.filter(
      (r) => r.models.some((m) => m.tier === filter.tier)
    );
  }
  return results;
}
function listModels(filter) {
  const state = loadState();
  if (!state) return [];
  const tierOrder = ["frontier", "mid", "local-large", "local-small"];
  const allModels = state.resources.filter((r) => r.status === "available").flatMap((r) => r.models);
  const unique = dedupeById(allModels);
  const filtered = filter?.tier ? unique.filter((m) => m.tier === filter.tier) : unique;
  return filtered.sort(
    (a, b) => tierOrder.indexOf(a.tier) - tierOrder.indexOf(b.tier)
  );
}
function dedupeById(models) {
  const seen = /* @__PURE__ */ new Set();
  return models.filter((m) => {
    if (seen.has(m.modelId)) return false;
    seen.add(m.modelId);
    return true;
  });
}
function buildAgentSummary() {
  const state = loadState();
  const tierOrder = [
    "frontier",
    "mid",
    "local-large",
    "local-small"
  ];
  if (!state) {
    return {
      tiers: tierOrder.map((t) => ({
        tier: t,
        description: tierDescription(t),
        models: []
      })),
      unavailableResources: []
    };
  }
  const allModels = listModels();
  const unavailable = state.resources.filter((r) => r.status !== "available").map((r) => ({ name: r.resource.name, error: r.error }));
  const stateAge = formatAge(state.probedAt);
  return {
    tiers: tierOrder.map((t) => ({
      tier: t,
      description: tierDescription(t),
      models: allModels.filter((m) => m.tier === t)
    })),
    unavailableResources: unavailable,
    stateAge
  };
}
function formatAge(isoTimestamp) {
  const diffMs = Date.now() - new Date(isoTimestamp).getTime();
  const mins = Math.floor(diffMs / 6e4);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
export {
  AUTH_FILE,
  MWOC_DIR,
  RESOURCES_FILE,
  STATE_FILE,
  TIER_ORDER,
  buildAgentSummary,
  ensureMwocDir,
  getApiKey,
  getResourceState,
  inferTier,
  listModels,
  listResources,
  loadAuth,
  loadResourcesConfig,
  loadState,
  probeAll,
  probeAnthropic,
  probeOllama,
  probeOpenAI,
  probeOpenAICompatible,
  probeRemoteRig,
  probeResource,
  saveAuth,
  saveResourcesConfig,
  tierDescription
};
