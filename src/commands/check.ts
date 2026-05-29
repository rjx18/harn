import type { Command } from "commander";
import { notImplemented } from "./not-implemented.js";

export function registerCheckCommand(program: Command): void {
  program
    .command("check [planId]")
    .description("Validate a Git diff against a locked plan.")
    .option("--staged", "validate the staged diff")
    .action(() => notImplemented("harn check"));
}
