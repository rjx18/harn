# Bootstrap Harn In An Existing Project

Use this when a repo has no `.harn/` directory yet.

Bootstrap must be human-guided. Do not invent product rules, business rules, assumptions, or anchors. Do not use scripts to generate assumptions or anchors. Assumptions and anchors should be hand-written after reading the code and receiving human confirmation.

## Goal

Create a small initial Harn layer:

```txt
.harn/assumptions/ = current assumption truth
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
Pass 3: Add approved assumptions and anchors
```

Each pass must end with human confirmation. Do not move to the next pass until the human approves the previous pass.

## Complex Repos: Work Entity By Entity

If the codebase is large or complex, do not bootstrap all concepts in one pass.

First, run Pass 1 to identify core concepts and ask the human to approve the order.

Then repeat Pass 2 and Pass 3 per entity:

```txt
Round 1: Case
  Pass 2: Deep-dive Case and approve assumptions
  Pass 3: Add Case assumptions and anchors
  Commit

Round 2: Workflow
  Pass 2: Deep-dive Workflow and approve assumptions
  Pass 3: Add Workflow assumptions and anchors
  Commit

Round 3: Reporting
  Pass 2: Deep-dive Reporting and approve assumptions
  Pass 3: Add Reporting assumptions and anchors
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

## Pass 3: Add Approved Assumptions And Anchors

Write only approved assumptions into `.harn/assumptions/`.

Use Harn-generated IDs when available. If no ID generator exists, use a random short ID in the form `a-xxxxxx`. Do not use sequential IDs like `A-001`.

Example:

```yaml
id: a-7k3p9x
title: Single active workflow per case
state: active
statement: A case has at most one active workflow.
depends_on: []
```

Rules:

```txt
state must be active
statement must describe current truth
depends_on should only include approved clear dependencies
do not create retired assumptions during bootstrap unless explicitly asked
```

Add anchors only to code that directly depends on the assumption.

Single-line:

```python
if case.active_workflow_id is not None:  # harn:assume a-7k3p9x ref=workflow-guard
    raise CaseAlreadyHasActiveWorkflowError(case.id)
```

Block:

```python
# harn:assume a-7k3p9x ref=workflow-guard
if case.active_workflow_id is not None:
    raise CaseAlreadyHasActiveWorkflowError(case.id)
# harn:end a-7k3p9x
```

Function-level:

```python
# harn:assume a-7k3p9x ref=start-workflow scope=function
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
  - id: a-7k3p9x
    title: Single active workflow per case

added_anchors:
  - assumption: a-7k3p9x
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
```

Do not mix unrelated entities in one bootstrap commit unless the human explicitly approves it.

## Agent Rules

```txt
Do not automate assumption or anchor creation with scripts.
Do not invent business rules.
Do not bootstrap the whole repo at once.
Do not create fake plans.
Do not create future-state assumptions.
Do not proceed between passes without human confirmation.
If complexity is high, narrow the next pass to one entity.
Ask open questions when code evidence is ambiguous.
Prefer fewer, clearer assumptions over many vague ones.
```

