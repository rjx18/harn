import type { Command } from "commander";
import { notImplemented } from "./not-implemented.js";

export function registerLogCommand(program: Command): void {
  program
    .command("log")
    .description("List applied Harn plans.")
    .action(() => notImplemented("harn log"));
}
