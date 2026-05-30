import { git } from "./exec.js";

export async function readStagedFile(root: string, filePath: string): Promise<string | undefined> {
  try {
    return await git(root, ["show", `:0:${filePath}`]);
  } catch {
    return undefined;
  }
}
