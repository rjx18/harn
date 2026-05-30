import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { createLockFixture, runHarn } from "./support/fixtures.mjs";

test("pre-commit hook runs staged check", async () => {
  const hook = await readFile("hooks/pre-commit", "utf8");

  assert.match(hook, /harn check --staged/);
  execFileSync("sh", ["-n", "hooks/pre-commit"]);
});

test("pre-commit hook blocks failed staged checks", async () => {
  const root = await createLockFixture();
  runHarn(root, "plan", "lock", "support-multiple-workflows");
  await writeFile(`${root}/backend/unplanned.py`, "print('unplanned')\n");
  execFileSync("git", ["add", "."], { cwd: root });

  const binDir = join(root, "bin");
  await mkdir(binDir);
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
