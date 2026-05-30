# Harn Install And Hooks

## Install

If Harn is available:

```bash
harn --help
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

When published to npm:

```bash
npx harn --help
npx harn <command>
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

Use Harn as both a pre-commit and post-commit gate.

Install the pre-commit hook:

```bash
cp /path/to/harn/hooks/pre-commit .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

The pre-commit hook runs:

```bash
harn check --staged
```

Install a post-commit hook:

```bash
cat > .git/hooks/post-commit <<'EOF'
#!/usr/bin/env sh
set -eu

plan_id="$(git diff-tree --no-commit-id --name-only -r HEAD \
  | sed -n 's#^\.harn/plans/\([a-z][a-z0-9-]*\)\.yaml$#\1#p' \
  | head -n 1)"

if [ -z "$plan_id" ]; then
  exit 0
fi

harn apply "$plan_id"

if ! git diff --quiet -- .harn; then
  echo "Harn applied $plan_id."
  echo "Review .harn changes, then amend or create a follow-up commit."
fi
EOF

chmod +x .git/hooks/post-commit
```

The post-commit hook should not auto-amend commits. After it applies Harn state, explicitly amend or create a follow-up commit.

Preferred amend flow:

```bash
git add .harn/assumptions .harn/plans
git commit --amend --no-edit
```

Alternative follow-up flow:

```bash
git add .harn/assumptions .harn/plans
git commit -m "Apply Harn plan <plan-id>"
```
