import type { Command } from "commander";
import { notImplemented } from "./not-implemented.js";

export function registerApplyCommand(program: Command): void {
  program
    .command("apply <planId>")
    .description("Apply a valid locked plan to assumption truth.")
    .action(() => notImplemented("harn apply"));
}
