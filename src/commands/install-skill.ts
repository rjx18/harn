import { homedir } from "node:os";
import { readFileSync } from "node:fs";
import type { Command } from "commander";
import { HarnError } from "../core/errors.js";
import { printYaml } from "../core/output.js";
import { installHarnCli, type CliInstallResult } from "../services/install.js";
import {
  getAutoInstallTargets,
  installHarnSkill,
  installTargetDescriptions,
  installTargets,
  type SkillInstallTarget
} from "../services/skill-install.js";

interface InstallSkillCommandOptions {
  target?: string;
  home?: string;
  project?: string;
  force?: boolean;
  dryRun?: boolean;
  yes?: boolean;
}

interface InstallCommandOptions extends InstallSkillCommandOptions {
  skipAgents?: boolean;
  skipCli?: boolean;
  package?: string;
}

export function registerInstallSkillCommand(program: Command): void {
  program
    .command("install")
    .description("Install the Harn CLI, then optionally install Harn into coding assistants.")
    .option(
      "-t, --target <targets>",
      "Comma-separated assistant targets: auto, all, codex, claude, claude-project, cursor, windsurf, copilot, agents."
    )
    .option("--home <path>", "Home directory to install user-scoped assistant skills into.")
    .option("--project <path>", "Project directory to install project-scoped assistant rules into.")
    .option("--force", "Replace existing Harn skill or rule files.")
    .option("--dry-run", "Show what would be installed without writing files.")
    .option("-y, --yes", "Skip the interactive menu and install auto-detected assistant targets.")
    .option("--skip-cli", "Do not install the Harn CLI globally.")
    .option("--skip-agents", "Do not install assistant skills or rules.")
    .option("--package <spec>", "Package spec used for the global CLI install.", "@richhardry/harn@latest")
    .action(async (options: InstallCommandOptions) => {
      try {
        const homeDir = options.home ?? homedir();
        const projectDir = options.project;

        if (process.stdin.isTTY && process.stdout.isTTY) {
          const result = await runInteractiveInstall(options, homeDir, projectDir);
          if (options.dryRun === true) {
            printYaml(result);
          }
          return;
        }

        const cli =
          options.skipCli === true
            ? {
                target: "cli" as const,
                kind: "global_npm_package" as const,
                package: options.package ?? "@richhardry/harn@latest",
                command: [],
                action: "skipped" as const,
                reason: "Skipped by --skip-cli."
              }
            : await installHarnCli({
                packageSpec: options.package,
                dryRun: options.dryRun === true
              });

        const targets = await resolveAssistantTargets({
          homeDir,
          projectDir,
          target: options.target,
          yes: options.yes === true,
          skipAgents: options.skipAgents === true,
          allowSkip: true
        });

        const agents =
          targets.length === 0
            ? {
                result: "skipped" as const,
                targets: [],
                notes: ["No assistant targets selected."]
              }
            : await installHarnSkill({
                targets,
                homeDir,
                projectDir,
                force: options.force === true,
                dryRun: options.dryRun === true
              });

        printYaml({
          result: "installed",
          cli,
          agents
        });
      } catch (error) {
        if (error instanceof Error) {
          throw new HarnError(error.message);
        }

        throw error;
      }
    });

  program
    .command("install-skill")
    .description("Install the bundled Harn skill into supported coding assistants.")
    .option(
      "-t, --target <targets>",
      "Comma-separated targets: auto, all, codex, claude, claude-project, cursor, windsurf, copilot, agents."
    )
    .option("--home <path>", "Home directory to install user-scoped assistant skills into.")
    .option("--project <path>", "Project directory to install project-scoped assistant rules into.")
    .option("--force", "Replace existing Harn skill or rule files.")
    .option("--dry-run", "Show what would be installed without writing files.")
    .option("-y, --yes", "Skip the interactive menu and install auto-detected targets.")
    .action(async (options: InstallSkillCommandOptions) => {
      try {
        const homeDir = options.home ?? homedir();
        const projectDir = options.project;
        const targets = await resolveAssistantTargets({
          homeDir,
          projectDir,
          target: options.target,
          yes: options.yes === true,
          skipAgents: false,
          allowSkip: false
        });

        const result = await installHarnSkill({
          targets,
          homeDir,
          projectDir,
          force: options.force === true,
          dryRun: options.dryRun === true
        });
        printYaml(result);
      } catch (error) {
        if (error instanceof Error) {
          throw new HarnError(error.message);
        }

        throw error;
      }
    });
}

