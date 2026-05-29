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
    a-7k3p9x.yaml
    a-8m2q1z.yaml

  plans/
    p-d4f8qa.yaml
```

`.harn/assumptions/` contains the current ground-truth assumptions.

`.harn/plans/` contains proposed transitions to that ground truth.

Proposed assumptions do not go into `.harn/assumptions/` until a plan is applied.

## 4. IDs

Harn uses short random IDs instead of sequential IDs, because sequential IDs create merge conflicts in multi-author Git workflows.

Assumption IDs:

```txt
a-7k3p9x
a-8m2q1z
```

Plan IDs:

```txt
p-d4f8qa
p-92ks0v
```

Assumption files:

```txt
.harn/assumptions/a-7k3p9x.yaml
```

Plan files:

```txt
.harn/plans/p-d4f8qa.yaml
```

## 5. Assumptions

An assumption is a named statement that code depends on.

If the statement changes or stops being true, known code locations should be checked.

Good assumptions:

```txt
A case has at most one active workflow.
Invoice totals are stored in cents.
Deleted records are soft-deleted.
Users can only belong to one workspace.
Tenant ID must be present on every query.
```

Bad assumptions:

```txt
The frontend should be clean.
The API should be reliable.
The workflow system should be good.
```

A useful test:

> If this statement changes, can we point to specific code that should be checked?

### 5.1 Assumption File

```yaml
id: a-7k3p9x
title: Single active workflow per case
state: active
statement: A case has at most one active workflow.
depends_on: []
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
id: a-8m2q1z
title: Case status derives from active workflow
state: active
statement: Case status is derived from the active workflow.
depends_on:
  - a-7k3p9x
```

This means:

```txt
a-8m2q1z depends-on a-7k3p9x
a-7k3p9x is depended-by a-8m2q1z
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
a-7k3p9x:workflow-guard
```

The assumption ID identifies the rule.

The `ref` identifies the specific code location.

Line numbers can move. The `ref` gives Harn a stable anchor identity across refactors.

### 7.2 Single-Line Anchor

```python
if case.active_workflow_id is not None:  # harn:assume a-7k3p9x ref=workflow-guard
    raise CaseAlreadyHasActiveWorkflowError(case.id)
```

### 7.3 Block Anchor

```python
# harn:assume a-7k3p9x ref=workflow-guard
if case.active_workflow_id is not None:
    raise CaseAlreadyHasActiveWorkflowError(case.id)
# harn:end a-7k3p9x
```

### 7.4 Function-Level Anchor

```python
# harn:assume a-7k3p9x ref=start-workflow scope=function
def start_workflow(case_id: str):
    ...
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
id: p-d4f8qa
title: Support multiple active workflows

assumptions:
  retire:
    - id: a-7k3p9x
      reason: Cases can now have multiple active workflows.

  create:
    - id: a-f92ks0
      title: Multiple active workflows per case
      statement: A case may have multiple active workflows.
      reason: Replacement model for case workflows.
      depends_on: []

  reviewed:
    - id: a-8m2q1z
      reason: It depends on a-7k3p9x.
      outcome: unchanged
      note: Case status already uses aggregate workflow state.

anchors:
  a-7k3p9x:
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
harn plan check p-d4f8qa
```

Example output:

```yaml
plan:
  id: p-d4f8qa
  title: Support multiple active workflows
  state: draft

result: valid

assumptions:
  retire:
    - a-7k3p9x
  create:
    - a-f92ks0
  reviewed:
    - a-8m2q1z

anchors:
  accounted_for:
    - a-7k3p9x:workflow-guard
    - a-7k3p9x:timeline-display
    - a-7k3p9x:status-report
```

Invalid example:

```yaml
plan:
  id: p-d4f8qa

result: invalid

blocking:
  - type: missing_dependent_assumption
    assumption: a-8m2q1z
    reason: a-8m2q1z is depended-by retired assumption a-7k3p9x.

  - type: missing_anchor_action
    anchor: a-7k3p9x:status-report
    reason: Retired assumption anchors must have planned actions.
```

## 10. Plan Locking

`harn plan lock <plan-id>` freezes a valid plan.

The normal flow is to lock the plan before code is written.

If code has already been written, Harn may still lock the plan, but the lock records that it was created with a dirty worktree. This is allowed, but Harn must warn that the plan was backfilled after implementation started.

Example:

```bash
harn plan lock p-d4f8qa
```

The lock is stored inside the plan file itself.

Example:

```yaml
lock:
  locked_at: 2026-05-30T10:00:00+08:00
  base_commit: abc123
  plan_hash: 9f3a...
  dirty_at_lock: false
