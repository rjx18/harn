import { parseYamlText, readYamlFile } from "../core/yaml.js";
import type { HarnPaths } from "../core/repo.js";
import { planPath } from "../core/repo.js";
import { scanAnchors } from "../anchors/scanner.js";
import type { Anchor } from "../anchors/types.js";
import { parseAssumption } from "../domain/assumption.js";
import { hashPlanContent } from "../domain/plan-hash.js";
import { getPlanState, type Plan } from "../domain/plan.js";
import { loadHarnProject } from "../domain/project.js";
import { anchorsTouchedByRanges } from "../git/anchors.js";
import { getChangedFiles, getChangedRanges } from "../git/diff.js";
import { readStagedFile } from "../git/show.js";
import type { BlockingIssue } from "./plan-check.js";
import { classifyStagedChanges } from "./staged-diff.js";

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
    empty?: boolean;
    draft_plan_only?: boolean;
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

type CheckMode = "locked" | "applied";

interface PlanResolution {
  plan: Plan;
  mode: CheckMode;
}

export async function checkDiff(paths: HarnPaths, options: CheckOptions): Promise<DiffCheckResult> {
  const project = await loadHarnProject(paths);
  const changedFiles = await getChangedFiles(paths.root, options.staged === true);
  if (options.staged === true && !options.planId) {
    const staged = await classifyStagedChanges(paths, changedFiles);
    if (staged.kind === "empty") {
      return {
        result: "pass",
        diff: {
          empty: true,
          unplanned_anchored_assumptions: []
        }
      };
    }

    if (staged.kind === "draft_plan_only") {
      return {
        result: "pass",
        diff: {
          draft_plan_only: true,
          unplanned_anchored_assumptions: []
        }
      };
    }

    if (staged.kind === "invalid_harn_metadata") {
      return {
        result: "blocked",
        blocking: staged.blocking
      };
    }
  }

  const resolution = resolvePlan(project.plans, options.planId, options.staged === true, changedFiles);

  if (!resolution) {
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

  const { plan, mode } = resolution;
  const blocking: BlockingIssue[] = [];
  const state = getPlanState(plan);

  if (mode === "locked" && (state !== "locked" || !plan.lock)) {
    blocking.push({
      type: "plan_not_locked",
      reason: "harn check requires a locked plan."
    });
  }

  if (mode === "applied" && state !== "applied") {
    blocking.push({
      type: "plan_not_applied",
      reason: "Applied staged checks require an applied plan."
    });
  }

  const rawPlan = await readYamlFile(planPath(paths, plan.id));
  if (mode === "locked" && plan.lock && hashPlanContent(rawPlan) !== plan.lock.hash) {
    blocking.push({
      type: "locked_plan_changed",
      reason: "The plan content changed after it was locked."
    });
  }

  const [scan, changedRanges] = await Promise.all([
    scanAnchors(paths.root),
    getChangedRanges(paths.root, options.staged === true)
  ]);

  const planFile = `.harn/plans/${plan.id}.yaml`;
  const implementationFiles = changedFiles.filter((file) => file !== planFile);
  const changedAssumptionFiles = implementationFiles.filter((file) => file.startsWith(".harn/assumptions/"));
  const otherHarnFiles = implementationFiles.filter(
    (file) => file.startsWith(".harn/") && !file.startsWith(".harn/assumptions/")
  );

  if (mode === "locked") {
    for (const file of changedAssumptionFiles) {
      blocking.push({
        type: "ground_truth_assumption_edited",
        reason: `Ground-truth assumption file changed directly: ${file}.`
      });
    }
  } else {
    blocking.push(...(await validateAppliedAssumptionChanges(paths, plan, changedAssumptionFiles)));
  }

  for (const file of otherHarnFiles) {
    blocking.push({
      type: "unplanned_harn_file_changed",
      reason: `Changed Harn file is not the checked plan or an expected assumption file: ${file}.`
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

function resolvePlan(
  plans: Plan[],
  planId: string | undefined,
  staged: boolean,
  changedFiles: string[]
): PlanResolution | undefined {
  if (planId) {
    const plan = plans.find((candidate) => candidate.id === planId);
    if (!plan) {
      return undefined;
    }

    const state = getPlanState(plan);
    if (state === "applied" && staged && changedFiles.includes(`.harn/plans/${plan.id}.yaml`)) {
      return { plan, mode: "applied" };
    }

    return { plan, mode: "locked" };
  }

  const lockedPlans = plans.filter((plan) => getPlanState(plan) === "locked");
  if (lockedPlans.length === 1) {
    return { plan: lockedPlans[0], mode: "locked" };
  }

  if (staged) {
    const appliedPlans = plans.filter(
      (plan) => getPlanState(plan) === "applied" && changedFiles.includes(`.harn/plans/${plan.id}.yaml`)
    );
    if (appliedPlans.length === 1) {
      return { plan: appliedPlans[0], mode: "applied" };
    }
  }

  return undefined;
}

async function validateAppliedAssumptionChanges(
  paths: HarnPaths,
  plan: Plan,
  changedAssumptionFiles: string[]
): Promise<BlockingIssue[]> {
  const blocking: BlockingIssue[] = [];
  const changed = new Set(changedAssumptionFiles);
  const created = new Map(plan.assumptions.create.map((action) => [assumptionFilePath(action.id), action]));
  const retired = new Set(plan.assumptions.retire.map((action) => assumptionFilePath(action.id)));
  const expected = new Set([...created.keys(), ...retired]);

  for (const file of changedAssumptionFiles) {
    if (!expected.has(file)) {
      blocking.push({
        type: "unexpected_applied_assumption_changed",
        reason: `Applied Harn state changed an assumption not created or retired by the plan: ${file}.`
      });
    }
  }

  for (const [file, action] of created) {
    if (!changed.has(file)) {
      blocking.push({
        type: "missing_created_assumption",
        assumption: action.id,
        reason: `Applied Harn state is missing created assumption file: ${file}.`
      });
      continue;
    }

    const raw = await readStagedYaml(paths.root, file);
    if (!raw) {
      continue;
    }

    const assumption = parseAssumption(raw, file);
    if (
      assumption.id !== action.id ||
      assumption.title !== action.title ||
      assumption.statement !== action.statement ||
      assumption.state !== "active" ||
      !sameStringArray(assumption.depends_on, action.depends_on)
    ) {
      blocking.push({
        type: "created_assumption_mismatch",
        assumption: action.id,
        reason: `Created assumption file does not match the plan action: ${file}.`
      });
    }
  }

  for (const action of plan.assumptions.retire) {
    const file = assumptionFilePath(action.id);
    if (!changed.has(file)) {
      blocking.push({
        type: "missing_retired_assumption",
        assumption: action.id,
        reason: `Applied Harn state is missing retired assumption update: ${file}.`
      });
      continue;
    }

    const raw = await readStagedYaml(paths.root, file);
    if (!raw) {
      continue;
    }

    const assumption = parseAssumption(raw, file);
    const record = raw as Record<string, unknown>;
    if (assumption.id !== action.id || assumption.state !== "retired" || record["retired_by"] !== plan.id) {
      blocking.push({
        type: "retired_assumption_mismatch",
        assumption: action.id,
        reason: `Retired assumption file does not match the plan action: ${file}.`
      });
    }
  }

  return blocking;
}

async function readStagedYaml(root: string, file: string): Promise<unknown | undefined> {
  const content = await readStagedFile(root, file);
  if (content === undefined) {
    return undefined;
  }

  return parseYamlText(content);
}

function assumptionFilePath(assumptionId: string): string {
  return `.harn/assumptions/${assumptionId}.yaml`;
}

function sameStringArray(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
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
