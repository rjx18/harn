import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

test("harn find summarizes project state", async () => {
  const root = await createFindFixture();

  const output = runHarn(root, "find");

  assert.match(output, /summary:/);
  assert.match(output, /assumptions: 2/);
  assert.match(output, /anchors: 1/);
  assert.match(output, /plans: 1/);
});

test("harn find shows one assumption with anchors and dependents", async () => {
  const root = await createFindFixture();

  const output = runHarn(root, "find", "a-7k3p9x");

  assert.match(output, /assumption:/);
  assert.match(output, /id: a-7k3p9x/);
  assert.match(output, /depended_by:/);
  assert.match(output, /id: a-8m2q1z/);
  assert.match(output, /ref: workflow-guard/);
});

test("harn find --depended-by traverses dependencies", async () => {
  const root = await createFindFixture();

  const output = runHarn(root, "find", "--depended-by", "a-7k3p9x", "--depth", "1");

  assert.match(output, /target:/);
  assert.match(output, /depended_by:/);
  assert.match(output, /id: a-8m2q1z/);
  assert.match(output, /depth: 1/);
});

test("harn find --plan shows plan scope", async () => {
  const root = await createFindFixture();

  const output = runHarn(root, "find", "--plan", "p-d4f8qa");

  assert.match(output, /plan:/);
  assert.match(output, /retire:/);
  assert.match(output, /- a-7k3p9x/);
  assert.match(output, /planned_action: remove/);
});

async function createFindFixture() {
  const root = await mkdtemp(join(tmpdir(), "harn-find-"));
  await mkdir(join(root, ".harn", "assumptions"), { recursive: true });
  await mkdir(join(root, ".harn", "plans"), { recursive: true });
  await mkdir(join(root, "backend"), { recursive: true });

  await writeFile(
    join(root, ".harn", "assumptions", "a-7k3p9x.yaml"),
    [
      "id: a-7k3p9x",
      "title: Single active workflow per case",
      "state: active",
      "statement: A case has at most one active workflow.",
      "depends_on: []"
    ].join("\n")
  );

  await writeFile(
    join(root, ".harn", "assumptions", "a-8m2q1z.yaml"),
    [
      "id: a-8m2q1z",
      "title: Case status derives from active workflow",
      "state: active",
      "statement: Case status is derived from the active workflow.",
      "depends_on:",
      "  - a-7k3p9x"
    ].join("\n")
  );

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
      "  reviewed:",
      "    - id: a-8m2q1z",
      "      reason: It depends on a-7k3p9x.",
      "      outcome: unchanged",
      "anchors:",
      "  a-7k3p9x:",
      "    workflow-guard:",
      "      action: remove",
      "      reason: Guard rejects second active workflow.",
      "files:",
      "  - backend/workflow.py"
    ].join("\n")
  );

  await writeFile(
    join(root, "backend", "workflow.py"),
    "if active:  # harn:assume a-7k3p9x ref=workflow-guard"
  );

  return root;
}

function runHarn(root, ...args) {
  return execFileSync("node", [join(process.cwd(), "dist/index.js"), ...args], {
    cwd: root,
    encoding: "utf8"
  });
}
