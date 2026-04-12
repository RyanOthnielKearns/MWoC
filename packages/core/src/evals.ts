import fs from "node:fs";
import path from "node:path";
import { MWOC_DIR, ensureMwocDir } from "./config.js";
import { readJson, writeJson, ensureDir } from "./utils/storage.js";
import { fetchWithTimeout } from "./utils/http.js";
import { longestPrefixMatch, sortedLongestPrefixMatch } from "./utils/matching.js";
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
  ensureDir(EVALS_DIR);
}

// ---------------------------------------------------------------------------
// Known HuggingFace IDs for cloud models (best-effort prefix match)
// ---------------------------------------------------------------------------

const CLOUD_HF_MAP: Array<{ prefix: string; hfId: string }> = [
  // ... existing map ...
];

const SORTED_CLOUD_HF_MAP = [...CLOUD_HF_MAP].sort(
  (a, b) => b.prefix.length - a.prefix.length
);

function lookupCloudHFId(modelId: string): string | null {
  return sortedLongestPrefixMatch(modelId, SORTED_CLOUD_HF_MAP.map(e => ({ prefix: e.prefix, value: e.hfId })));
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
    const res = await fetchWithTimeout(`${endpoint}/api/show`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: modelId }),
    }, 5000);
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
  return readJson(ID_MAP_FILE, {});
}

function saveIdMap(map: Record<string, IdMapEntry>): void {
  writeJson(ID_MAP_FILE, map);
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

    const res = await fetchWithTimeout(url.toString(), {}, 8000);

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
    const res = await fetchWithTimeout(url, {}, 8000);

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
    const res = await fetchWithTimeout(
      "https://api.wulong.dev/arena-ai-leaderboards/v1/leaderboard?name=text",
      {},
      10000
    );

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
  return readJson(evalCachePath(hfId), null);
}

function saveEvalCache(hfId: string, data: ModelEvalData): void {
  writeJson(evalCachePath(hfId), data);
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
