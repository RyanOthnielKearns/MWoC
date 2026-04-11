import fs from "node:fs";
import path from "node:path";
import { MWOC_DIR, ensureMwocDir } from "./config.js";
import type {
  Resource,
  OllamaModelInfo,
  HFEvalResult,
  ArenaELOResult,
  ModelEvalData,
} from "./types.js";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const EVALS_DIR = path.join(MWOC_DIR, "evals");
const ARENA_CACHE_FILE = path.join(EVALS_DIR, "_arena-text.json");
const ID_MAP_FILE = path.join(EVALS_DIR, "id-map.json");

const EVAL_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function ensureEvalsDir(): void {
  ensureMwocDir();
  if (!fs.existsSync(EVALS_DIR)) {
    fs.mkdirSync(EVALS_DIR, { recursive: true });
  }
}

// ---------------------------------------------------------------------------
// Known HuggingFace IDs for cloud models (best-effort prefix match)
// ---------------------------------------------------------------------------

const CLOUD_HF_MAP: Array<{ prefix: string; hfId: string }> = [
  // Anthropic
  { prefix: "claude-opus-4",      hfId: "anthropic/claude-opus-4-20250514" },
  { prefix: "claude-sonnet-4",    hfId: "anthropic/claude-sonnet-4-20250514" },
  { prefix: "claude-haiku-4",     hfId: "anthropic/claude-haiku-4-5-20251001" },
  { prefix: "claude-3-5-sonnet",  hfId: "anthropic/claude-3-5-sonnet-20241022" },
  { prefix: "claude-3-5-haiku",   hfId: "anthropic/claude-3-5-haiku-20241022" },
  { prefix: "claude-3-opus",      hfId: "anthropic/claude-3-opus-20240229" },
  { prefix: "claude-3-sonnet",    hfId: "anthropic/claude-3-sonnet-20240229" },
  { prefix: "claude-3-haiku",     hfId: "anthropic/claude-3-haiku-20240307" },
  // OpenAI
  { prefix: "gpt-4o-mini",        hfId: "openai/gpt-4o-mini" },
  { prefix: "gpt-4o",             hfId: "openai/gpt-4o" },
  { prefix: "gpt-4-turbo",        hfId: "openai/gpt-4-turbo" },
  { prefix: "gpt-4",              hfId: "openai/gpt-4" },
  { prefix: "o3-mini",            hfId: "openai/o3-mini" },
  { prefix: "o3",                 hfId: "openai/o3" },
  { prefix: "o1-mini",            hfId: "openai/o1-mini" },
  { prefix: "o1",                 hfId: "openai/o1" },
];

