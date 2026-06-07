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

test("finds nested block anchors", () => {
  const result = scanAnchorText(
    "backend/payment.py",
    [
      "# harn:assume payment-priority-order ref=allocation-flow",
      "def allocate_payment(claim, payment):",
      "    remaining = payment.amount",
      "    # harn:assume catastrophe-payment-override ref=catastrophe-branch",
      "    if claim.is_catastrophe:",
      "        remaining = allocate_insurer_first(claim, remaining)",
      "    # harn:end catastrophe-payment-override",
      "    return allocate_deductible_first(claim, remaining)",
      "# harn:end payment-priority-order"
    ].join("\n")
  );

  assert.equal(result.issues.length, 0);
  assert.deepEqual(
    result.anchors.map((anchor) => ({
      identity: anchor.identity,
      startLine: anchor.startLine,
      endLine: anchor.endLine,
      kind: anchor.kind
    })),
    [
      {
        identity: "catastrophe-payment-override:catastrophe-branch",
        startLine: 4,
        endLine: 7,
        kind: "block"
      },
      {
        identity: "payment-priority-order:allocation-flow",
        startLine: 1,
        endLine: 9,
        kind: "block"
      }
    ]
  );
});

test("allows nested anchors with the same assumption and different refs", () => {
  const result = scanAnchorText(
    "backend/payment.py",
    [
      "# harn:assume payment-priority-order ref=allocation-flow",
      "def allocate_payment(claim, payment):",
      "    # harn:assume payment-priority-order ref=catastrophe-branch",
      "    if claim.is_catastrophe:",
      "        return allocate_insurer_first(claim, payment)",
      "    # harn:end payment-priority-order",
      "    return allocate_deductible_first(claim, payment)",
      "# harn:end payment-priority-order"
    ].join("\n")
  );

  assert.equal(result.issues.length, 0);
  assert.deepEqual(
    result.anchors.map((anchor) => anchor.identity),
    ["payment-priority-order:catastrophe-branch", "payment-priority-order:allocation-flow"]
  );
});

test("reports mismatched nested end markers", () => {
  const result = scanAnchorText(
    "backend/payment.py",
    [
      "# harn:assume payment-priority-order ref=allocation-flow",
      "def allocate_payment(claim, payment):",
      "    # harn:assume catastrophe-payment-override ref=catastrophe-branch",
      "    if claim.is_catastrophe:",
      "        return allocate_insurer_first(claim, payment)",
      "    # harn:end payment-priority-order",
      "    return allocate_deductible_first(claim, payment)",
      "# harn:end catastrophe-payment-override"
    ].join("\n")
  );

  assert.equal(result.issues[0].type, "mismatched_end");
  assert.match(result.issues[0].message, /does not match open anchor/);
});

test("reports missing end markers for unclosed nested anchors", () => {
  const result = scanAnchorText(
    "backend/payment.py",
    [
      "# harn:assume payment-priority-order ref=allocation-flow",
      "def allocate_payment(claim, payment):",
      "    # harn:assume catastrophe-payment-override ref=catastrophe-branch",
      "    if claim.is_catastrophe:",
      "        return allocate_insurer_first(claim, payment)"
    ].join("\n")
  );

  assert.deepEqual(
    result.issues.map((issue) => issue.type),
    ["missing_end", "missing_end"]
  );
});

test("does not treat inline anchors as nested stack entries", () => {
  const result = scanAnchorText(
    "backend/payment.py",
    [
      "# harn:assume payment-priority-order ref=allocation-flow",
      "def allocate_payment(claim, payment):",
      "    if claim.is_catastrophe:  # harn:assume catastrophe-payment-override ref=catastrophe-line",
      "        return allocate_insurer_first(claim, payment)",
      "# harn:end payment-priority-order"
    ].join("\n")
  );

  assert.equal(result.issues.length, 0);
  assert.deepEqual(
    result.anchors.map((anchor) => ({ identity: anchor.identity, kind: anchor.kind })),
    [
      { identity: "catastrophe-payment-override:catastrophe-line", kind: "line" },
      { identity: "payment-priority-order:allocation-flow", kind: "block" }
    ]
  );
});

test("does not treat function-scope anchors as nested stack entries", () => {
  const result = scanAnchorText(
    "backend/payment.py",
    [
      "# harn:assume payment-priority-order ref=allocation-flow",
      "def allocate_payment(claim, payment):",
      "    # harn:assume catastrophe-payment-override ref=catastrophe-function scope=function",
      "    if claim.is_catastrophe:",
      "        return allocate_insurer_first(claim, payment)",
      "# harn:end payment-priority-order"
    ].join("\n")
  );

  assert.equal(result.issues.length, 0);
  assert.deepEqual(
    result.anchors.map((anchor) => ({ identity: anchor.identity, kind: anchor.kind })),
    [
      { identity: "catastrophe-payment-override:catastrophe-function", kind: "function" },
      { identity: "payment-priority-order:allocation-flow", kind: "block" }
    ]
  );
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

test("scanAnchors respects harnignore for tracked documentation examples", async () => {
  const root = await mkdtemp(join(tmpdir(), "harn-harnignore-"));
  await mkdir(join(root, "backend"), { recursive: true });
  await mkdir(join(root, "skill", "references"), { recursive: true });
  await writeFile(
    join(root, ".harnignore"),
    ["README.md", "skill/", "fixtures/*.md"].join("\n")
  );
  await writeFile(
    join(root, "README.md"),
    "# harn:assume documented-example ref=readme-example\n# harn:end documented-example\n"
  );
  await writeFile(
    join(root, "skill", "references", "install.md"),
    "# harn:assume documented-skill-example ref=skill-example\n# harn:end documented-skill-example\n"
  );
  await mkdir(join(root, "fixtures"), { recursive: true });
  await writeFile(
    join(root, "fixtures", "example.md"),
    "# harn:assume fixture-example ref=fixture\n# harn:end fixture-example\n"
  );
  await writeFile(
    join(root, "backend", "workflow.py"),
    "if active:  # harn:assume single-active-workflow ref=workflow-guard\n"
  );
  execFileSync("git", ["init"], { cwd: root });
  execFileSync("git", ["add", "."], { cwd: root });

  const result = await scanAnchors(root);

  assert.deepEqual(
    result.anchors.map((anchor) => anchor.identity),
    ["single-active-workflow:workflow-guard"]
  );
});
