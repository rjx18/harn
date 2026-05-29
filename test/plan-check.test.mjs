import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

test("harn plan check validates a complete plan", async () => {
  const root = await createPlanFixture({ includeDependent: true, includeStatusAnchor: true });

  const output = runHarn(root, "plan", "check", "p-d4f8qa");

  assert.match(output, /result: valid/);
  assert.match(output, /accounted_for:/);
  assert.match(output, /a-7k3p9x:workflow-guard/);
});

test("harn plan check catches missing dependent assumptions and anchor actions", async () => {
  const root = await createPlanFixture({ includeDependent: false, includeStatusAnchor: false });

  const output = runHarn(root, "plan", "check", "p-d4f8qa");

  assert.match(output, /result: invalid/);
  assert.match(output, /type: missing_dependent_assumption/);
  assert.match(output, /type: missing_anchor_action/);
});

async function createPlanFixture({ includeDependent, includeStatusAnchor }) {
  const root = await mkdtemp(join(tmpdir(), "harn-plan-check-"));
  await mkdir(join(root, ".harn", "assumptions"), { recursive: true });
  await mkdir(join(root, ".harn", "plans"), { recursive: true });
  await mkdir(join(root, "backend"), { recursive: true });

  await writeAssumption(root, "a-7k3p9x", "Single active workflow", []);
  await writeAssumption(root, "a-8m2q1z", "Case status derives from active workflow", ["a-7k3p9x"]);

  await writeFile(
    join(root, "backend", "workflow.py"),
    [
      "if active:  # harn:assume a-7k3p9x ref=workflow-guard",
      "status = active  # harn:assume a-7k3p9x ref=status-report"
    ].join("\n")
  );

  const reviewed = includeDependent
    ? [
        "  reviewed:",
        "    - id: a-8m2q1z",
        "      reason: It depends on a-7k3p9x.",
        "      outcome: unchanged"
      ]
    : ["  reviewed: []"];

  const statusAnchor = includeStatusAnchor
    ? ["    status-report:", "      action: keep", "      reason: Report remains valid."]
    : [];

  await writeFile(
    join(root, ".harn", "plans", "p-d4f8qa.yaml"),
    [
      "id: p-d4f8qa",
      "title: Support multiple active workflows",
      "assumptions:",
      "  retire:",
      "    - id: a-7k3p9x",
      "      reason: Cases can now have multiple active workflows.",
      "  create: []",
      ...reviewed,
      "anchors:",
      "  a-7k3p9x:",
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

async function writeAssumption(root, id, title, dependsOn) {
  const dependsOnLines =
    dependsOn.length === 0 ? ["depends_on: []"] : ["depends_on:", ...dependsOn.map((dependency) => `  - ${dependency}`)];

  await writeFile(
    join(root, ".harn", "assumptions", `${id}.yaml`),
    [
      `id: ${id}`,
      `title: ${title}`,
      "state: active",
      `statement: ${title}.`,
      ...dependsOnLines
    ].join("\n")
  );
}

function runHarn(root, ...args) {
  return execFileSync("node", [join(process.cwd(), "dist/index.js"), ...args], {
    cwd: root,
    encoding: "utf8"
  });
}
