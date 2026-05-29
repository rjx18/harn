import { git } from "./exec.js";

export async function getHeadCommit(root: string): Promise<string> {
  try {
    return (await git(root, ["rev-parse", "HEAD"])).trim();
  } catch {
    return "unknown";
  }
}

export async function isWorktreeDirty(root: string): Promise<boolean> {
  try {
    return (await git(root, ["status", "--porcelain"])).trim().length > 0;
  } catch {
    return false;
  }
}
