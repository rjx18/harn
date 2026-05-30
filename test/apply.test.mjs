import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { test } from "node:test";
import { createLockFixture, runHarn, runHarnFailure } from "./support/fixtures.mjs";

test("harn apply retires and creates assumptions and marks plan applied", async () => {
  const root = await createLockFixture();
  const planPath = `${root}/.harn/plans/support-multiple-workflows.yaml`;
  const plan = await readFile(planPath, "utf8");
  await writeFile(
    planPath,
    plan.replace(
      "  create: []",
      [
        "  create:",
        "    - id: multiple-active-workflows",
        "      title: Multiple active workflows per case",
        "      statement: A case may have multiple active workflows.",
        "      reason: Replacement model for case workflows.",
        "      depends_on: []"
      ].join("\n")
    )
  );
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "add create"], {
    cwd: root
  });
  runHarn(root, "plan", "lock", "support-multiple-workflows");
  execFileSync("bash", ["-lc", "perl -0pi -e 's/if active:/if active_changed:/' backend/workflow.py"], { cwd: root });

  const output = runHarn(root, "apply", "support-multiple-workflows");
  const retired = await readFile(`${root}/.harn/assumptions/single-active-workflow.yaml`, "utf8");
  const created = await readFile(`${root}/.harn/assumptions/multiple-active-workflows.yaml`, "utf8");
  const appliedPlan = await readFile(planPath, "utf8");

  assert.match(output, /result: applied/);
  assert.match(retired, /state: retired/);
  assert.match(retired, /retired_by: support-multiple-workflows/);
  assert.match(created, /state: active/);
  assert.match(created, /hash: a-[a-f0-9]{12}/);
  assert.match(created, /created_by: support-multiple-workflows/);
  assert.doesNotMatch(appliedPlan, /lock:/);
  assert.match(appliedPlan, /applied:/);
});

test("harn apply does not mutate when check is blocked", async () => {
  const root = await createLockFixture();
  runHarn(root, "plan", "lock", "support-multiple-workflows");
  await writeFile(`${root}/backend/unplanned.py`, "print('unplanned')\n");

  const output = runHarnFailure(root, "apply", "support-multiple-workflows");
  const assumption = await readFile(`${root}/.harn/assumptions/single-active-workflow.yaml`, "utf8");

  assert.match(output, /result: blocked/);
  assert.match(assumption, /state: active/);
});

test("harn apply infers the single locked plan", async () => {
  const root = await createLockFixture();
  runHarn(root, "plan", "lock", "support-multiple-workflows");
  execFileSync("bash", ["-lc", "perl -0pi -e 's/if active:/if active_changed:/' backend/workflow.py"], { cwd: root });

  const output = runHarn(root, "apply");
  const appliedPlan = await readFile(`${root}/.harn/plans/support-multiple-workflows.yaml`, "utf8");

  assert.match(output, /result: applied/);
  assert.match(output, /id: support-multiple-workflows/);
  assert.doesNotMatch(appliedPlan, /lock:/);
  assert.match(appliedPlan, /applied:/);
});

test("harn apply blocks without a locked plan to infer", async () => {
  const root = await createLockFixture();

  const output = runHarnFailure(root, "apply");

  assert.match(output, /result: blocked/);
  assert.match(output, /locked_plan_not_found/);
});

test("harn apply blocks when multiple locked plans exist and no id is provided", async () => {
  const root = await createLockFixture();
  await writeFile(
    `${root}/.harn/plans/review-workflow.yaml`,
    [
      "id: review-workflow",
      "title: Review workflow assumption",
      "assumptions:",
      "  retire: []",
      "  create: []",
      "  reviewed:",
      "    - id: single-active-workflow",
      "      outcome: unchanged",
      "      reason: Baseline review.",
      "anchors: {}",
      "files:",
      "  - backend/workflow.py"
    ].join("\n")
  );
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "add second plan"], {
    cwd: root
  });
  runHarn(root, "plan", "lock", "support-multiple-workflows");
  runHarn(root, "plan", "lock", "review-workflow");

  const output = runHarnFailure(root, "apply");

  assert.match(output, /result: blocked/);
  assert.match(output, /locked_plan_not_found/);
});
