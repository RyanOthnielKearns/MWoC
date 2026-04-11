// Capability tiers — ordered from most to least capable
export type CapabilityTier = "frontier" | "mid" | "local-large" | "local-small";

export const TIER_ORDER: CapabilityTier[] = [
  "frontier",
  "mid",
  "local-large",
  "local-small",
];

export interface ModelEntry {
  modelId: string;
  tier: CapabilityTier;
  contextWindow?: number;
  description: string;
  notes?: string;
}

// --- Resource types ---

export interface LocalMachine {
  type: "local";
  name: string;
  backend: "ollama";
  endpoint: string; // e.g. http://localhost:11434
  hardwareNotes?: string;
  // Models are discovered by probing, not declared statically
}

export interface CloudSubscription {
  type: "cloud";
  name: string;
  provider: "anthropic" | "openai" | "google" | string;
  tier?: string; // e.g. "Pro", "Edu"
  renewalDate?: string; // ISO date
  rateLimitNotes?: string;
  // Models discovered by probing the API
}

export interface RemoteRig {
  type: "remote";
  name: string;
  backend: "vllm" | "sglang";
  endpoint: string; // base URL of the OpenAI-compatible API
  accessMethod: "direct" | "ssh-tunnel";
  sshHost?: string; // required when accessMethod = ssh-tunnel
  sshUser?: string;
  localPort?: number; // local port for the tunnel
  hardwareNotes?: string;
  // Models discovered by probing
}

export type Resource = LocalMachine | CloudSubscription | RemoteRig;

// --- Probed state ---

export type ResourceStatus = "available" | "unavailable" | "unknown";

export interface ProbedResource {
  resource: Resource;
  status: ResourceStatus;
  models: ModelEntry[];
  probedAt: string; // ISO timestamp
  error?: string;
}

export interface StateCache {
  probedAt: string;
  resources: ProbedResource[];
}

// --- Config file shape (~/.mwoc/resources.yaml) ---

export interface ResourcesConfig {
  resources: Resource[];
  // Optional user overrides for tier assignments
  tierOverrides?: Record<string, CapabilityTier>;
}
