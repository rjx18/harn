import { readYamlFile } from "../core/yaml.js";
import { hashAssumptionContent } from "./assumption-hash.js";
import { isAssumptionId } from "./ids.js";
import { asRecord, failIfIssues, getOptionalString, getRequiredString, getStringArray } from "./validation.js";

export type AssumptionState = "active" | "retired";

export interface Assumption {
  id: string;
  hash?: string;
  title: string;
  state: AssumptionState;
  statement: string;
  depends_on: string[];
}

const assumptionStates = new Set<AssumptionState>(["active", "retired"]);

export function parseAssumption(value: unknown, source = "assumption"): Assumption {
  const record = asRecord(value, source);
  const issues: string[] = [];

  const id = getRequiredString(record, "id", issues);
  const hash = getOptionalString(record, "hash", issues);
  const title = getRequiredString(record, "title", issues);
  const state = getRequiredString(record, "state", issues);
  const statement = getRequiredString(record, "statement", issues);
  const dependsOn = getStringArray(record, "depends_on", issues);

  if (id && !isAssumptionId(id)) {
    issues.push("id must be a readable slug.");
  }

  if (state && !assumptionStates.has(state as AssumptionState)) {
    issues.push("state must be active or retired.");
  }

  for (const dependency of dependsOn) {
    if (!isAssumptionId(dependency)) {
      issues.push(`depends_on contains invalid assumption id: ${dependency}.`);
    }
  }

  const expectedHash = title && statement ? hashAssumptionContent({ title, statement }) : undefined;
  if (state === "active" && !hash) {
    issues.push("active assumptions must include a Harn-generated hash.");
  }

  if (hash && expectedHash && hash !== expectedHash) {
    issues.push(`hash must match immutable title and statement content; expected ${expectedHash}.`);
  }

  failIfIssues(source, issues);

  return {
    id,
    ...(hash ? { hash } : {}),
    title,
    state: state as AssumptionState,
    statement,
    depends_on: dependsOn
  };
}

export async function loadAssumptionFile(path: string): Promise<Assumption> {
  return parseAssumption(await readYamlFile(path), path);
}
