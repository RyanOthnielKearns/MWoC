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
  benchmarkOllama,
  resolvePrompts,
  PROMPT_SUITES,
  saveBenchRun,
  listBenchRuns,
  loadBenchRun,
  overallMeanToksPerSec,
  BENCH_DIR,
} from "@mwoc/core";
import type {
  CapabilityTier,
  Resource,
  RemoteServer,
  BenchProgressEvent,
  BenchRunResult,
  BenchRun,
} from "@mwoc/core";
import { startDashboard } from "./dash.js";
import { formatAge } from "@mwoc/core/utils/time";
import { getResourceLabel, getResourceTypeLabel } from "@mwoc/core/utils/resources";
import { fetchWithTimeout } from "@mwoc/core/utils/http";

async function pingOllama(endpoint: string): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(
      `${endpoint}/api/tags`,
      {},
      3000
    );
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

      const typeStr = getResourceTypeLabel(r.resource);
      const notes =
        r.error && r.status !== "unknown"
          ? chalk.dim(r.error.slice(0, 40))
          : getResourceLabel(r.resource);

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
        console.log(chalk.dim("No resources declared. Run: mwoc resource add"));
        return;
      }
      for (const r of config.resources) {
        const detail = getResourceLabel(r);
        console.log(`  ${r.name.padEnd(24)} ${chalk.dim(r.type.padEnd(8))} ${chalk.dim(detail)}`);
      }
    })
);

