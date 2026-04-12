import { fetchWithTimeout } from "./utils/http.js";
import { wrapProbe } from "./utils/common.js";
import type {
  LocalMachine,
  CloudSubscription,
  RemoteServer,
  ProbedResource,
  ModelEntry,
} from "./types.js";
import { getApiKey } from "./config.js";
import { inferTier } from "./tiers.js";

const PROBE_TIMEOUT_MS = 8000;

function timestamp(): string {
  return new Date().toISOString();
}

// --- Ollama probe ---

interface OllamaTagsResponse {
  models: Array<{ name: string; details?: { parameter_size?: string } }>;
}

export async function probeOllama(
  resource: LocalMachine,
  tierOverrides?: Record<string, string>
): Promise<ProbedResource> {
  return wrapProbe(
    async () => {
      const url = `${resource.endpoint.replace(/\/$/, "")}/api/tags`;
      const res = await fetchWithTimeout(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as OllamaTagsResponse;

      const models: ModelEntry[] = data.models.map((m) => ({
        modelId: m.name,
        tier: inferTier(m.name, tierOverrides as Record<string, import("./types.js").CapabilityTier>),
        description: `Ollama model: ${m.name}${m.details?.parameter_size ? ` (${m.details.parameter_size})` : ""}`,
      }));

      return {
        resource,
        status: "available",
        models,
        probedAt: timestamp(),
      };
    },
    (err) => ({
      resource,
      status: "unavailable",
      models: [],
      probedAt: timestamp(),
      error: String(err),
    })
  );
}

// --- OpenAI-compatible probe (vLLM / SGLang / OpenAI / Anthropic via proxy) ---

interface OpenAIModelsResponse {
  data: Array<{ id: string; context_window?: number }>;
}

export async function probeOpenAICompatible(
  endpoint: string,
  apiKey: string | undefined,
  resourceName: string,
  tierOverrides?: Record<string, string>
): Promise<ModelEntry[]> {
  const url = `${endpoint.replace(/\/$/, "")}/v1/models`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

  const res = await fetchWithTimeout(url, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  const data = (await res.json()) as OpenAIModelsResponse;

  return data.data.map((m) => ({
    modelId: m.id,
    tier: inferTier(m.id, tierOverrides as Record<string, import("./types.js").CapabilityTier>),
    contextWindow: m.context_window,
    description: `${resourceName}: ${m.id}`,
  }));
}

export async function probeRemoteServer(
  resource: RemoteServer,
  tierOverrides?: Record<string, string>
): Promise<ProbedResource> {
  return wrapProbe(
    async () => {
      const models = await probeOpenAICompatible(
        resource.endpoint,
        undefined,
        resource.name,
        tierOverrides
      );
      return { resource, status: "available", models, probedAt: timestamp() };
    },
    (err) => ({
      resource,
      status: "unavailable",
      models: [],
      probedAt: timestamp(),
      error: String(err),
    })
  );
}

// --- Anthropic probe ---

interface AnthropicModelsResponse {
  data: Array<{ id: string; context_window?: number }>;
}

export async function probeAnthropic(
  resource: CloudSubscription,
  tierOverrides?: Record<string, string>
): Promise<ProbedResource> {
  if (resource.webOnly) {
    return {
      resource,
      status: "unknown",
      models: [],
      probedAt: timestamp(),
      error: "Web subscription — no API access to probe",
    };
  }

  const apiKey = getApiKey("anthropic");
  if (!apiKey) {
    return {
      resource,
      status: "unknown",
      models: [],
      probedAt: timestamp(),
      error: "No API key configured. Run: mwoc auth add anthropic",
    };
  }

  return wrapProbe(
    async () => {
      const res = await fetchWithTimeout("https://api.anthropic.com/v1/models", {
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as AnthropicModelsResponse;

      const models: ModelEntry[] = data.data.map((m) => ({
        modelId: m.id,
        tier: inferTier(m.id, tierOverrides as Record<string, import("./types.js").CapabilityTier>),
        contextWindow: m.context_window,
        description: `Anthropic (${resource.tier ?? "subscription"}): ${m.id}`,
      }));

      return { resource, status: "available", models, probedAt: timestamp() };
    },
    (err) => ({
      resource,
      status: "unavailable",
      models: [],
      probedAt: timestamp(),
      error: String(err),
    })
  );
}

// --- OpenAI probe ---

export async function probeOpenAI(
  resource: CloudSubscription,
  tierOverrides?: Record<string, string>
): Promise<ProbedResource> {
  if (resource.webOnly) {
    return {
      resource,
      status: "unknown",
      models: [],
      probedAt: timestamp(),
      error: "Web subscription — no API access to probe",
    };
  }

  const apiKey = getApiKey("openai");
  if (!apiKey) {
    return {
      resource,
      status: "unknown",
      models: [],
      probedAt: timestamp(),
      error: "No API key configured. Run: mwoc auth add openai",
    };
  }

  return wrapProbe(
    async () => {
      const models = await probeOpenAICompatible(
        "https://api.openai.com",
        apiKey,
        resource.name,
        tierOverrides
      );
      return { resource, status: "available", models, probedAt: timestamp() };
    },
    (err) => ({
      resource,
      status: "unavailable",
      models: [],
      probedAt: timestamp(),
      error: String(err),
    })
  );
}

// --- Dispatch ---

export async function probeResource(
  resource: import("./types.js").Resource,
  tierOverrides?: Record<string, string>
): Promise<ProbedResource> {
  if (resource.type === "local") {
    if (resource.backend === "ollama") return probeOllama(resource, tierOverrides);
    return {
      resource,
      status: "unknown",
      models: [],
      probedAt: timestamp(),
      error: `Unsupported local backend: ${(resource as LocalMachine).backend}`,
    };
  }

  if (resource.type === "server") {
    return probeRemoteServer(resource, tierOverrides);
  }

  if (resource.type === "cloud") {
    if (resource.provider === "anthropic") return probeAnthropic(resource, tierOverrides);
    if (resource.provider === "openai") return probeOpenAI(resource, tierOverrides);
    return {
      resource,
      status: "unknown",
      models: [],
      probedAt: timestamp(),
      error: `Unsupported cloud provider: ${resource.provider}`,
    };
  }

  return {
    resource,
    status: "unknown",
    models: [],
    probedAt: timestamp(),
    error: "Unknown resource type",
  };
}
