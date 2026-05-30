# Harn

Harn is a repo-native guardrail for agentic coding.

The MVP behavior is defined in `SPEC.md`.

Agents write readable IDs such as `single-active-workflow`.
Harn writes integrity hashes when plans are locked or applied.

Install globally when you want `harn` available for hooks and normal repo work:

```bash
npm install -g @richhardry/harn
harn --help
```

Run without installing for one-off use:

```bash
npx @richhardry/harn --help
npx @richhardry/harn <command>
```

## Pre-Commit Hook

Harn ships a copyable pre-commit hook at `hooks/pre-commit`.

To use it in a repository:

```bash
cp hooks/pre-commit .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

The hook runs:

```bash
harn check --staged
```
