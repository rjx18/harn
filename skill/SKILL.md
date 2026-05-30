---
name: harn
description: Use when working in a repository that uses Harn, or when installing, initializing, planning, locking, checking, applying, or debugging Harn assumption-impact workflows for agentic coding. Harn enforces that code changes match a locked assumption-impact plan using .harn files, anchors, Git diffs, pre-commit checks, and post-commit apply.
---

# Harn

Harn is a repo-native guardrail for agentic coding.

Use Harn to ensure code changes match a predeclared assumption-impact plan.

Source of truth:

```txt
.harn/assumptions/ = current assumption truth
.harn/plans/       = proposed and applied assumption transitions
source anchors     = code locations tied to assumptions
git diff           = what actually changed
```

## Required Workflow

1. Explore existing assumptions.
   - Run `harn find`.
   - Use `harn find --file <path>` before editing relevant files.
   - Use `harn find <assumption-id>` for assumption details.
   - Use `harn find --depended-by <id> --depth <n>` to inspect dependent assumptions.

2. Draft or update a plan in `.harn/plans/`.
   - Declare intended assumption changes.
   - Account for affected anchors.
   - Use only the valid enum values listed below.

3. Check the plan.
   - Run `harn plan check <plan-id>`.
   - Fix every blocking item before locking.

4. Lock the plan.
   - Run `harn plan lock <plan-id>`.
   - Do not implement before the plan is locked unless explicitly asked.

5. Implement the code change.
   - Keep edits within the locked plan.
   - During implementation, use `harn find --changed`, `harn find --staged`, and `harn find --plan <plan-id>` to verify scope.

6. Check before commit.
   - Run `harn check <plan-id>`.
   - Stage files.
   - The pre-commit hook should run `harn check --staged`.

7. Commit the implementation.

8. Apply the plan after commit.
   - The post-commit hook should run `harn apply <plan-id>`.
   - If `.harn` files change, amend the commit or create a follow-up commit according to repo practice.

## Assumption Rule Of Thumb

An assumption is a tracked statement that code depends on.

Create or update a Harn assumption only when this is true:

> If this statement changes, at least one known code location, test, query, schema, or API shape should be reviewed.

Good assumptions are specific, stable enough to matter, important if wrong, connected to code, and reviewable when changed.

Good assumptions are usually:

```txt
business rules
authorization rules
data invariants
state-machine rules
API contracts
persistence behaviors
reporting rules
compatibility behaviors
money/time/unit conventions
tenant/security boundaries
```

Do not create assumptions for ordinary implementation details such as local variable names, minor layout choices, generic helper structure, obvious type conversions, or temporary implementation choices.

If unsure whether a statement should be a Harn assumption, read `references/assumptions.md`.

## Valid Values

Assumption `state`:

```txt
active
retired
```

Plan state is derived, not manually stored:

```txt
draft   = no lock block and no applied block
locked  = lock block exists and applied block does not exist
applied = applied block exists and lock block does not exist
invalid = lock and applied both exist
```

Do not write `state` or `status` into a plan.

Plan assumption actions:

```txt
create
retire
reviewed
```

Reviewed assumption `outcome`:

```txt
unchanged
```

Use `reviewed` only when an existing assumption was checked and remains true. If an assumption changes meaning, use `retire` plus `create`.

Anchor actions:

```txt
change
remove
keep
```

Plan-check results:

```txt
valid
invalid
```

Diff-check results:

```txt
pass
blocked
```

Apply results:

```txt
applied
blocked
```

## Commands

```bash
harn init
harn find
harn find <assumption-id>
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

## Check Behavior

`harn check` verifies the Git diff against the locked plan.

It checks:

```txt
plan is locked
plan hash still matches
changed files are listed in the plan
changed anchored regions are listed in the plan
no unplanned anchored assumptions were touched
anchors marked keep were not changed
ground-truth assumptions were not directly edited
```

If `harn check` blocks, either fix the code to match the locked plan or update and re-lock the plan.

## Agent Rules

- Use `harn find` before planning implementation.
- Review all linked and depended-by assumptions before locking a plan.
- Do not edit code first and invent the plan afterward.
- Do not silently edit a locked plan while coding.
- If implementation reveals new scope, stop, update the plan, run `harn plan check`, and re-lock.
- Trust Harn output over remembered context.

If context is compacted or lost, recover with:

```bash
harn find
harn find --changed
harn find --staged
harn check <plan-id>
```

## References

- For installation, initialization, and hook setup, read `references/install.md`.
- For detailed assumption and anchor guidance, read `references/assumptions.md`.

