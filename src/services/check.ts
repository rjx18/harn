import { readYamlFile } from "../core/yaml.js";
import type { HarnPaths } from "../core/repo.js";
import { planPath } from "../core/repo.js";
import { scanAnchors } from "../anchors/scanner.js";
import type { Anchor } from "../anchors/types.js";
import { hashPlanContent } from "../domain/plan-hash.js";
import { getPlanState, type Plan } from "../domain/plan.js";
import { loadHarnProject } from "../domain/project.js";
import { anchorsTouchedByRanges } from "../git/anchors.js";
import { getChangedFiles, getChangedRanges } from "../git/diff.js";
import type { BlockingIssue } from "./plan-check.js";

export interface CheckOptions {
  planId?: string;
  staged?: boolean;
}

export interface DiffCheckResult {
  plan?: {
    id: string;
    title: string;
  };
  result: "pass" | "blocked";
  diff?: {
    unplanned_anchored_assumptions: string[];
  };
  anchors?: AnchorCheckResult[];
  warnings?: Array<{
    type: string;
    reason: string;
  }>;
  blocking?: BlockingIssue[];
}

interface AnchorCheckResult {
  anchor: string;
  planned: string;
  actual: string;
  result: "ok" | "blocked";
}

export async function checkDiff(paths: HarnPaths, options: CheckOptions): Promise<DiffCheckResult> {
  const project = await loadHarnProject(paths);
  const plan = resolvePlan(project.plans, options.planId);

  if (!plan) {
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

  const blocking: BlockingIssue[] = [];
  const state = getPlanState(plan);

  if (state !== "locked" || !plan.lock) {
    blocking.push({
      type: "plan_not_locked",
      reason: "harn check requires a locked plan."
    });
  }

  const rawPlan = await readYamlFile(planPath(paths, plan.id));
  if (plan.lock && hashPlanContent(rawPlan) !== plan.lock.plan_hash) {
    blocking.push({
      type: "locked_plan_changed",
      reason: "The plan content changed after it was locked."
    });
  }

  const [scan, changedFiles, changedRanges] = await Promise.all([
    scanAnchors(paths.root),
    getChangedFiles(paths.root, options.staged === true),
    getChangedRanges(paths.root, options.staged === true)
  ]);

  const planFile = `.harn/plans/${plan.id}.yaml`;
  const implementationFiles = changedFiles.filter((file) => file !== planFile);
  const changedAssumptionFiles = implementationFiles.filter((file) => file.startsWith(".harn/assumptions/"));
  for (const file of changedAssumptionFiles) {
    blocking.push({
      type: "ground_truth_assumption_edited",
      reason: `Ground-truth assumption file changed directly: ${file}.`
    });
  }

  for (const file of implementationFiles.filter((file) => !file.startsWith(".harn/"))) {
    if (!plan.files.includes(file)) {
      blocking.push({
        type: "unplanned_file_changed",
        reason: `Changed file is not declared in plan files: ${file}.`
      });
    }
  }

  const touchedAnchors = anchorsTouchedByRanges(scan.anchors, changedRanges);
  const anchorResults = buildAnchorResults(plan, touchedAnchors, scan.anchors);
  for (const result of anchorResults) {
    if (result.result === "blocked") {
      blocking.push({
        type: result.planned === "keep" ? "kept_anchor_changed" : "unplanned_anchor_touched",
        anchor: result.anchor,
        reason:
          result.planned === "keep"
            ? "The plan marked this anchor as keep, but the diff changed it."
            : "The diff changed an anchored region not declared in the locked plan."
      });
    }
  }

  const unplanned = anchorResults
    .filter((result) => result.planned === "unplanned")
    .map((result) => result.anchor);

  return {
    plan: {
      id: plan.id,
      title: plan.title
    },
    result: blocking.length === 0 ? "pass" : "blocked",
    diff: {
      unplanned_anchored_assumptions: unplanned
    },
    anchors: anchorResults,
    ...(plan.lock?.dirty_at_lock
      ? {
          warnings: [
            {
              type: "dirty_worktree_at_lock",
              reason:
                "The plan was locked while implementation changes already existed. This is an after-the-fact lock."
            }
          ]
        }
      : {}),
    ...(blocking.length > 0 ? { blocking } : {})
  };
}

function resolvePlan(plans: Plan[], planId: string | undefined): Plan | undefined {
  if (planId) {
    return plans.find((plan) => plan.id === planId);
  }

  const lockedPlans = plans.filter((plan) => getPlanState(plan) === "locked");
  return lockedPlans.length === 1 ? lockedPlans[0] : undefined;
}

function buildAnchorResults(plan: Plan, touchedAnchors: Anchor[], allAnchors: Anchor[]): AnchorCheckResult[] {
  const results: AnchorCheckResult[] = [];
  const touchedIdentities = new Set(touchedAnchors.map((anchor) => anchor.identity));

  for (const anchor of touchedAnchors) {
      const planned: string = plan.anchors[anchor.assumptionId]?.[anchor.ref]?.action ?? "unplanned";
    results.push({
      anchor: anchor.identity,
      planned,
      actual: "changed",
      result: planned === "unplanned" || planned === "keep" ? "blocked" : "ok"
    });
  }

  for (const [assumptionId, refs] of Object.entries(plan.anchors)) {
    for (const [ref, action] of Object.entries(refs)) {
      const identity = `${assumptionId}:${ref}`;
      if (touchedIdentities.has(identity)) {
        continue;
      }

      const stillExists = allAnchors.some((anchor) => anchor.identity === identity);
      if (action.action === "keep" || action.action === "change" || (action.action === "remove" && !stillExists)) {
        results.push({
          anchor: identity,
          planned: action.action,
          actual: stillExists ? "unchanged" : "removed",
          result: "ok"
        });
      }
    }
  }

  return results;
}
