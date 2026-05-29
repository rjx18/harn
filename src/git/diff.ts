import { git } from "./exec.js";

export interface ChangedRange {
  file: string;
  startLine: number;
  endLine: number;
}

export async function getChangedRanges(root: string, staged: boolean): Promise<ChangedRange[]> {
  const args = ["diff", "--unified=0", "--no-ext-diff", "--relative"];
  if (staged) {
    args.splice(1, 0, "--cached");
  }

  const output = await git(root, args);
  return parseChangedRanges(output);
}

export function parseChangedRanges(diff: string): ChangedRange[] {
  const ranges: ChangedRange[] = [];
  let currentFile: string | undefined;

  for (const line of diff.split(/\r?\n/)) {
    if (line.startsWith("+++ b/")) {
      currentFile = line.slice("+++ b/".length);
      continue;
    }

    if (line.startsWith("+++ /dev/null")) {
      currentFile = undefined;
      continue;
    }

    if (!line.startsWith("@@") || !currentFile) {
      continue;
    }

    const match = line.match(/\+(\d+)(?:,(\d+))?/);
    if (!match) {
      continue;
    }

    const startLine = Number.parseInt(match[1], 10);
    const length = match[2] ? Number.parseInt(match[2], 10) : 1;
    const endLine = length === 0 ? startLine : startLine + length - 1;
    ranges.push({ file: currentFile, startLine, endLine });
  }

  return ranges;
}
