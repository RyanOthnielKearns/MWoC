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
  backend: "ollama" | "vllm" | "sglang";
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

export interface GpuMonitorConfig {
  /** Upstash Redis REST URL — or an env var reference like "$UPSTASH_REDIS_REST_URL" */
  redisRestUrl: string;
  /** Upstash Redis REST token — or an env var reference like "$UPSTASH_REDIS_REST_TOKEN" */
  redisRestToken: string;
  /** Redis key to read; defaults to "gpu:state" */
  stateKey?: string;
}

export interface GpuEntry {
  index: number;
  name: string;
  utilization: number;    // %
  memory_used: number;    // MiB
  memory_total: number;   // MiB
  temperature: number;    // °C
  free: boolean;
  percent_available: number;
}

export interface GpuState {
  gpus: GpuEntry[];
  updatedAt: string; // ISO timestamp
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
  gpuMonitor?: GpuMonitorConfig;
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
  /**
   * For server resources only: whether the inference endpoint was reachable at
   * probe time. A server can be `available` (SSH host up) while inference is
   * `offline` (no vLLM/SGLang process running).
   */
  inferenceStatus?: "online" | "offline" | "unknown";
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
  /** general.architecture from GGUF metadata (e.g. "gemma4", "llama3") */
  architecture?: string;
  /** general.base_model.0.repo_id from GGUF metadata — direct HF repo ID when present */
  hfRepoId?: string;
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
  /** Ollama library page URL for local models — always set regardless of HF match status */
  ollamaLibraryUrl?: string;
}

// --- Bench types ---

export interface BenchPrompt {
  id: string;
  category: "coding" | "writing" | "reasoning";
  text: string;
}

export interface BenchRunResult {
  promptId: string;
  runIndex: number;               // 0-based
  loadTime: number;               // seconds (load_duration / 1e9)
  promptEvalTime: number;         // seconds (prompt_eval_duration / 1e9)
  generationTime: number;         // seconds (eval_duration / 1e9)
  totalTime: number;              // seconds (total_duration / 1e9)
  promptTokens: number;           // prompt_eval_count
  generationTokens: number;       // eval_count
  promptTokensPerSec: number;     // promptTokens / promptEvalTime
  generationTokensPerSec: number; // generationTokens / generationTime
}

export interface BenchAggregate {
  promptId: string;
  runCount: number;
  meanGenerationTokensPerSec: number;
  stddevGenerationTokensPerSec: number;
  meanPromptTokensPerSec: number;
  stddevPromptTokensPerSec: number;
  meanLoadTime: number;
  meanTotalTime: number;
  stddevTotalTime: number;
}

export interface BenchMemorySnapshot {
  processor: "cpu" | "gpu" | "unknown";
  modelSizeBytes: number | null;  // Ollama /api/ps → models[n].size
  vramSizeBytes: number | null;   // Ollama /api/ps → models[n].size_vram
  systemTotalMemBytes: number;    // os.totalmem()
  systemFreeMemBytes: number;     // os.freemem() captured after first inference
}

export interface BenchRun {
  id: string;               // sanitized "{ISO}-{resourceName}-{modelId}"
  modelId: string;
  resourceName: string;
  suite: string;
  runsPerPrompt: number;
  results: BenchRunResult[];    // all individual results across all prompts × runs
  aggregates: BenchAggregate[]; // one per promptId
  memory: BenchMemorySnapshot | null;
  timestamp: string;            // ISO
}

export type BenchProgressEvent =
  | { type: "run-start";        promptId: string; runIndex: number; runsPerPrompt: number }
  | { type: "run-done";         promptId: string; runIndex: number; result: BenchRunResult }
  | { type: "run-error";        promptId: string; runIndex: number; error: string }
  | { type: "memory-captured";  snapshot: BenchMemorySnapshot }
  | { type: "prompt-start";     promptId: string; promptText: string };
