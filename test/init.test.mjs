import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

test("harn init creates the MVP directory structure", async () => {
  const root = await mkdtemp(join(tmpdir(), "harn-init-"));

  const output = execFileSync("node", [join(process.cwd(), "dist/index.js"), "init"], {
    cwd: root,
    encoding: "utf8"
  });

  assert.match(output, /result: initialized/);
  assert.match(output, /detected: false/);
  assert.match(output, /Not inside a Git worktree/);
  assert.equal(existsSync(join(root, ".harn")), true);
  assert.equal(existsSync(join(root, ".harn", "assumptions")), true);
  assert.equal(existsSync(join(root, ".harn", "plans")), true);
});

test("harn init installs pre-commit hook in a git repo", async () => {
  const root = await mkdtemp(join(tmpdir(), "harn-init-git-"));
  execFileSync("git", ["init"], { cwd: root });

  const output = runHarn(root, "init");
  const hookPath = join(root, ".git", "hooks", "pre-commit");

  assert.match(output, /detected: true/);
  assert.match(output, /action: installed/);
  assert.equal(existsSync(hookPath), true);
  assert.match(readFileSync(hookPath, "utf8"), /harn check --staged/);
  assert.notEqual(statSync(hookPath).mode & 0o111, 0);
});

test("harn init --yes installs pre-commit hook non-interactively", async () => {
  const root = await mkdtemp(join(tmpdir(), "harn-init-yes-"));
  execFileSync("git", ["init"], { cwd: root });

  const output = runHarn(root, "init", "--yes");

  assert.match(output, /action: installed/);
  assert.equal(existsSync(join(root, ".git", "hooks", "pre-commit")), true);
});

test("harn init --no-hook skips hook installation", async () => {
  const root = await mkdtemp(join(tmpdir(), "harn-init-no-hook-"));
  execFileSync("git", ["init"], { cwd: root });

  const output = runHarn(root, "init", "--no-hook");

  assert.match(output, /detected: true/);
  assert.match(output, /action: skipped/);
  assert.match(output, /Skipped by --no-hook/);
  assert.equal(existsSync(join(root, ".git", "hooks", "pre-commit")), false);
});

test("harn init does not overwrite an existing pre-commit hook", async () => {
  const root = await mkdtemp(join(tmpdir(), "harn-init-existing-hook-"));
  execFileSync("git", ["init"], { cwd: root });
  const hookPath = join(root, ".git", "hooks", "pre-commit");
  await writeFile(hookPath, "#!/usr/bin/env sh\necho custom\n");

  const output = runHarn(root, "init");

  assert.match(output, /action: skipped/);
  assert.match(output, /Existing pre-commit hook found/);
  assert.equal(readFileSync(hookPath, "utf8"), "#!/usr/bin/env sh\necho custom\n");
});

function runHarn(root, ...args) {
  return execFileSync("node", [join(process.cwd(), "dist/index.js"), ...args], {
    cwd: root,
    encoding: "utf8"
  });
}
