import { readFileSync } from "node:fs";
import { Command } from "commander";
import { registerApplyCommand } from "./commands/apply.js";
import { registerFindCommand } from "./commands/find.js";
import { registerInitCommand } from "./commands/init.js";
import { registerInstallSkillCommand } from "./commands/install-skill.js";
import { registerLogCommand } from "./commands/log.js";
import { registerPlanCommand } from "./commands/plan.js";
import { registerCheckCommand } from "./commands/check.js";

export function createCli(): Command {
  const program = new Command();

  program
    .name("harn")
    .description("Repo-native guardrails for agentic coding.")
    .version(readPackageVersion());

  registerInitCommand(program);
  registerInstallSkillCommand(program);
  registerFindCommand(program);
  registerPlanCommand(program);
  registerCheckCommand(program);
  registerApplyCommand(program);
  registerLogCommand(program);

  return program;
}

function readPackageVersion(): string {
  try {
    const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
      version?: unknown;
    };
    return typeof packageJson.version === "string" ? packageJson.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}
