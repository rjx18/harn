import { readYamlFile, writeYamlFile } from "../core/yaml.js";
import type { HarnPaths } from "../core/repo.js";
import { planPath } from "../core/repo.js";
import { hashPlanContent } from "../domain/plan-hash.js";
import { parsePlan } from "../domain/plan.js";
import { getHeadCommit, isWorktreeDirtyExcept } from "../git/status.js";
import { checkPlan } from "./plan-check.js";

export interface PlanLockResult {
  result: "locked" | "invalid";
  plan: {
    id: string;
    title?: string;
  };
  lock?: {
    locked_at: string;
    base_commit: string;
    hash: string;
    dirty_at_lock: boolean;
  };
  warnings?: Array<{
    type: string;
    reason: string;
  }>;
  blocking?: unknown;
}

export async function lockPlan(paths: HarnPaths, planId: string): Promise<PlanLockResult> {
  const precheck = await checkPlan(paths, planId);
  if (precheck.result !== "valid") {
    return {
      result: "invalid",
      plan: { id: planId },
      blocking: precheck.blocking
    };
  }

  const path = planPath(paths, planId);
  const rawPlan = await readYamlFile(path);
  const plan = parsePlan(rawPlan, path);
  const dirtyAtLock = await isWorktreeDirtyExcept(paths.root, [`.harn/plans/${planId}.yaml`]);
  const lock = {
    locked_at: new Date().toISOString(),
    base_commit: await getHeadCommit(paths.root),
    hash: hashPlanContent(rawPlan),
    dirty_at_lock: dirtyAtLock
  };

  await writeYamlFile(path, {
    ...(rawPlan as Record<string, unknown>),
    lock
  });

  return {
    result: "locked",
    plan: {
      id: plan.id,
      title: plan.title
    },
    lock,
    ...(dirtyAtLock
      ? {
          warnings: [
            {
              type: "dirty_worktree_at_lock",
              reason:
                "The plan was locked while implementation changes already existed. This is an after-the-fact lock."
            }
          ]
        }
      : {})
  };
}
