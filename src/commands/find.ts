import type { Command } from "commander";
import { printYaml } from "../core/output.js";
import { findRepoRoot, getHarnPaths } from "../core/repo.js";
import { findHarn } from "../services/find.js";

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
    .action(async (assumptionId: string | undefined, options: Record<string, unknown>) => {
      const root = findRepoRoot();
      const result = await findHarn(getHarnPaths(root), {
        assumptionId,
        dependedBy: stringOption(options["dependedBy"]),
        depth: numberOption(options["depth"]),
        file: stringOption(options["file"]),
        planId: stringOption(options["plan"])
      });
      printYaml(result);
    });
}

function stringOption(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function numberOption(value: unknown): number | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}
