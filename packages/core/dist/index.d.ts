type CapabilityTier = "frontier" | "mid" | "local-large" | "local-small";
declare const TIER_ORDER: CapabilityTier[];
interface ModelEntry {
    modelId: string;
    tier: CapabilityTier;
    contextWindow?: number;
    description: string;
    notes?: string;
}
interface LocalMachine {
    type: "local";
    name: string;
    backend: "ollama";
    endpoint: string;
    hardwareNotes?: string;
}
interface CloudSubscription {
    type: "cloud";
    name: string;
    provider: "anthropic" | "openai" | "google" | string;
    tier?: string;
    renewalDate?: string;
    rateLimitNotes?: string;
}
interface RemoteRig {
    type: "remote";
    name: string;
    backend: "vllm" | "sglang";
    endpoint: string;
    accessMethod: "direct" | "ssh-tunnel";
    sshHost?: string;
    sshUser?: string;
    localPort?: number;
    hardwareNotes?: string;
}
type Resource = LocalMachine | CloudSubscription | RemoteRig;
type ResourceStatus = "available" | "unavailable" | "unknown";
interface ProbedResource {
    resource: Resource;
    status: ResourceStatus;
    models: ModelEntry[];
    probedAt: string;
    error?: string;
}
interface StateCache {
    probedAt: string;
    resources: ProbedResource[];
}
interface ResourcesConfig {
    resources: Resource[];
    tierOverrides?: Record<string, CapabilityTier>;
}

declare function inferTier(modelId: string, overrides?: Record<string, CapabilityTier>): CapabilityTier;
declare function tierDescription(tier: CapabilityTier): string;

declare const MWOC_DIR: string;
declare const AUTH_FILE: string;
declare const RESOURCES_FILE: string;
declare const STATE_FILE: string;
declare function ensureMwocDir(): void;
interface AuthConfig {
    [provider: string]: {
        apiKey?: string;
    };
}
declare function loadAuth(): AuthConfig;
declare function saveAuth(auth: AuthConfig): void;
declare function getApiKey(provider: string): string | undefined;
declare function loadResourcesConfig(): ResourcesConfig;
declare function saveResourcesConfig(config: ResourcesConfig): void;

declare function probeOllama(resource: LocalMachine, tierOverrides?: Record<string, string>): Promise<ProbedResource>;
declare function probeOpenAICompatible(endpoint: string, apiKey: string | undefined, resourceName: string, tierOverrides?: Record<string, string>): Promise<ModelEntry[]>;
declare function probeRemoteRig(resource: RemoteRig, tierOverrides?: Record<string, string>): Promise<ProbedResource>;
declare function probeAnthropic(resource: CloudSubscription, tierOverrides?: Record<string, string>): Promise<ProbedResource>;
declare function probeOpenAI(resource: CloudSubscription, tierOverrides?: Record<string, string>): Promise<ProbedResource>;
declare function probeResource(resource: Resource, tierOverrides?: Record<string, string>): Promise<ProbedResource>;

declare function loadState(): StateCache | null;
/**
 * Re-probe all configured resources and persist results to state.json.
 * Returns the updated state.
 */
declare function probeAll(options?: {
    resourceName?: string;
}): Promise<StateCache>;
/**
 * Return the last-probed state without re-probing.
 */
declare function getResourceState(): StateCache | null;
/**
 * List resources from state, with optional filtering.
 */
declare function listResources(filter?: {
    tier?: CapabilityTier;
    available?: boolean;
}): ProbedResource[];
/**
 * List all models from state, with optional tier filter.
 * Returns models sorted: frontier → mid → local-large → local-small.
 */
declare function listModels(filter?: {
    tier?: CapabilityTier;
}): ModelEntry[];
/**
 * Return a structured summary suitable for an LLM to read and reason about.
 * This is the primary payload for the mwoc_list_models agent tool.
 */
declare function buildAgentSummary(): {
    tiers: Array<{
        tier: CapabilityTier;
        description: string;
        models: ModelEntry[];
    }>;
    unavailableResources: Array<{
        name: string;
        error?: string;
    }>;
    stateAge?: string;
};

export { AUTH_FILE, type AuthConfig, type CapabilityTier, type CloudSubscription, type LocalMachine, MWOC_DIR, type ModelEntry, type ProbedResource, RESOURCES_FILE, type RemoteRig, type Resource, type ResourceStatus, type ResourcesConfig, STATE_FILE, type StateCache, TIER_ORDER, buildAgentSummary, ensureMwocDir, getApiKey, getResourceState, inferTier, listModels, listResources, loadAuth, loadResourcesConfig, loadState, probeAll, probeAnthropic, probeOllama, probeOpenAI, probeOpenAICompatible, probeRemoteRig, probeResource, saveAuth, saveResourcesConfig, tierDescription };
