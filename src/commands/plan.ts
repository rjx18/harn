import type { Command } from "commander";
import { printYaml } from "../core/output.js";
import { findRepoRoot, getHarnPaths } from "../core/repo.js";
import { checkPlan } from "../services/plan-check.js";
import { notImplemented } from "./not-implemented.js";

export function registerPlanCommand(program: Command): void {
  const plan = program
    .command("plan")
    .description("Validate and lock Harn plans.");

  plan
    .command("check <planId>")
    .description("Validate a plan before implementation.")
    .action(async (planId: string) => {
      const root = findRepoRoot();
      printYaml(await checkPlan(getHarnPaths(root), planId));
    });

  plan
    .command("lock <planId>")
    .description("Freeze a valid plan.")
    .action(() => notImplemented("harn plan lock"));
}
