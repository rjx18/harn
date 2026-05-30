import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp } from "node:fs/promises";
import { test } from "node:test";
import { getHarnPaths } from "../dist/core/repo.js";
import { parseAssumption } from "../dist/domain/assumption.js";
import { getPlanState, parsePlan } from "../dist/domain/plan.js";
import { loadHarnProject } from "../dist/domain/project.js";

test("parses a valid assumption", () => {
  const assumption = parseAssumption({
    id: "single-active-workflow",
    title: "Single active workflow",
    state: "active",
    statement: "A case has at most one active workflow.",
    depends_on: []
  });

  assert.equal(assumption.id, "single-active-workflow");
  assert.equal(assumption.state, "active");
});

test("rejects an invalid assumption id", () => {
  assert.throws(
    () =>
      parseAssumption({
        id: "A-001",
        title: "Single active workflow",
        state: "active",
        statement: "A case has at most one active workflow.",
        depends_on: []
      }),
    /assumption is invalid/
  );
});

test("derives plan state from lock and applied blocks", () => {
  const draft = parsePlan({
    id: "support-multiple-workflows",
    title: "Support multiple active workflows",
    assumptions: {},
    files: ["backend/workflow.py"]
  });

  assert.equal(getPlanState(draft), "draft");

  const locked = parsePlan({
    ...draft,
    lock: {
      locked_at: "2026-05-30T10:00:00+08:00",
      base_commit: "abc123",
      hash: "hash",
      dirty_at_lock: false
    }
  });

  assert.equal(getPlanState(locked), "locked");
});

test("rejects a plan with lock and applied blocks", () => {
  assert.throws(
    () =>
      parsePlan({
        id: "support-multiple-workflows",
        title: "Support multiple active workflows",
        assumptions: {},
        files: ["backend/workflow.py"],
        lock: {
          locked_at: "2026-05-30T10:00:00+08:00",
          base_commit: "abc123",
          hash: "hash",
          dirty_at_lock: false
        },
        applied: {
          applied_at: "2026-05-30T11:00:00+08:00"
        }
      }),
    /plan is invalid/
  );
});

test("loads assumptions and plans from .harn", async () => {
  const root = await mkdtemp(join(tmpdir(), "harn-model-"));
  const paths = getHarnPaths(root);
  await mkdir(paths.assumptionsDir, { recursive: true });
  await mkdir(paths.plansDir, { recursive: true });

  await writeFile(
    join(paths.assumptionsDir, "single-active-workflow.yaml"),
    [
      "id: single-active-workflow",
      "title: Single active workflow",
      "state: active",
      "statement: A case has at most one active workflow.",
      "depends_on: []"
    ].join("\n")
  );

  await writeFile(
    join(paths.plansDir, "support-multiple-workflows.yaml"),
    ["id: support-multiple-workflows", "title: Support multiple active workflows", "assumptions: {}", "files: []"].join("\n")
  );

  const project = await loadHarnProject(paths);
  assert.equal(project.assumptions.length, 1);
  assert.equal(project.plans.length, 1);
});
