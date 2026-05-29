import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { parseChangedRanges } from "../dist/git/diff.js";

test("parses changed ranges from zero-context git diff", () => {
  const diff = [
    "diff --git a/backend/workflow.py b/backend/workflow.py",
    "index 1111111..2222222 100644",
    "--- a/backend/workflow.py",
    "+++ b/backend/workflow.py",
    "@@ -1 +1 @@",
    "-old",
    "+new",
    "@@ -10,0 +11,2 @@",
    "+added",
    "+lines"
  ].join("\n");

  assert.deepEqual(parseChangedRanges(diff), [
    { file: "backend/workflow.py", startLine: 1, endLine: 1 },
    { file: "backend/workflow.py", startLine: 11, endLine: 12 }
  ]);
});

test("harn find --changed shows touched anchors", async () => {
  const { root, runHarn } = await createGitFixture();
  execFileSync("bash", ["-lc", "perl -0pi -e 's/active/active_changed/' backend/workflow.py"], { cwd: root });

  const output = runHarn("find", "--changed");

  assert.match(output, /changed_anchors:/);
  assert.match(output, /assumption: a-7k3p9x/);
  assert.match(output, /ref: workflow-guard/);
});

test("harn find --staged shows staged touched anchors", async () => {
  const { root, runHarn } = await createGitFixture();
  execFileSync("bash", ["-lc", "perl -0pi -e 's/active/active_changed/' backend/workflow.py"], { cwd: root });
  execFileSync("git", ["add", "backend/workflow.py"], { cwd: root });

  const output = runHarn("find", "--staged");

  assert.match(output, /staged_anchors:/);
  assert.match(output, /assumption: a-7k3p9x/);
  assert.match(output, /ref: workflow-guard/);
});

async function createGitFixture() {
  const { mkdtemp, mkdir, writeFile } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const root = await mkdtemp(join(tmpdir(), "harn-git-"));

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
    join(root, "backend", "workflow.py"),
    "if active:  # harn:assume a-7k3p9x ref=workflow-guard\n"
  );

  execFileSync("git", ["init"], { cwd: root });
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "initial"], {
    cwd: root
  });

  return {
    root,
    runHarn: (...args) =>
      execFileSync("node", [join(process.cwd(), "dist/index.js"), ...args], {
        cwd: root,
        encoding: "utf8"
      })
  };
}
