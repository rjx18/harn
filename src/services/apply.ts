import { readYamlFile, writeYamlFile } from "../core/yaml.js";
import type { HarnPaths } from "../core/repo.js";
import { assumptionPath, planPath } from "../core/repo.js";
import { parseAssumption } from "../domain/assumption.js";
import { hashAssumptionContent } from "../domain/assumption-hash.js";
import { parsePlan } from "../domain/plan.js";
import { getHeadCommit } from "../git/status.js";
import { checkDiff } from "./check.js";

export async function applyPlan(paths: HarnPaths, planId?: string): Promise<unknown> {
  const check = await checkDiff(paths, { planId });
  if (check.result !== "pass") {
    return {
      result: "blocked",
      ...(planId ? { plan: { id: planId } } : {}),
      blocking: check.blocking
    };
  }

  const resolvedPlanId = check.plan?.id;
  if (!resolvedPlanId) {
    return {
      result: "blocked",
      blocking: [
        {
          type: "locked_plan_not_found",
          reason: "Provide a plan id or keep exactly one locked plan in .harn/plans."
        }
      ]
    };
  }

  const rawPlan = (await readYamlFile(planPath(paths, resolvedPlanId))) as Record<string, unknown>;
  const plan = parsePlan(rawPlan, planPath(paths, resolvedPlanId));

  for (const action of plan.assumptions.retire) {
    const path = assumptionPath(paths, action.id);
    const rawAssumption = (await readYamlFile(path)) as Record<string, unknown>;
    const assumption = parseAssumption(rawAssumption, path);
    await writeYamlFile(path, {
      ...rawAssumption,
      state: "retired",
      retired_by: plan.id,
      title: assumption.title
    });
  }

  for (const action of plan.assumptions.create) {
    await writeYamlFile(assumptionPath(paths, action.id), {
      id: action.id,
      hash: hashAssumptionContent({ title: action.title, statement: action.statement }),
      title: action.title,
      state: "active",
      statement: action.statement,
      depends_on: action.depends_on,
      created_by: plan.id
    });
  }

  const applied = {
    applied_at: new Date().toISOString(),
    commit: await getHeadCommit(paths.root)
  };

  const { lock: _lock, ...planWithoutLock } = rawPlan;
  await writeYamlFile(planPath(paths, plan.id), {
    ...planWithoutLock,
    applied
  });

  return {
    result: "applied",
    plan: {
      id: plan.id,
      state: "applied"
    },
    applied,
    assumptions: {
      retired: plan.assumptions.retire.map((action) => action.id),
      created: plan.assumptions.create.map((action) => action.id),
      reviewed: plan.assumptions.reviewed.map((action) => action.id)
    },
    ...(check.warnings ? { warnings: check.warnings } : {})
  };
}
