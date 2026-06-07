import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

test("prints top-level help", () => {
  const output = execFileSync("node", ["dist/index.js", "--help"], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8"
  });

  assert.match(output, /Usage: harn/);
  assert.match(output, /init/);
  assert.match(output, /install/);
  assert.match(output, /install-skill/);
  assert.match(output, /find/);
  assert.match(output, /plan/);
  assert.match(output, /check/);
  assert.match(output, /apply/);
  assert.match(output, /log/);
});