interface InteractiveInstallResult {
  result: "installed";
  cli: CliInstallResult | {
    target: "cli";
    kind: "global_npm_package";
    package: string;
    command: string[];
    action: "skipped";
    reason: string;
  };
  agents: Awaited<ReturnType<typeof installHarnSkill>> | {
    result: "skipped";
    targets: [];
    notes: string[];
  };
}

async function runInteractiveInstall(
  options: InstallCommandOptions,
  homeDir: string,
  projectDir?: string
): Promise<InteractiveInstallResult> {
  const ui = new SetupUi();
  const cliLogs: string[] = [];
  const agentLogs: string[] = [];

  ui.render({
    title: "Setup",
    cliStatus: options.skipCli === true ? "skipped" : "running",
    cliLogs,
    agentStatus: "pending",
    agentLogs
  });

  const cli =
    options.skipCli === true
      ? {
          target: "cli" as const,
          kind: "global_npm_package" as const,
          package: options.package ?? "@richhardry/harn@latest",
          command: [],
          action: "skipped" as const,
          reason: "Skipped by --skip-cli."
        }
      : await ui.withSpinner(async () =>
          installHarnCli({
            packageSpec: options.package,
            dryRun: options.dryRun === true,
            onLog(line) {
              cliLogs.push(line);
              ui.render({
                title: "Setup",
                cliStatus: "running",
                cliLogs,
                agentStatus: "pending",
                agentLogs
              });
            }
          })
        );

  ui.render({
    title: "Setup",
    cliStatus: cli.action === "skipped" ? "skipped" : "done",
    cliLogs,
    agentStatus: options.skipAgents === true ? "skipped" : "running",
    agentLogs
  });

  const targets = await resolveAssistantTargets({
    homeDir,
    projectDir,
    target: options.target,
    yes: options.yes === true,
    skipAgents: options.skipAgents === true,
    allowSkip: true,
    ui,
    cliStatus: cli.action === "skipped" ? "skipped" : "done",
    cliLogs,
    agentLogs
  });

  const agents =
    targets.length === 0
      ? {
          result: "skipped" as const,
          targets: [] as [],
          notes: ["No assistant targets selected."]
        }
      : await installHarnSkill({
          targets,
          homeDir,
          projectDir,
          force: options.force === true,
          dryRun: options.dryRun === true
        });

  for (const target of agents.targets) {
    agentLogs.push(
      `${target.action.replace("_", " ")} ${formatTargetName(target.target)} ${target.kind} to ${target.path}`
    );
  }
  if (agents.targets.length === 0) {
    agentLogs.push("Skipped assistant setup.");
  }

  ui.stop();
  ui.render({
    title: "Setup complete",
    cliStatus: cli.action === "skipped" ? "skipped" : "done",
    cliLogs,
    agentStatus: agents.result === "skipped" ? "skipped" : "done",
    agentLogs,
    final: true
  });

  return {
    result: "installed",
    cli,
    agents
  };
}

async function resolveAssistantTargets(options: {
  homeDir: string;
  projectDir?: string;
  target?: string;
  yes: boolean;
  skipAgents: boolean;
  allowSkip: boolean;
  ui?: SetupUi;
  cliStatus?: StepStatus;
  cliLogs?: string[];
  agentLogs?: string[];
}): Promise<string[]> {
  if (options.skipAgents) {
    return [];
  }

  if (options.target !== undefined) {
    return [options.target];
  }

  if (options.yes) {
    return ["auto"];
  }

  if (process.stdin.isTTY && process.stdout.isTTY) {
    return promptForInstallTargets(options.homeDir, options.projectDir, {
      allowSkip: options.allowSkip,
      ui: options.ui,
      cliStatus: options.cliStatus,
      cliLogs: options.cliLogs,
      agentLogs: options.agentLogs
    });
  }

  return options.allowSkip ? [] : ["auto"];
}

