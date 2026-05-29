import { readYamlFile } from "../core/yaml.js";
import { isAssumptionId, isPlanId } from "./ids.js";
import {
  asRecord,
  failIfIssues,
  getOptionalString,
  getRequiredString,
  getStringArray
} from "./validation.js";

export type PlanState = "draft" | "locked" | "applied" | "invalid";
export type AnchorAction = "change" | "remove" | "keep";

export interface RetireAssumptionAction {
  id: string;
  reason: string;
}

export interface CreateAssumptionAction {
  id: string;
  title: string;
  statement: string;
  reason: string;
  depends_on: string[];
}

export interface ReviewedAssumptionAction {
  id: string;
  reason: string;
  outcome: string;
  note?: string;
}

export interface PlannedAnchorAction {
  action: AnchorAction;
  reason: string;
}

export interface PlanLock {
  locked_at: string;
  base_commit: string;
  plan_hash: string;
  dirty_at_lock: boolean;
}

export interface PlanApplied {
  applied_at: string;
  commit?: string;
}

export interface Plan {
  id: string;
  title: string;
  assumptions: {
    retire: RetireAssumptionAction[];
    create: CreateAssumptionAction[];
    reviewed: ReviewedAssumptionAction[];
  };
  anchors: Record<string, Record<string, PlannedAnchorAction>>;
  files: string[];
  lock?: PlanLock;
  applied?: PlanApplied;
}

const anchorActions = new Set<AnchorAction>(["change", "remove", "keep"]);

export function getPlanState(plan: Plan): PlanState {
  if (plan.lock && plan.applied) {
    return "invalid";
  }

  if (plan.applied) {
    return "applied";
  }

  if (plan.lock) {
    return "locked";
  }

  return "draft";
}

export function parsePlan(value: unknown, source = "plan"): Plan {
  const record = asRecord(value, source);
  const issues: string[] = [];

  const id = getRequiredString(record, "id", issues);
  const title = getRequiredString(record, "title", issues);
  const assumptions = parsePlanAssumptions(record["assumptions"], `${source}.assumptions`, issues);
  const anchors = parsePlanAnchors(record["anchors"], `${source}.anchors`, issues);
  const files = getStringArray(record, "files", issues);
  const lock = parseLock(record["lock"], `${source}.lock`, issues);
  const applied = parseApplied(record["applied"], `${source}.applied`, issues);

  if (id && !isPlanId(id)) {
    issues.push("id must look like p-xxxxxx.");
  }

  if (lock && applied) {
    issues.push("plan cannot contain both lock and applied blocks.");
  }

  failIfIssues(source, issues);

  return {
    id,
    title,
    assumptions,
    anchors,
    files,
    ...(lock ? { lock } : {}),
    ...(applied ? { applied } : {})
  };
}

export async function loadPlanFile(path: string): Promise<Plan> {
  return parsePlan(await readYamlFile(path), path);
}

function parsePlanAssumptions(
  value: unknown,
  label: string,
  issues: string[]
): Plan["assumptions"] {
  const record = value === undefined ? {} : asRecordForIssues(value, label, issues);

  return {
    retire: parseRetireActions(record["retire"], `${label}.retire`, issues),
    create: parseCreateActions(record["create"], `${label}.create`, issues),
    reviewed: parseReviewedActions(record["reviewed"], `${label}.reviewed`, issues)
  };
}

function parseRetireActions(value: unknown, label: string, issues: string[]): RetireAssumptionAction[] {
  return parseActionList(value, label, issues, (record, itemLabel) => {
    const id = getRequiredString(record, "id", issues);
    const reason = getRequiredString(record, "reason", issues);
    validateAssumptionId(id, `${itemLabel}.id`, issues);
    return { id, reason };
  });
}

