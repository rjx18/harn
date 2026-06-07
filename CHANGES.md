# Change Log

## 0.1.5

- Fixed live terminal installer cleanup so `harn install` exits after the interactive assistant menu on TTYs.
- Fixed interactive menu key handling when terminals deliver multiple keypresses in one input chunk.

## 0.1.4

- Fixed the interactive installer so it exits cleanly after the assistant menu completes.

## 0.1.3

- Added the interactive `harn install` setup flow.
- Added assistant skill installation targets for Codex, Claude Code, Cursor, Windsurf, GitHub Copilot instructions, and `AGENTS.md`.
- Added `.harnignore` support so documentation examples do not count as live anchors.
- Updated `harn init` to install the Harn pre-commit hook by default in Git worktrees.
- Added `harn init --yes` for non-interactive agent setup and `harn init --no-hook` to skip hook installation.
