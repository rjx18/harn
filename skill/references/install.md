# Harn Install And Hooks

## Install

Run the interactive installer:

```bash
npx @richhardry/harn@latest install
```

The installer sets up the Harn CLI, then lets you choose which coding assistants should get the Harn agent skill or project rule.

Targets:

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

If using the local Harn repo:

```bash
cd /path/to/harn
npm install
npm run build
npm link
```

Verify:

```bash
harn --help
```

## Codex Global Instruction

For Codex, install the Harn skill so it is used automatically in Harn-enabled repos.

Then add this to `~/.codex/AGENTS.md` or your Codex global instructions file:

```md
When working in any repository that contains `.harn/`, always use the `harn` skill before making code changes.

For code changes in Harn-enabled repos:
1. Run `harn find`.
2. Check related assumptions with `harn find --file <path>` and `harn find --depended-by <id> --depth 2`.
3. Make or update a Harn plan before editing code.
4. Run `harn plan check <plan-id>`.
5. Lock the plan before implementation.
6. Run `harn check <plan-id>` before committing.
7. Apply the plan after commit when appropriate.
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

Commit `.harn` files with the code changes they justify.

## Recommended Hook Setup

Use Harn as a pre-commit gate.

Install the pre-commit hook:

```bash
cp /path/to/harn/hooks/pre-commit .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

The pre-commit hook runs:

```bash
harn check --staged
harn apply
git add .harn
harn check --staged
```

The hook creates one commit containing the code change, applied plan, and generated assumption truth. Empty staged checks and draft plan-only checkpoint commits pass without apply.

One implementation commit must consume only one locked plan. Do not install a post-commit Harn apply hook for normal work.
