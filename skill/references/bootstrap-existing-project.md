# Bootstrap Harn In An Existing Project

Use this when a repo has no `.harn/` directory yet.

Bootstrap must be human-guided. Do not invent product rules, business rules, assumptions, or anchors. Do not use scripts to generate assumptions or anchors. Assumptions and anchors should be hand-written after reading the code and receiving human confirmation.

## Goal

Create a small initial Harn layer:

```txt
.harn/plans/       = approved bootstrap plan
.harn/assumptions/ = current assumption truth after apply
source anchors     = code locations tied to assumptions
```

Capture current truth only. Do not create fake plans or future-state assumptions.

## Initialize

```bash
harn init
```

This creates:

```txt
.harn/
  assumptions/
  plans/
```

## Three-Pass Bootstrap

Bootstrap happens in three passes:

```txt
Pass 1: Identify core entities/concepts
Pass 2: Deep-dive approved entities and propose assumptions
Pass 3: Add an approved bootstrap plan and anchors
```

Each pass must end with human confirmation. Do not move to the next pass until the human approves the previous pass.

## Complex Repos: Work Entity By Entity

If the codebase is large or complex, do not bootstrap all concepts in one pass.

First, run Pass 1 to identify core concepts and ask the human to approve the order.

Then repeat Pass 2 and Pass 3 per entity:

```txt
Round 1: Case
  Pass 2: Deep-dive Case and approve assumptions
  Pass 3: Add Case bootstrap plan and anchors
  Commit

Round 2: Workflow
  Pass 2: Deep-dive Workflow and approve assumptions
  Pass 3: Add Workflow bootstrap plan and anchors
  Commit

Round 3: Reporting
  Pass 2: Deep-dive Reporting and approve assumptions
  Pass 3: Add Reporting bootstrap plan and anchors
  Commit
```

Each entity should produce its own small, reviewable commit.

## Pass 1: Identify Core Entities / Concepts

Read repo structure, entry points, schemas, domain models, API routes, migrations, services, tests, and docs.

Do not write `.harn` files yet.

Produce a short proposal:

```yaml
core_concepts:
  - name: Case
    why_it_matters: Central business object used by workflow, reporting, and status logic.
    evidence:
      - backend/models/case.py
      - backend/services/workflow.py

  - name: Workflow
    why_it_matters: Encodes lifecycle and active/completed/cancelled state.
    evidence:
      - backend/models/workflow.py
      - tests/workflow/

open_questions:
  - Is Workflow the main lifecycle driver for Case status?
```

Ask the human:

```txt
Are these the right concepts to bootstrap Harn around?
Which entity should be bootstrapped first?
Should any concepts be removed, renamed, or added?
```

## Pass 2: Deep-Dive One Approved Entity

For the approved entity, identify current assumptions the code appears to depend on.

Do not write assumption files yet.

For each proposed assumption, include evidence and uncertainty:

```yaml
entity: Workflow

proposed_assumptions:
  - title: Single active workflow per case
    statement: A case has at most one active workflow.
    confidence: high
    evidence:
      - backend/services/workflow.py
      - migrations/202605010001_workflow_unique_active.sql
      - tests/workflow/test_single_active_workflow.py
    likely_anchor_points:
      - backend/services/workflow.py
      - frontend/components/CaseWorkflowTimeline.tsx
    open_questions: []

  - title: Archived cases excluded from SLA report
    statement: Archived cases are excluded from SLA reports.
    confidence: medium
    evidence:
      - reports/sla_report.sql
    likely_anchor_points:
      - reports/sla_report.sql
    open_questions:
      - Are archived cases excluded from all reports or only SLA reports?
```

Use confidence:

```txt
high   = directly enforced by code, schema, or tests
medium = strongly suggested but needs confirmation
low    = possible assumption; needs human clarification
```

Do not include low-confidence assumptions unless the human explicitly approves them.

