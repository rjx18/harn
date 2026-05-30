import { isAssumptionId } from "../domain/ids.js";

export interface ParsedAssumeMarker {
  assumptionId: string;
  ref?: string;
  scope?: string;
  inline: boolean;
}

export interface ParsedEndMarker {
  assumptionId: string;
}

const assumePattern = /harn:assume\s+([a-z][a-z0-9-]*)(?<attrs>[^\n]*)/;
const endPattern = /harn:end\s+([a-z][a-z0-9-]*)/;

export function parseAssumeMarker(line: string): ParsedAssumeMarker | undefined {
  const match = line.match(assumePattern);
  if (!match) {
    return undefined;
  }

  const assumptionId = match[1];
  if (!isAssumptionId(assumptionId)) {
    return undefined;
  }

  const attrs = parseAttrs(match.groups?.["attrs"] ?? "");
  return {
    assumptionId,
    ref: attrs.get("ref"),
    scope: attrs.get("scope"),
    inline: hasCodeBeforeMarker(line, match.index ?? 0)
  };
}

export function parseEndMarker(line: string): ParsedEndMarker | undefined {
  const match = line.match(endPattern);
  if (!match) {
    return undefined;
  }

  return { assumptionId: match[1] };
}

function parseAttrs(raw: string): Map<string, string> {
  const attrs = new Map<string, string>();

  for (const part of raw.trim().split(/\s+/)) {
    const [key, value] = part.split("=", 2);
    if (key && value) {
      attrs.set(key, value.replace(/[}\])*/,;]+$/g, ""));
    }
  }

  return attrs;
}

function hasCodeBeforeMarker(line: string, markerIndex: number): boolean {
  const prefix = line.slice(0, markerIndex).trim();
  if (!prefix) {
    return false;
  }

  return !["#", "//", "--", "/*", "{/*", "*"].some((commentStart) => prefix.startsWith(commentStart));
}
