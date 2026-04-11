import fs from "node:fs";
import path from "node:path";
import { MWOC_DIR, ensureMwocDir } from "./config.js";
import { overallMeanToksPerSec } from "./bench.js";
import type { BenchRun } from "./types.js";

export const BENCH_DIR = path.join(MWOC_DIR, "bench");

function ensureBenchDir(): void {
  ensureMwocDir();
  if (!fs.existsSync(BENCH_DIR)) {
    fs.mkdirSync(BENCH_DIR, { recursive: true });
  }
}

// ---------------------------------------------------------------------------
// Save
// ---------------------------------------------------------------------------

export function saveBenchRun(run: BenchRun): string {
  ensureBenchDir();
  const filePath = path.join(BENCH_DIR, `${run.id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(run, null, 2), "utf-8");
  return filePath;
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export interface BenchRunSummary {
  id: string;
  modelId: string;
  resourceName: string;
  suite: string;
  runsPerPrompt: number;
  timestamp: string;
  meanGenerationTokensPerSec: number | null;
}

export function listBenchRuns(): BenchRunSummary[] {
  if (!fs.existsSync(BENCH_DIR)) return [];
  const files = fs.readdirSync(BENCH_DIR).filter((f) => f.endsWith(".json"));
  const summaries: BenchRunSummary[] = [];

  for (const file of files) {
    try {
      const run = JSON.parse(
        fs.readFileSync(path.join(BENCH_DIR, file), "utf-8"),
      ) as BenchRun;
      summaries.push({
        id: run.id,
        modelId: run.modelId,
        resourceName: run.resourceName,
        suite: run.suite,
        runsPerPrompt: run.runsPerPrompt,
        timestamp: run.timestamp,
        meanGenerationTokensPerSec: overallMeanToksPerSec(run),
      });
    } catch {
      // skip malformed files
    }
  }

  return summaries.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
}

// ---------------------------------------------------------------------------
// Load by prefix
// ---------------------------------------------------------------------------

export function loadBenchRun(idPrefix: string): BenchRun {
  if (!fs.existsSync(BENCH_DIR)) {
    throw new Error("No bench results found. Run `mwoc bench` first.");
  }
  const files = fs
    .readdirSync(BENCH_DIR)
    .filter((f) => f.endsWith(".json") && f.startsWith(idPrefix));

  if (files.length === 0) {
    throw new Error(`No bench run found matching prefix "${idPrefix}".`);
  }
  if (files.length > 1) {
    throw new Error(
      `Prefix "${idPrefix}" is ambiguous — matches: ${files.join(", ")}`,
    );
  }
  return JSON.parse(
    fs.readFileSync(path.join(BENCH_DIR, files[0]), "utf-8"),
  ) as BenchRun;
}
