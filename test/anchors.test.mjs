import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { scanAnchors, scanAnchorText } from "../dist/anchors/scanner.js";

test("finds single-line anchors", () => {
  const result = scanAnchorText(
      "backend/workflow.py",
      [
      "if case.active_workflow_id is not None:  # harn:assume single-active-workflow ref=workflow-guard",
      "    raise CaseAlreadyHasActiveWorkflowError(case.id)"
    ].join("\n")
  );

  assert.equal(result.issues.length, 0);
  assert.deepEqual(result.anchors[0], {
    assumptionId: "single-active-workflow",
    ref: "workflow-guard",
    identity: "single-active-workflow:workflow-guard",
    file: "backend/workflow.py",
    startLine: 1,
    endLine: 1,
    kind: "line"
  });
});

test("finds block anchors", () => {
  const result = scanAnchorText(
      "backend/workflow.py",
      [
      "# harn:assume single-active-workflow ref=workflow-guard",
      "if case.active_workflow_id is not None:",
      "    raise CaseAlreadyHasActiveWorkflowError(case.id)",
      "# harn:end single-active-workflow"
    ].join("\n")
  );

  assert.equal(result.issues.length, 0);
  assert.equal(result.anchors[0].kind, "block");
  assert.equal(result.anchors[0].startLine, 1);
  assert.equal(result.anchors[0].endLine, 4);
});

test("recognizes function-level anchors", () => {
  const result = scanAnchorText(
      "backend/workflow.py",
      [
      "# harn:assume single-active-workflow ref=start-workflow scope=function",
      "def start_workflow(case_id: str):",
      "    pass"
    ].join("\n")
  );

  assert.equal(result.issues.length, 0);
  assert.equal(result.anchors[0].kind, "function");
  assert.equal(result.anchors[0].startLine, 1);
});

test("reports missing end markers", () => {
  const result = scanAnchorText("backend/workflow.py", "# harn:assume single-active-workflow ref=workflow-guard");

  assert.equal(result.anchors.length, 0);
  assert.equal(result.issues[0].type, "missing_end");
});

test("reports duplicate anchors across files", async () => {
  const root = await mkdtemp(join(tmpdir(), "harn-anchors-"));
  await mkdir(join(root, "backend"), { recursive: true });
  await writeFile(join(root, "backend", "a.py"), "if active:  # harn:assume single-active-workflow ref=workflow-guard");
  await writeFile(join(root, "backend", "b.py"), "if active:  # harn:assume single-active-workflow ref=workflow-guard");

  const result = await scanAnchors(root);

  assert.equal(result.anchors.length, 2);
  assert.equal(result.issues[0].type, "duplicate_anchor");
});

test("scanAnchors respects gitignore", async () => {
  const root = await mkdtemp(join(tmpdir(), "harn-gitignore-"));
  await mkdir(join(root, "backend"), { recursive: true });
  await mkdir(join(root, ".next", "server", "app"), { recursive: true });
  await writeFile(join(root, ".gitignore"), ".next/\n");
  await writeFile(join(root, "backend", "workflow.py"), "print('no anchors')\n");
  await writeFile(
    join(root, ".next", "server", "app", "page.js"),
    "if active:  # harn:assume stale-generated-anchor ref=generated\n"
  );
  execFileSync("git", ["init"], { cwd: root });

  const result = await scanAnchors(root);

  assert.equal(result.anchors.length, 0);
});
