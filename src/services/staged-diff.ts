import { parseYamlText } from "../core/yaml.js";
import type { HarnPaths } from "../core/repo.js";
import { getPlanState, parsePlan } from "../domain/plan.js";
import { readStagedFile } from "../git/show.js";
import type { BlockingIssue } from "./plan-check.js";

export type StagedChangeKind = "empty" | "draft_plan_only" | "other" | "invalid_harn_metadata";

export interface StagedChangeClassification {
  kind: StagedChangeKind;
  blocking?: BlockingIssue[];
}

export async function classifyStagedChanges(
  paths: HarnPaths,
  changedFiles: string[]
): Promise<StagedChangeClassification> {
  if (changedFiles.length === 0) {
    return { kind: "empty" };
  }

  const planFiles = changedFiles.filter(isPlanFile);
  if (planFiles.length !== changedFiles.length) {
    return { kind: "other" };
  }

  const blocking: BlockingIssue[] = [];
  for (const file of planFiles) {
    const content = await readStagedFile(paths.root, file);
    if (!content) {
      blocking.push({
        type: "invalid_harn_metadata",
        reason: `Staged draft plan is missing or deleted: ${file}.`
      });
      continue;
    }

    try {
      const plan = parsePlan(parseYamlText(content), file);
      if (getPlanState(plan) !== "draft") {
        blocking.push({
          type: "staged_plan_not_draft",
          reason: `Planning checkpoint commits can only contain draft plans: ${file}.`
        });
      }
    } catch (error) {
      blocking.push({
        type: "invalid_harn_metadata",
        reason: error instanceof Error ? error.message : `Invalid staged Harn plan: ${file}.`
      });
    }
  }

  return blocking.length > 0 ? { kind: "invalid_harn_metadata", blocking } : { kind: "draft_plan_only" };
}

function isPlanFile(file: string): boolean {
  return file.startsWith(".harn/plans/") && (file.endsWith(".yaml") || file.endsWith(".yml"));
}
