import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { runHarn } from "./support/fixtures.mjs";

test("harn log lists applied plans in order", async () => {
  const root = await mkdtemp(join(tmpdir(), "harn-log-"));
  await mkdir(join(root, ".harn", "plans"), { recursive: true });

  await writePlan(root, "p-bbbbbb", "Second plan", "2026-05-30T12:00:00+08:00");
  await writePlan(root, "p-aaaaaa", "First plan", "2026-05-30T11:00:00+08:00");

  const output = runHarn(root, "log");

  assert.match(output, /plans:/);
  assert.ok(output.indexOf("id: p-aaaaaa") < output.indexOf("id: p-bbbbbb"));
  assert.match(output, /retired:/);
  assert.match(output, /created:/);
});

async function writePlan(root, id, title, appliedAt) {
  await writeFile(
    join(root, ".harn", "plans", `${id}.yaml`),
    [
      `id: ${id}`,
      `title: ${title}`,
      "assumptions:",
      "  retire:",
      "    - id: single-active-workflow",
      "      reason: Retired by test.",
      "  create: []",
      "  reviewed: []",
      "anchors: {}",
      "files:",
      "  - backend/workflow.py",
      "applied:",
      `  applied_at: ${appliedAt}`,
      "  commit: abc123"
    ].join("\n")
  );
}
