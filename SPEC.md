# Harn MVP Spec

## 1. What Harn Is

Harn is a repo-native guardrail for agentic coding.

Its job is to ensure that code changes match a predeclared assumption-impact plan.

Harn tracks:

- current assumptions about the system
- code anchors that depend on those assumptions
- plans that propose creating, retiring, or reviewing assumptions
- Git diffs that show what code actually changed

Harn does not try to infer hidden intent. It only works from explicit files, explicit anchors, declared dependencies, and Git diffs.

## 2. Core Job

Harn answers one question:

> Did this code change stay inside the assumption-impact plan that was declared before coding started?

A valid Harn flow is:

```txt
1. Write a plan.
2. Check the plan.
3. Lock the plan.
4. Write code.
5. Check the diff against the locked plan.
6. Apply the plan to update assumption truth.
7. Commit code and .harn changes together.
```

## 3. Source Of Truth

Harn state lives in Git-tracked files under `.harn`.

```txt
.harn/
  assumptions/
    single-active-workflow.yaml
    case-status-derived.yaml

  plans/
    support-multiple-workflows.yaml
```

`.harn/assumptions/` contains the current ground-truth assumptions.

`.harn/plans/` contains proposed transitions to that ground truth.

Proposed assumptions do not go into `.harn/assumptions/` until a plan is applied.

## 4. IDs And Hashes

Harn uses human-readable slug IDs for assumptions and plans.

IDs are written by humans or agents:

```txt
single-active-workflow
case-status-derived
support-multiple-workflows
```

Hashes are written by Harn:

```txt
a-7e7e69cd6688
9f3a...
```

Agents may write IDs.

Agents must not write hashes.

Assumption files:

```txt
.harn/assumptions/single-active-workflow.yaml
```

Plan files:

```txt
.harn/plans/support-multiple-workflows.yaml
```

## 5. Assumptions

An assumption is a named statement that code depends on.

If the statement changes or stops being true, known code locations should be checked.

Default shape:

```txt
<subject> must/does <observable behavior or invariant> when/for <specific scope or trigger>, because/so <reason, consumer, or consequence>.
```

The behavior must be observable in code, tests, queries, schema, config, API shape, or runtime UI behavior.

Good assumptions:

```txt
A case must have at most one active workflow while workflow state is singular because downstream status logic reads one active workflow.
Invoice totals are stored in cents for all persisted invoice records so arithmetic avoids floating-point rounding.
Deleted records are soft-deleted for user-owned records so restore and audit flows can recover them.
Users can only belong to one workspace during account setup because authorization derives permissions from one workspace.
Tenant ID must be present on every tenant-scoped query so data cannot cross tenant boundaries.
```

Bad assumptions:

```txt
The frontend should be clean.
The API should be reliable.
The workflow system should be good.
```

A useful test:

> If this statement changes, can we point to specific code that should be checked?

If the statement cannot be anchored to code, a test, a query, config, schema, or API shape, it is probably not a Harn assumption.

### 5.1 Assumption File

```yaml
id: single-active-workflow
hash: a-7e7e69cd6688
title: Single active workflow per case
state: active
statement: A case has at most one active workflow.
depends_on: []
created_by: bootstrap-workflow
```

Supported states:

```txt
active
retired
```

## 6. Assumption Dependencies

An assumption can depend on another assumption.

Example:

```yaml
id: case-status-derived
hash: a-ce77fd8faca3
title: Case status derives from active workflow
state: active
statement: Case status is derived from the active workflow.
depends_on:
  - single-active-workflow
```

This means:

```txt
case-status-derived depends-on single-active-workflow
single-active-workflow is depended-by case-status-derived
```

If a plan retires an assumption, Harn checks assumptions that are depended-by that assumption.

Those dependent assumptions must be accounted for in the plan.

They can be:

```txt
reviewed
retired
```

If a dependent assumption is only reviewed, no anchor action is required for it.

If a dependent assumption is retired, its anchors must be accounted for.

Assumption `hash` is computed from immutable content:

```txt
title
statement
```

It does not include mutable fields like `state`, `depends_on`, `created_by`, or `retired_by`.

## 7. Anchors

An anchor links an assumption to a specific place in the repo.

The anchor says:

> This code depends on this assumption.

Anchors should not be added to every line of code. They should be used where code directly encodes an important business rule, invariant, compatibility behavior, data rule, or architectural constraint.

Good anchor locations:

```txt
authorization checks
validation rules
database constraints
API response shape compatibility logic
reporting queries
workflow state logic
billing calculations
important tests
```

Bad anchor locations:

```txt
ordinary helper code
generic formatting code
local variable assignments
implementation details that can freely change
```

### 7.1 Anchor Ref

