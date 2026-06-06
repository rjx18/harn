import type { Anchor } from "../anchors/types.js";
import type { ChangedRange } from "./diff.js";

interface LineSegment {
  startLine: number;
  endLine: number;
}

export function anchorsTouchedByRanges(anchors: Anchor[], ranges: ChangedRange[]): Anchor[] {
  const touched = new Map<string, Anchor>();
  const segmentsByAnchor = new Map(anchors.map((anchor) => [anchor.identity, directSegmentsForAnchor(anchor, anchors)]));

  for (const anchor of anchors) {
    const segments = segmentsByAnchor.get(anchor.identity) ?? [];
    if (ranges.some((range) => range.file === anchor.file && segments.some((segment) => rangesOverlap(segment, range)))) {
      touched.set(anchor.identity, anchor);
    }
  }

  return [...touched.values()];
}

function directSegmentsForAnchor(anchor: Anchor, anchors: Anchor[]): LineSegment[] {
  if (anchor.kind !== "block") {
    return [{ startLine: anchor.startLine, endLine: anchor.endLine }];
  }

  const childSpans = anchors
    .filter((candidate) => isNestedBlockChild(anchor, candidate))
    .map((child) => ({ startLine: child.startLine, endLine: child.endLine }))
    .sort((left, right) => left.startLine - right.startLine || left.endLine - right.endLine);

  const segments: LineSegment[] = [
    { startLine: anchor.startLine, endLine: anchor.startLine },
    { startLine: anchor.startLine + 1, endLine: anchor.endLine - 1 },
    { startLine: anchor.endLine, endLine: anchor.endLine }
  ];

  return childSpans.reduce((remaining, child) => remaining.flatMap((segment) => subtractSegment(segment, child)), segments);
}

function isNestedBlockChild(parent: Anchor, candidate: Anchor): boolean {
  return (
    candidate.kind === "block" &&
    candidate.identity !== parent.identity &&
    candidate.file === parent.file &&
    parent.startLine < candidate.startLine &&
    candidate.endLine < parent.endLine
  );
}

function subtractSegment(segment: LineSegment, child: LineSegment): LineSegment[] {
  if (!rangesOverlap(segment, child)) {
    return [segment];
  }

  return [
    { startLine: segment.startLine, endLine: child.startLine - 1 },
    { startLine: child.endLine + 1, endLine: segment.endLine }
  ].filter((candidate) => candidate.startLine <= candidate.endLine);
}

function rangesOverlap(left: LineSegment, right: LineSegment): boolean {
  return left.startLine <= right.endLine && right.startLine <= left.endLine;
}
