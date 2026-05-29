import type { Command } from "commander";
import { notImplemented } from "./not-implemented.js";

export function registerPlanCommand(program: Command): void {
  const plan = program
    .command("plan")
    .description("Validate and lock Harn plans.");

  plan
    .command("check <planId>")
    .description("Validate a plan before implementation.")
    .action(() => notImplemented("harn plan check"));

  plan
    .command("lock <planId>")
    .description("Freeze a valid plan.")
    .action(() => notImplemented("harn plan lock"));
}
