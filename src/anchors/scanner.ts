import { readFile, readdir } from "node:fs/promises";
import { basename, join, relative } from "node:path";
import { git } from "../git/exec.js";
import { parseAssumeMarker, parseEndMarker, type ParsedAssumeMarker } from "./parser.js";
import type { Anchor, AnchorIssue, AnchorScanResult } from "./types.js";

const internalDirectories = new Set([".git", ".harn"]);
const harnIgnoreFile = ".harnignore";

interface IgnoreRule {
  pattern: string;
  negated: boolean;
}

interface HarnIgnore {
  ignores(path: string): boolean;
}

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
  const stack: OpenBlock[] = [];

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const endMarker = parseEndMarker(line);
    if (endMarker) {
      const openBlock = stack.at(-1);
      if (!openBlock) {
        issues.push({
          type: "unexpected_end",
          file,
          line: lineNumber,
          message: `Unexpected harn:end ${endMarker.assumptionId}.`
        });
        return;
      }

      if (openBlock.marker.assumptionId !== endMarker.assumptionId) {
        issues.push({
          type: "mismatched_end",
          file,
          line: lineNumber,
          message: `harn:end ${endMarker.assumptionId} does not match open anchor ${openBlock.marker.assumptionId}:${openBlock.marker.ref}.`
        });
        return;
      }

      stack.pop();
      anchors.push(makeAnchor(openBlock.marker, file, openBlock.startLine, lineNumber, "block"));
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

    if (marker.scope === "function") {
      anchors.push(makeAnchor(marker, file, lineNumber, lineNumber, "function"));
      return;
    }

    if (marker.inline) {
      anchors.push(makeAnchor(marker, file, lineNumber, lineNumber, "line"));
      return;
    }

    stack.push({ marker, file, startLine: lineNumber });
  });

  for (const openBlock of stack) {
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
  const ignore = await loadHarnIgnore(root);
  const gitFiles = await listGitVisibleFiles(root);
  if (gitFiles) {
    return gitFiles.filter((file) => !ignore.ignores(relative(root, file)));
  }

  const files: string[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (internalDirectories.has(entry.name)) {
        continue;
      }

      const path = join(dir, entry.name);
      const relativePath = relative(root, path);
      if (ignore.ignores(entry.isDirectory() ? `${relativePath}/` : relativePath)) {
        continue;
      }

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

async function loadHarnIgnore(root: string): Promise<HarnIgnore> {
  let content = "";
  try {
    content = await readFile(join(root, harnIgnoreFile), "utf8");
  } catch {
    return { ignores: () => false };
  }

  const rules = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"))
    .map((line): IgnoreRule => {
      const negated = line.startsWith("!");
      return {
        pattern: normalizeIgnorePattern(negated ? line.slice(1) : line),
        negated
      };
    })
    .filter((rule) => rule.pattern !== "");

  return {
    ignores(path: string): boolean {
      const normalizedPath = normalizePath(path);
      let ignored = false;

      for (const rule of rules) {
        if (matchesIgnoreRule(normalizedPath, rule.pattern)) {
          ignored = !rule.negated;
        }
      }

      return ignored;
    }
  };
}

function normalizeIgnorePattern(pattern: string): string {
  return normalizePath(pattern).replace(/^\/+/, "");
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\/+/, "");
}

function matchesIgnoreRule(path: string, pattern: string): boolean {
  if (pattern.endsWith("/")) {
    const directory = pattern.slice(0, -1);
    return matchesDirectoryRule(path, directory);
  }

  if (hasGlob(pattern)) {
    return matchesGlobRule(path, pattern);
  }

  if (pattern.includes("/")) {
    return path === pattern || path.startsWith(`${pattern}/`);
  }

  return basename(path) === pattern || path.split("/").includes(pattern);
}

function matchesDirectoryRule(path: string, directory: string): boolean {
  if (directory.includes("/")) {
    return path === directory || path.startsWith(`${directory}/`);
  }

  return path.split("/").includes(directory);
}

function matchesGlobRule(path: string, pattern: string): boolean {
  const candidates = pattern.includes("/") ? [path] : [basename(path), ...path.split("/")];
  const regexp = new RegExp(`^${globToRegExp(pattern)}$`);
  return candidates.some((candidate) => regexp.test(candidate));
}

function hasGlob(pattern: string): boolean {
  return pattern.includes("*") || pattern.includes("?");
}

function globToRegExp(pattern: string): string {
  let result = "";

  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    const next = pattern[index + 1];

    if (character === "*" && next === "*") {
      result += ".*";
      index += 1;
    } else if (character === "*") {
      result += "[^/]*";
    } else if (character === "?") {
      result += "[^/]";
    } else {
      result += escapeRegExp(character);
    }
  }

  return result;
}

function escapeRegExp(value: string): string {
  return value.replace(/[\\^$+?.()|[\]{}]/g, "\\$&");
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
