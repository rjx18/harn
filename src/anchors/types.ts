export type AnchorKind = "line" | "block" | "function";

export interface Anchor {
  assumptionId: string;
  ref: string;
  identity: string;
  file: string;
  startLine: number;
  endLine: number;
  kind: AnchorKind;
}

export interface AnchorIssue {
  type: "missing_ref" | "missing_end" | "unexpected_end" | "nested_anchor" | "duplicate_anchor";
  file: string;
  line?: number;
  message: string;
}

export interface AnchorScanResult {
  anchors: Anchor[];
  issues: AnchorIssue[];
}
