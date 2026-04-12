import { ensureDir, readJson, writeJson, readYaml, writeYaml } from "./utils/storage.js";
import type { ResourcesConfig } from "./types.js";


export const MWOC_DIR = path.join(os.homedir(), ".mwoc");
export const AUTH_FILE = path.join(MWOC_DIR, "auth.json");
export const RESOURCES_FILE = path.join(MWOC_DIR, "resources.yaml");
export const STATE_FILE = path.join(MWOC_DIR, "state.json");

export function ensureMwocDir(): void {
  ensureDir(MWOC_DIR);
}

// --- Auth ---

export interface AuthConfig {
  [provider: string]: {
    apiKey?: string;
    // Future: OAuth tokens, etc.
  };
}

export function loadAuth(): AuthConfig {
  return readJson(AUTH_FILE, {});
}

export function saveAuth(auth: AuthConfig): void {
  writeJson(AUTH_FILE, auth, { mode: 0o600 });
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
  return readYaml(RESOURCES_FILE, DEFAULT_RESOURCES_CONFIG);
}

export function saveResourcesConfig(config: ResourcesConfig): void {
  writeYaml(RESOURCES_FILE, config);
}
