import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

test("harn plan check validates a complete plan", async () => {
  const root = await createPlanFixture({ includeDependent: true, includeStatusAnchor: true });

  const output = runHarn(root, "plan", "check", "support-multiple-workflows");

  assert.match(output, /result: valid/);
  assert.match(output, /accounted_for:/);
  assert.match(output, /single-active-workflow:workflow-guard/);
});

test("harn plan check catches missing dependent assumptions and anchor actions", async () => {
  const root = await createPlanFixture({ includeDependent: false, includeStatusAnchor: false });

  const output = runHarnFailure(root, "plan", "check", "support-multiple-workflows");

  assert.match(output, /result: invalid/);
  assert.match(output, /type: missing_dependent_assumption/);
  assert.match(output, /type: missing_anchor_action/);
});

test("harn plan check allows anchors for assumptions created by the same plan", async () => {
  const root = await createPlanWithCreatedAnchorFixture();

  const output = runHarn(root, "plan", "check", "bootstrap-workflow");

  assert.match(output, /result: valid/);
  assert.match(output, /create:/);
  assert.match(output, /single-active-workflow/);
});

async function createPlanFixture({ includeDependent, includeStatusAnchor }) {
  const root = await mkdtemp(join(tmpdir(), "harn-plan-check-"));
  await mkdir(join(root, ".harn", "assumptions"), { recursive: true });
  await mkdir(join(root, ".harn", "plans"), { recursive: true });
  await mkdir(join(root, "backend"), { recursive: true });

  await writeAssumption(root, "single-active-workflow", "Single active workflow", []);
  await writeAssumption(root, "case-status-derived", "Case status derives from active workflow", ["single-active-workflow"]);

  await writeFile(
    join(root, "backend", "workflow.py"),
    [
      "if active:  # harn:assume single-active-workflow ref=workflow-guard",
      "status = active  # harn:assume single-active-workflow ref=status-report"
    ].join("\n")
  );

  const reviewed = includeDependent
    ? [
        "  reviewed:",
        "    - id: case-status-derived",
        "      reason: It depends on single-active-workflow.",
        "      outcome: unchanged"
      ]
    : ["  reviewed: []"];

  const statusAnchor = includeStatusAnchor
    ? ["    status-report:", "      action: keep", "      reason: Report remains valid."]
    : [];

  await writeFile(
    join(root, ".harn", "plans", "support-multiple-workflows.yaml"),
    [
      "id: support-multiple-workflows",
      "title: Support multiple active workflows",
      "assumptions:",
      "  retire:",
      "    - id: single-active-workflow",
      "      reason: Cases can now have multiple active workflows.",
      "  create: []",
      ...reviewed,
      "anchors:",
      "  single-active-workflow:",
      "    workflow-guard:",
      "      action: remove",
      "      reason: Guard rejects second active workflow.",
      ...statusAnchor,
      "files:",
      "  - backend/workflow.py"
    ].join("\n")
  );

  return root;
}

async function createPlanWithCreatedAnchorFixture() {
  const root = await mkdtemp(join(tmpdir(), "harn-plan-created-anchor-"));
  await mkdir(join(root, ".harn", "assumptions"), { recursive: true });
  await mkdir(join(root, ".harn", "plans"), { recursive: true });
  await mkdir(join(root, "backend"), { recursive: true });

  await writeFile(
    join(root, "backend", "workflow.py"),
    [
      "# harn:assume single-active-workflow ref=workflow-guard",
      "if active:",
      "    raise Error()",
      "# harn:end single-active-workflow"
    ].join("\n")
  );

  await writeFile(
    join(root, ".harn", "plans", "bootstrap-workflow.yaml"),
    [
      "id: bootstrap-workflow",
      "title: Bootstrap workflow assumptions",
      "assumptions:",
      "  retire: []",
      "  create:",
      "    - id: single-active-workflow",
      "      title: Single active workflow per case",
      "      statement: A case has at most one active workflow.",
      "      reason: Current workflow guard enforces this behavior.",
      "      depends_on: []",
      "  reviewed: []",
      "anchors:",
      "  single-active-workflow:",
      "    workflow-guard:",
      "      action: keep",
      "      reason: Current guard enforces this assumption.",
      "files:",
      "  - backend/workflow.py"
    ].join("\n")
  );

  return root;
}

async function writeAssumption(root, id, title, dependsOn) {
  const statement = `${title}.`;
  const hash = hashAssumptionContent(title, statement);
  const dependsOnLines =
    dependsOn.length === 0 ? ["depends_on: []"] : ["depends_on:", ...dependsOn.map((dependency) => `  - ${dependency}`)];

  await writeFile(
    join(root, ".harn", "assumptions", `${id}.yaml`),
    [
      `id: ${id}`,
      `hash: ${hash}`,
      `title: ${title}`,
      "state: active",
      `statement: ${statement}`,
      ...dependsOnLines
    ].join("\n")
  );
}

function hashAssumptionContent(title, statement) {
  return `a-${createHash("sha256")
    .update(JSON.stringify({ statement: statement.trim(), title: title.trim() }))
    .digest("hex")
    .slice(0, 12)}`;
}

function runHarn(root, ...args) {
  return execFileSync("node", [join(process.cwd(), "dist/index.js"), ...args], {
    cwd: root,
    encoding: "utf8"
  });
}

function runHarnFailure(root, ...args) {
  try {
    runHarn(root, ...args);
  } catch (error) {
    return `${error.stdout ?? ""}${error.stderr ?? ""}`;
  }

  throw new Error(`Expected harn ${args.join(" ")} to fail`);
}
