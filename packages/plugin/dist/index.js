// src/index.ts
import { probeAll, buildAgentSummary, getResourceState } from "@mwoc/core";
var index_default = definePluginEntry({
  id: "mwoc",
  register(api) {
    api.registerTool({
      name: "mwoc_list_models",
      description: "Returns all available LLM models from your compute registry, grouped by capability tier (frontier, mid, local-large, local-small). Each tier includes a description of what kinds of tasks it is suited for. Use this to decide which model to assign to a subtask.",
      parameters: {
        type: "object",
        properties: {
          tier: {
            type: "string",
            enum: ["frontier", "mid", "local-large", "local-small"],
            description: "Optional: filter to a specific tier. Omit to see all tiers."
          },
          refresh: {
            type: "boolean",
            description: "If true, re-probe all resources before returning results. Use when you suspect the state cache is stale (e.g. before starting a long task)."
          }
        },
        required: []
      },
      async execute(params) {
        const { tier, refresh } = params;
        if (refresh) {
          await probeAll();
        }
        const summary = buildAgentSummary();
        const state = getResourceState();
        const lines = [];
        if (state) {
          lines.push(`State freshness: ${summary.stateAge ?? "unknown"}`);
        } else {
          lines.push(
            "WARNING: No state cache found. Run `mwoc probe` or set refresh=true."
          );
        }
        const tiers = tier ? summary.tiers.filter((t) => t.tier === tier) : summary.tiers;
        for (const group of tiers) {
          lines.push(`
## ${group.tier.toUpperCase()}`);
          lines.push(group.description);
          if (group.models.length === 0) {
            lines.push("  (no models available in this tier)");
          } else {
            for (const m of group.models) {
              const ctx = m.contextWindow ? ` [${Math.round(m.contextWindow / 1e3)}k ctx]` : "";
              lines.push(`  - ${m.modelId}${ctx}`);
              if (m.notes) lines.push(`    Note: ${m.notes}`);
            }
          }
        }
        if (summary.unavailableResources.length > 0) {
          lines.push("\n## UNAVAILABLE RESOURCES");
          for (const r of summary.unavailableResources) {
            lines.push(`  - ${r.name}${r.error ? `: ${r.error}` : ""}`);
          }
        }
        return lines.join("\n");
      }
    });
    api.registerTool({
      name: "mwoc_probe",
      description: "Re-probes all configured compute resources (local Ollama, remote vLLM rigs, cloud APIs) and returns fresh availability and model data. Call this before starting a long multi-step task to ensure the model list is current.",
      parameters: {
        type: "object",
        properties: {
          resource: {
            type: "string",
            description: "Optional: name of a specific resource to probe (e.g. 'local-ollama'). Omit to probe all resources."
          }
        },
        required: []
      },
      async execute(params) {
        const { resource } = params;
        const state = await probeAll(resource ? { resourceName: resource } : void 0);
        const lines = [`Probed ${state.resources.length} resource(s):`];
        for (const r of state.resources) {
          const icon = r.status === "available" ? "\u2713" : "\u2717";
          const modelCount = r.status === "available" ? ` (${r.models.length} models)` : "";
          const err = r.error ? ` \u2014 ${r.error}` : "";
          lines.push(`  ${icon} ${r.resource.name}${modelCount}${err}`);
        }
        return lines.join("\n");
      }
    });
    api.registerSkill({
      name: "mwoc_select_model",
      description: "Given a description of a subtask, use the MWoC compute registry to recommend the most cost-efficient model that is capable of handling it. Preserves frontier budget for tasks that genuinely require it.",
      prompt: `You are helping select the right LLM for a subtask.

First, call the \`mwoc_list_models\` tool to see all available models grouped by capability tier. Each tier has a description of what it is suited for.

Then, given the subtask description the user provides, recommend:
1. The capability tier that fits the task (prefer the lowest tier that can handle it well)
2. A specific model from that tier to use
3. A one-sentence rationale

Be concise. Err toward cheaper/local models unless the task genuinely requires frontier reasoning, long context, or novel synthesis.`
    });
  }
});
export {
  index_default as default
};
