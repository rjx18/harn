---
name: harn
description: Always use when a repository contains a .harn directory, harn anchors, harn plans, Harn assumptions, or when doing any code change in a repo that uses Harn. Use for planning, editing, checking, committing, installing, initializing, bootstrapping, locking, applying, or debugging Harn workflows.
---

# Harn

Harn is a repo-native guardrail for agentic coding.

Use Harn to ensure code changes match a predeclared assumption-impact plan.

Harn is not a work log. Harn is a pre-change contract between intended assumption impact and the actual Git diff.

Source of truth:

```txt
.harn/assumptions/ = current assumption truth
.harn/plans/       = proposed and applied assumption transitions
source anchors     = code locations tied to assumptions
git diff           = what actually changed
```

## Required Workflow

Before starting, check Git baseline:

```bash
git status --short
git rev-parse --is-inside-work-tree
```

If the repo is not a Git repo, initialize Git and create a baseline commit before Harn planning unless the human explicitly says this is a bootstrap/baseline operation.

If there is large uncommitted scaffold work, stop and ask whether to commit it first. Do not use a dirty lock to explain already-written work unless the human explicitly accepts that risk.

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
   - If the lock says `dirty_at_lock: true`, report this to the human before continuing.

5. Implement the code change.
   - Keep edits within the locked plan.
   - During implementation, use `harn find --changed`, `harn find --staged`, and `harn find --plan <plan-id>` to verify scope.

6. Commit through the Harn pre-commit hook.
   - Run `harn check <plan-id>`.
   - Stage files.
   - The pre-commit hook should run `harn check --staged`, `harn apply`, `git add .harn`, then `harn check --staged` again.

7. Commit once.
   - The commit should contain the code change, applied plan, and generated assumption truth.
   - Do not use a post-commit Harn apply flow for normal work.

## Assumption Rule Of Thumb

An assumption is a tracked statement that code depends on.

Default shape:

```txt
<subject> must/does <observable behavior or invariant> when/for <specific scope or trigger>, because/so <reason, consumer, or consequence>.
```

Use the shape to force clarity, but keep the sentence natural. The behavior must be observable in code, tests, queries, schema, config, API shape, or runtime UI behavior.

Every assumption should answer:

```txt
what code/system thing is this about?
what must stay true?
when or where does it apply?
why does it matter?
```

Create or update a Harn assumption only when this is true:

> If this statement changes, at least one known code location, test, query, schema, or API shape should be reviewed.

If the statement cannot be anchored to code, a test, a query, config, schema, or API shape, it is probably not a Harn assumption.

Good assumptions are specific, stable enough to matter, important if wrong, connected to code, and reviewable when changed.

Create one Harn assumption per independently reviewable review obligation. A review obligation is one specific rule, invariant, dependency, data contract, UI/runtime behavior, integration expectation, or policy that future work may need to review deliberately.

Do not create one broad assumption for a feature area, page, module, service, workflow, or subsystem when it contains multiple review obligations that can change independently. Use `depends_on` to connect related assumptions instead of merging them.

Do not over-split into trivial implementation details, isolated render text, local helper mechanics, ordinary formatting, individual fixture fields, or one-off test assertions unless changing them would create a meaningful review obligation.

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

Frontend assumptions can be detailed. They should describe UI/runtime contracts with cognitive load, not inert markup trivia.

Good frontend assumptions include animation behavior, script/load ordering, runtime DOM ownership, generated content mounts, refresh/update relationships, responsive behavior, accessibility contracts, routing/state persistence, and integration contracts between old scripts and new components.

When unsure about granularity, read `references/assumptions.md`. When bootstrapping a repo, read `references/bootstrap-existing-project.md`.

## ID And Hash Rules

- Write readable slug IDs, for example `single-active-workflow` or `support-multiple-workflows`.
- Use readable assumption IDs in anchors and `depends_on`.
- Do not write random-looking IDs like `a-xxxxxx` as assumption IDs.
- Do not write or edit Harn hashes. Harn writes `hash` fields when assumptions are applied and lock hashes when plans are locked.
- Do not edit files in `.harn/assumptions/` directly during normal work. Change assumption truth through a plan, then run `harn apply`.

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

Action meanings:

```txt
change = this anchored region is expected to change
remove = this anchored region or assumption dependency is expected to be removed
keep   = this anchored region must not change at all
```

Adding or moving a Harn comment inside an anchored region is still a change. Do not use `keep` if you will touch that region for any reason.

Nested block anchors are allowed. End markers must close in last-in-first-out order. Nesting means overlapping implementation, not automatic `depends_on`; declare semantic dependency explicitly.

For nested anchors, Harn uses direct-touch semantics:

```txt
inner-only code change     = inner anchor touched
outer-only code change     = outer anchor touched
inner + outer code changed = both anchors touched
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
harn apply [plan-id]
harn log
```

## Check Behavior

`harn check` verifies the Git diff against the locked plan. `harn check --staged` also accepts valid applied staged Harn state produced by `harn apply`.

It checks:

```txt
plan is locked, or staged Harn state is already applied and valid
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
- Use `harn find --plan <plan-id>` for plan scope. `harn find <id>` is for assumption IDs.
- Review all linked and depended-by assumptions before locking a plan.
- Do not edit code first and invent the plan afterward.
- Do not silently edit a locked plan while coding.
- Never edit a locked plan to fit implementation already done.
- If a locked plan is wrong, stop and create a replacement plan or ask the human whether to abandon/delete the bad plan.
- If implementation reveals new scope before coding continues, stop, update or replace the plan, run `harn plan check`, and lock again.
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
- For bootstrapping Harn in an existing project with no `.harn` files, read `references/bootstrap-existing-project.md`.
- For detailed assumption and anchor guidance, read `references/assumptions.md`.
