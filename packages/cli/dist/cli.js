#!/usr/bin/env node

// src/cli.ts
import { Command } from "commander";
import chalk from "chalk";
import Table from "cli-table3";
import { input, password, select } from "@inquirer/prompts";
import {
  probeAll,
  listModels,
  getResourceState,
  loadAuth,
  saveAuth,
  loadResourcesConfig,
  saveResourcesConfig,
  MWOC_DIR,
  RESOURCES_FILE,
  AUTH_FILE
} from "@mwoc/core";
async function pingOllama(endpoint) {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 3e3);
    const res = await fetch(`${endpoint}/api/tags`, { signal: controller.signal });
    clearTimeout(id);
    return res.ok;
  } catch {
    return false;
  }
}
var TIER_COLORS = {
  frontier: chalk.magenta,
  mid: chalk.blue,
  "local-large": chalk.green,
  "local-small": chalk.gray
};
var program = new Command();
program.name("mwoc").description("My World of Compute \u2014 personal compute registry").version("0.1.0");
program.command("status").description("Show all resources and their current availability").action(() => {
  const state = getResourceState();
  if (!state) {
    console.log(
      chalk.yellow("No state found. Run `mwoc probe` to scan your resources.")
    );
    return;
  }
  const age = formatAge(state.probedAt);
  console.log(chalk.dim(`Last probed: ${age}
`));
  const table = new Table({
    head: ["Resource", "Type", "Status", "Models", "Notes"].map(
      (h) => chalk.bold(h)
    ),
    colWidths: [20, 10, 14, 8, 30]
  });
  for (const r of state.resources) {
    const statusStr = r.status === "available" ? chalk.green("available") : r.status === "unavailable" ? chalk.red("unavailable") : chalk.yellow("unknown");
    const typeStr = r.resource.type === "server" ? "server" : r.resource.type === "cloud" && r.resource.webOnly ? "web sub" : r.resource.type;
    const notes = r.error && r.status !== "unknown" ? chalk.dim(r.error.slice(0, 40)) : r.resource.type === "local" ? r.resource.endpoint : r.resource.type === "server" ? r.resource.endpoint : r.resource.type === "cloud" && r.resource.webOnly ? `${r.resource.provider} (web only)` : r.resource.provider;
    table.push([r.resource.name, typeStr, statusStr, r.models.length, notes]);
  }
  console.log(table.toString());
});
program.command("models").description("List all available models, grouped by tier").option("--tier <tier>", "Filter by tier (frontier|mid|local-large|local-small)").action((opts) => {
  const tier = opts.tier;
  const models = listModels(tier ? { tier } : void 0);
  if (models.length === 0) {
    console.log(
      chalk.yellow("No models found. Run `mwoc probe` first.")
    );
    return;
  }
  const tierOrder = [
    "frontier",
    "mid",
    "local-large",
    "local-small"
  ];
  const tiers = tier ? [tier] : tierOrder;
  for (const t of tiers) {
    const group = models.filter((m) => m.tier === t);
    if (group.length === 0) continue;
    console.log("\n" + TIER_COLORS[t](`\u25B8 ${t.toUpperCase()}`));
    for (const m of group) {
      const ctx = m.contextWindow ? chalk.dim(` (${(m.contextWindow / 1e3).toFixed(0)}k ctx)`) : "";
      console.log(`  ${m.modelId}${ctx}`);
      if (m.notes) console.log(chalk.dim(`    ${m.notes}`));
    }
  }
  console.log();
});
program.command("probe").description("Re-probe all resources and update state cache").option("--resource <name>", "Probe only a specific resource by name").action(async (opts) => {
  console.log(chalk.dim("Probing resources..."));
  const state = await probeAll(
    opts.resource ? { resourceName: opts.resource } : void 0
  );
  let available = 0;
  let unavailable = 0;
  for (const r of state.resources) {
    const icon = r.status === "available" ? chalk.green("\u2713") : chalk.red("\u2717");
    const modelCount = r.status === "available" ? chalk.dim(` (${r.models.length} models)`) : "";
    const err = r.error ? chalk.dim(` \u2014 ${r.error.slice(0, 60)}`) : "";
    console.log(`  ${icon} ${r.resource.name}${modelCount}${err}`);
    if (r.status === "available") available++;
    else unavailable++;
  }
  console.log(
    `
${chalk.green(available)} available, ${chalk.red(unavailable)} unavailable`
  );
});
program.command("auth").description("Manage credentials").addCommand(
  new Command("add").description("Add or rotate a credential for a provider").argument("<provider>", "Provider name (e.g. anthropic, openai)").action(async (provider) => {
    const key = await password({ message: `API key for ${provider}:` });
    const auth = loadAuth();
    auth[provider] = { ...auth[provider], apiKey: key.trim() };
    saveAuth(auth);
    console.log(
      chalk.green(`\u2713 Saved API key for ${provider} to ${AUTH_FILE}`)
    );
  })
);
program.command("init").description("First-run wizard: declare resources and authenticate providers").action(async () => {
  console.log(chalk.bold("\nWelcome to My World of Compute (MWoC)\n"));
  console.log(`Config will be stored in ${chalk.cyan(MWOC_DIR)}
`);
  const resources = [];
  console.log(chalk.bold("Local machine"));
  const OLLAMA_DEFAULT = "http://localhost:11434";
  process.stdout.write(chalk.dim(`Checking for Ollama at ${OLLAMA_DEFAULT}... `));
  const ollamaFound = await pingOllama(OLLAMA_DEFAULT);
  if (ollamaFound) {
    console.log(chalk.green("found"));
    const addOllama = await select({
      message: "Add it to MWoC?",
      choices: [
        { value: true, name: "Yes" },
        { value: false, name: "No" }
      ]
    });
    if (addOllama) {
      resources.push({
        type: "local",
        name: "local-ollama",
        backend: "ollama",
        endpoint: OLLAMA_DEFAULT
      });
    }
  } else {
    console.log(chalk.dim("not found"));
    const ollamaElsewhere = await select({
      message: "Is Ollama running at a different address?",
      choices: [
        { value: true, name: "Yes" },
        { value: false, name: "No" }
      ]
    });
    if (ollamaElsewhere) {
      const endpoint = await input({
        message: "Ollama endpoint:",
        default: OLLAMA_DEFAULT
      });
      const name = await input({
        message: "Name for this resource:",
        default: "local-ollama"
      });
      resources.push({ type: "local", name, backend: "ollama", endpoint });
    }
  }
  console.log("\n" + chalk.bold("Anthropic"));
  console.log(chalk.dim("Claude Pro (claude.ai) and the Anthropic API are separate services."));
  const hasClaudePro = await select({
    message: "Do you have a Claude Pro or Claude Max subscription (claude.ai)?",
    choices: [
      { value: true, name: "Yes" },
      { value: false, name: "No" }
    ]
  });
  if (hasClaudePro) {
    const tier = await select({
      message: "Which plan?",
      choices: [
        { value: "Pro", name: "Claude Pro ($20/mo)" },
        { value: "Max", name: "Claude Max ($100/mo)" },
        { value: "Team", name: "Claude Team" }
      ]
    });
    resources.push({
      type: "cloud",
      name: `claude-${tier.toLowerCase()}`,
      provider: "anthropic",
      tier,
      webOnly: true
    });
    console.log(chalk.green(`\u2713 Claude ${tier} subscription noted`));
  }
  const hasAnthropicApi = await select({
    message: "Do you have an Anthropic API key?",
    choices: [
      { value: true, name: "Yes" },
      { value: false, name: "No" }
    ]
  });
  if (hasAnthropicApi) {
    const key = await password({ message: "Anthropic API key:" });
    const auth = loadAuth();
    auth["anthropic"] = { apiKey: key.trim() };
    saveAuth(auth);
    resources.push({
      type: "cloud",
      name: "anthropic-api",
      provider: "anthropic",
      tier: "API"
    });
    console.log(chalk.green("\u2713 Anthropic API key saved"));
  }
  console.log("\n" + chalk.bold("OpenAI"));
  console.log(chalk.dim("ChatGPT subscriptions and the OpenAI API are separate services."));
  const hasChatGPT = await select({
    message: "Do you have a ChatGPT subscription (chatgpt.com)?",
    choices: [
      { value: true, name: "Yes" },
      { value: false, name: "No" }
    ]
  });
  if (hasChatGPT) {
    const tier = await input({
      message: "Subscription tier (e.g. Plus, Edu, Team, Pro):",
      default: "Plus"
    });
    resources.push({
      type: "cloud",
      name: `chatgpt-${tier.toLowerCase()}`,
      provider: "openai",
      tier,
      webOnly: true
    });
    console.log(chalk.green(`\u2713 ChatGPT ${tier} subscription noted`));
  }
  const hasOpenAIApi = await select({
    message: "Do you have an OpenAI API key?",
    choices: [
      { value: true, name: "Yes" },
      { value: false, name: "No" }
    ]
  });
  if (hasOpenAIApi) {
    const key = await password({ message: "OpenAI API key:" });
    const auth = loadAuth();
    auth["openai"] = { apiKey: key.trim() };
    saveAuth(auth);
    resources.push({
      type: "cloud",
      name: "openai-api",
      provider: "openai",
      tier: "API"
    });
    console.log(chalk.green("\u2713 OpenAI API key saved"));
  }
  console.log("\n" + chalk.bold("Remote servers"));
  console.log(
    chalk.dim(
      "A remote server is any machine you have network access to that runs an inference API\n" + chalk.dim("(e.g. a shared GPU machine over VPN, a lab server, a home box you SSH into).")
    )
  );
  let addAnotherServer = true;
  let serverCount = 0;
  while (addAnotherServer) {
    const prompt = serverCount === 0 ? "Do you have access to a remote server running an inference API?" : "Add another remote server?";
    const addServer = await select({
      message: prompt,
      choices: [
        { value: true, name: "Yes" },
        { value: false, name: "No" }
      ]
    });
    if (!addServer) {
      addAnotherServer = false;
      break;
    }
    const name = await input({
      message: "Name for this server:",
      default: `server-${serverCount + 1}`
    });
    const endpoint = await input({
      message: "Inference API endpoint URL:",
      default: "http://10.0.0.1:8000"
    });
    const accessMethod = await select({
      message: "How do you reach it?",
      choices: [
        { value: "direct", name: "Direct \u2014 reachable over VPN or private network" },
        { value: "ssh-tunnel", name: "SSH tunnel \u2014 forward the port locally first" }
      ]
    });
    const server = {
      type: "server",
      name,
      backend: "vllm",
      endpoint,
      accessMethod
    };
    if (accessMethod === "ssh-tunnel") {
      server.sshHost = await input({ message: "SSH hostname or IP:" });
      server.sshUser = await input({ message: "SSH username:" });
    }
    resources.push(server);
    serverCount++;
  }
  const existing = loadResourcesConfig();
  saveResourcesConfig({ ...existing, resources });
  console.log(chalk.green(`
\u2713 Saved ${resources.length} resource(s) to ${RESOURCES_FILE}`));
  console.log(chalk.dim("Run `mwoc probe` to scan them now.\n"));
});
program.parse();
function formatAge(isoTimestamp) {
  const diffMs = Date.now() - new Date(isoTimestamp).getTime();
  const mins = Math.floor(diffMs / 6e4);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
