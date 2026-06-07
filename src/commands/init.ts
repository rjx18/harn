import type { Command } from "commander";
import { printYaml } from "../core/output.js";
import { findRepoRoot, getHarnPaths } from "../core/repo.js";
import { initializeHarn } from "../services/init.js";

interface InitCommandOptions {
  hook?: boolean;
  yes?: boolean;
}

export function registerInitCommand(program: Command): void {
  program
    .command("init")
    .description("Create the .harn directory structure.")
    .option("--no-hook", "Do not install the Harn pre-commit hook.")
    .option("--yes", "Run non-interactively with default init behavior.")
    .action(async (options: InitCommandOptions) => {
      const root = findRepoRoot();
      const result = await initializeHarn(getHarnPaths(root), {
        installHook: options.hook !== false
      });
      printYaml(result);
    });
}
