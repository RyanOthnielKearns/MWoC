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
  // webOnly: true means this is a chat subscription (claude.ai, chatgpt.com) with no API access.
  // It can be tracked for awareness but cannot be probed or used by agents.
  webOnly?: boolean;
  // Models discovered by probing the API (not applicable for webOnly resources)
}

export interface RemoteServer {
  type: "server";
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

/** @deprecated Use RemoteServer instead. Kept for backwards compatibility. */
export type RemoteRig = RemoteServer;

export type Resource = LocalMachine | CloudSubscription | RemoteServer;

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

// --- Eval / benchmark types ---

export interface OllamaModelInfo {
  family: string;
  parameterSize: string;
  quantizationLevel: string;
  format: string;
}

export interface HFEvalResult {
  datasetName: string;
  metricName: string;
  metricValue: number;
  taskType: string;
}

export interface ArenaELOResult {
  rank: number;
  model: string;
  score: number | null;
  ci: number | null;
  votes: number | null;
}

export interface ModelEvalData {
  hfModelId: string | null;
  hfMatchConfidence: "exact" | "auto" | "none";
  hfEvals: HFEvalResult[];
  arenaELO: ArenaELOResult | null;
  fetchedAt: string;
}
