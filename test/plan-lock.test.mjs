import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { test } from "node:test";
import { createLockFixture, runHarn } from "./support/fixtures.mjs";

test("harn plan lock writes a lock block", async () => {
  const root = await createLockFixture();

  const output = runHarn(root, "plan", "lock", "support-multiple-workflows");
  const plan = await readFile(`${root}/.harn/plans/support-multiple-workflows.yaml`, "utf8");

  assert.match(output, /result: locked/);
  assert.match(plan, /lock:/);
  assert.match(plan, /hash:/);
  assert.match(plan, /dirty_at_lock: false/);
});

test("harn plan lock warns when worktree is dirty", async () => {
  const root = await createLockFixture();
  execFileSync("bash", ["-lc", "echo '# implementation' >> backend/workflow.py"], { cwd: root });

  const output = runHarn(root, "plan", "lock", "support-multiple-workflows");

  assert.match(output, /warnings:/);
  assert.match(output, /type: dirty_worktree_at_lock/);
});

test("harn plan lock ignores the draft plan file when checking dirtiness", async () => {
  const root = await createLockFixture();
  await writeFile(
    `${root}/.harn/plans/bootstrap-runtime.yaml`,
    [
      "id: bootstrap-runtime",
      "title: Bootstrap runtime",
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

  const output = runHarn(root, "plan", "lock", "bootstrap-runtime");
  const plan = await readFile(`${root}/.harn/plans/bootstrap-runtime.yaml`, "utf8");

  assert.match(output, /result: locked/);
  assert.doesNotMatch(output, /dirty_worktree_at_lock/);
  assert.match(plan, /dirty_at_lock: false/);
});