Ask the human:

```txt
Which assumptions should be included?
Are these statements accurate?
Which uncertain assumptions need correction?
Are any important assumptions missing for this entity?
```

## Pass 3: Add Approved Bootstrap Plan And Anchors

Write only approved assumptions into a plan under `.harn/plans/`.

Use readable slug IDs. Agents write IDs, but Harn writes hashes during apply.

Do not write `.harn/assumptions/` files directly. Applied assumptions are created by `harn apply`.

Example:

```yaml
id: bootstrap-workflow
title: Bootstrap workflow assumptions

assumptions:
  retire: []
  create:
    - id: single-active-workflow
      title: Single active workflow per case
      statement: A case has at most one active workflow.
      reason: Current workflow guard enforces this behavior.
      depends_on: []
  reviewed: []

anchors:
  single-active-workflow:
    workflow-guard:
      action: change
      reason: Add anchor to current workflow guard.

files:
  - backend/services/workflow.py
```

After `harn apply`, Harn creates an applied assumption like:

```yaml
id: single-active-workflow
hash: a-7e7e69cd6688
title: Single active workflow per case
state: active
statement: A case has at most one active workflow.
depends_on: []
created_by: bootstrap-workflow
```

Rules:

```txt
statement must describe current truth
depends_on should only include approved clear dependencies
do not write hashes manually
do not create retired assumptions during bootstrap unless explicitly asked
```

Add anchors only to code that directly depends on the assumption.

Preferred order:

```txt
1. Write the bootstrap plan.
2. Run `harn plan check <plan-id>`.
3. Run `harn plan lock <plan-id>`.
4. Add source anchors listed in the plan.
5. Run `harn check <plan-id>`.
6. Run `harn apply <plan-id>`.
```

Single-line:

```python
if case.active_workflow_id is not None:  # harn:assume single-active-workflow ref=workflow-guard
    raise CaseAlreadyHasActiveWorkflowError(case.id)
```

Block:

```python
# harn:assume single-active-workflow ref=workflow-guard
if case.active_workflow_id is not None:
    raise CaseAlreadyHasActiveWorkflowError(case.id)
# harn:end single-active-workflow
```

Function-level:

```python
# harn:assume single-active-workflow ref=start-workflow scope=function
def start_workflow(case_id: str):
    ...
```

Use stable refs:

```txt
workflow-guard
timeline-display
status-report
tenant-filter
soft-delete-query
money-cents-storage
```

Avoid vague refs:

```txt
logic
check
misc
thing
line-42
```

## Verify Each Entity

Run:

```bash
harn find
harn find <assumption-id>
harn find --file <path>
```

Show the human:

```yaml
entity: Workflow

created_assumptions:
  - id: single-active-workflow
    title: Single active workflow per case

added_anchors:
  - assumption: single-active-workflow
    ref: workflow-guard
    file: backend/services/workflow.py

open_questions: []
```

Ask:

```txt
Do these assumptions and anchors correctly capture current truth for this entity?
Should any anchors be removed, renamed, or added?
```

## Commit Each Entity

After human approval:

```bash
git add .harn source-files-with-anchors
git commit -m "Add Harn assumptions for <entity>"
```

Each commit should contain only:

```txt
assumptions for the approved entity
anchors for those assumptions
directly necessary dependency links
a bootstrap plan for those assumptions
```

Do not mix unrelated entities in one bootstrap commit unless the human explicitly approves it.

## Agent Rules

```txt
Do not automate assumption or anchor creation with scripts.
Do not invent business rules.
Do not bootstrap the whole repo at once.
Do not create future-state assumptions.
Do not write `.harn/assumptions/` directly.
Do not write Harn hashes manually.
Do not proceed between passes without human confirmation.
If complexity is high, narrow the next pass to one entity.
Ask open questions when code evidence is ambiguous.
Prefer fewer, clearer assumptions over many vague ones.
```