`ref` is the stable name for one anchor under an assumption.

Example:

```txt
single-active-workflow:workflow-guard
```

The assumption ID identifies the rule.

The `ref` identifies the specific code location.

Line numbers can move. The `ref` gives Harn a stable anchor identity across refactors.

### 7.2 Single-Line Anchor

```python
if case.active_workflow_id is not None:  # harn:assume single-active-workflow ref=workflow-guard
    raise CaseAlreadyHasActiveWorkflowError(case.id)
```

### 7.3 Block Anchor

```python
# harn:assume single-active-workflow ref=workflow-guard
if case.active_workflow_id is not None:
    raise CaseAlreadyHasActiveWorkflowError(case.id)
# harn:end single-active-workflow
```

### 7.4 Function-Level Anchor

```python
# harn:assume single-active-workflow ref=start-workflow scope=function
def start_workflow(case_id: str):
    ...
```

### 7.5 Nested Block Anchors

Block anchors may be nested.

```python
# harn:assume payment-priority-order ref=allocation-flow
def allocate_payment(claim, payment):
    remaining = payment.amount

    # harn:assume catastrophe-payment-override ref=catastrophe-branch
    if claim.is_catastrophe:
        remaining = allocate_insurer_first(claim, remaining)
    # harn:end catastrophe-payment-override

    return allocate_deductible_first(claim, remaining)
# harn:end payment-priority-order
```

Nested block rules:

```txt
- end markers close in last-in-first-out order
- inline anchors do not create nesting scope
- function-level anchors do not create nesting scope
- nesting does not automatically create depends_on relationships
```

Nesting represents overlapping implementation. Semantic dependency must still be declared explicitly with `depends_on`.

Diff checks use direct-touch semantics:

```txt
inner-only code change     = inner anchor touched
outer-only code change     = outer anchor touched
outer marker line changed  = outer anchor touched
inner marker line changed  = inner anchor touched
inner + outer code changed = both anchors touched
```

For MVP, anchors do not have roles.

## 8. Plans

A plan describes proposed changes to assumption truth.

A plan is normally written before coding starts.

The plan must account for:

- assumptions it will create
- assumptions it will retire
- dependent assumptions it has reviewed
- anchors that will be changed, removed, or kept
- files the implementation plans to touch

### 8.1 Plan File

```yaml
id: support-multiple-workflows
title: Support multiple active workflows

assumptions:
  retire:
    - id: single-active-workflow
      reason: Cases can now have multiple active workflows.

  create:
    - id: multiple-active-workflows
      title: Multiple active workflows per case
      statement: A case may have multiple active workflows.
      reason: Replacement model for case workflows.
      depends_on: []

  reviewed:
    - id: case-status-derived
      reason: It depends on single-active-workflow.
      outcome: unchanged
      note: Case status already uses aggregate workflow state.

anchors:
  single-active-workflow:
    workflow-guard:
      action: remove
      reason: The guard rejects a second active workflow.

    timeline-display:
      action: change
      reason: The timeline must render multiple workflows.

    status-report:
      action: keep
      reason: The report already queries workflow rows independently.

files:
  - backend/workflow.py
  - frontend/timeline.tsx
  - reports/status.sql
```

Plan state is derived from blocks in the plan file.

There is no explicit `status` field.

```txt
draft   = no lock block and no applied block
locked  = lock block exists and applied block does not exist
applied = applied block exists
```

If both `lock` and `applied` exist, the plan metadata is invalid.

Supported assumption actions:

```txt
create
retire
reviewed
```

Supported anchor actions:

```txt
change
remove
keep
```

## 9. Plan Checking

`harn plan check <plan-id>` validates the plan before coding starts.

It checks:

- retired assumptions exist and are active
- created assumptions are only proposed inside the plan
- reviewed assumptions exist and are active
- assumptions depended-by retired assumptions are accounted for
- every anchor for a retired assumption has a planned action
- planned files are declared

Example:

```bash
harn plan check support-multiple-workflows
```

Example output:

```yaml
plan:
  id: support-multiple-workflows
  title: Support multiple active workflows
  state: draft

result: valid

assumptions:
  retire:
    - single-active-workflow
  create:
    - multiple-active-workflows
  reviewed:
    - case-status-derived

anchors:
  accounted_for:
    - single-active-workflow:workflow-guard
    - single-active-workflow:timeline-display
    - single-active-workflow:status-report
```

Invalid example:

```yaml
plan:
  id: support-multiple-workflows

result: invalid

blocking:
  - type: missing_dependent_assumption
    assumption: case-status-derived
    reason: case-status-derived is depended-by retired assumption single-active-workflow.

  - type: missing_anchor_action
    anchor: single-active-workflow:status-report
    reason: Retired assumption anchors must have planned actions.
```