function lookupCloudHFId(modelId: string): string | null {
  const lower = modelId.toLowerCase();
  // Sort longer prefixes first so more specific matches win
  const sorted = [...CLOUD_HF_MAP].sort((a, b) => b.prefix.length - a.prefix.length);
  for (const entry of sorted) {
    if (lower.startsWith(entry.prefix)) return entry.hfId;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Benchmarks of interest (filter HF eval results to these)
// ---------------------------------------------------------------------------

const BENCHMARK_KEYWORDS = [
  "mmlu", "humaneval", "arc", "gsm8k", "hellaswag",
  "truthfulqa", "math", "winogrande", "mbpp", "bbh",
];

function isInterestingBenchmark(name: string): boolean {
  const lower = name.toLowerCase();
  return BENCHMARK_KEYWORDS.some((kw) => lower.includes(kw));
}

// ---------------------------------------------------------------------------
// Ollama model info
// ---------------------------------------------------------------------------

export async function fetchOllamaModelInfo(
  endpoint: string,
  modelId: string,
): Promise<OllamaModelInfo | null> {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${endpoint}/api/show`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: modelId }),
      signal: controller.signal,
    });
    clearTimeout(id);
    if (!res.ok) return null;
    const data = await res.json() as {
      details?: {
        family?: string;
        parameter_size?: string;
        quantization_level?: string;
        format?: string;
      };
    };
    const d = data.details ?? {};
    return {
      family: d.family ?? "unknown",
      parameterSize: d.parameter_size ?? "unknown",
      quantizationLevel: d.quantization_level ?? "unknown",
      format: d.format ?? "unknown",
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// HuggingFace ID resolution
// ---------------------------------------------------------------------------

interface IdMapEntry {
  hfId: string;
  confidence: "exact" | "auto";
}

function loadIdMap(): Record<string, IdMapEntry> {
  if (!fs.existsSync(ID_MAP_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(ID_MAP_FILE, "utf-8")) as Record<string, IdMapEntry>;
  } catch {
    return {};
  }
}

function saveIdMap(map: Record<string, IdMapEntry>): void {
  ensureEvalsDir();
  fs.writeFileSync(ID_MAP_FILE, JSON.stringify(map, null, 2), "utf-8");
}

async function autoMatchHFId(
  modelId: string,
  ollamaInfo: OllamaModelInfo | null,
): Promise<{ hfId: string; confidence: "exact" | "auto" } | null> {
  const cached = loadIdMap()[modelId];
  if (cached) return cached;

  // Build a search query from what we know
  const parts: string[] = [];
  if (ollamaInfo) {
    if (ollamaInfo.family && ollamaInfo.family !== "unknown") parts.push(ollamaInfo.family);
    if (ollamaInfo.parameterSize && ollamaInfo.parameterSize !== "unknown") {
      parts.push(ollamaInfo.parameterSize);
    }
  }
  // Also parse the modelId itself (strip tag: e.g. "llama3.2:3b" → "llama3.2 3b")
  const baseId = modelId.split(":")[0].replace(/[._-]+/g, " ");
  const query = parts.length > 0
    ? `${parts.join(" ")} instruct`
    : `${baseId} instruct`;

  try {
    const url = new URL("https://huggingface.co/api/models");
    url.searchParams.set("search", query);
    url.searchParams.set("sort", "downloads");
    url.searchParams.set("filter", "text-generation");
    url.searchParams.set("limit", "5");

    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url.toString(), { signal: controller.signal });
    clearTimeout(id);

    if (!res.ok) return null;
    const results = await res.json() as Array<{ id?: string; modelId?: string }>;
    if (!results.length) return null;

    const hfId = results[0].id ?? results[0].modelId ?? null;
    if (!hfId) return null;

    const entry: IdMapEntry = { hfId, confidence: "auto" };
    const map = loadIdMap();
    map[modelId] = entry;
    saveIdMap(map);
    return entry;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// HuggingFace eval results
// ---------------------------------------------------------------------------

async function fetchHFEvals(hfModelId: string): Promise<HFEvalResult[]> {
  try {
    const url = `https://huggingface.co/api/models/${encodeURIComponent(hfModelId)}?expand[]=evalResults`;
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(id);

    if (!res.ok) return [];
    const data = await res.json() as {
      evalResults?: Array<{
        dataset_name?: string;
        dataset_type?: string;
        metric_name?: string;
        metric_value?: number;
        task_type?: string;
      }>;
    };

    const raw = data.evalResults ?? [];
    return raw
      .filter((e) => isInterestingBenchmark(e.dataset_name ?? e.dataset_type ?? ""))
      .map((e) => ({
        datasetName: e.dataset_name ?? e.dataset_type ?? "unknown",
        metricName: e.metric_name ?? "score",
        metricValue: e.metric_value ?? 0,
        taskType: e.task_type ?? "unknown",
      }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Chatbot Arena ELO
// ---------------------------------------------------------------------------

interface ArenaCacheFile {
  data: Array<{
    rank: number;
    model: string;
    vendor: string | null;
    license: string | null;
    score: number | null;
    ci: number | null;
    votes: number | null;
  }>;
  fetchedAt: string;
}

async function getArenaLeaderboard(): Promise<ArenaCacheFile["data"]> {
  // Return cached data if fresh
  if (fs.existsSync(ARENA_CACHE_FILE)) {
    try {
      const cached = JSON.parse(fs.readFileSync(ARENA_CACHE_FILE, "utf-8")) as ArenaCacheFile;
      if (Date.now() - new Date(cached.fetchedAt).getTime() < EVAL_TTL_MS) {
        return cached.data;
      }
    } catch { /* fall through to re-fetch */ }
  }

  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(
      "https://api.wulong.dev/arena-ai-leaderboards/v1/leaderboard?name=text",
      { signal: controller.signal },
    );
    clearTimeout(id);

    if (!res.ok) return [];
    const data = await res.json() as ArenaCacheFile["data"];

    ensureEvalsDir();
    const cache: ArenaCacheFile = { data, fetchedAt: new Date().toISOString() };
    fs.writeFileSync(ARENA_CACHE_FILE, JSON.stringify(cache, null, 2), "utf-8");
    return data;
  } catch {
    return [];
  }
}

function normalise(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

async function lookupArenaELO(modelId: string, hfId: string | null): Promise<ArenaELOResult | null> {
  const leaderboard = await getArenaLeaderboard();
  if (!leaderboard.length) return null;

  // Build a list of candidate name fragments to try matching against
  const candidates = [
    normalise(modelId.split(":")[0]),
    ...(hfId ? [normalise(hfId.split("/").pop() ?? "")] : []),
  ];

  for (const entry of leaderboard) {
    const normEntry = normalise(entry.model);
    if (candidates.some((c) => c.length > 3 && normEntry.includes(c))) {
      return {
        rank: entry.rank,
        model: entry.model,
        score: entry.score,
        ci: entry.ci,
        votes: entry.votes,
      };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Per-model eval cache
// ---------------------------------------------------------------------------

function evalCachePath(hfId: string): string {
  const safe = encodeURIComponent(hfId).replace(/%/g, "_");
  return path.join(EVALS_DIR, `${safe}.json`);
}

function loadEvalCache(hfId: string): ModelEvalData | null {
  const p = evalCachePath(hfId);
  if (!fs.existsSync(p)) return null;
  try {
    const cached = JSON.parse(fs.readFileSync(p, "utf-8")) as ModelEvalData;
    if (Date.now() - new Date(cached.fetchedAt).getTime() < EVAL_TTL_MS) return cached;
    return null;
  } catch {
    return null;
  }
}

function saveEvalCache(hfId: string, data: ModelEvalData): void {
  ensureEvalsDir();
  fs.writeFileSync(evalCachePath(hfId), JSON.stringify(data, null, 2), "utf-8");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch all available eval data for a model. Results are cached on disk for 24h.
 */
export async function fetchModelEvals(
  modelId: string,
  resource: Resource,
): Promise<ModelEvalData> {
  // 1. Resolve HuggingFace ID
  let hfId: string | null = null;
  let hfMatchConfidence: ModelEvalData["hfMatchConfidence"] = "none";

  if (resource.type === "cloud") {
    const cloudMatch = lookupCloudHFId(modelId);
    if (cloudMatch) {
      hfId = cloudMatch;
      hfMatchConfidence = "exact";
    }
  } else if (resource.type === "local" || resource.type === "server") {
    const endpoint = resource.type === "local" ? resource.endpoint : resource.endpoint;
    const ollamaInfo = resource.type === "local"
      ? await fetchOllamaModelInfo(endpoint, modelId)
      : null;
    const match = await autoMatchHFId(modelId, ollamaInfo);
    if (match) {
      hfId = match.hfId;
      hfMatchConfidence = match.confidence;
    }
  }

  // 2. Check per-model cache (keyed on hfId or modelId if no hfId)
  const cacheKey = hfId ?? modelId;
  const cached = loadEvalCache(cacheKey);
  if (cached) return cached;

  // 3. Fetch in parallel
  const [hfEvals, arenaELO] = await Promise.all([
    hfId ? fetchHFEvals(hfId) : Promise.resolve([] as HFEvalResult[]),
    lookupArenaELO(modelId, hfId),
  ]);

  const result: ModelEvalData = {
    hfModelId: hfId,
    hfMatchConfidence,
    hfEvals,
    arenaELO,
    fetchedAt: new Date().toISOString(),
  };

  saveEvalCache(cacheKey, result);
  return result;
}
