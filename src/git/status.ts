import { git } from "./exec.js";

export async function getHeadCommit(root: string): Promise<string> {
  try {
    return (await git(root, ["rev-parse", "HEAD"])).trim();
  } catch {
    return "unknown";
  }
}

export async function isWorktreeDirty(root: string): Promise<boolean> {
  return (await getWorktreeChangedPaths(root)).length > 0;
}

export async function isWorktreeDirtyExcept(root: string, ignoredPaths: string[]): Promise<boolean> {
  const ignored = new Set(ignoredPaths);
  return (await getWorktreeChangedPaths(root)).some((path) => !ignored.has(path));
}

export async function getWorktreeChangedPaths(root: string): Promise<string[]> {
  try {
    const output = await git(root, ["status", "--porcelain"]);
    return output
      .split("\n")
      .map((line) => line.trimEnd())
      .filter(Boolean)
      .map((line) => parsePorcelainPath(line));
  } catch {
    return [];
  }
}

function parsePorcelainPath(line: string): string {
  const path = line.slice(3);
  const renameSeparator = " -> ";
  const renameIndex = path.indexOf(renameSeparator);
  return renameIndex === -1 ? path : path.slice(renameIndex + renameSeparator.length);
}
