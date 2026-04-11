import fs from "node:fs";
import { STATE_FILE, loadResourcesConfig, ensureMwocDir } from "./config.js";
import { probeResource } from "./probes.js";
import { tierDescription } from "./tiers.js";
import type {
  CapabilityTier,
  ModelEntry,
  ProbedResource,
  StateCache,
} from "./types.js";

// --- State cache ---

export function loadState(): StateCache | null {
  if (!fs.existsSync(STATE_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8")) as StateCache;
  } catch {
    return null;
  }
}

function saveState(state: StateCache): void {
  ensureMwocDir();
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), {
    encoding: "utf-8",
  });
}

// --- Core API ---

/**
 * Re-probe all configured resources and persist results to state.json.
 * Returns the updated state.
 */
export async function probeAll(options?: {
  resourceName?: string;
}): Promise<StateCache> {
  const config = loadResourcesConfig();
  const resources = options?.resourceName
    ? config.resources.filter((r) => r.name === options.resourceName)
    : config.resources;

  const results = await Promise.all(
    resources.map((r) => probeResource(r, config.tierOverrides as Record<string, string> | undefined))
  );

  // Merge with existing state if filtering by name
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

  const state: StateCache = {
    probedAt: new Date().toISOString(),
    resources: finalResults,
  };
  saveState(state);
  return state;
}

/**
 * Return the last-probed state without re-probing.
 */
export function getResourceState(): StateCache | null {
  return loadState();
}

/**
 * List resources from state, with optional filtering.
 */
export function listResources(filter?: {
  tier?: CapabilityTier;
  available?: boolean;
}): ProbedResource[] {
  const state = loadState();
  if (!state) return [];

  let results = state.resources;

  if (filter?.available !== undefined) {
    results = results.filter((r) =>
      filter.available ? r.status === "available" : r.status !== "available"
    );
  }

  if (filter?.tier) {
    results = results.filter((r) =>
      r.models.some((m) => m.tier === filter.tier)
    );
  }

  return results;
}

/**
 * List all models from state, with optional tier filter.
 * Returns models sorted: frontier → mid → local-large → local-small.
 */
export function listModels(filter?: { tier?: CapabilityTier }): ModelEntry[] {
  const state = loadState();
  if (!state) return [];

  const tierOrder = ["frontier", "mid", "local-large", "local-small"];

  const allModels = state.resources
    .filter((r) => r.status === "available")
    .flatMap((r) => r.models);

  const unique = dedupeById(allModels);

  const filtered = filter?.tier
    ? unique.filter((m) => m.tier === filter.tier)
    : unique;

  return filtered.sort(
    (a, b) => tierOrder.indexOf(a.tier) - tierOrder.indexOf(b.tier)
  );
}

function dedupeById(models: ModelEntry[]): ModelEntry[] {
  const seen = new Set<string>();
  return models.filter((m) => {
    if (seen.has(m.modelId)) return false;
    seen.add(m.modelId);
    return true;
  });
}

/**
 * Return a structured summary suitable for an LLM to read and reason about.
 * This is the primary payload for the mwoc_list_models agent tool.
 */
export function buildAgentSummary(): {
  tiers: Array<{
    tier: CapabilityTier;
    description: string;
    models: ModelEntry[];
  }>;
  unavailableResources: Array<{ name: string; error?: string }>;
  stateAge?: string;
} {
  const state = loadState();
  const tierOrder: CapabilityTier[] = [
    "frontier",
    "mid",
    "local-large",
    "local-small",
  ];

  if (!state) {
    return {
      tiers: tierOrder.map((t) => ({
        tier: t,
        description: tierDescription(t),
        models: [],
      })),
      unavailableResources: [],
    };
  }

  const allModels = listModels();
  const unavailable = state.resources
    .filter((r) => r.status !== "available")
    .map((r) => ({ name: r.resource.name, error: r.error }));

  const stateAge = formatAge(state.probedAt);

  return {
    tiers: tierOrder.map((t) => ({
      tier: t,
      description: tierDescription(t),
      models: allModels.filter((m) => m.tier === t),
    })),
    unavailableResources: unavailable,
    stateAge,
  };
}

function formatAge(isoTimestamp: string): string {
  const diffMs = Date.now() - new Date(isoTimestamp).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
