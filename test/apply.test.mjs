import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { test } from "node:test";
import { createLockFixture, runHarn } from "./support/fixtures.mjs";

test("harn apply retires and creates assumptions and marks plan applied", async () => {
  const root = await createLockFixture();
  const planPath = `${root}/.harn/plans/p-d4f8qa.yaml`;
  const plan = await readFile(planPath, "utf8");
  await writeFile(
    planPath,
    plan.replace(
      "  create: []",
      [
        "  create:",
        "    - id: a-f92ks0",
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
  runHarn(root, "plan", "lock", "p-d4f8qa");
  execFileSync("bash", ["-lc", "perl -0pi -e 's/if active:/if active_changed:/' backend/workflow.py"], { cwd: root });

  const output = runHarn(root, "apply", "p-d4f8qa");
  const retired = await readFile(`${root}/.harn/assumptions/a-7k3p9x.yaml`, "utf8");
  const created = await readFile(`${root}/.harn/assumptions/a-f92ks0.yaml`, "utf8");
  const appliedPlan = await readFile(planPath, "utf8");

  assert.match(output, /result: applied/);
  assert.match(retired, /state: retired/);
  assert.match(created, /state: active/);
  assert.doesNotMatch(appliedPlan, /lock:/);
  assert.match(appliedPlan, /applied:/);
});

test("harn apply does not mutate when check is blocked", async () => {
  const root = await createLockFixture();
  runHarn(root, "plan", "lock", "p-d4f8qa");
  await writeFile(`${root}/backend/unplanned.py`, "print('unplanned')\n");

  const output = runHarn(root, "apply", "p-d4f8qa");
  const assumption = await readFile(`${root}/.harn/assumptions/a-7k3p9x.yaml`, "utf8");

  assert.match(output, /result: blocked/);
  assert.match(assumption, /state: active/);
});
