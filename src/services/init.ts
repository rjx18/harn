import { mkdir } from "node:fs/promises";
import type { HarnPaths } from "../core/repo.js";

export interface InitResult {
  result: "initialized";
  paths: {
    harn: string;
    assumptions: string;
    plans: string;
  };
}

export async function initializeHarn(paths: HarnPaths): Promise<InitResult> {
  await mkdir(paths.assumptionsDir, { recursive: true });
  await mkdir(paths.plansDir, { recursive: true });

  return {
    result: "initialized",
    paths: {
      harn: paths.harnDir,
      assumptions: paths.assumptionsDir,
      plans: paths.plansDir
    }
  };
}
