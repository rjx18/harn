import type { Command } from "commander";
import { printYaml } from "../core/output.js";
import { findRepoRoot, getHarnPaths } from "../core/repo.js";
import { checkDiff } from "../services/check.js";

export function registerCheckCommand(program: Command): void {
  program
    .command("check [planId]")
    .description("Validate a Git diff against a locked plan.")
    .option("--staged", "validate the staged diff")
    .action(async (planId: string | undefined, options: Record<string, unknown>) => {
      const root = findRepoRoot();
      const result = await checkDiff(getHarnPaths(root), { planId, staged: options["staged"] === true });
      printYaml(result);
      if (result.result === "blocked") {
        process.exitCode = 1;
      }
    });
}
