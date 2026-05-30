import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { git } from "../git/exec.js";
import { parseAssumeMarker, parseEndMarker, type ParsedAssumeMarker } from "./parser.js";
import type { Anchor, AnchorIssue, AnchorScanResult } from "./types.js";

const internalDirectories = new Set([".git", ".harn"]);

interface OpenBlock {
  marker: ParsedAssumeMarker;
  file: string;
  startLine: number;
}

export async function scanAnchors(root: string): Promise<AnchorScanResult> {
  const files = await listSourceFiles(root);
  const results = await Promise.all(files.map((file) => scanAnchorFile(root, file)));
  const anchors = results.flatMap((result) => result.anchors);
  const issues = results.flatMap((result) => result.issues);

  issues.push(...findDuplicateAnchors(anchors));

  return { anchors, issues };
}

export async function scanAnchorFile(root: string, file: string): Promise<AnchorScanResult> {
  let content: string;
  try {
    content = await readFile(file, "utf8");
  } catch {
    return { anchors: [], issues: [] };
  }

  const relativeFile = relative(root, file);
  return scanAnchorText(relativeFile, content);
}

export function scanAnchorText(file: string, content: string): AnchorScanResult {
  const anchors: Anchor[] = [];
  const issues: AnchorIssue[] = [];
  const lines = content.split(/\r?\n/);
  let openBlock: OpenBlock | undefined;

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const endMarker = parseEndMarker(line);
    if (endMarker) {
      if (!openBlock) {
        issues.push({
          type: "unexpected_end",
          file,
          line: lineNumber,
          message: `Unexpected harn:end ${endMarker.assumptionId}.`
        });
        return;
      }

      anchors.push(makeAnchor(openBlock.marker, file, openBlock.startLine, lineNumber, "block"));
      openBlock = undefined;
      return;
    }

    const marker = parseAssumeMarker(line);
    if (!marker) {
      return;
    }

    if (!marker.ref) {
      issues.push({
        type: "missing_ref",
        file,
        line: lineNumber,
        message: `Anchor for ${marker.assumptionId} is missing ref=.`
      });
      return;
    }

    if (openBlock) {
      issues.push({
        type: "nested_anchor",
        file,
        line: lineNumber,
        message: `Nested anchor ${marker.assumptionId}:${marker.ref} inside ${openBlock.marker.assumptionId}:${openBlock.marker.ref}.`
      });
      return;
    }

    if (marker.scope === "function") {
      anchors.push(makeAnchor(marker, file, lineNumber, lineNumber, "function"));
      return;
    }

    if (marker.inline) {
      anchors.push(makeAnchor(marker, file, lineNumber, lineNumber, "line"));
      return;
    }

    openBlock = { marker, file, startLine: lineNumber };
  });

  if (openBlock) {
    issues.push({
      type: "missing_end",
      file,
      line: openBlock.startLine,
      message: `Anchor ${openBlock.marker.assumptionId}:${openBlock.marker.ref} is missing harn:end.`
    });
  }

  return { anchors, issues };
}

async function listSourceFiles(root: string): Promise<string[]> {
  const gitFiles = await listGitVisibleFiles(root);
  if (gitFiles) {
    return gitFiles;
  }

  const files: string[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (internalDirectories.has(entry.name)) {
        continue;
      }

      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(path);
      } else if (entry.isFile()) {
        files.push(path);
      }
    }
  }

  await walk(root);
  return files;
}

async function listGitVisibleFiles(root: string): Promise<string[] | undefined> {
  try {
    const output = await git(root, ["ls-files", "--cached", "--others", "--exclude-standard"]);
    return output
      .split(/\r?\n/)
      .map((file) => file.trim())
      .filter((file) => file !== "" && !isInternalPath(file))
      .map((file) => join(root, file));
  } catch {
    return undefined;
  }
}

function isInternalPath(file: string): boolean {
  return file === ".git" || file.startsWith(".git/") || file === ".harn" || file.startsWith(".harn/");
}

function makeAnchor(
  marker: ParsedAssumeMarker,
  file: string,
  startLine: number,
  endLine: number,
  kind: Anchor["kind"]
): Anchor {
  const ref = marker.ref ?? "";
  return {
    assumptionId: marker.assumptionId,
    ref,
    identity: `${marker.assumptionId}:${ref}`,
    file,
    startLine,
    endLine,
    kind
  };
}

function findDuplicateAnchors(anchors: Anchor[]): AnchorIssue[] {
  const seen = new Map<string, Anchor>();
  const issues: AnchorIssue[] = [];

  for (const anchor of anchors) {
    const existing = seen.get(anchor.identity);
    if (existing) {
      issues.push({
        type: "duplicate_anchor",
        file: anchor.file,
        line: anchor.startLine,
        message: `Duplicate anchor ${anchor.identity}; first seen in ${existing.file}:${existing.startLine}.`
      });
      continue;
    }

    seen.set(anchor.identity, anchor);
  }

  return issues;
}
