import { Command } from "commander";
import chalk from "chalk";
import Table from "cli-table3";
import { input, password, select } from "@inquirer/prompts";
import {
  probeAll,
  listResources,
  listModels,
  getResourceState,
  loadAuth,
  saveAuth,
  loadResourcesConfig,
  saveResourcesConfig,
  MWOC_DIR,
  RESOURCES_FILE,
  AUTH_FILE,
} from "@mwoc/core";
import type { CapabilityTier, Resource } from "@mwoc/core";

const TIER_COLORS: Record<CapabilityTier, chalk.Chalk> = {
  frontier: chalk.magenta,
  mid: chalk.blue,
  "local-large": chalk.green,
  "local-small": chalk.gray,
};

const program = new Command();

program
  .name("mwoc")
  .description("My World of Compute — personal compute registry")
  .version("0.1.0");

// --- mwoc status ---
program
  .command("status")
  .description("Show all resources and their current availability")
  .action(() => {
    const state = getResourceState();
    if (!state) {
      console.log(
        chalk.yellow("No state found. Run `mwoc probe` to scan your resources.")
      );
      return;
    }

    const age = formatAge(state.probedAt);
    console.log(chalk.dim(`Last probed: ${age}\n`));

    const table = new Table({
      head: ["Resource", "Type", "Status", "Models", "Notes"].map((h) =>
        chalk.bold(h)
      ),
      colWidths: [20, 10, 14, 8, 30],
    });

    for (const r of state.resources) {
      const statusStr =
        r.status === "available"
          ? chalk.green("available")
          : r.status === "unavailable"
            ? chalk.red("unavailable")
            : chalk.yellow("unknown");

      const typeStr = r.resource.type;
      const notes =
        r.error
          ? chalk.dim(r.error.slice(0, 40))
          : r.resource.type === "local"
            ? r.resource.endpoint
            : r.resource.type === "remote"
              ? r.resource.endpoint
              : r.resource.provider;

      table.push([r.resource.name, typeStr, statusStr, r.models.length, notes]);
    }

    console.log(table.toString());
  });

// --- mwoc models ---
program
  .command("models")
  .description("List all available models, grouped by tier")
  .option("--tier <tier>", "Filter by tier (frontier|mid|local-large|local-small)")
  .action((opts: { tier?: string }) => {
    const tier = opts.tier as CapabilityTier | undefined;
    const models = listModels(tier ? { tier } : undefined);

    if (models.length === 0) {
      console.log(
        chalk.yellow("No models found. Run `mwoc probe` first.")
      );
      return;
    }

    const tierOrder: CapabilityTier[] = [
      "frontier",
      "mid",
      "local-large",
      "local-small",
    ];
    const tiers = tier ? [tier] : tierOrder;

    for (const t of tiers) {
      const group = models.filter((m) => m.tier === t);
      if (group.length === 0) continue;

      console.log("\n" + TIER_COLORS[t](`▸ ${t.toUpperCase()}`));
      for (const m of group) {
        const ctx = m.contextWindow
          ? chalk.dim(` (${(m.contextWindow / 1000).toFixed(0)}k ctx)`)
          : "";
        console.log(`  ${m.modelId}${ctx}`);
        if (m.notes) console.log(chalk.dim(`    ${m.notes}`));
      }
    }
    console.log();
  });

// --- mwoc probe ---
program
  .command("probe")
  .description("Re-probe all resources and update state cache")
  .option("--resource <name>", "Probe only a specific resource by name")
  .action(async (opts: { resource?: string }) => {
    console.log(chalk.dim("Probing resources..."));
    const state = await probeAll(
      opts.resource ? { resourceName: opts.resource } : undefined
    );

    let available = 0;
    let unavailable = 0;
    for (const r of state.resources) {
      const icon = r.status === "available" ? chalk.green("✓") : chalk.red("✗");
      const modelCount =
        r.status === "available" ? chalk.dim(` (${r.models.length} models)`) : "";
      const err = r.error ? chalk.dim(` — ${r.error.slice(0, 60)}`) : "";
      console.log(`  ${icon} ${r.resource.name}${modelCount}${err}`);
      if (r.status === "available") available++;
      else unavailable++;
    }

    console.log(
      `\n${chalk.green(available)} available, ${chalk.red(unavailable)} unavailable`
    );
  });

