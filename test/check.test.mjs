import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { hashAssumptionContent } from "../dist/domain/assumption-hash.js";
import { createLockFixture, runHarn, runHarnFailure } from "./support/fixtures.mjs";

test("harn check passes when diff matches locked plan", async () => {
  const root = await createLockFixture();
  runHarn(root, "plan", "lock", "support-multiple-workflows");
  execFileSync("bash", ["-lc", "perl -0pi -e 's/if active:/if active_changed:/' backend/workflow.py"], { cwd: root });

  const output = runHarn(root, "check", "support-multiple-workflows");

  assert.match(output, /result: pass/);
  assert.match(output, /planned: remove/);
});

test("harn check blocks when locked plan changed", async () => {
  const root = await createLockFixture();
  runHarn(root, "plan", "lock", "support-multiple-workflows");
  const planPath = `${root}/.harn/plans/support-multiple-workflows.yaml`;
  const plan = await readFile(planPath, "utf8");
  await writeFile(planPath, plan.replace("Support multiple active workflows", "Edited plan title"));

  const output = runHarnFailure(root, "check", "support-multiple-workflows");

  assert.match(output, /result: blocked/);
  assert.match(output, /type: locked_plan_changed/);
});

test("harn check blocks unplanned anchored changes", async () => {
  const root = await createLockFixture();
  await writeFile(
    `${root}/backend/other.py`,
    "if tenant:  # harn:assume tenant-filter-required ref=tenant-filter\n"
  );
  runHarn(root, "plan", "lock", "support-multiple-workflows");
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "lock"], {
    cwd: root
  });
  execFileSync("bash", ["-lc", "perl -0pi -e 's/tenant/tenant_changed/' backend/other.py"], { cwd: root });

  const output = runHarnFailure(root, "check", "support-multiple-workflows");

  assert.match(output, /result: blocked/);
  assert.match(output, /type: unplanned_anchor_touched/);
});

test("harn check blocks changed keep anchors", async () => {
  const root = await createLockFixture();
  const planPath = `${root}/.harn/plans/support-multiple-workflows.yaml`;
  const plan = await readFile(planPath, "utf8");
  await writeFile(planPath, plan.replace("action: remove", "action: keep"));
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "keep plan"], {
    cwd: root
  });
  runHarn(root, "plan", "lock", "support-multiple-workflows");
  execFileSync("bash", ["-lc", "perl -0pi -e 's/if active:/if active_changed:/' backend/workflow.py"], { cwd: root });

  const output = runHarnFailure(root, "check", "support-multiple-workflows");

  assert.match(output, /result: blocked/);
  assert.match(output, /type: kept_anchor_changed/);
});

test("harn check --staged uses the single locked plan", async () => {
  const root = await createLockFixture();
  runHarn(root, "plan", "lock", "support-multiple-workflows");
  execFileSync("bash", ["-lc", "perl -0pi -e 's/if active:/if active_changed:/' backend/workflow.py"], { cwd: root });
  execFileSync("git", ["add", "backend/workflow.py"], { cwd: root });

  const output = runHarn(root, "check", "--staged");

  assert.match(output, /result: pass/);
  assert.match(output, /planned: remove/);
});

test("harn check --staged passes with an empty staged diff", async () => {
  const root = await createLockFixture();

  const output = runHarn(root, "check", "--staged");

  assert.match(output, /result: pass/);
  assert.match(output, /empty: true/);
});

test("harn check --staged passes with draft plan-only changes", async () => {
  const root = await createLockFixture();
  await writeFile(
    `${root}/.harn/plans/bootstrap-runtime.yaml`,
    [
      "id: bootstrap-runtime",
      "title: Bootstrap runtime",
      "assumptions:",
      "  retire: []",
      "  create: []",
      "  reviewed:",
      "    - id: single-active-workflow",
      "      outcome: unchanged",
      "      reason: Baseline review.",
      "anchors: {}",
      "files:",
      "  - backend/workflow.py"
    ].join("\n")
  );
  execFileSync("git", ["add", ".harn/plans/bootstrap-runtime.yaml"], { cwd: root });

  const output = runHarn(root, "check", "--staged");

  assert.match(output, /result: pass/);
  assert.match(output, /draft_plan_only: true/);
});

