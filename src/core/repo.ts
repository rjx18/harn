import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export interface HarnPaths {
  root: string;
  harnDir: string;
  assumptionsDir: string;
  plansDir: string;
}

export function findRepoRoot(start = process.cwd()): string {
  let current = resolve(start);

  while (true) {
    if (existsSync(join(current, ".harn")) || existsSync(join(current, ".git"))) {
      return current;
    }

    const parent = dirname(current);
    if (parent === current) {
      return resolve(start);
    }

    current = parent;
  }
}

export function getHarnPaths(root = findRepoRoot()): HarnPaths {
  const harnDir = join(root, ".harn");

  return {
    root,
    harnDir,
    assumptionsDir: join(harnDir, "assumptions"),
    plansDir: join(harnDir, "plans")
  };
}

export function assumptionPath(paths: HarnPaths, assumptionId: string): string {
  return join(paths.assumptionsDir, `${assumptionId}.yaml`);
}

export function planPath(paths: HarnPaths, planId: string): string {
  return join(paths.plansDir, `${planId}.yaml`);
}
