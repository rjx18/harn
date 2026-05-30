import type { Command } from "commander";
import { printYaml } from "../core/output.js";
import { findRepoRoot, getHarnPaths } from "../core/repo.js";
import { applyPlan } from "../services/apply.js";

export function registerApplyCommand(program: Command): void {
  program
    .command("apply [planId]")
    .description("Apply a valid locked plan to assumption truth.")
    .action(async (planId: string | undefined) => {
      const root = findRepoRoot();
      const result = await applyPlan(getHarnPaths(root), planId);
      printYaml(result);
      if (typeof result === "object" && result && "result" in result && result.result === "blocked") {
        process.exitCode = 1;
      }
    });
}