test("harn check --staged blocks non-draft plan-only changes", async () => {
  const root = await createLockFixture();
  await writeFile(
    `${root}/.harn/plans/bootstrap-runtime.yaml`,
    [
      "id: bootstrap-runtime",
      "title: Bootstrap runtime",
      "assumptions:",
      "  retire: []",
      "  create: []",
      "  reviewed:",
      "    - id: single-active-workflow",
      "      outcome: unchanged",
      "      reason: Baseline review.",
      "anchors: {}",
      "files:",
      "  - backend/workflow.py",
      "applied:",
      "  applied_at: 2026-06-06T00:00:00.000Z"
    ].join("\n")
  );
  execFileSync("git", ["add", ".harn/plans/bootstrap-runtime.yaml"], { cwd: root });

  const output = runHarnFailure(root, "check", "--staged");

  assert.match(output, /result: blocked/);
  assert.match(output, /staged_plan_not_draft/);
});

test("harn check --staged blocks source changes mixed with an unlocked draft plan", async () => {
  const root = await createLockFixture();
  await writeFile(
    `${root}/.harn/plans/bootstrap-runtime.yaml`,
    [
      "id: bootstrap-runtime",
      "title: Bootstrap runtime",
      "assumptions:",
      "  retire: []",
      "  create: []",
      "  reviewed:",
      "    - id: single-active-workflow",
      "      outcome: unchanged",
      "      reason: Baseline review.",
      "anchors: {}",
      "files:",
      "  - backend/workflow.py"
    ].join("\n")
  );
  await writeFile(`${root}/backend/unplanned.py`, "print('unplanned')\n");
  execFileSync("git", ["add", ".harn/plans/bootstrap-runtime.yaml", "backend/unplanned.py"], { cwd: root });

  const output = runHarnFailure(root, "check", "--staged");

  assert.match(output, /result: blocked/);
  assert.match(output, /locked_plan_not_found/);
});

test("harn check --staged accepts applied one-commit state", async () => {
  const root = await createLockFixture();
  runHarn(root, "plan", "lock", "support-multiple-workflows");
  execFileSync("bash", ["-lc", "perl -0pi -e 's/if active:/if active_changed:/' backend/workflow.py"], { cwd: root });
  execFileSync("git", ["add", "."], { cwd: root });
  runHarn(root, "apply");
  execFileSync("git", ["add", ".harn"], { cwd: root });

  const output = runHarn(root, "check", "--staged");

  assert.match(output, /result: pass/);
  assert.match(output, /id: support-multiple-workflows/);
});

test("harn check --staged blocks unrelated assumptions in applied state", async () => {
  const root = await createLockFixture();
  runHarn(root, "plan", "lock", "support-multiple-workflows");
  execFileSync("bash", ["-lc", "perl -0pi -e 's/if active:/if active_changed:/' backend/workflow.py"], { cwd: root });
  execFileSync("git", ["add", "."], { cwd: root });
  runHarn(root, "apply");
  await writeFile(
    `${root}/.harn/assumptions/unrelated.yaml`,
    [
      "id: unrelated",
      "title: Unrelated",
      "state: retired",
      "statement: Unrelated code must stay observable for tests because this is unrelated.",
      "depends_on: []"
    ].join("\n")
  );
  execFileSync("git", ["add", ".harn"], { cwd: root });

  const output = runHarnFailure(root, "check", "--staged");

  assert.match(output, /result: blocked/);
  assert.match(output, /unexpected_applied_assumption_changed/);
});

test("harn check --staged blocks unplanned source files in applied state", async () => {
  const root = await createLockFixture();
  runHarn(root, "plan", "lock", "support-multiple-workflows");
  execFileSync("bash", ["-lc", "perl -0pi -e 's/if active:/if active_changed:/' backend/workflow.py"], { cwd: root });
  execFileSync("git", ["add", "."], { cwd: root });
  runHarn(root, "apply");
  await writeFile(`${root}/backend/unplanned.py`, "print('unplanned')\n");
  execFileSync("git", ["add", "."], { cwd: root });

  const output = runHarnFailure(root, "check", "--staged");

  assert.match(output, /result: blocked/);
  assert.match(output, /unplanned_file_changed/);
});

test("harn check allows inner-only nested changes with only inner anchor planned", async () => {
  const root = await createNestedAnchorFixture("inner-only-change", {
    "catastrophe-payment-override": {
      "catastrophe-branch": "change"
    }
  });
  runHarn(root, "plan", "lock", "inner-only-change");
  execFileSync("bash", ["-lc", "perl -0pi -e 's/allocate_insurer_first/allocate_insurer_first_changed/' backend/payment.py"], {
    cwd: root
  });

  const output = runHarn(root, "check", "inner-only-change");

  assert.match(output, /result: pass/);
  assert.match(output, /anchor: catastrophe-payment-override:catastrophe-branch/);
  assert.doesNotMatch(output, /payment-priority-order:allocation-flow/);
});

