import { git } from "./exec.js";

export async function getFileIntroducedCommit(root: string, filePath: string): Promise<string | undefined> {
  try {
    const output = await git(root, ["log", "--diff-filter=A", "--format=%H", "--", filePath]);
    return output
      .trim()
      .split("\n")
      .find(Boolean);
  } catch {
    return undefined;
  }
}