```

`base_commit` is the Git commit that the implementation is expected to start from.

`plan_hash` is a hash of the planned transition content, excluding the lock metadata itself.

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
harn find a-7k3p9x
```

```yaml
assumption:
  id: a-7k3p9x
  title: Single active workflow per case
  state: active
  statement: A case has at most one active workflow.

depends_on: []

depended_by:
  - id: a-8m2q1z
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
harn find --depended-by a-7k3p9x
```

```yaml
target:
  id: a-7k3p9x
  title: Single active workflow per case

depended_by:
  depth: 1
  assumptions:
    - id: a-8m2q1z
      title: Case status derives from active workflow
      depth: 1
```

With depth:

```bash
harn find --depended-by a-7k3p9x --depth 2
```

```yaml
target:
  id: a-7k3p9x
  title: Single active workflow per case

depended_by:
  depth: 2
  assumptions:
    - id: a-8m2q1z
      title: Case status derives from active workflow
      depth: 1
    - id: a-k29saa
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
  - assumption: a-7k3p9x
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
  - assumption: a-7k3p9x
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
  - assumption: a-7k3p9x
    ref: workflow-guard
    file: backend/workflow.py
```

### 11.7 Find Plan Scope

```bash
harn find --plan p-d4f8qa
```

```yaml
plan:
  id: p-d4f8qa
  title: Support multiple active workflows

assumptions:
  retire:
    - a-7k3p9x
  create:
    - a-f92ks0
  reviewed:
    - a-8m2q1z

anchors:
  - assumption: a-7k3p9x
    ref: workflow-guard
    planned_action: remove
  - assumption: a-7k3p9x
    ref: timeline-display
    planned_action: change
```

## 12. Diff Checking

`harn check <plan-id>` validates the actual Git diff against a locked plan.

Example:

```bash
harn check p-d4f8qa
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

Example passing output:

```yaml
plan:
  id: p-d4f8qa
  title: Support multiple active workflows

result: pass

diff:
  unplanned_anchored_assumptions: []

anchors:
  - anchor: a-7k3p9x:workflow-guard
    planned: remove
    actual: changed
    result: ok
  - anchor: a-7k3p9x:timeline-display
    planned: change
    actual: changed
    result: ok
  - anchor: a-7k3p9x:status-report
    planned: keep
    actual: unchanged
    result: ok
```

Example blocking output:

```yaml
plan:
  id: p-d4f8qa

result: blocked

blocking:
  - type: unplanned_anchor_touched
    anchor: a-92ks0v:tenant-filter
    file: backend/query.py
    reason: The diff changed an anchored region not declared in the locked plan.

  - type: kept_anchor_changed
    anchor: a-7k3p9x:status-report
    file: reports/status.sql
    reason: The plan marked this anchor as keep, but the diff changed it.

  - type: locked_plan_changed
    plan: p-d4f8qa
    reason: The plan content changed after it was locked.
```

## 13. Applying A Plan

`harn apply <plan-id>` updates `.harn/assumptions/` from a valid locked plan.

Example:

```bash
harn apply p-d4f8qa
```

`harn apply` always runs `harn check` first.

If the check fails, apply fails and does not mutate assumption truth.

If the check passes, apply:

- marks retired assumptions as `retired`
- creates new active assumption files from the plan's `create` entries
- leaves reviewed assumptions active
- removes the plan's `lock` block
- adds the plan's `applied` block
- records when the plan was applied

Example result:

```yaml
result: applied

plan:
  id: p-d4f8qa
  state: applied

applied:
  applied_at: 2026-05-30T11:00:00+08:00
  commit: def456

assumptions:
  retired:
    - a-7k3p9x
  created:
    - a-f92ks0
  reviewed:
    - a-8m2q1z
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

Example:

```bash
harn log
```

```yaml
plans:
  - id: p-d4f8qa
    title: Support multiple active workflows
    applied_at: 2026-05-30T11:00:00+08:00
    commit: def456
    retired:
      - a-7k3p9x
    created:
      - a-f92ks0
    reviewed:
      - a-8m2q1z

```

## 15. Pre-Commit Hook

Harn should support a pre-commit hook that runs:

```bash
harn check --staged
```

The hook blocks commits when staged changes do not match a locked plan.

The hook should catch:

- staged changes to anchored code outside the plan
- staged changes to files outside the plan
- staged changes to anchors marked `keep`
- direct staged edits to ground-truth assumptions that were not produced by apply
- locked plans that changed after locking

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
harn apply <plan-id>
harn log
```

There is no separate `report` command in the MVP.

`harn check` prints the status report directly in structured YAML-like output.
