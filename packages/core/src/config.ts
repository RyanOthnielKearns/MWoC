import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import yaml from "js-yaml";
import type { ResourcesConfig } from "./types.js";

export const MWOC_DIR = path.join(os.homedir(), ".mwoc");
export const AUTH_FILE = path.join(MWOC_DIR, "auth.json");
export const RESOURCES_FILE = path.join(MWOC_DIR, "resources.yaml");
export const STATE_FILE = path.join(MWOC_DIR, "state.json");

export function ensureMwocDir(): void {
  if (!fs.existsSync(MWOC_DIR)) {
    fs.mkdirSync(MWOC_DIR, { recursive: true, mode: 0o700 });
  }
}

// --- Auth ---

export interface AuthConfig {
  [provider: string]: {
    apiKey?: string;
    // Future: OAuth tokens, etc.
  };
}

export function loadAuth(): AuthConfig {
  if (!fs.existsSync(AUTH_FILE)) return {};
  const raw = fs.readFileSync(AUTH_FILE, "utf-8");
  return JSON.parse(raw) as AuthConfig;
}

export function saveAuth(auth: AuthConfig): void {
  ensureMwocDir();
  fs.writeFileSync(AUTH_FILE, JSON.stringify(auth, null, 2), {
    mode: 0o600,
    encoding: "utf-8",
  });
}

export function getApiKey(provider: string): string | undefined {
  // 1. Check auth.json
  const auth = loadAuth();
  if (auth[provider]?.apiKey) return auth[provider].apiKey;

  // 2. Fall back to environment variables
  const envMap: Record<string, string> = {
    anthropic: "ANTHROPIC_API_KEY",
    openai: "OPENAI_API_KEY",
    google: "GOOGLE_API_KEY",
  };
  const envVar = envMap[provider.toLowerCase()];
  if (envVar && process.env[envVar]) return process.env[envVar];

  return undefined;
}

// --- Resources config ---

const DEFAULT_RESOURCES_CONFIG: ResourcesConfig = {
  resources: [],
};

export function loadResourcesConfig(): ResourcesConfig {
  if (!fs.existsSync(RESOURCES_FILE)) return DEFAULT_RESOURCES_CONFIG;
  const raw = fs.readFileSync(RESOURCES_FILE, "utf-8");
  return yaml.load(raw) as ResourcesConfig;
}

export function saveResourcesConfig(config: ResourcesConfig): void {
  ensureMwocDir();
  fs.writeFileSync(RESOURCES_FILE, yaml.dump(config), { encoding: "utf-8" });
}
