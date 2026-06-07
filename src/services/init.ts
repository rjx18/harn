import { chmod, copyFile, mkdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { HarnPaths } from "../core/repo.js";
import { git } from "../git/exec.js";

export interface InitResult {
  result: "initialized";
  paths: {
    harn: string;
    assumptions: string;
    plans: string;
  };
  git: {
    detected: boolean;
  };
  hook: {
    pre_commit: HookInitResult;
  };
}

export type HookInitResult =
  | {
      action: "installed";
      path: string;
    }
  | {
      action: "skipped";
      path?: string;
      reason: string;
    };

export interface InitOptions {
  installHook?: boolean;
}

export async function initializeHarn(paths: HarnPaths, options: InitOptions = {}): Promise<InitResult> {
  await mkdir(paths.assumptionsDir, { recursive: true });
  await mkdir(paths.plansDir, { recursive: true });

  const installHook = options.installHook !== false;
  const gitDetected = await isGitWorktree(paths.root);
  const hook = installHook
    ? await installPreCommitHook(paths.root, gitDetected)
    : {
        action: "skipped" as const,
        reason: "Skipped by --no-hook."
      };

  return {
    result: "initialized",
    paths: {
      harn: paths.harnDir,
      assumptions: paths.assumptionsDir,
      plans: paths.plansDir
    },
    git: {
      detected: gitDetected
    },
    hook: {
      pre_commit: hook
    }
  };
}

async function installPreCommitHook(root: string, gitDetected: boolean): Promise<HookInitResult> {
  if (!gitDetected) {
    return {
      action: "skipped",
      reason: "Not inside a Git worktree."
    };
  }

  const hookPath = (await git(root, ["rev-parse", "--git-path", "hooks/pre-commit"])).trim();
  const absoluteHookPath = hookPath.startsWith("/") ? hookPath : join(root, hookPath);

  if (await exists(absoluteHookPath)) {
    return {
      action: "skipped",
      path: absoluteHookPath,
      reason: "Existing pre-commit hook found; leaving it unchanged."
    };
  }

  await mkdir(dirname(absoluteHookPath), { recursive: true });
  await copyFile(preCommitHookSource(), absoluteHookPath);
  await chmod(absoluteHookPath, 0o755);

  return {
    action: "installed",
    path: absoluteHookPath
  };
}

async function isGitWorktree(root: string): Promise<boolean> {
  try {
    return (await git(root, ["rev-parse", "--is-inside-work-tree"])).trim() === "true";
  } catch {
    return false;
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function preCommitHookSource(): string {
  return fileURLToPath(new URL("../../hooks/pre-commit", import.meta.url));
}
