import type { Command } from "commander";
import { printYaml } from "../core/output.js";
import { findRepoRoot, getHarnPaths } from "../core/repo.js";
import { getHarnLog } from "../services/log.js";

export function registerLogCommand(program: Command): void {
  program
    .command("log")
    .description("List applied Harn plans.")
    .action(async () => {
      const root = findRepoRoot();
      printYaml(await getHarnLog(getHarnPaths(root)));
    });
}
