import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
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
  assert.equal(existsSync(join(root, ".harn")), true);
  assert.equal(existsSync(join(root, ".harn", "assumptions")), true);
  assert.equal(existsSync(join(root, ".harn", "plans")), true);
});