async function promptForInstallTargets(
  homeDir = homedir(),
  projectDir = process.cwd(),
  options: {
    allowSkip: boolean;
    ui?: SetupUi;
    cliStatus?: StepStatus;
    cliLogs?: string[];
    agentLogs?: string[];
  } = { allowSkip: false }
): Promise<SkillInstallTarget[]> {
  const defaults = new Set(await getAutoInstallTargets(homeDir, projectDir));
  const selected = new Set<SkillInstallTarget>(options.allowSkip ? [] : defaults);
  let index = 0;
  let message = options.allowSkip ? "Choose assistants for Harn, or press Enter to skip." : "Choose where to install Harn.";

  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    const stdout = process.stdout;
    const wasRaw = stdin.isRaw;
    const wasPaused = stdin.isPaused();

    function cleanup(): void {
      stdin.off("data", onData);
      if (stdin.isTTY) {
        stdin.setRawMode(wasRaw);
      }
      if (wasPaused) {
        stdin.pause();
      }
      stdout.write(styles.cursor.show);
    }

    function render(): void {
      if (options.ui) {
        options.ui.render({
          title: "Setup",
          cliStatus: options.cliStatus ?? "done",
          cliLogs: options.cliLogs ?? [],
          agentStatus: "running",
          agentLogs: options.agentLogs ?? [],
          menu: {
            message,
            index,
            selected,
            detected: defaults
          }
        });
        return;
      }

      stdout.write(`${styles.cursor.hide}${styles.clear}`);
      stdout.write(`${message}\n\n`);
      stdout.write("Use ↑/↓ to move, Space to toggle, a to toggle all, Enter to continue, q to cancel.\n\n");
      stdout.write(renderMenu({ index, selected, detected: defaults }));
    }

    function onData(data: Buffer): void {
      const key = data.toString("utf8");

      if (key === "\u0003" || key.toLowerCase() === "q") {
        cleanup();
        reject(new HarnError("Install cancelled."));
        return;
      }

      if (key === "\x1B[A") {
        index = (index - 1 + installTargets.length) % installTargets.length;
      } else if (key === "\x1B[B") {
        index = (index + 1) % installTargets.length;
      } else if (key === " ") {
        const target = installTargets[index];
        if (selected.has(target)) {
          selected.delete(target);
        } else {
          selected.add(target);
        }
      } else if (key.toLowerCase() === "a") {
        if (selected.size === installTargets.length) {
          selected.clear();
        } else {
          for (const target of installTargets) {
            selected.add(target);
          }
        }
      } else if (key === "\r" || key === "\n") {
        if (selected.size === 0) {
          if (options.allowSkip) {
            cleanup();
            resolve([]);
            return;
          }
          message = "Select at least one target.";
        } else {
          const targets = installTargets.filter((target) => selected.has(target));
          cleanup();
          resolve(targets);
          return;
        }
      }

      render();
    }

    if (stdin.isTTY) {
      stdin.setRawMode(true);
    }
    stdin.resume();
    stdin.on("data", onData);
    render();
  });
}

type StepStatus = "pending" | "running" | "done" | "skipped";

interface SetupRenderState {
  title: string;
  cliStatus: StepStatus;
  cliLogs: string[];
  agentStatus: StepStatus;
  agentLogs: string[];
  menu?: {
    message: string;
    index: number;
    selected: Set<SkillInstallTarget>;
    detected: Set<SkillInstallTarget>;
  };
  final?: boolean;
}

class SetupUi {
  private frame = 0;
  private timer: NodeJS.Timeout | undefined;
  private lastState: SetupRenderState | undefined;