function parseCreateActions(value: unknown, label: string, issues: string[]): CreateAssumptionAction[] {
  return parseActionList(value, label, issues, (record, itemLabel) => {
    const id = getRequiredString(record, "id", issues);
    const title = getRequiredString(record, "title", issues);
    const statement = getRequiredString(record, "statement", issues);
    const reason = getRequiredString(record, "reason", issues);
    const dependsOn = getStringArray(record, "depends_on", issues);
    validateAssumptionId(id, `${itemLabel}.id`, issues);
    for (const dependency of dependsOn) {
      validateAssumptionId(dependency, `${itemLabel}.depends_on`, issues);
    }
    return { id, title, statement, reason, depends_on: dependsOn };
  });
}

function parseReviewedActions(value: unknown, label: string, issues: string[]): ReviewedAssumptionAction[] {
  return parseActionList(value, label, issues, (record, itemLabel) => {
    const id = getRequiredString(record, "id", issues);
    const reason = getRequiredString(record, "reason", issues);
    const outcome = getRequiredString(record, "outcome", issues);
    const note = getOptionalString(record, "note", issues);
    validateAssumptionId(id, `${itemLabel}.id`, issues);
    return { id, reason, outcome, ...(note ? { note } : {}) };
  });
}

function parsePlanAnchors(
  value: unknown,
  label: string,
  issues: string[]
): Record<string, Record<string, PlannedAnchorAction>> {
  if (value === undefined) {
    return {};
  }

  const anchorRecord = asRecordForIssues(value, label, issues);
  const result: Record<string, Record<string, PlannedAnchorAction>> = {};

  for (const [assumptionId, refsValue] of Object.entries(anchorRecord)) {
    validateAssumptionId(assumptionId, `${label}.${assumptionId}`, issues);
    const refs = asRecordForIssues(refsValue, `${label}.${assumptionId}`, issues);
    result[assumptionId] = {};

    for (const [ref, actionValue] of Object.entries(refs)) {
      const actionRecord = asRecordForIssues(actionValue, `${label}.${assumptionId}.${ref}`, issues);
      const action = getRequiredString(actionRecord, "action", issues);
      const reason = getRequiredString(actionRecord, "reason", issues);

      if (action && !anchorActions.has(action as AnchorAction)) {
        issues.push(`${label}.${assumptionId}.${ref}.action must be change, remove, or keep.`);
      }

      result[assumptionId][ref] = {
        action: action as AnchorAction,
        reason
      };
    }
  }

  return result;
}

function parseLock(value: unknown, label: string, issues: string[]): PlanLock | undefined {
  if (value === undefined) {
    return undefined;
  }

  const record = asRecordForIssues(value, label, issues);
  const lockedAt = getRequiredString(record, "locked_at", issues);
  const baseCommit = getRequiredString(record, "base_commit", issues);
  const planHash = getRequiredString(record, "plan_hash", issues);
  const dirtyAtLock = record["dirty_at_lock"];

  if (typeof dirtyAtLock !== "boolean") {
    issues.push(`${label}.dirty_at_lock must be a boolean.`);
  }

  return {
    locked_at: lockedAt,
    base_commit: baseCommit,
    plan_hash: planHash,
    dirty_at_lock: dirtyAtLock === true
  };
}

function parseApplied(value: unknown, label: string, issues: string[]): PlanApplied | undefined {
  if (value === undefined) {
    return undefined;
  }

  const record = asRecordForIssues(value, label, issues);
  const appliedAt = getRequiredString(record, "applied_at", issues);
  const commit = getOptionalString(record, "commit", issues);
  return { applied_at: appliedAt, ...(commit ? { commit } : {}) };
}

function parseActionList<T>(
  value: unknown,
  label: string,
  issues: string[],
  parseItem: (record: Record<string, unknown>, label: string) => T
): T[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    issues.push(`${label} must be a list.`);
    return [];
  }

  return value.map((item, index) => parseItem(asRecordForIssues(item, `${label}[${index}]`, issues), `${label}[${index}]`));
}

function asRecordForIssues(value: unknown, label: string, issues: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    issues.push(`${label} must be a mapping.`);
    return {};
  }

  return value as Record<string, unknown>;
}

function validateAssumptionId(id: string, label: string, issues: string[]): void {
  if (id && !isAssumptionId(id)) {
    issues.push(`${label} must look like a-xxxxxx.`);
  }
}
