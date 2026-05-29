import type { Command } from "commander";
import { notImplemented } from "./not-implemented.js";

export function registerFindCommand(program: Command): void {
  program
    .command("find [assumptionId]")
    .description("Find Harn assumptions, anchors, and plan scope.")
    .option("--depended-by <assumption-id>", "find assumptions depended-by an assumption")
    .option("--depth <n>", "dependency traversal depth", "1")
    .option("--file <path>", "find anchors in a file")
    .option("--changed", "find anchors touched by the current diff")
    .option("--staged", "find anchors touched by the staged diff")
    .option("--plan <plan-id>", "find assumptions and anchors relevant to a plan")
    .action(() => notImplemented("harn find"));
}
