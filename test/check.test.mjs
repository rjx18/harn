import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { test } from "node:test";
import { createLockFixture, runHarn } from "./support/fixtures.mjs";

test("harn check passes when diff matches locked plan", async () => {
  const root = await createLockFixture();
  runHarn(root, "plan", "lock", "p-d4f8qa");
  execFileSync("bash", ["-lc", "perl -0pi -e 's/if active:/if active_changed:/' backend/workflow.py"], { cwd: root });

  const output = runHarn(root, "check", "p-d4f8qa");

  assert.match(output, /result: pass/);
  assert.match(output, /planned: remove/);
});

test("harn check blocks when locked plan changed", async () => {
  const root = await createLockFixture();
  runHarn(root, "plan", "lock", "p-d4f8qa");
  const planPath = `${root}/.harn/plans/p-d4f8qa.yaml`;
  const plan = await readFile(planPath, "utf8");
  await writeFile(planPath, plan.replace("Support multiple active workflows", "Edited plan title"));

  const output = runHarn(root, "check", "p-d4f8qa");

  assert.match(output, /result: blocked/);
  assert.match(output, /type: locked_plan_changed/);
});

test("harn check blocks unplanned anchored changes", async () => {
  const root = await createLockFixture();
  await writeFile(
    `${root}/backend/other.py`,
    "if tenant:  # harn:assume a-9z9z9z ref=tenant-filter\n"
  );
  runHarn(root, "plan", "lock", "p-d4f8qa");
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "lock"], {
    cwd: root
  });
  execFileSync("bash", ["-lc", "perl -0pi -e 's/tenant/tenant_changed/' backend/other.py"], { cwd: root });

  const output = runHarn(root, "check", "p-d4f8qa");

  assert.match(output, /result: blocked/);
  assert.match(output, /type: unplanned_anchor_touched/);
});

test("harn check blocks changed keep anchors", async () => {
  const root = await createLockFixture();
  const planPath = `${root}/.harn/plans/p-d4f8qa.yaml`;
  const plan = await readFile(planPath, "utf8");
  await writeFile(planPath, plan.replace("action: remove", "action: keep"));
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "keep plan"], {
    cwd: root
  });
  runHarn(root, "plan", "lock", "p-d4f8qa");
  execFileSync("bash", ["-lc", "perl -0pi -e 's/if active:/if active_changed:/' backend/workflow.py"], { cwd: root });

  const output = runHarn(root, "check", "p-d4f8qa");

  assert.match(output, /result: blocked/);
  assert.match(output, /type: kept_anchor_changed/);
});
