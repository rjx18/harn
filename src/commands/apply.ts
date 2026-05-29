import type { Command } from "commander";
import { printYaml } from "../core/output.js";
import { findRepoRoot, getHarnPaths } from "../core/repo.js";
import { applyPlan } from "../services/apply.js";

export function registerApplyCommand(program: Command): void {
  program
    .command("apply <planId>")
    .description("Apply a valid locked plan to assumption truth.")
    .action(async (planId: string) => {
      const root = findRepoRoot();
      printYaml(await applyPlan(getHarnPaths(root), planId));
    });
}
