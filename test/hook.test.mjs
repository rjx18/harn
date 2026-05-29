import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("pre-commit hook runs staged check", async () => {
  const hook = await readFile("hooks/pre-commit", "utf8");

  assert.match(hook, /harn check --staged/);
  execFileSync("sh", ["-n", "hooks/pre-commit"]);
});