test("harn check allows outer-only nested changes with only outer anchor planned", async () => {
  const root = await createNestedAnchorFixture("outer-only-change", {
    "payment-priority-order": {
      "allocation-flow": "change"
    }
  });
  runHarn(root, "plan", "lock", "outer-only-change");
  execFileSync("bash", ["-lc", "perl -0pi -e 's/allocate_deductible_first/allocate_deductible_first_changed/' backend/payment.py"], {
    cwd: root
  });

  const output = runHarn(root, "check", "outer-only-change");

  assert.match(output, /result: pass/);
  assert.match(output, /anchor: payment-priority-order:allocation-flow/);
  assert.doesNotMatch(output, /catastrophe-payment-override:catastrophe-branch/);
});

test("harn check blocks when nested inner change omits inner anchor", async () => {
  const root = await createNestedAnchorFixture("missing-inner-change", {
    "payment-priority-order": {
      "allocation-flow": "change"
    }
  });
  runHarn(root, "plan", "lock", "missing-inner-change");
  execFileSync("bash", ["-lc", "perl -0pi -e 's/allocate_insurer_first/allocate_insurer_first_changed/' backend/payment.py"], {
    cwd: root
  });

  const output = runHarnFailure(root, "check", "missing-inner-change");

  assert.match(output, /result: blocked/);
  assert.match(output, /anchor: catastrophe-payment-override:catastrophe-branch/);
  assert.match(output, /unplanned_anchor_touched/);
});

test("harn check blocks when nested outer change omits outer anchor", async () => {
  const root = await createNestedAnchorFixture("missing-outer-change", {
    "catastrophe-payment-override": {
      "catastrophe-branch": "change"
    }
  });
  runHarn(root, "plan", "lock", "missing-outer-change");
  execFileSync("bash", ["-lc", "perl -0pi -e 's/allocate_deductible_first/allocate_deductible_first_changed/' backend/payment.py"], {
    cwd: root
  });

  const output = runHarnFailure(root, "check", "missing-outer-change");

  assert.match(output, /result: blocked/);
  assert.match(output, /anchor: payment-priority-order:allocation-flow/);
  assert.match(output, /unplanned_anchor_touched/);
});

async function createNestedAnchorFixture(planId, anchors) {
  const root = await mkdtemp(join(tmpdir(), "harn-nested-check-"));
  await mkdir(join(root, ".harn", "assumptions"), { recursive: true });
  await mkdir(join(root, ".harn", "plans"), { recursive: true });
  await mkdir(join(root, "backend"), { recursive: true });

  await writeAssumption(root, {
    id: "payment-priority-order",
    title: "Payment priority order",
    statement:
      "Payments must allocate deductible before insurer contribution because settlement totals display claimant balance first."
  });
  await writeAssumption(root, {
    id: "catastrophe-payment-override",
    title: "Catastrophe payment override",
    statement:
      "Catastrophe claims must allocate insurer contribution first because catastrophe settlements use emergency payout rules."
  });
  await writeFile(
    join(root, "backend", "payment.py"),
    [
      "# harn:assume payment-priority-order ref=allocation-flow",
      "def allocate_payment(claim, payment):",
      "    remaining = payment.amount",
      "    # harn:assume catastrophe-payment-override ref=catastrophe-branch",
      "    if claim.is_catastrophe:",
      "        remaining = allocate_insurer_first(claim, remaining)",
      "    # harn:end catastrophe-payment-override",
      "    return allocate_deductible_first(claim, remaining)",
      "# harn:end payment-priority-order"
    ].join("\n")
  );

  execFileSync("git", ["init"], { cwd: root });
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "initial"], {
    cwd: root
  });

  await writeFile(join(root, ".harn", "plans", `${planId}.yaml`), renderNestedPlan(planId, anchors));
  return root;
}

async function writeAssumption(root, assumption) {
  await writeFile(
    join(root, ".harn", "assumptions", `${assumption.id}.yaml`),
    [
      `id: ${assumption.id}`,
      `hash: ${hashAssumptionContent({ title: assumption.title, statement: assumption.statement })}`,
      `title: ${assumption.title}`,
      "state: active",
      `statement: ${assumption.statement}`,
      "depends_on: []"
    ].join("\n")
  );
}

function renderNestedPlan(planId, anchors) {
  return [
    `id: ${planId}`,
    `title: ${planId}`,
    "assumptions:",
    "  retire: []",
    "  create: []",
    "  reviewed: []",
    "anchors:",
    ...Object.entries(anchors).flatMap(([assumptionId, refs]) => [
      `  ${assumptionId}:`,
      ...Object.entries(refs).flatMap(([ref, action]) => [
        `    ${ref}:`,
        `      action: ${action}`,
        "      reason: Planned nested-anchor test change."
      ])
    ]),
    "files:",
    "  - backend/payment.py"
  ].join("\n");
}
