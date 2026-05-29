import type { Command } from "commander";
import { notImplemented } from "./not-implemented.js";

export function registerInitCommand(program: Command): void {
  program
    .command("init")
    .description("Create the .harn directory structure.")
    .action(() => notImplemented("harn init"));
}
