import type { HarnPaths } from "../core/repo.js";
import { getPlanState } from "../domain/plan.js";
import { loadHarnProject } from "../domain/project.js";

export async function getHarnLog(paths: HarnPaths): Promise<unknown> {
  const project = await loadHarnProject(paths);
  const plans = project.plans
    .filter((plan) => getPlanState(plan) === "applied" && plan.applied)
    .sort((left, right) => left.applied!.applied_at.localeCompare(right.applied!.applied_at))
    .map((plan) => ({
      id: plan.id,
      title: plan.title,
      applied_at: plan.applied!.applied_at,
      ...(plan.applied!.commit ? { commit: plan.applied!.commit } : {}),
      retired: plan.assumptions.retire.map((action) => action.id),
      created: plan.assumptions.create.map((action) => action.id),
      reviewed: plan.assumptions.reviewed.map((action) => action.id)
    }));

  return { plans };
}