  render(state: SetupRenderState): void {
    this.lastState = state;
    process.stdout.write(`${styles.cursor.hide}${styles.clear}`);
    process.stdout.write(`${styles.cyan(wordArt())}\n`);
    process.stdout.write(`${styles.dim(`v${readPackageVersion()} - created by richhardry`)}\n\n`);
    process.stdout.write(`${styles.bold(state.title)}\n\n`);
    process.stdout.write(this.renderStep(1, "Install Harn CLI", state.cliStatus));
    process.stdout.write(renderLogs(state.cliLogs));
    process.stdout.write("\n");
    process.stdout.write(this.renderStep(2, "Install Harn agent skill", state.agentStatus));
    process.stdout.write(renderLogs(state.agentLogs));

    if (state.menu) {
      process.stdout.write(`\n    ${styles.dim(state.menu.message)}\n`);
      process.stdout.write(`    ${styles.dim("Use ↑/↓ to move, Space to toggle, a to toggle all, Enter to continue, q to cancel.")}\n\n`);
      process.stdout.write(renderMenu(state.menu));
    }

    if (state.final) {
      process.stdout.write(`\n${styles.green("Harn is ready.")}\n`);
      process.stdout.write(`Run ${styles.cyan("harn init")} in a repository to start.\n`);
      process.stdout.write(styles.cursor.show);
    }
  }

  withSpinner<T>(operation: () => Promise<T>): Promise<T> {
    this.timer = setInterval(() => {
      this.frame += 1;
      if (this.lastState) {
        this.render(this.lastState);
      }
    }, 90);

    return operation().finally(() => this.stop());
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  private renderStep(number: number, label: string, status: StepStatus): string {
    return `${styles.cyan(`[${number}]`)} ${label}  ${this.renderStatus(status)}\n`;
  }

  private renderStatus(status: StepStatus): string {
    switch (status) {
      case "running":
        return styles.yellow(`${spinnerFrames[this.frame % spinnerFrames.length]} installing`);
      case "done":
        return styles.green("✓ done");
      case "skipped":
        return styles.dim("skipped");
      case "pending":
        return styles.dim("pending");
    }
  }
}

const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

const styles = {
  clear: "\x1b[H\x1b[J",
  cursor: {
    hide: "\x1b[?25l",
    show: "\x1b[?25h"
  },
  bold: (value: string) => `\x1b[1m${value}\x1b[0m`,
  cyan: (value: string) => `\x1b[36m${value}\x1b[0m`,
  dim: (value: string) => `\x1b[2m${value}\x1b[0m`,
  green: (value: string) => `\x1b[32m${value}\x1b[0m`,
  yellow: (value: string) => `\x1b[33m${value}\x1b[0m`,
  gray: (value: string) => `\x1b[90m${value}\x1b[0m`
};

function renderLogs(logs: string[]): string {
  return logs
    .slice(-6)
    .map((log) => `    ${styles.dim(`> ${log}`)}\n`)
    .join("");
}

function renderMenu(menu: {
  index: number;
  selected: Set<SkillInstallTarget>;
  detected: Set<SkillInstallTarget>;
}): string {
  return installTargets
    .map((target, itemIndex) => {
      const pointer = itemIndex === menu.index ? styles.cyan("❯") : " ";
      const checked = menu.selected.has(target) ? styles.green("◉") : styles.gray("○");
      const detected = menu.detected.has(target) ? ` ${styles.dim("detected")}` : "";
      return [
        `    ${pointer} ${checked} ${styles.bold(formatTargetName(target))}${detected}`,
        `       ${styles.dim(installTargetDescriptions[target])}`
      ].join("\n");
    })
    .join("\n\n")
    .concat("\n");
}

function formatTargetName(target: SkillInstallTarget): string {
  const names: Record<SkillInstallTarget, string> = {
    codex: "Codex",
    claude: "Claude Code",
    "claude-project": "Claude Code project",
    cursor: "Cursor",
    windsurf: "Windsurf",
    copilot: "GitHub Copilot",
    agents: "AGENTS.md"
  };
  return names[target];
}

function wordArt(): string {
  return [
    "   ________  ________  ________  ________ ",
    "  ╱    ╱   ╲╱        ╲╱        ╲╱    ╱   ╲",
    " ╱         ╱         ╱         ╱         ╱",
    "╱         ╱         ╱        _╱         ╱ ",
    "╲___╱____╱╲___╱____╱╲____╱___╱╲__╱_____╱  "
  ].join("\n");
}

function readPackageVersion(): string {
  try {
    const packageJson = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
      version?: unknown;
    };
    return typeof packageJson.version === "string" ? packageJson.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}
