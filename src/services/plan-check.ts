import type { Anchor } from "../anchors/types.js";
import { scanAnchors } from "../anchors/scanner.js";
import { HarnError } from "../core/errors.js";
import type { HarnPaths } from "../core/repo.js";
import type { Assumption } from "../domain/assumption.js";
import type { Plan } from "../domain/plan.js";
import { getPlanState } from "../domain/plan.js";
import { loadHarnProject } from "../domain/project.js";

export interface BlockingIssue {
  type: string;
  assumption?: string;
  anchor?: string;
  reason: string;
}

export interface PlanCheckResult {
  plan: {
    id: string;
    title: string;
    state: string;
  };
  result: "valid" | "invalid";
  assumptions?: {
    retire: string[];
    create: string[];
    reviewed: string[];
  };
  anchors?: {
    accounted_for: string[];
  };
  blocking?: BlockingIssue[];
}

export async function checkPlan(paths: HarnPaths, planId: string): Promise<PlanCheckResult> {
  const [project, scan] = await Promise.all([loadHarnProject(paths), scanAnchors(paths.root)]);
  const plan = project.plans.find((candidate) => candidate.id === planId);

  if (!plan) {
    throw new HarnError(`Plan not found: ${planId}`);
  }

  return validatePlan(plan, project.assumptions, scan.anchors);
}

export function validatePlan(plan: Plan, assumptions: Assumption[], anchors: Anchor[]): PlanCheckResult {
  const blocking: BlockingIssue[] = [];
  const state = getPlanState(plan);
  const assumptionById = new Map(assumptions.map((assumption) => [assumption.id, assumption]));
  const retired = new Set(plan.assumptions.retire.map((action) => action.id));
  const reviewed = new Set(plan.assumptions.reviewed.map((action) => action.id));
  const created = new Set(plan.assumptions.create.map((action) => action.id));

  if (state === "invalid") {
    blocking.push({
      type: "invalid_plan_metadata",
      reason: "Plan cannot contain both lock and applied blocks."
    });
  }

  for (const action of plan.assumptions.retire) {
    const assumption = assumptionById.get(action.id);
    if (!assumption) {
      blocking.push({
        type: "missing_retired_assumption",
        assumption: action.id,
        reason: "Retired assumption does not exist."
      });
    } else if (assumption.state !== "active") {
      blocking.push({
        type: "retired_assumption_not_active",
        assumption: action.id,
        reason: "Retired assumption must currently be active."
      });
    }
  }

  for (const action of plan.assumptions.create) {
    if (assumptionById.has(action.id)) {
      blocking.push({
        type: "created_assumption_already_exists",
        assumption: action.id,
        reason: "Created assumptions must not already exist in ground truth."
      });
    }
  }

  for (const action of plan.assumptions.reviewed) {
    const assumption = assumptionById.get(action.id);
    if (!assumption) {
      blocking.push({
        type: "missing_reviewed_assumption",
        assumption: action.id,
        reason: "Reviewed assumption does not exist."
      });
    } else if (assumption.state !== "active") {
      blocking.push({
        type: "reviewed_assumption_not_active",
        assumption: action.id,
        reason: "Reviewed assumption must currently be active."
      });
    }
  }

  for (const retiredId of retired) {
    for (const dependent of assumptions.filter((assumption) => assumption.depends_on.includes(retiredId))) {
      if (!reviewed.has(dependent.id) && !retired.has(dependent.id)) {
        blocking.push({
          type: "missing_dependent_assumption",
          assumption: dependent.id,
          reason: `${dependent.id} is depended-by retired assumption ${retiredId}.`
        });
      }
    }
  }

  const accountedAnchors: string[] = [];
  for (const retiredId of retired) {
    const retiredAnchors = anchors.filter((anchor) => anchor.assumptionId === retiredId);
    const plannedRefs = plan.anchors[retiredId] ?? {};

    for (const anchor of retiredAnchors) {
      if (!plannedRefs[anchor.ref]) {
        blocking.push({
          type: "missing_anchor_action",
          anchor: anchor.identity,
          reason: "Retired assumption anchors must have planned actions."
        });
      } else {
        accountedAnchors.push(anchor.identity);
      }
    }
  }

  if (plan.files.length === 0 && (retired.size > 0 || created.size > 0 || reviewed.size > 0)) {
    blocking.push({
      type: "missing_planned_files",
      reason: "Plan must declare implementation files."
    });
  }

  return {
    plan: {
      id: plan.id,
      title: plan.title,
      state
    },
    result: blocking.length === 0 ? "valid" : "invalid",
    ...(blocking.length === 0
      ? {
          assumptions: {
            retire: [...retired],
            create: [...created],
            reviewed: [...reviewed]
          },
          anchors: {
            accounted_for: accountedAnchors
          }
        }
      : { blocking })
  };
}
