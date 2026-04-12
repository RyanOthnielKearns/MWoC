import { longestPrefixMatch, sortedLongestPrefixMatch } from "./utils/matching.js";
import type { CapabilityTier } from "./types.js";

// Static default tier assignments for well-known model IDs.
// Matched by prefix — the most specific prefix wins.
// Users can override any assignment in resources.yaml > tierOverrides.
const DEFAULT_TIER_MAP: Array<{ prefix: string; tier: CapabilityTier }> = [
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
  { prefix: "smollm", tier: "local-small" },
];

const TIER_DESCRIPTIONS: Record<CapabilityTier, string> = {
  frontier:
    "Best available reasoning, long-context understanding, and novel synthesis. Use for architecture decisions, complex debugging, and tasks that require judgment across large codebases.",
  mid: "Strong general-purpose capability at lower cost. Use for drafting, code generation, structured summarization, and multi-step reasoning that doesn't require frontier judgment.",
  "local-large":
    "On-device inference, no rate limits, moderate capability. Use for iteration, reformatting, structured extraction, and tasks where privacy or latency matter.",
  "local-small":
    "Fast, low-memory, on-device. Use for classification, routing decisions, templating, and any task where speed matters more than depth.",
};

const SORTED_DEFAULT_TIER_MAP = [...DEFAULT_TIER_MAP].sort(
  (a, b) => b.prefix.length - a.prefix.length
);

export function inferTier(
  modelId: string,
  overrides?: Record<string, CapabilityTier>
): CapabilityTier {
  const normalized = modelId.toLowerCase();

  if (overrides) {
    const exactOverride = overrides[modelId] ?? overrides[normalized];
    if (exactOverride) return exactOverride;

    for (const [prefix, tier] of Object.entries(overrides)) {
      if (normalized.startsWith(prefix.toLowerCase())) return tier;
    }
  }

  // Use shared matching utility with pre-sorted map
  const match = sortedLongestPrefixMatch(normalized, SORTED_DEFAULT_TIER_MAP.map(e => ({ prefix: e.prefix, value: e.tier })));
  if (match) return match;

  // Unknown model — default to local-large (conservative)
  return "local-large";
}

export function tierDescription(tier: CapabilityTier): string {
  return TIER_DESCRIPTIONS[tier];
}
