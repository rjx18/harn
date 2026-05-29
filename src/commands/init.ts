import type { Command } from "commander";
import { printYaml } from "../core/output.js";
import { findRepoRoot, getHarnPaths } from "../core/repo.js";
import { initializeHarn } from "../services/init.js";

export function registerInitCommand(program: Command): void {
  program
    .command("init")
    .description("Create the .harn directory structure.")
    .action(async () => {
      const root = findRepoRoot();
      const result = await initializeHarn(getHarnPaths(root));
      printYaml(result);
    });
}
