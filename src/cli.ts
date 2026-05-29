import { Command } from "commander";
import { registerApplyCommand } from "./commands/apply.js";
import { registerFindCommand } from "./commands/find.js";
import { registerInitCommand } from "./commands/init.js";
import { registerLogCommand } from "./commands/log.js";
import { registerPlanCommand } from "./commands/plan.js";
import { registerCheckCommand } from "./commands/check.js";

export function createCli(): Command {
  const program = new Command();

  program
    .name("harn")
    .description("Repo-native guardrails for agentic coding.")
    .version("0.0.0");

  registerInitCommand(program);
  registerFindCommand(program);
  registerPlanCommand(program);
  registerCheckCommand(program);
  registerApplyCommand(program);
  registerLogCommand(program);

  return program;
}
