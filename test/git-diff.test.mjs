import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { anchorsTouchedByRanges } from "../dist/git/anchors.js";
import { parseChangedRanges } from "../dist/git/diff.js";

test("parses changed ranges from zero-context git diff", () => {
  const diff = [
    "diff --git a/backend/workflow.py b/backend/workflow.py",
    "index 1111111..2222222 100644",
    "--- a/backend/workflow.py",
    "+++ b/backend/workflow.py",
    "@@ -1 +1 @@",
    "-old",
    "+new",
    "@@ -10,0 +11,2 @@",
    "+added",
    "+lines"
  ].join("\n");

  assert.deepEqual(parseChangedRanges(diff), [
    { file: "backend/workflow.py", startLine: 1, endLine: 1 },
    { file: "backend/workflow.py", startLine: 11, endLine: 12 }
  ]);
});

test("nested inner-only ranges touch the inner anchor only", () => {
  const touched = anchorsTouchedByRanges(nestedAnchors(), [{ file: "backend/payment.py", startLine: 5, endLine: 5 }]);

  assert.deepEqual(
    touched.map((anchor) => anchor.identity),
    ["catastrophe-payment-override:catastrophe-branch"]
  );
});

test("nested outer-only ranges touch the outer anchor only", () => {
  const touched = anchorsTouchedByRanges(nestedAnchors(), [{ file: "backend/payment.py", startLine: 8, endLine: 8 }]);

  assert.deepEqual(
    touched.map((anchor) => anchor.identity),
    ["payment-priority-order:allocation-flow"]
  );
});

test("nested ranges spanning inner and outer code touch both anchors", () => {
  const touched = anchorsTouchedByRanges(nestedAnchors(), [{ file: "backend/payment.py", startLine: 5, endLine: 8 }]);

  assert.deepEqual(
    touched.map((anchor) => anchor.identity),
    ["payment-priority-order:allocation-flow", "catastrophe-payment-override:catastrophe-branch"]
  );
});

test("nested marker ranges touch the marker owner only", () => {
  const outerStart = anchorsTouchedByRanges(nestedAnchors(), [
    { file: "backend/payment.py", startLine: 1, endLine: 1 }
  ]);
  const innerStart = anchorsTouchedByRanges(nestedAnchors(), [
    { file: "backend/payment.py", startLine: 4, endLine: 4 }
  ]);

  assert.deepEqual(
    outerStart.map((anchor) => anchor.identity),
    ["payment-priority-order:allocation-flow"]
  );
  assert.deepEqual(
    innerStart.map((anchor) => anchor.identity),
    ["catastrophe-payment-override:catastrophe-branch"]
  );
});

test("harn find --changed shows touched anchors", async () => {
  const { root, runHarn } = await createGitFixture();
  execFileSync("bash", ["-lc", "perl -0pi -e 's/active/active_changed/' backend/workflow.py"], { cwd: root });

  const output = runHarn("find", "--changed");

  assert.match(output, /changed_anchors:/);
  assert.match(output, /assumption: single-active-workflow/);
  assert.match(output, /ref: workflow-guard/);
});

test("harn find --staged shows staged touched anchors", async () => {
  const { root, runHarn } = await createGitFixture();
  execFileSync("bash", ["-lc", "perl -0pi -e 's/active/active_changed/' backend/workflow.py"], { cwd: root });
  execFileSync("git", ["add", "backend/workflow.py"], { cwd: root });

  const output = runHarn("find", "--staged");

  assert.match(output, /staged_anchors:/);
  assert.match(output, /assumption: single-active-workflow/);
  assert.match(output, /ref: workflow-guard/);
});

async function createGitFixture() {
  const { mkdtemp, mkdir, writeFile } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const root = await mkdtemp(join(tmpdir(), "harn-git-"));

  await mkdir(join(root, ".harn", "assumptions"), { recursive: true });
  await mkdir(join(root, ".harn", "plans"), { recursive: true });
  await mkdir(join(root, "backend"), { recursive: true });
  await writeFile(
    join(root, ".harn", "assumptions", "single-active-workflow.yaml"),
    [
      "id: single-active-workflow",
      "hash: a-7e7e69cd6688",
      "title: Single active workflow per case",
      "state: active",
      "statement: A case has at most one active workflow.",
      "depends_on: []"
    ].join("\n")
  );
  await writeFile(
    join(root, "backend", "workflow.py"),
    "if active:  # harn:assume single-active-workflow ref=workflow-guard\n"
  );

  execFileSync("git", ["init"], { cwd: root });
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "initial"], {
    cwd: root
  });

  return {
    root,
    runHarn: (...args) =>
      execFileSync("node", [join(process.cwd(), "dist/index.js"), ...args], {
        cwd: root,
        encoding: "utf8"
      })
  };
}

function nestedAnchors() {
  return [
    {
      assumptionId: "payment-priority-order",
      ref: "allocation-flow",
      identity: "payment-priority-order:allocation-flow",
      file: "backend/payment.py",
      startLine: 1,
      endLine: 9,
      kind: "block"
    },
    {
      assumptionId: "catastrophe-payment-override",
      ref: "catastrophe-branch",
      identity: "catastrophe-payment-override:catastrophe-branch",
      file: "backend/payment.py",
      startLine: 4,
      endLine: 7,
      kind: "block"
    }
  ];
}
