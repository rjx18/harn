import type { Anchor } from "../anchors/types.js";
import type { ChangedRange } from "./diff.js";

export function anchorsTouchedByRanges(anchors: Anchor[], ranges: ChangedRange[]): Anchor[] {
  const touched = new Map<string, Anchor>();

  for (const anchor of anchors) {
    if (ranges.some((range) => range.file === anchor.file && rangesOverlap(anchor, range))) {
      touched.set(anchor.identity, anchor);
    }
  }

  return [...touched.values()];
}

function rangesOverlap(anchor: Anchor, range: ChangedRange): boolean {
  return anchor.startLine <= range.endLine && range.startLine <= anchor.endLine;
}
