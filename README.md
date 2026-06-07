# Harn

[![Actions Status](https://github.com/rjx18/harn/actions/workflows/test.yml/badge.svg)](https://github.com/rjx18/harn/actions/workflows/test.yml)
[![npm](https://img.shields.io/npm/v/%40richhardry%2Fharn.svg)](https://www.npmjs.com/package/@richhardry/harn)
[![Supported Node Versions](https://img.shields.io/badge/node-%3E%3D20-339933.svg)](./package.json)
[![Downloads](https://img.shields.io/npm/dm/%40richhardry%2Fharn.svg)](https://www.npmjs.com/package/@richhardry/harn)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

Harn is a repo-native guardrail for agentic coding.

It gives AI agents one job: make code changes match a predeclared assumption-impact plan.

Harn is not a coding agent, task manager, or work log. It is a small deterministic layer that uses Git-tracked files, source anchors, and Git diffs to answer:

> Did this change stay inside the plan that was declared before coding started?

## Install

Run the interactive installer:

```bash
npx @richhardry/harn@latest install
```

The installer sets up the Harn CLI, then lets you choose which coding assistants should get the Harn agent skill or project rule.

## Why Harn Exists

AI coding agents are good at editing code, but they can lose context, miss related rules, or quietly change behavior outside the intended scope. Existing memory files and instructions help, but they depend on the agent remembering and obeying them.

Harn makes the important parts explicit and checkable:

- what assumptions the code currently depends on
- where those assumptions are anchored in code
- which assumptions a plan intends to create, retire, or review
- which files and anchors the code change is allowed to touch
- whether the staged Git diff actually matches that plan

The goal is not to infer hidden relationships. Harn only trusts declared plans, declared assumptions, source anchors, and deterministic Git checks.

## How It Works

Harn stores state in `.harn/`:

```txt
.harn/
  assumptions/
    single-active-workflow.yaml
  plans/
    support-multiple-workflows.yaml
```

Assumptions are current repo truth. Plans are proposed transitions to that truth.

A normal flow is:

```txt
1. Explore current assumptions and anchors.
2. Write a plan in .harn/plans/.
3. Run harn plan check.
4. Lock the plan.
5. Edit code inside the locked plan scope.
6. Commit through the Harn pre-commit hook.
7. The hook checks, applies, restages .harn, and checks again.
8. One commit contains code, applied plan, and updated assumption truth.
```

Many plans may exist in `.harn/plans/`, but only one plan may be locked in a worktree at a time. One implementation commit must consume only one locked plan. Draft plan-only commits are allowed as planning checkpoints.

## Assumptions

An assumption is a tracked statement that code depends on.

Use this shape:

```txt
<subject> must/does <observable behavior or invariant> when/for <specific scope or trigger>, because/so <reason, consumer, or consequence>.
```

Good assumptions are specific, stable enough to matter, important if wrong, connected to code, and reviewable when changed.

Examples:

```txt
A case must have at most one active workflow while workflow state is singular because downstream status logic reads one active workflow.
Tenant ID must be present on every tenant-scoped query so data cannot cross tenant boundaries.
GSAP must load before page animation scripts execute because those scripts register ScrollTrigger animations at startup.
The commit detail panel refreshes when a graph milestone is selected so milestone state stays visible to the user.
```

If a statement cannot be anchored to code, a test, a query, config, schema, API shape, or runtime UI behavior, it is probably not a Harn assumption.

## Anchors

Anchors connect assumptions to code.

Block anchor:

```python
# harn:assume single-active-workflow ref=workflow-guard
if case.active_workflow_id is not None:
    raise CaseAlreadyHasActiveWorkflowError(case.id)
# harn:end single-active-workflow
```

Single-line anchor:

```python
if case.active_workflow_id is not None:  # harn:assume single-active-workflow ref=workflow-guard
    raise CaseAlreadyHasActiveWorkflowError(case.id)
```

Nested block anchors are allowed:

```python
# harn:assume payment-priority-order ref=allocation-flow
def allocate_payment(claim, payment):
    # harn:assume catastrophe-payment-override ref=catastrophe-branch
    if claim.is_catastrophe:
        return allocate_insurer_first(claim, payment)
    # harn:end catastrophe-payment-override

    return allocate_deductible_first(claim, payment)
# harn:end payment-priority-order
```

Nested anchors are closed in last-in-first-out order. Nesting means overlapping implementation, not automatic `depends_on`. Declare `depends_on` only when one assumption's truth relies on another assumption's truth.

For diff checks, Harn uses direct-touch semantics: changing only the inner block touches the inner anchor, changing outer code outside the child block touches the outer anchor, and changing both requires both planned anchor actions.

The assumption ID is readable. Harn-generated hashes are written by Harn, not by agents.

Anchor actions in plans:

```txt
change = this anchored region is expected to change
remove = this anchored region or assumption dependency is expected to be removed
keep   = this anchored region must not change
```

## Ignore Non-Source Examples

Harn scans Git-visible files for anchor markers. If documentation, examples, generated output, or fixtures include literal `harn:assume` text that should not count as live source anchors, add those paths to `.harnignore` at the repo root:

```gitignore
README.md
SPEC.md
docs/
fixtures/
```

`.harnignore` is applied by Harn itself, including to already-tracked files.

## Local Development

```bash
npm install
npm run build
npm link
```

## Initialize A Repo

From the target repository:

```bash
harn init
```

This creates:

```txt
.harn/
  assumptions/
  plans/
```

If the target repository is a Git worktree, `harn init` also installs Harn's pre-commit hook. Use `harn init --no-hook` to skip hook installation.

For an existing complex project, bootstrap Harn in small human-reviewed passes: identify core entities, propose assumptions for one entity at a time, then add approved anchors and plans.

## Plan Format

Plans are YAML files in `.harn/plans/`.

Example:

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
      statement: A case may have multiple active workflows for workflow orchestration because parallel workflows are now supported.
      reason: Replacement model for workflow orchestration.
      depends_on: []
  reviewed: []

anchors:
  single-active-workflow:
    workflow-guard:
      action: remove
      reason: Remove the guard that rejects a second active workflow.

files:
  - backend/workflow.py
```

Do not write `lock`, `applied`, or hashes manually. Harn writes those.

## Recommended Workflow

```bash
harn find
harn find --file backend/workflow.py
harn find single-active-workflow
harn find --depended-by single-active-workflow --depth 2

# write or update .harn/plans/support-multiple-workflows.yaml

harn plan check support-multiple-workflows
harn plan lock support-multiple-workflows

# edit code

harn check support-multiple-workflows
git add .
git commit -m "Support multiple active workflows"
```

With the Harn pre-commit hook installed, the commit runs:

```bash
harn check --staged
harn apply
git add .harn
harn check --staged
```

The final commit contains:

```txt
code changes
applied plan
created or retired assumptions
```

No post-commit hook is required.

## Install The Pre-Commit Hook

Harn ships a copyable hook:

```bash
cp hooks/pre-commit .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

The hook blocks commits when staged code does not match the locked plan. It also blocks applied Harn state that does not match the plan. Empty staged checks and draft plan-only checkpoint commits are allowed.

## Commands

```bash
harn init
harn find
harn find <assumption-id>
harn find --file <path>
harn find --changed
harn find --staged
harn find --plan <plan-id>
harn find --depended-by <assumption-id> --depth <n>
harn plan check <plan-id>
harn plan lock <plan-id>
harn check <plan-id>
harn check --staged
harn apply [plan-id]
harn log
```

## What Harn Checks

`harn plan check` validates that a plan accounts for affected assumptions and anchors before work starts.

`harn check` validates a Git diff against a locked plan:

- changed source files must be declared in `files`
- changed anchored regions must be declared in `anchors`
- anchors marked `keep` must not change
- ground-truth assumption files must not be edited directly
- locked plans must not be modified after locking

`harn check --staged` also accepts valid applied Harn state produced by `harn apply`.

It also passes for an empty staged diff or a draft plan-only staged diff.

## Agent Skills

This package includes a Harn skill that can be installed into supported coding assistants.

The installer installs the Harn CLI globally, then opens a terminal menu where you can choose zero or more assistant targets such as Codex, Claude Code, Cursor, Windsurf, GitHub Copilot instructions, or a generic `AGENTS.md`. Press Enter without selecting an assistant to skip agent setup.

Available targets:

```txt
auto            Detect existing assistant directories, or fall back to Codex and Claude user skills.
all             Install every supported target.
codex           ~/.codex/skills/harn
claude          ~/.claude/skills/harn
claude-project  .claude/skills/harn
cursor          .cursor/rules/harn.mdc
windsurf        .windsurf/rules/harn.md
copilot         .github/instructions/harn.instructions.md
agents          AGENTS.md
```

Pass `--force` to replace an existing Harn skill or rule file. Pass `--yes` to skip the interactive menu and use auto-detected targets.

## Spec

The detailed MVP behavior is in [`SPEC.md`](./SPEC.md).

## Change Log

The log has become long enough to live in its own file.

See [`CHANGES.md`](./CHANGES.md).

## Authors

The author list lives in its own file.

See [`AUTHORS.md`](./AUTHORS.md).

## Code Of Conduct

Everyone participating in Harn is expected to treat other people with respect in issues, pull requests, discussions, and related project spaces.

See [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md).