// --- mwoc auth add ---
program
  .command("auth")
  .description("Manage credentials")
  .addCommand(
    new Command("add")
      .description("Add or rotate a credential for a provider")
      .argument("<provider>", "Provider name (e.g. anthropic, openai)")
      .action(async (provider: string) => {
        const key = await password({ message: `API key for ${provider}:` });
        const auth = loadAuth();
        auth[provider] = { ...auth[provider], apiKey: key.trim() };
        saveAuth(auth);
        console.log(
          chalk.green(`✓ Saved API key for ${provider} to ${AUTH_FILE}`)
        );
      })
  );

// --- mwoc init ---
program
  .command("init")
  .description("First-run wizard: declare resources and authenticate providers")
  .action(async () => {
    console.log(chalk.bold("\nWelcome to My World of Compute (MWoC)\n"));
    console.log(
      `Config will be stored in ${chalk.cyan(MWOC_DIR)}\n`
    );

    const resources: Resource[] = [];

    // Local Ollama
    const addOllama = await select({
      message: "Do you have Ollama running locally?",
      choices: [
        { value: true, name: "Yes" },
        { value: false, name: "No" },
      ],
    });

    if (addOllama) {
      const endpoint = await input({
        message: "Ollama endpoint:",
        default: "http://localhost:11434",
      });
      const name = await input({
        message: "Name for this resource:",
        default: "local-ollama",
      });
      resources.push({ type: "local", name, backend: "ollama", endpoint });
    }

    // Anthropic
    const addAnthropic = await select({
      message: "Do you have an Anthropic API key (Claude Pro / API)?",
      choices: [
        { value: true, name: "Yes" },
        { value: false, name: "No" },
      ],
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
        tier: "Pro",
      });
      console.log(chalk.green("✓ Anthropic key saved"));
    }

    // OpenAI
    const addOpenAI = await select({
      message: "Do you have an OpenAI API key or ChatGPT Edu subscription?",
      choices: [
        { value: true, name: "Yes" },
        { value: false, name: "No" },
      ],
    });

    if (addOpenAI) {
      const key = await password({ message: "OpenAI API key:" });
      const tierLabel = await input({
        message: "Subscription tier label (e.g. Edu, Plus):",
        default: "Edu",
      });
      const auth = loadAuth();
      auth["openai"] = { apiKey: key.trim() };
      saveAuth(auth);
      resources.push({
        type: "cloud",
        name: "openai",
        provider: "openai",
        tier: tierLabel,
      });
      console.log(chalk.green("✓ OpenAI key saved"));
    }

    // Remote VPN rig
    const addRemote = await select({
      message: "Do you have a remote GPU rig accessible over VPN?",
      choices: [
        { value: true, name: "Yes" },
        { value: false, name: "No" },
      ],
    });

    if (addRemote) {
      const name = await input({ message: "Name for this rig:", default: "gpu-rig-1" });
      const endpoint = await input({
        message: "vLLM/SGLang endpoint URL (when VPN is connected):",
        default: "http://10.0.0.1:8000",
      });
      const accessMethod = await select({
        message: "How do you reach it?",
        choices: [
          { value: "direct", name: "Direct over VPN IP" },
          { value: "ssh-tunnel", name: "SSH tunnel to forward the port" },
        ],
      });
      const rig: Resource = {
        type: "remote",
        name,
        backend: "vllm",
        endpoint,
        accessMethod: accessMethod as "direct" | "ssh-tunnel",
      };
      if (accessMethod === "ssh-tunnel") {
        rig.sshHost = await input({ message: "SSH hostname or IP:" });
        rig.sshUser = await input({ message: "SSH username:" });
      }
      resources.push(rig);
    }

    // Save resources config
    const existing = loadResourcesConfig();
    saveResourcesConfig({ ...existing, resources });

    console.log(chalk.green(`\n✓ Saved ${resources.length} resource(s) to ${RESOURCES_FILE}`));
    console.log(chalk.dim("\nRun `mwoc probe` to scan them now.\n"));
  });

program.parse();

function formatAge(isoTimestamp: string): string {
  const diffMs = Date.now() - new Date(isoTimestamp).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
