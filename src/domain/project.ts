import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { HarnPaths } from "../core/repo.js";
import { loadAssumptionFile, type Assumption } from "./assumption.js";
import { loadPlanFile, type Plan } from "./plan.js";

export interface HarnProject {
  assumptions: Assumption[];
  plans: Plan[];
}

export async function loadHarnProject(paths: HarnPaths): Promise<HarnProject> {
  const [assumptions, plans] = await Promise.all([
    loadYamlCollection(paths.assumptionsDir, loadAssumptionFile),
    loadYamlCollection(paths.plansDir, loadPlanFile)
  ]);

  return { assumptions, plans };
}

async function loadYamlCollection<T>(
  dir: string,
  load: (path: string) => Promise<T>
): Promise<T[]> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch (error) {
    if (isMissingDirectory(error)) {
      return [];
    }
    throw error;
  }

  const yamlFiles = entries.filter((entry) => entry.endsWith(".yaml") || entry.endsWith(".yml"));
  return Promise.all(yamlFiles.map((entry) => load(join(dir, entry))));
}

function isMissingDirectory(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}
