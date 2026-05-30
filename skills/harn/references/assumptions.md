# Harn Assumptions And Anchors

## What Makes A Good Assumption

An assumption is a tracked statement that code depends on.

A good assumption is:

```txt
specific
stable enough to matter
important if wrong
connected to code
reviewable when changed
```

Use this test:

> If this statement changes, should at least one known code location, test, query, schema, or API shape be reviewed?

If yes, it can be a Harn assumption.

## Good Assumptions

```txt
A case has at most one active workflow.
Invoice totals are stored in cents.
Deleted records are soft-deleted.
Tenant ID must be present on every query.
Users can only belong to one workspace.
A trial user cannot export reports.
Case status is derived from active workflow state.
Public API clients identify cases by UUID.
Archived cases are excluded from SLA reports.
```

Good assumptions usually describe:

```txt
business rule
authorization rule
data invariant
state-machine rule
API contract
persistence behavior
reporting rule
compatibility behavior
money/time/unit convention
tenant/security boundary
```

## Bad Assumptions

```txt
The frontend should be clean.
The API should be reliable.
The workflow system should be good.
The code should be maintainable.
Users should have a good experience.
This function should be simple.
```

Usually not assumptions:

```txt
local variable names
minor UI layout choices
small helper function structure
generic error handling
temporary implementation choices
obvious type conversions
```

## Assumption File

```yaml
id: single-active-workflow
hash: a-7e7e69cd6688
title: Single active workflow per case
state: active
statement: A case has at most one active workflow.
depends_on: []
```

Use readable slug IDs. Harn writes `hash`; agents must not invent or edit it.

Valid states:

```txt
active
retired
```

## Dependencies

Use `depends_on` when one assumption relies on another.

```yaml
id: case-status-derived
hash: a-ce77fd8faca3
title: Case status derives from active workflow
state: active
statement: Case status is derived from the active workflow.
depends_on:
  - single-active-workflow
```

If `single-active-workflow` is retired, every depended-by assumption must be accounted for.

Find dependents:

```bash
harn find --depended-by single-active-workflow --depth 2
```

If a dependent assumption remains valid, mark it as reviewed:

```yaml
reviewed:
  - id: case-status-derived
    reason: It depends on single-active-workflow.
    outcome: unchanged
    note: Case status already uses aggregate workflow state.
```

If a dependent assumption changes, retire it and create a replacement.

## Anchors

An anchor links source code to an assumption.

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

Anchor identity:

```txt
<assumption-id>:<ref>
```

Example:

```txt
single-active-workflow:workflow-guard
```

Anchor only important code. Do not anchor ordinary implementation details.
