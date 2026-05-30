import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmod, readFile, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createLockFixture, runHarn } from "./support/fixtures.mjs";

test("pre-commit hook runs staged check", async () => {
  const hook = await readFile("hooks/pre-commit", "utf8");

  assert.match(hook, /harn check --staged/);
  assert.match(hook, /harn apply/);
  assert.match(hook, /git add \.harn/);
  execFileSync("sh", ["-n", "hooks/pre-commit"]);
});

test("pre-commit hook blocks failed staged checks", async () => {
  const root = await createLockFixture();
  runHarn(root, "plan", "lock", "support-multiple-workflows");
  await writeFile(`${root}/backend/unplanned.py`, "print('unplanned')\n");
  execFileSync("git", ["add", "."], { cwd: root });

  const binDir = await mkdtemp(join(tmpdir(), "harn-bin-"));
  const harnBin = join(binDir, "harn");
  await writeFile(harnBin, `#!/usr/bin/env sh\nnode ${JSON.stringify(join(process.cwd(), "dist/index.js"))} "$@"\n`);
  await chmod(harnBin, 0o755);
  await writeFile(join(root, ".git", "hooks", "pre-commit"), "#!/usr/bin/env sh\nset -eu\nharn check --staged\n");
  await chmod(join(root, ".git", "hooks", "pre-commit"), 0o755);

  assert.throws(
    () =>
      execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "blocked"], {
        cwd: root,
        env: { ...process.env, PATH: `${binDir}:${process.env.PATH}` },
        encoding: "utf8"
      }),
    /unplanned_file_changed/
  );
});

test("pre-commit hook applies and restages Harn state in one commit", async () => {
  const root = await createLockFixture();
  runHarn(root, "plan", "lock", "support-multiple-workflows");
  execFileSync("bash", ["-lc", "perl -0pi -e 's/if active:/if active_changed:/' backend/workflow.py"], { cwd: root });
  execFileSync("git", ["add", "."], { cwd: root });

  const binDir = await mkdtemp(join(tmpdir(), "harn-bin-"));
  const harnBin = join(binDir, "harn");
  await writeFile(harnBin, `#!/usr/bin/env sh\nnode ${JSON.stringify(join(process.cwd(), "dist/index.js"))} "$@"\n`);
  await chmod(harnBin, 0o755);
  await writeFile(join(root, ".git", "hooks", "pre-commit"), await readFile("hooks/pre-commit", "utf8"));
  await chmod(join(root, ".git", "hooks", "pre-commit"), 0o755);

  execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "one commit"], {
    cwd: root,
    env: { ...process.env, PATH: `${binDir}:${process.env.PATH}` },
    encoding: "utf8"
  });

  const plan = execFileSync("git", ["show", "HEAD:.harn/plans/support-multiple-workflows.yaml"], {
    cwd: root,
    encoding: "utf8"
  });
  const assumption = execFileSync("git", ["show", "HEAD:.harn/assumptions/single-active-workflow.yaml"], {
    cwd: root,
    encoding: "utf8"
  });
  const status = execFileSync("git", ["status", "--short"], { cwd: root, encoding: "utf8" });

  assert.match(plan, /applied:/);
  assert.doesNotMatch(plan, /lock:/);
  assert.match(assumption, /state: retired/);
  assert.equal(status, "");
});
