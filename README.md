# Harn

Harn is a repo-native guardrail for agentic coding.

The MVP behavior is defined in `SPEC.md`.

```bash
npx harn --help
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
