import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { test } from "node:test";
import { createLockFixture, runHarn, runHarnFailure } from "./support/fixtures.mjs";

test("harn check passes when diff matches locked plan", async () => {
  const root = await createLockFixture();
  runHarn(root, "plan", "lock", "support-multiple-workflows");
  execFileSync("bash", ["-lc", "perl -0pi -e 's/if active:/if active_changed:/' backend/workflow.py"], { cwd: root });

  const output = runHarn(root, "check", "support-multiple-workflows");

  assert.match(output, /result: pass/);
  assert.match(output, /planned: remove/);
});

test("harn check blocks when locked plan changed", async () => {
  const root = await createLockFixture();
  runHarn(root, "plan", "lock", "support-multiple-workflows");
  const planPath = `${root}/.harn/plans/support-multiple-workflows.yaml`;
  const plan = await readFile(planPath, "utf8");
  await writeFile(planPath, plan.replace("Support multiple active workflows", "Edited plan title"));

  const output = runHarnFailure(root, "check", "support-multiple-workflows");

  assert.match(output, /result: blocked/);
  assert.match(output, /type: locked_plan_changed/);
});

test("harn check blocks unplanned anchored changes", async () => {
  const root = await createLockFixture();
  await writeFile(
    `${root}/backend/other.py`,
    "if tenant:  # harn:assume tenant-filter-required ref=tenant-filter\n"
  );
  runHarn(root, "plan", "lock", "support-multiple-workflows");
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "lock"], {
    cwd: root
  });
  execFileSync("bash", ["-lc", "perl -0pi -e 's/tenant/tenant_changed/' backend/other.py"], { cwd: root });

  const output = runHarnFailure(root, "check", "support-multiple-workflows");

  assert.match(output, /result: blocked/);
  assert.match(output, /type: unplanned_anchor_touched/);
});

test("harn check blocks changed keep anchors", async () => {
  const root = await createLockFixture();
  const planPath = `${root}/.harn/plans/support-multiple-workflows.yaml`;
  const plan = await readFile(planPath, "utf8");
  await writeFile(planPath, plan.replace("action: remove", "action: keep"));
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "keep plan"], {
    cwd: root
  });
  runHarn(root, "plan", "lock", "support-multiple-workflows");
  execFileSync("bash", ["-lc", "perl -0pi -e 's/if active:/if active_changed:/' backend/workflow.py"], { cwd: root });

  const output = runHarnFailure(root, "check", "support-multiple-workflows");

  assert.match(output, /result: blocked/);
  assert.match(output, /type: kept_anchor_changed/);
});

test("harn check --staged uses the single locked plan", async () => {
  const root = await createLockFixture();
  runHarn(root, "plan", "lock", "support-multiple-workflows");
  execFileSync("bash", ["-lc", "perl -0pi -e 's/if active:/if active_changed:/' backend/workflow.py"], { cwd: root });
  execFileSync("git", ["add", "backend/workflow.py"], { cwd: root });

  const output = runHarn(root, "check", "--staged");

  assert.match(output, /result: pass/);
  assert.match(output, /planned: remove/);
});

test("harn check --staged accepts applied one-commit state", async () => {
  const root = await createLockFixture();
  runHarn(root, "plan", "lock", "support-multiple-workflows");
  execFileSync("bash", ["-lc", "perl -0pi -e 's/if active:/if active_changed:/' backend/workflow.py"], { cwd: root });
  execFileSync("git", ["add", "."], { cwd: root });
  runHarn(root, "apply");
  execFileSync("git", ["add", ".harn"], { cwd: root });

  const output = runHarn(root, "check", "--staged");

  assert.match(output, /result: pass/);
  assert.match(output, /id: support-multiple-workflows/);
});

test("harn check --staged blocks unrelated assumptions in applied state", async () => {
  const root = await createLockFixture();
  runHarn(root, "plan", "lock", "support-multiple-workflows");
  execFileSync("bash", ["-lc", "perl -0pi -e 's/if active:/if active_changed:/' backend/workflow.py"], { cwd: root });
  execFileSync("git", ["add", "."], { cwd: root });
  runHarn(root, "apply");
  await writeFile(
    `${root}/.harn/assumptions/unrelated.yaml`,
    [
      "id: unrelated",
      "title: Unrelated",
      "state: retired",
      "statement: Unrelated code must stay observable for tests because this is unrelated.",
      "depends_on: []"
    ].join("\n")
  );
  execFileSync("git", ["add", ".harn"], { cwd: root });

  const output = runHarnFailure(root, "check", "--staged");

  assert.match(output, /result: blocked/);
  assert.match(output, /unexpected_applied_assumption_changed/);
});

test("harn check --staged blocks unplanned source files in applied state", async () => {
  const root = await createLockFixture();
  runHarn(root, "plan", "lock", "support-multiple-workflows");
  execFileSync("bash", ["-lc", "perl -0pi -e 's/if active:/if active_changed:/' backend/workflow.py"], { cwd: root });
  execFileSync("git", ["add", "."], { cwd: root });
  runHarn(root, "apply");
  await writeFile(`${root}/backend/unplanned.py`, "print('unplanned')\n");
  execFileSync("git", ["add", "."], { cwd: root });

  const output = runHarnFailure(root, "check", "--staged");

  assert.match(output, /result: blocked/);
  assert.match(output, /unplanned_file_changed/);
});