## 10. Plan Locking

`harn plan lock <plan-id>` freezes a valid plan.

The normal flow is to lock the plan before code is written.

Many draft or applied plans may exist in `.harn/plans/`, but only one plan may be locked in a worktree at a time. `harn plan lock <plan-id>` locks the selected draft plan and blocks if another plan is already locked.

One implementation commit must consume only one locked plan. If the work needs multiple implementation commits, split it into multiple plans before locking.

If code has already been written, Harn may still lock the plan, but the lock records that it was created with a dirty worktree. This is allowed, but Harn must warn that the plan was backfilled after implementation started.

The current plan file itself does not count as dirty when it is being locked. A new draft plan must be writable before it can be locked.

Example:

```bash
harn plan lock support-multiple-workflows
```

The lock is stored inside the plan file itself.

Example:

```yaml
lock:
  locked_at: 2026-05-30T10:00:00+08:00
  base_commit: abc123
  hash: 9f3a...
  dirty_at_lock: false
```

`base_commit` is the Git commit that the implementation is expected to start from.

`hash` is a hash of the planned transition content, excluding the lock metadata itself.

If a locked plan's planned transition content changes, Harn treats the lock as invalid.

The plan must be checked and locked again.

The point of locking is not to make the file impossible to edit. The point is to make any edit detectable.

After locking, code changes are checked against the locked plan.

If `dirty_at_lock` is true, `harn check` and `harn apply` may still pass, but their output must include a warning that the plan was locked after implementation changes already existed.

Example:

```yaml
result: locked

warnings:
  - type: dirty_worktree_at_lock
    reason: The plan was locked while implementation changes already existed. This is an after-the-fact lock.
```

## 11. Finding Anchors And Assumptions

`harn find` discovers Harn anchors and assumption relationships.

Internally, Harn scans source files for anchor comments, but the user-facing command is `find`.

Default output should be structured and YAML-like.

### 11.1 Summary

```bash
harn find
```

```yaml
summary:
  assumptions: 17
  anchors: 42
  plans: 3
```

### 11.2 Find One Assumption

```bash
harn find single-active-workflow
```

```yaml
assumption:
  id: single-active-workflow
  title: Single active workflow per case
  state: active
  statement: A case has at most one active workflow.

depends_on: []

depended_by:
  - id: case-status-derived
    title: Case status derives from active workflow

anchors:
  - ref: workflow-guard
    file: backend/workflow.py
    line: 42
  - ref: timeline-display
    file: frontend/timeline.tsx
    line: 18
  - ref: status-report
    file: reports/status.sql
    line: 10
```

### 11.3 Find Assumptions Depending On Another Assumption

```bash
harn find --depended-by single-active-workflow
```

```yaml
target:
  id: single-active-workflow
  title: Single active workflow per case

depended_by:
  depth: 1
  assumptions:
    - id: case-status-derived
      title: Case status derives from active workflow
      depth: 1
```

With depth:

```bash
harn find --depended-by single-active-workflow --depth 2
```

```yaml
target:
  id: single-active-workflow
  title: Single active workflow per case

depended_by:
  depth: 2
  assumptions:
    - id: case-status-derived
      title: Case status derives from active workflow
      depth: 1
    - id: task-assignment-workflow
      title: SLA report derives from case status
      depth: 2
```

### 11.4 Find Anchors In A File

```bash
harn find --file backend/workflow.py
```

```yaml
file: backend/workflow.py

anchors:
  - assumption: single-active-workflow
    ref: workflow-guard
    line: 42
```

### 11.5 Find Changed Anchors

```bash
harn find --changed
```

Find anchors touched by the current Git diff.

```yaml
changed_anchors:
  - assumption: single-active-workflow
    ref: workflow-guard
    file: backend/workflow.py
```

### 11.6 Find Staged Anchors

```bash
harn find --staged
```

Find anchors touched by the staged Git diff.

```yaml
staged_anchors:
  - assumption: single-active-workflow
    ref: workflow-guard
    file: backend/workflow.py
```

### 11.7 Find Plan Scope

```bash
harn find --plan support-multiple-workflows
```

```yaml
plan:
  id: support-multiple-workflows
  title: Support multiple active workflows

assumptions:
  retire:
    - single-active-workflow
  create:
    - multiple-active-workflows
  reviewed:
    - case-status-derived

anchors:
  - assumption: single-active-workflow
    ref: workflow-guard
    planned_action: remove
  - assumption: single-active-workflow
    ref: timeline-display
    planned_action: change
```

## 12. Diff Checking

`harn check <plan-id>` validates the actual Git diff against a locked plan.

Example:

```bash
harn check support-multiple-workflows
```

It checks:

