# Harn Install And Hooks

## Install

Recommended install for normal repo work and Git hooks:

```bash
npm install -g @richhardry/harn
harn --help
```

One-off use without installing:

```bash
npx @richhardry/harn --help
npx @richhardry/harn <command>
```

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

For Codex, install the Harn skill and add a standing global instruction so it is used automatically in Harn-enabled repos.

Install the skill into Codex:

```bash
mkdir -p ~/.codex/skills/harn
cp -R /path/to/harn/skill/. ~/.codex/skills/harn/
```

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

The hook creates one commit containing the code change, applied plan, and generated assumption truth. Do not install a post-commit Harn apply hook for normal work.
