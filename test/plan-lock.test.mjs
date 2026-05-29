import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { createLockFixture, runHarn } from "./support/fixtures.mjs";

test("harn plan lock writes a lock block", async () => {
  const root = await createLockFixture();

  const output = runHarn(root, "plan", "lock", "p-d4f8qa");
  const plan = await readFile(`${root}/.harn/plans/p-d4f8qa.yaml`, "utf8");

  assert.match(output, /result: locked/);
  assert.match(plan, /lock:/);
  assert.match(plan, /plan_hash:/);
  assert.match(plan, /dirty_at_lock: false/);
});

test("harn plan lock warns when worktree is dirty", async () => {
  const root = await createLockFixture();
  execFileSync("bash", ["-lc", "echo '# implementation' >> backend/workflow.py"], { cwd: root });

  const output = runHarn(root, "plan", "lock", "p-d4f8qa");

  assert.match(output, /warnings:/);
  assert.match(output, /type: dirty_worktree_at_lock/);
});
