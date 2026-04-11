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
    const typeStr = r.resource.type;
    const notes = r.error ? chalk.dim(r.error.slice(0, 40)) : r.resource.type === "local" ? r.resource.endpoint : r.resource.type === "remote" ? r.resource.endpoint : r.resource.provider;
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
  console.log(
    `Config will be stored in ${chalk.cyan(MWOC_DIR)}
`
  );
  const resources = [];
  const addOllama = await select({
    message: "Do you have Ollama running locally?",
    choices: [
      { value: true, name: "Yes" },
      { value: false, name: "No" }
    ]
  });
  if (addOllama) {
    const endpoint = await input({
      message: "Ollama endpoint:",
      default: "http://localhost:11434"
    });
    const name = await input({
      message: "Name for this resource:",
      default: "local-ollama"
    });
    resources.push({ type: "local", name, backend: "ollama", endpoint });
  }
  const addAnthropic = await select({
    message: "Do you have an Anthropic API key (Claude Pro / API)?",
    choices: [
      { value: true, name: "Yes" },
      { value: false, name: "No" }
    ]
  });
  if (addAnthropic) {
    const key = await password({ message: "Anthropic API key:" });
    const auth = loadAuth();
    auth["anthropic"] = { apiKey: key.trim() };
    saveAuth(auth);
    resources.push({
      type: "cloud",
      name: "anthropic",
      provider: "anthropic",
      tier: "Pro"
    });
    console.log(chalk.green("\u2713 Anthropic key saved"));
  }
  const addOpenAI = await select({
    message: "Do you have an OpenAI API key or ChatGPT Edu subscription?",
    choices: [
      { value: true, name: "Yes" },
      { value: false, name: "No" }
    ]
  });
  if (addOpenAI) {
    const key = await password({ message: "OpenAI API key:" });
    const tierLabel = await input({
      message: "Subscription tier label (e.g. Edu, Plus):",
      default: "Edu"
    });
    const auth = loadAuth();
    auth["openai"] = { apiKey: key.trim() };
    saveAuth(auth);
    resources.push({
      type: "cloud",
      name: "openai",
      provider: "openai",
      tier: tierLabel
    });
    console.log(chalk.green("\u2713 OpenAI key saved"));
  }
  const addRemote = await select({
    message: "Do you have a remote GPU rig accessible over VPN?",
    choices: [
      { value: true, name: "Yes" },
      { value: false, name: "No" }
    ]
  });
  if (addRemote) {
    const name = await input({ message: "Name for this rig:", default: "gpu-rig-1" });
    const endpoint = await input({
      message: "vLLM/SGLang endpoint URL (when VPN is connected):",
      default: "http://10.0.0.1:8000"
    });
    const accessMethod = await select({
      message: "How do you reach it?",
      choices: [
        { value: "direct", name: "Direct over VPN IP" },
        { value: "ssh-tunnel", name: "SSH tunnel to forward the port" }
      ]
    });
    const rig = {
      type: "remote",
      name,
      backend: "vllm",
      endpoint,
      accessMethod
    };
    if (accessMethod === "ssh-tunnel") {
      rig.sshHost = await input({ message: "SSH hostname or IP:" });
      rig.sshUser = await input({ message: "SSH username:" });
    }
    resources.push(rig);
  }
  const existing = loadResourcesConfig();
  saveResourcesConfig({ ...existing, resources });
  console.log(chalk.green(`
\u2713 Saved ${resources.length} resource(s) to ${RESOURCES_FILE}`));
  console.log(chalk.dim("\nRun `mwoc probe` to scan them now.\n"));
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
