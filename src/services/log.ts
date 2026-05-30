import type { HarnPaths } from "../core/repo.js";
import { getPlanState } from "../domain/plan.js";
import { loadHarnProject } from "../domain/project.js";
import { getFileIntroducedCommit } from "../git/log.js";

export async function getHarnLog(paths: HarnPaths): Promise<unknown> {
  const project = await loadHarnProject(paths);
  const appliedPlans = project.plans
    .filter((plan) => getPlanState(plan) === "applied" && plan.applied)
    .sort((left, right) => left.applied!.applied_at.localeCompare(right.applied!.applied_at));

  const plans = await Promise.all(
    appliedPlans.map(async (plan) => ({
      id: plan.id,
      title: plan.title,
      applied_at: plan.applied!.applied_at,
      ...(plan.applied!.commit
        ? { commit: plan.applied!.commit }
        : await computedCommit(paths.root, `.harn/plans/${plan.id}.yaml`)),
      retired: plan.assumptions.retire.map((action) => action.id),
      created: plan.assumptions.create.map((action) => action.id),
      reviewed: plan.assumptions.reviewed.map((action) => action.id)
    }))
  );

  return { plans };
}

async function computedCommit(root: string, filePath: string): Promise<{ commit: string } | Record<string, never>> {
  const commit = await getFileIntroducedCommit(root, filePath);
  return commit ? { commit } : {};
}