resourceCmd.addCommand(
  new Command("add")
    .description("Add a single resource and append it to resources.yaml")
    .action(async () => {
      const config = loadResourcesConfig();
      const existingNames = new Set(config.resources.map((r) => r.name));

      const type = await select({
        message: "Resource type:",
        choices: [
          { value: "local",  name: "Local machine  (Ollama)" },
          { value: "cloud",  name: "Cloud provider (Anthropic, OpenAI, …)" },
          { value: "server", name: "Remote server  (vLLM / SGLang over VPN or SSH)" },
        ],
      });

      let resource: Resource;

      if (type === "local") {
        const endpoint = await input({
          message: "Ollama endpoint:",
          default: "http://localhost:11434",
        });
        const name = await input({
          message: "Name for this resource:",
          default: "local-ollama",
        });
        if (existingNames.has(name)) {
          console.log(chalk.yellow(`A resource named "${name}" already exists. Use a different name or remove it first.`));
          return;
        }
        resource = { type: "local", name, backend: "ollama", endpoint };

      } else if (type === "cloud") {
        const provider = await input({
          message: "Provider (e.g. anthropic, openai, google):",
          default: "anthropic",
        });
        const accessKind = await select({
          message: "Access type:",
          choices: [
            { value: "api",     name: "API key" },
            { value: "web",     name: "Web subscription (claude.ai, chatgpt.com, …)" },
          ],
        });

        if (accessKind === "web") {
          const tier = await input({
            message: "Subscription tier (e.g. Pro, Max, Plus, Edu):",
            default: "Pro",
          });
          const name = await input({
            message: "Name for this resource:",
            default: `${provider}-${tier.toLowerCase()}`,
          });
          if (existingNames.has(name)) {
            console.log(chalk.yellow(`A resource named "${name}" already exists. Use a different name or remove it first.`));
            return;
          }
          resource = { type: "cloud", name, provider, tier, webOnly: true };
        } else {
          const key = await password({ message: `API key for ${provider}:` });
          const auth = loadAuth();
          auth[provider] = { ...auth[provider], apiKey: key.trim() };
          saveAuth(auth);
          console.log(chalk.green(`✓ Saved API key for ${provider} to ${AUTH_FILE}`));

          const name = await input({
            message: "Name for this resource:",
            default: `${provider}-api`,
          });
          if (existingNames.has(name)) {
            console.log(chalk.yellow(`A resource named "${name}" already exists. Use a different name or remove it first.`));
            return;
          }
          resource = { type: "cloud", name, provider, tier: "API" };
        }

      } else {
        // server
        const name = await input({
          message: "Name for this server:",
          default: "gpu-server",
        });
        if (existingNames.has(name)) {
          console.log(chalk.yellow(`A resource named "${name}" already exists. Use a different name or remove it first.`));
          return;
        }
        const endpoint = await input({
          message: "Inference API endpoint URL:",
          default: "http://10.0.0.1:8000",
        });
        const accessMethod = await select({
          message: "How do you reach it?",
          choices: [
            { value: "direct",     name: "Direct — reachable over VPN or private network" },
            { value: "ssh-tunnel", name: "SSH tunnel — forward the port locally first" },
          ],
        });

        resource = {
          type: "server",
          name,
          backend: "vllm",
          endpoint,
          accessMethod: accessMethod as "direct" | "ssh-tunnel",
        };

        if (accessMethod === "ssh-tunnel") {
          (resource as RemoteServer).sshHost = await input({ message: "SSH hostname or IP:" });
          (resource as RemoteServer).sshUser = await input({ message: "SSH username:" });
        }
      }

      config.resources.push(resource);
      saveResourcesConfig(config);
      console.log(chalk.green(`✓ Added "${resource.name}" to ${RESOURCES_FILE}`));
      console.log(chalk.dim("Run `mwoc probe` to scan it now."));
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
    const existing = loadResourcesConfig();
    if (existing.resources.length > 0) {
      console.log(chalk.yellow(`\nWarning: ${existing.resources.length} resource(s) already configured in ${RESOURCES_FILE}.`));
      console.log(chalk.yellow("Running init will replace your entire resource list.\n"));
      console.log(chalk.dim("To add a single resource instead, run: mwoc resource add\n"));
      const proceed = await select({
        message: "Replace existing configuration and start over?",
        choices: [
          { value: false, name: "No, keep my current resources" },
          { value: true,  name: "Yes, wipe and reconfigure from scratch" },
        ],
      });
      if (!proceed) {
        console.log(chalk.dim("Aborted. Your resources are unchanged."));
        return;
      }
    }

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
    saveResourcesConfig({ ...existing, resources });

    console.log(chalk.green(`\n✓ Saved ${resources.length} resource(s) to ${RESOURCES_FILE}`));
    console.log(chalk.dim("Run `mwoc probe` to scan them now.\n"));
  });

// --- mwoc dash ---
program
  .command("dash")
  .description("Open the MWoC dashboard in a browser")
  .action(async () => {
    await startDashboard();
  });

// --- mwoc bench ---
program
  .command("bench")
  .description("Benchmark local Ollama models for throughput and memory usage")
  .option("--resource <name>", "Target resource (must be a local Ollama resource)")
  .option("--model <id>", "Specific model ID to benchmark")
  .option("--runs <n>", "Iterations per prompt", "3")
  .option("--suite <name>", `Prompt suite: ${Object.keys(PROMPT_SUITES).join(", ")}`, "all")
  .option("--prompt <text>", "Single custom prompt (overrides --suite)")
  .option("--list", "List saved bench runs")
  .option("--compare <ids>", "Compare two saved runs by ID prefix, comma-separated (e.g. --compare id1,id2)")
  .action(async (opts: {
    resource?: string;
    model?: string;
    runs: string;
    suite: string;
    prompt?: string;
    list?: boolean;
    compare?: string;
  }) => {

    // ── --list submode ──────────────────────────────────────────────────────
    if (opts.list) {
      const runs = listBenchRuns();
      if (runs.length === 0) {
        console.log(chalk.dim(`No bench results found. Run \`mwoc bench\` to create some.\n  Results are stored in ${BENCH_DIR}`));
        return;
      }
      const table = new Table({
        head: ["ID (prefix)", "Model", "Resource", "Suite", "Runs", "tok/s", "Date"].map(
          (h) => chalk.bold(h),
        ),
        colWidths: [26, 28, 20, 12, 6, 10, 22],
      });
      for (const r of runs) {
        const speed = r.meanGenerationTokensPerSec != null
          ? r.meanGenerationTokensPerSec.toFixed(1)
          : chalk.dim("—");
        const date = new Date(r.timestamp).toLocaleString();
        table.push([r.id.slice(0, 24), r.modelId, r.resourceName, r.suite, r.runsPerPrompt, speed, date]);
      }
      console.log(table.toString());
      return;
    }

    // ── --compare submode ───────────────────────────────────────────────────
    if (opts.compare) {
      const parts = opts.compare.split(",").map((s) => s.trim());
      if (parts.length !== 2) {
        console.log(chalk.red("--compare requires exactly two comma-separated ID prefixes."));
        process.exit(1);
      }
      let runA: BenchRun, runB: BenchRun;
      try {
        runA = loadBenchRun(parts[0]);
        runB = loadBenchRun(parts[1]);
      } catch (err) {
        console.log(chalk.red(String(err)));
        process.exit(1);
      }

      if (runA.suite !== runB.suite) {
        console.log(chalk.yellow(`Warning: suites differ (${runA.suite} vs ${runB.suite}). Comparison may be misleading.`));
      }

      console.log(chalk.bold("\nComparing two benchmark runs:"));
      console.log(`  A  ${chalk.cyan(runA.modelId.padEnd(24))} ${runA.resourceName}  ${new Date(runA.timestamp).toLocaleString()}`);
      console.log(`  B  ${chalk.cyan(runB.modelId.padEnd(24))} ${runB.resourceName}  ${new Date(runB.timestamp).toLocaleString()}`);
      console.log();

      function fmtDelta(a: number | null, b: number | null, higherIsBetter: boolean): string {
        if (a == null || b == null || a === 0) return chalk.dim("—");
        const pct = ((b - a) / a) * 100;
        const better = higherIsBetter ? pct > 0 : pct < 0;
        const str = (pct >= 0 ? "+" : "") + pct.toFixed(0) + "%";
        return better ? chalk.green(str) : chalk.red(str);
      }

      const meanA = overallMeanToksPerSec(runA);
      const meanB = overallMeanToksPerSec(runB);
      const loadA = runA.aggregates[0]?.meanLoadTime ?? null;
      const loadB = runB.aggregates[0]?.meanLoadTime ?? null;
      const memA  = runA.memory?.modelSizeBytes ?? null;
      const memB  = runB.memory?.modelSizeBytes ?? null;
      const promptA = runA.aggregates[0]
        ? runA.aggregates.reduce((s, a) => s + a.meanPromptTokensPerSec, 0) / runA.aggregates.length
        : null;
      const promptB = runB.aggregates[0]
        ? runB.aggregates.reduce((s, a) => s + a.meanPromptTokensPerSec, 0) / runB.aggregates.length
        : null;

      function fmtMem(bytes: number | null): string {
        if (bytes == null) return chalk.dim("—");
        return (bytes / 1e9).toFixed(2) + " GB";
      }

      const colA = 14, colB = 14, colD = 10;
      const hdr = (s: string) => chalk.dim(s.padEnd(24));
      const val = (s: string, w: number) => s.padStart(w);

      console.log(
        hdr("") +
        chalk.bold("A".padStart(colA)) +
        chalk.bold("B".padStart(colB)) +
        chalk.bold("Δ".padStart(colD)),
      );
      console.log(chalk.dim("─".repeat(24 + colA + colB + colD)));

      function row(label: string, a: string, b: string, delta: string) {
        console.log(hdr(label) + val(a, colA) + val(b, colB) + val(delta, colD));
      }

      row(
        "Generation speed",
        meanA != null ? meanA.toFixed(1) + " tok/s" : "—",
        meanB != null ? meanB.toFixed(1) + " tok/s" : "—",
        fmtDelta(meanA, meanB, true),
      );
      row(
        "Prompt speed",
        promptA != null ? promptA.toFixed(1) + " tok/s" : "—",
        promptB != null ? promptB.toFixed(1) + " tok/s" : "—",
        fmtDelta(promptA, promptB, true),
      );
      row(
        "Load time",
        loadA != null ? loadA.toFixed(2) + "s" : "—",
        loadB != null ? loadB.toFixed(2) + "s" : "—",
        fmtDelta(loadA, loadB, false),
      );
      row(
        "Memory",
        fmtMem(memA),
        fmtMem(memB),
        fmtDelta(memA, memB, false),
      );
      row("Suite",       runA.suite,        runB.suite,        chalk.dim("—"));
      row("Runs/prompt", String(runA.runsPerPrompt), String(runB.runsPerPrompt), chalk.dim("—"));
      console.log();
      return;
    }

    // ── Normal bench run ────────────────────────────────────────────────────

    const runsPerPrompt = Math.max(1, parseInt(opts.runs, 10) || 3);

    // Resolve resource
    const state = getResourceState();
    if (!state) {
      console.log(chalk.yellow("No probe state found. Run `mwoc probe` first."));
      process.exit(1);
    }

    let targetResource = opts.resource
      ? state.resources.find((r) => r.resource.name === opts.resource)
      : state.resources.find((r) => r.resource.type === "local" && r.status === "available");

    if (!targetResource) {
      const msg = opts.resource
        ? `Resource "${opts.resource}" not found in probe state.`
        : "No available local resource found.";
      console.log(chalk.yellow(msg + " Run `mwoc probe` or check `mwoc resource list`."));
      process.exit(1);
    }

    if (targetResource.resource.type !== "local") {
      console.log(chalk.red(`mwoc bench only supports local Ollama resources. "${targetResource.resource.name}" is type "${targetResource.resource.type}".`));
      process.exit(1);
    }

    const endpoint = (targetResource.resource as { endpoint: string }).endpoint;

    // Resolve models
    let modelIds: string[];
    if (opts.model) {
      const found = targetResource.models.find((m) => m.modelId === opts.model);
      if (!found) {
        console.log(chalk.yellow(`Model "${opts.model}" not found on ${targetResource.resource.name}. Run \`mwoc probe\` to refresh.`));
        process.exit(1);
      }
      modelIds = [opts.model];
    } else {
      modelIds = targetResource.models.map((m) => m.modelId);
      if (modelIds.length === 0) {
        console.log(chalk.yellow(`No models found on ${targetResource.resource.name}. Run \`mwoc probe\` to refresh.`));
        process.exit(1);
      }
      if (modelIds.length > 3) {
        console.log(chalk.yellow(`Found ${modelIds.length} models on ${targetResource.resource.name}:`));
        for (const id of modelIds) console.log(chalk.dim(`  ${id}`));
        const proceed = await select({
          message: "Benchmark all of them? (This may take a while)",
          choices: [
            { value: false, name: "No, cancel" },
            { value: true,  name: "Yes, benchmark all" },
          ],
        });
        if (!proceed) return;
      }
    }

    // Resolve prompts
    const suiteKey = PROMPT_SUITES[opts.suite] ? opts.suite : "all";
    const prompts = resolvePrompts(suiteKey, opts.prompt);

    // Run each model
    for (const modelId of modelIds) {
      const totalRuns = prompts.length * runsPerPrompt;
      const suiteName = opts.prompt ? "custom" : suiteKey;

      console.log(
        chalk.cyan(`\nBenchmarking ${chalk.bold(modelId)}`) +
        chalk.dim(`  ·  ${targetResource.resource.name}  ·  suite: ${suiteName}  ·  ${runsPerPrompt} run${runsPerPrompt !== 1 ? "s" : ""}/prompt  ·  ${totalRuns} total`),
      );
      console.log(chalk.dim("─".repeat(68)));

      // Track per-prompt state for output
      let lastPromptId = "";

      function handleProgress(event: BenchProgressEvent) {
        if (event.type === "prompt-start") {
          lastPromptId = event.promptId;
          const preview = event.promptText.length > 55
            ? event.promptText.slice(0, 55) + "…"
            : event.promptText;
          console.log(`\n  ${chalk.bold(event.promptId)}  ${chalk.dim(`"${preview}"`)}`);
        } else if (event.type === "run-done") {
          const r: BenchRunResult = event.result;
          const runLabel = `Run ${event.runIndex + 1}/${event.runsPerPrompt}`;
          console.log(
            chalk.dim(`  ${runLabel.padEnd(10)}`) +
            chalk.green("✓") +
            chalk.dim(`  ${r.generationTokens} tok`) +
            `  ${r.generationTime.toFixed(2)}s` +
            `  ${chalk.bold(r.generationTokensPerSec.toFixed(1))} tok/s`,
          );
        } else if (event.type === "run-error") {
          console.log(
            chalk.dim(`  Run ${event.runIndex + 1}/${runsPerPrompt}  `) +
            chalk.red(`✗  ${event.error.slice(0, 60)}`),
          );
        } else if (event.type === "memory-captured") {
          // Printed in summary below
        }
      }

      const benchRun = await benchmarkOllama(
        endpoint,
        modelId,
        targetResource.resource.name,
        prompts,
        runsPerPrompt,
        handleProgress,
      );
      benchRun.suite = suiteName;

      // Per-prompt aggregate lines
      for (const agg of benchRun.aggregates) {
        if (agg.runCount === 0) continue;
        const loadStr = agg.meanLoadTime > 0.01
          ? chalk.dim(`load ${agg.meanLoadTime.toFixed(2)}s · `)
          : "";
        const promptStr = chalk.dim(`prompt ${agg.meanPromptTokensPerSec.toFixed(0)} tok/s · `);
        const genStr = `generate ${chalk.yellow(agg.meanGenerationTokensPerSec.toFixed(1))}`;
        const sdStr = agg.runCount > 1
          ? chalk.dim(` ± ${agg.stddevGenerationTokensPerSec.toFixed(1)}`) + " tok/s"
          : " tok/s";
        console.log(`  ${chalk.dim("─")} ${loadStr}${promptStr}${genStr}${sdStr}`);
      }

      // Summary block
      const overallSpeed = overallMeanToksPerSec(benchRun);
      const allGenToks = benchRun.results.map((r) => r.generationTokensPerSec);
      const overallStddev = allGenToks.length > 1
        ? Math.sqrt(allGenToks.map((v) => (v - (overallSpeed ?? 0)) ** 2).reduce((a, b) => a + b, 0) / allGenToks.length)
        : 0;
      const allPromptToks = benchRun.results.map((r) => r.promptTokensPerSec);
      const meanPromptSpeed = allPromptToks.length > 0
        ? allPromptToks.reduce((a, b) => a + b, 0) / allPromptToks.length
        : 0;
      const firstLoad = benchRun.results.find((r) => r.runIndex === 0)?.loadTime ?? 0;
      const mem = benchRun.memory;

      console.log("\n" + chalk.dim("─".repeat(68)));
      console.log(chalk.green(`SUMMARY  ${chalk.bold(modelId)}`));

      if (overallSpeed != null) {
        console.log(
          `  ${chalk.bold("Generation").padEnd(18)}` +
          chalk.green(`${overallSpeed.toFixed(1)} ± ${overallStddev.toFixed(1)} tok/s`) +
          chalk.dim("  (mean ± stddev, all prompts)"),
        );
      }
      if (meanPromptSpeed > 0) {
        const promptTokStddev = allPromptToks.length > 1
          ? Math.sqrt(allPromptToks.map((v) => (v - meanPromptSpeed) ** 2).reduce((a, b) => a + b, 0) / allPromptToks.length)
          : 0;
        console.log(
          `  ${"Prompt eval".padEnd(18)}` +
          `${meanPromptSpeed.toFixed(1)} ± ${promptTokStddev.toFixed(1)} tok/s`,
        );
      }
      if (firstLoad > 0.01) {
        console.log(`  ${"Load time".padEnd(18)}${firstLoad.toFixed(2)}s${chalk.dim("  (first inference)")}`);
      }
      if (mem) {
        const sizeGB = mem.modelSizeBytes != null ? (mem.modelSizeBytes / 1e9).toFixed(2) + " GB" : "unknown";
        const proc = mem.processor === "gpu" ? chalk.green("GPU") : mem.processor === "cpu" ? "CPU" : chalk.dim("unknown");
        console.log(`  ${"Memory".padEnd(18)}${sizeGB}  ·  ${proc}`);
        console.log(
          chalk.dim(
            `  ${"System RAM".padEnd(18)}` +
            `${(mem.systemFreeMemBytes / 1e9).toFixed(1)} GB free / ` +
            `${(mem.systemTotalMemBytes / 1e9).toFixed(1)} GB total`,
          ),
        );
      }

      const savedPath = saveBenchRun(benchRun);
      console.log(`\n${chalk.dim("Saved →")} ${chalk.cyan(savedPath)}\n`);
    }
  });

program.parse();

// Removed duplicated formatAge utility