- the plan is locked
- the locked plan hash is still valid
- the current plan content still matches the locked plan hash
- changed files are listed in the plan
- changed anchored regions are listed in the plan
- no unplanned anchored assumptions were touched
- anchors planned as `keep` were not changed
- anchors planned as `change` were changed or still have an acceptable planned file change
- anchors planned as `remove` were removed or changed consistently
- ground-truth assumption files were not edited directly except through apply

For nested anchors, `harn check` uses direct-touch semantics. An inner-only change does not require the outer anchor to be declared unless code outside the child span is also changed.

Example passing output:

```yaml
plan:
  id: support-multiple-workflows
  title: Support multiple active workflows

result: pass

diff:
  unplanned_anchored_assumptions: []

anchors:
  - anchor: single-active-workflow:workflow-guard
    planned: remove
    actual: changed
    result: ok
  - anchor: single-active-workflow:timeline-display
    planned: change
    actual: changed
    result: ok
  - anchor: single-active-workflow:status-report
    planned: keep
    actual: unchanged
    result: ok
```

Example blocking output:

```yaml
plan:
  id: support-multiple-workflows

result: blocked

blocking:
  - type: unplanned_anchor_touched
    anchor: tenant-filter-required:tenant-filter
    file: backend/query.py
    reason: The diff changed an anchored region not declared in the locked plan.

  - type: kept_anchor_changed
    anchor: single-active-workflow:status-report
    file: reports/status.sql
    reason: The plan marked this anchor as keep, but the diff changed it.

  - type: locked_plan_changed
    plan: support-multiple-workflows
    reason: The plan content changed after it was locked.
```

## 13. Applying A Plan

`harn apply [plan-id]` updates `.harn/assumptions/` from a valid locked plan. If no plan ID is provided, Harn applies the single locked plan.

Example:

```bash
harn apply support-multiple-workflows
```

`harn apply` always runs `harn check` first.

If the check fails, apply fails and does not mutate assumption truth.

If the check passes, apply:

- marks retired assumptions as `retired`
- creates new active assumption files from the plan's `create` entries
- writes Harn-generated `hash` values for created assumptions
- leaves reviewed assumptions active
- removes the plan's `lock` block
- adds the plan's `applied` block
- records when the plan was applied

Example result:

```yaml
result: applied

plan:
  id: support-multiple-workflows
  state: applied

applied:
  applied_at: 2026-05-30T11:00:00+08:00

assumptions:
  retired:
    - single-active-workflow
  created:
    - multiple-active-workflows
  reviewed:
    - case-status-derived
```

Applied plans stay in `.harn/plans/`.

They are historical records of how assumption truth changed.

Harn does not delete applied plans.

For MVP, there is no separate log file. The sequence of applied plans is the list of plan files with:

```yaml
applied:
  applied_at: ...
```

ordered by `applied.applied_at`.

## 14. Harn Log

`harn log` lists applied plans in order.

It derives the log from applied plan files in `.harn/plans/`.

Harn does not need a separate log file for MVP.

Applied plans do not store the commit hash of the commit that contains them. That would create a Git hash recursion problem. `harn log` computes the commit from Git history when the repository has the relevant history available.

Example:

```bash
harn log
```

```yaml
plans:
  - id: support-multiple-workflows
    title: Support multiple active workflows
    applied_at: 2026-05-30T11:00:00+08:00
    commit: def456
    retired:
      - single-active-workflow
    created:
      - multiple-active-workflows
    reviewed:
      - case-status-derived

```

## 15. Pre-Commit Hook

Harn should support a pre-commit hook that runs:

```bash
harn check --staged
harn apply
git add .harn
harn check --staged
```

The hook blocks commits when staged changes do not match a locked plan. When the staged implementation is valid, the hook applies the plan, restages `.harn`, validates the applied staged state, and allows one commit containing code plus Harn truth.

The hook should pass without applying when the staged diff is empty or contains only draft plan files.

The hook should catch:

- staged changes to anchored code outside the plan
- staged changes to files outside the plan
- staged changes to anchors marked `keep`
- direct staged edits to ground-truth assumptions that were not produced by apply
- locked plans that changed after locking
- applied Harn state that does not match the plan

## 16. Command Set

MVP commands:

```bash
harn init
harn find
harn find <assumption-id>
harn find --depended-by <assumption-id>
harn find --depended-by <assumption-id> --depth <n>
harn find --file <path>
harn find --changed
harn find --staged
harn find --plan <plan-id>
harn plan check <plan-id>
harn plan lock <plan-id>
harn check <plan-id>
harn check --staged
harn apply [plan-id]
harn log
```

There is no separate `report` command in the MVP.

`harn check` prints the status report directly in structured YAML-like output.
