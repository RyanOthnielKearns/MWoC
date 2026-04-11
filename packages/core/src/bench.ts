import os from "node:os";
import type {
  BenchPrompt,
  BenchRunResult,
  BenchAggregate,
  BenchMemorySnapshot,
  BenchRun,
  BenchProgressEvent,
} from "./types.js";

// ---------------------------------------------------------------------------
// Built-in prompt suite
// ---------------------------------------------------------------------------

export const BUILTIN_PROMPTS: BenchPrompt[] = [
  {
    id: "coding-1",
    category: "coding",
    text: "Write a TypeScript function that deep-clones an object, handling circular references.",
  },
  {
    id: "coding-2",
    category: "coding",
    text: "Implement a binary search tree in Python with insert, delete, and search operations, including unit tests.",
  },
  {
    id: "writing-1",
    category: "writing",
    text: "Write a 3-paragraph essay explaining the concept of emergence in complex systems, with two concrete examples.",
  },
  {
    id: "writing-2",
    category: "writing",
    text: "Compose a professional email declining a meeting invitation while proposing an alternative time and agenda.",
  },
  {
    id: "reasoning-1",
    category: "reasoning",
    text: "You have 8 balls, one is slightly heavier. You have a balance scale and exactly two weighings. Describe your strategy step by step.",
  },
  {
    id: "reasoning-2",
    category: "reasoning",
    text: "A store sells apples for $0.40 each and bags of 6 for $1.99. A customer buys 14 apples at minimum cost. Show your working.",
  },
];

export const PROMPT_SUITES: Record<string, string[]> = {
  all:       BUILTIN_PROMPTS.map((p) => p.id),
  coding:    ["coding-1",   "coding-2"],
  writing:   ["writing-1",  "writing-2"],
  reasoning: ["reasoning-1","reasoning-2"],
  quick:     ["coding-1"],
};

export function resolvePrompts(
  suite: string,
  customPrompt?: string,
): BenchPrompt[] {
  if (customPrompt) {
    return [{ id: "custom", category: "coding", text: customPrompt }];
  }
  const ids = PROMPT_SUITES[suite] ?? PROMPT_SUITES["all"];
  return BUILTIN_PROMPTS.filter((p) => ids.includes(p.id));
}

// ---------------------------------------------------------------------------
// Statistics helpers
// ---------------------------------------------------------------------------

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(
    values.map((v) => (v - m) ** 2).reduce((a, b) => a + b, 0) / values.length,
  );
}

// ---------------------------------------------------------------------------
// Ollama HTTP helpers
// ---------------------------------------------------------------------------

interface OllamaGenerateResponse {
  response: string;
  done: boolean;
  load_duration?: number;
  prompt_eval_duration?: number;
  eval_duration?: number;
  total_duration?: number;
  eval_count?: number;
  prompt_eval_count?: number;
}

interface OllamaPsEntry {
  name: string;
  size?: number;
  size_vram?: number;
}

