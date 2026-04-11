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
  AUTH_FILE,
} from "@mwoc/core";
import type { CapabilityTier, Resource, RemoteServer } from "@mwoc/core";

async function pingOllama(endpoint: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${endpoint}/api/tags`, { signal: controller.signal });
    clearTimeout(id);
    return res.ok;
  } catch {
    return false;
  }
}

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

      const typeStr =
        r.resource.type === "server"
          ? "server"
          : r.resource.type === "cloud" && r.resource.webOnly
            ? "web sub"
            : r.resource.type;
      const notes =
        r.error && r.status !== "unknown"
          ? chalk.dim(r.error.slice(0, 40))
          : r.resource.type === "local"
            ? r.resource.endpoint
            : r.resource.type === "server"
              ? r.resource.endpoint
              : r.resource.type === "cloud" && r.resource.webOnly
                ? `${r.resource.provider} (web only)`
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

// --- mwoc auth ---
const authCmd = program
  .command("auth")
  .description("Manage credentials");

authCmd.addCommand(
  new Command("add")
    .description("Add or rotate a credential for a provider")
    .argument("<provider>", "Provider name (e.g. anthropic, openai)")
    .action(async (provider: string) => {
      const key = await password({ message: `API key for ${provider}:` });
      const auth = loadAuth();
      auth[provider] = { ...auth[provider], apiKey: key.trim() };
      saveAuth(auth);
      console.log(chalk.green(`✓ Saved API key for ${provider} to ${AUTH_FILE}`));
    })
);

authCmd.addCommand(
  new Command("remove")
    .description("Remove a stored credential for a provider")
    .argument("<provider>", "Provider name (e.g. anthropic, openai)")
    .action((provider: string) => {
      const auth = loadAuth();
      if (!auth[provider]) {
        console.log(chalk.yellow(`No credential found for "${provider}".`));
        return;
      }
      delete auth[provider];
      saveAuth(auth);
      console.log(chalk.green(`✓ Removed credential for "${provider}"`));
    })
);

authCmd.addCommand(
  new Command("list")
    .description("List providers that have a stored credential")
    .action(() => {
      const auth = loadAuth();
      const providers = Object.keys(auth);
      if (providers.length === 0) {
        console.log(chalk.dim("No credentials stored. Run: mwoc auth add <provider>"));
        return;
      }
      for (const p of providers) {
        const key = auth[p]?.apiKey;
        const display = key ? `${key.slice(0, 8)}${"•".repeat(12)}` : "(no key)";
        console.log(`  ${p.padEnd(16)} ${chalk.dim(display)}`);
      }
    })
);

// --- mwoc resource ---
const resourceCmd = program
  .command("resource")
  .description("Manage declared resources");

resourceCmd.addCommand(
  new Command("list")
    .description("List all declared resources from resources.yaml")
    .action(() => {
      const config = loadResourcesConfig();
      if (config.resources.length === 0) {
        console.log(chalk.dim("No resources declared. Run: mwoc init"));
        return;
      }
      for (const r of config.resources) {
        const detail =
          r.type === "local"
            ? r.endpoint
            : r.type === "server"
              ? r.endpoint
              : r.type === "cloud" && r.webOnly
                ? `${r.provider} (web only)`
                : r.provider;
        console.log(`  ${r.name.padEnd(24)} ${chalk.dim(r.type.padEnd(8))} ${chalk.dim(detail)}`);
      }
    })
);

resourceCmd.addCommand(
  new Command("remove")
    .description("Remove a declared resource by name")
    .argument("<name>", "Resource name as shown in `mwoc resource list`")
    .action((name: string) => {
      const config = loadResourcesConfig();
      const before = config.resources.length;
      config.resources = config.resources.filter((r) => r.name !== name);
      if (config.resources.length === before) {
        console.log(chalk.yellow(`No resource named "${name}" found.`));
        console.log(chalk.dim("Run `mwoc resource list` to see declared resource names."));
        return;
      }
      saveResourcesConfig(config);
      console.log(chalk.green(`✓ Removed resource "${name}" from ${RESOURCES_FILE}`));
      console.log(chalk.dim("If this resource had an API key, also run: mwoc auth remove <provider>"));
    })
);

// --- mwoc init ---
program
  .command("init")
  .description("First-run wizard: declare resources and authenticate providers")
  .action(async () => {
    console.log(chalk.bold("\nWelcome to My World of Compute (MWoC)\n"));
    console.log(`Config will be stored in ${chalk.cyan(MWOC_DIR)}\n`);

    const resources: Resource[] = [];

    // --- Local Ollama ---
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
          { value: false, name: "No" },
        ],
      });
      if (addOllama) {
        resources.push({
          type: "local",
          name: "local-ollama",
          backend: "ollama",
          endpoint: OLLAMA_DEFAULT,
        });
      }
    } else {
      console.log(chalk.dim("not found"));
      const ollamaElsewhere = await select({
        message: "Is Ollama running at a different address?",
        choices: [
          { value: true, name: "Yes" },
          { value: false, name: "No" },
        ],
      });
      if (ollamaElsewhere) {
        const endpoint = await input({
          message: "Ollama endpoint:",
          default: OLLAMA_DEFAULT,
        });
        const name = await input({
          message: "Name for this resource:",
          default: "local-ollama",
        });
        resources.push({ type: "local", name, backend: "ollama", endpoint });
      }
    }

    // --- Anthropic ---
    console.log("\n" + chalk.bold("Anthropic"));
    console.log(chalk.dim("Claude Pro (claude.ai) and the Anthropic API are separate services."));

    const hasClaudePro = await select({
      message: "Do you have a Claude Pro or Claude Max subscription (claude.ai)?",
      choices: [
        { value: true, name: "Yes" },
        { value: false, name: "No" },
      ],
    });
    if (hasClaudePro) {
      const tier = await select({
        message: "Which plan?",
        choices: [
          { value: "Pro", name: "Claude Pro ($20/mo)" },
          { value: "Max", name: "Claude Max ($100/mo)" },
          { value: "Team", name: "Claude Team" },
        ],
      });
      resources.push({
        type: "cloud",
        name: `claude-${(tier as string).toLowerCase()}`,
        provider: "anthropic",
        tier: tier as string,
        webOnly: true,
      });
      console.log(chalk.green(`✓ Claude ${tier} subscription noted`));
    }

    const hasAnthropicApi = await select({
      message: "Do you have an Anthropic API key?",
      choices: [
        { value: true, name: "Yes" },
        { value: false, name: "No" },
      ],
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
        tier: "API",
      });
      console.log(chalk.green("✓ Anthropic API key saved"));
    }

    // --- OpenAI ---
    console.log("\n" + chalk.bold("OpenAI"));
    console.log(chalk.dim("ChatGPT subscriptions and the OpenAI API are separate services."));

    const hasChatGPT = await select({
      message: "Do you have a ChatGPT subscription (chatgpt.com)?",
      choices: [
        { value: true, name: "Yes" },
        { value: false, name: "No" },
      ],
    });
    if (hasChatGPT) {
      const tier = await input({
        message: "Subscription tier (e.g. Plus, Edu, Team, Pro):",
        default: "Plus",
      });
      resources.push({
        type: "cloud",
        name: `chatgpt-${tier.toLowerCase()}`,
        provider: "openai",
        tier,
        webOnly: true,
      });
      console.log(chalk.green(`✓ ChatGPT ${tier} subscription noted`));
    }

    const hasOpenAIApi = await select({
      message: "Do you have an OpenAI API key?",
      choices: [
        { value: true, name: "Yes" },
        { value: false, name: "No" },
      ],
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
        tier: "API",
      });
      console.log(chalk.green("✓ OpenAI API key saved"));
    }

    // --- Remote servers ---
    console.log("\n" + chalk.bold("Remote servers"));
    console.log(
      chalk.dim(
        "A remote server is any machine you have network access to that runs an inference API\n" +
        chalk.dim("(e.g. a shared GPU machine over VPN, a lab server, a home box you SSH into).")
      )
    );

    let addAnotherServer = true;
    let serverCount = 0;

    while (addAnotherServer) {
      const prompt = serverCount === 0
        ? "Do you have access to a remote server running an inference API?"
        : "Add another remote server?";

      const addServer = await select({
        message: prompt,
        choices: [
          { value: true, name: "Yes" },
          { value: false, name: "No" },
        ],
      });

      if (!addServer) {
        addAnotherServer = false;
        break;
      }

      const name = await input({
        message: "Name for this server:",
        default: `server-${serverCount + 1}`,
      });
      const endpoint = await input({
        message: "Inference API endpoint URL:",
        default: "http://10.0.0.1:8000",
      });
      const accessMethod = await select({
        message: "How do you reach it?",
        choices: [
          { value: "direct", name: "Direct — reachable over VPN or private network" },
          { value: "ssh-tunnel", name: "SSH tunnel — forward the port locally first" },
        ],
      });

      const server: Resource = {
        type: "server",
        name,
        backend: "vllm",
        endpoint,
        accessMethod: accessMethod as "direct" | "ssh-tunnel",
      };

      if (accessMethod === "ssh-tunnel") {
        (server as RemoteServer).sshHost = await input({ message: "SSH hostname or IP:" });
        (server as RemoteServer).sshUser = await input({ message: "SSH username:" });
      }

      resources.push(server);
      serverCount++;
    }

    // Save
    const existing = loadResourcesConfig();
    saveResourcesConfig({ ...existing, resources });

    console.log(chalk.green(`\n✓ Saved ${resources.length} resource(s) to ${RESOURCES_FILE}`));
    console.log(chalk.dim("Run `mwoc probe` to scan them now.\n"));
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
