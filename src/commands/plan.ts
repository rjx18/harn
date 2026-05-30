import type { Command } from "commander";
import { printYaml } from "../core/output.js";
import { findRepoRoot, getHarnPaths } from "../core/repo.js";
import { checkPlan } from "../services/plan-check.js";
import { lockPlan } from "../services/plan-lock.js";

export function registerPlanCommand(program: Command): void {
  const plan = program
    .command("plan")
    .description("Validate and lock Harn plans.");

  plan
    .command("check <planId>")
    .description("Validate a plan before implementation.")
    .action(async (planId: string) => {
      const root = findRepoRoot();
      const result = await checkPlan(getHarnPaths(root), planId);
      printYaml(result);
      if (result.result === "invalid") {
        process.exitCode = 1;
      }
    });

  plan
    .command("lock <planId>")
    .description("Freeze a valid plan.")
    .action(async (planId: string) => {
      const root = findRepoRoot();
      const result = await lockPlan(getHarnPaths(root), planId);
      printYaml(result);
      if (result.result === "invalid") {
        process.exitCode = 1;
      }
    });
}