async function ollamaGenerate(
  endpoint: string,
  modelId: string,
  prompt: string,
  timeoutMs = 120_000,
): Promise<OllamaGenerateResponse> {
  const base = endpoint.replace(/\/$/, "");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: modelId, prompt, stream: false }),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Ollama returned HTTP ${res.status}: ${await res.text()}`);
    }
    return (await res.json()) as OllamaGenerateResponse;
  } finally {
    clearTimeout(timer);
  }
}

async function ollamaPs(endpoint: string): Promise<OllamaPsEntry[]> {
  const base = endpoint.replace(/\/$/, "");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    const res = await fetch(`${base}/api/ps`, { signal: controller.signal });
    if (!res.ok) return [];
    const data = await res.json() as { models?: OllamaPsEntry[] };
    return data.models ?? [];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Core benchmark function
// ---------------------------------------------------------------------------

export async function benchmarkOllama(
  endpoint: string,
  modelId: string,
  resourceName: string,
  prompts: BenchPrompt[],
  runsPerPrompt: number,
  onProgress: (event: BenchProgressEvent) => void,
): Promise<BenchRun> {
  const allResults: BenchRunResult[] = [];
  let memory: BenchMemorySnapshot | null = null;
  let firstInferenceDone = false;

  for (const prompt of prompts) {
    onProgress({ type: "prompt-start", promptId: prompt.id, promptText: prompt.text });

    for (let runIndex = 0; runIndex < runsPerPrompt; runIndex++) {
      onProgress({ type: "run-start", promptId: prompt.id, runIndex, runsPerPrompt });

      try {
        const raw = await ollamaGenerate(endpoint, modelId, prompt.text);

        const loadTime        = (raw.load_duration        ?? 0) / 1e9;
        const promptEvalTime  = (raw.prompt_eval_duration ?? 0) / 1e9;
        const generationTime  = (raw.eval_duration        ?? 0) / 1e9;
        const totalTime       = (raw.total_duration       ?? 0) / 1e9;
        const promptTokens    = raw.prompt_eval_count ?? 0;
        const generationTokens = raw.eval_count ?? 0;

        const result: BenchRunResult = {
          promptId: prompt.id,
          runIndex,
          loadTime,
          promptEvalTime,
          generationTime,
          totalTime,
          promptTokens,
          generationTokens,
          promptTokensPerSec:     promptEvalTime  > 0 ? promptTokens    / promptEvalTime  : 0,
          generationTokensPerSec: generationTime  > 0 ? generationTokens / generationTime : 0,
        };

        allResults.push(result);
        onProgress({ type: "run-done", promptId: prompt.id, runIndex, result });

        // Capture memory snapshot after the very first successful inference
        if (!firstInferenceDone) {
          firstInferenceDone = true;
          const psEntries = await ollamaPs(endpoint);
          const entry = psEntries.find((e) => e.name === modelId);
          const snapshot: BenchMemorySnapshot = {
            processor:         entry?.size_vram && entry.size_vram > 0 ? "gpu" : entry ? "cpu" : "unknown",
            modelSizeBytes:    entry?.size ?? null,
            vramSizeBytes:     entry?.size_vram ?? null,
            systemTotalMemBytes: os.totalmem(),
            systemFreeMemBytes:  os.freemem(),
          };
          memory = snapshot;
          onProgress({ type: "memory-captured", snapshot });
        }
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        onProgress({ type: "run-error", promptId: prompt.id, runIndex, error });
      }
    }
  }

  // Build aggregates per prompt
  const aggregates: BenchAggregate[] = prompts.map((prompt) => {
    const runs = allResults.filter((r) => r.promptId === prompt.id);
    return {
      promptId: prompt.id,
      runCount: runs.length,
      meanGenerationTokensPerSec:   mean(runs.map((r) => r.generationTokensPerSec)),
      stddevGenerationTokensPerSec: stddev(runs.map((r) => r.generationTokensPerSec)),
      meanPromptTokensPerSec:       mean(runs.map((r) => r.promptTokensPerSec)),
      stddevPromptTokensPerSec:     stddev(runs.map((r) => r.promptTokensPerSec)),
      meanLoadTime:  mean(runs.map((r) => r.loadTime)),
      meanTotalTime: mean(runs.map((r) => r.totalTime)),
      stddevTotalTime: stddev(runs.map((r) => r.totalTime)),
    };
  });

  const timestamp = new Date().toISOString();
  const id = sanitizeId(`${timestamp}-${resourceName}-${modelId}`);

  return {
    id,
    modelId,
    resourceName,
    suite: "custom",   // caller overwrites this before saving
    runsPerPrompt,
    results: allResults,
    aggregates,
    memory,
    timestamp,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function sanitizeId(raw: string): string {
  return raw.replace(/[:/\\]/g, "_").replace(/\s+/g, "-");
}

/** Overall mean generation tokens/sec across all prompts in a run. */
export function overallMeanToksPerSec(run: BenchRun): number | null {
  const values = run.aggregates.map((a) => a.meanGenerationTokensPerSec).filter((v) => v > 0);
  return values.length > 0 ? mean(values) : null;
}
