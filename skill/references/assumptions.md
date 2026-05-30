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
id: a-7k3p9x
title: Single active workflow per case
state: active
statement: A case has at most one active workflow.
depends_on: []
```

Valid states:

```txt
active
retired
```

## Dependencies

Use `depends_on` when one assumption relies on another.

```yaml
id: a-8m2q1z
title: Case status derives from active workflow
state: active
statement: Case status is derived from the active workflow.
depends_on:
  - a-7k3p9x
```

If `a-7k3p9x` is retired, every depended-by assumption must be accounted for.

Find dependents:

```bash
harn find --depended-by a-7k3p9x --depth 2
```

If a dependent assumption remains valid, mark it as reviewed:

```yaml
reviewed:
  - id: a-8m2q1z
    reason: It depends on a-7k3p9x.
    outcome: unchanged
    note: Case status already uses aggregate workflow state.
```

If a dependent assumption changes, retire it and create a replacement.

## Anchors

An anchor links source code to an assumption.

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

Anchor identity:

```txt
<assumption-id>:<ref>
```

Example:

```txt
a-7k3p9x:workflow-guard
```

Anchor only important code. Do not anchor ordinary implementation details.

