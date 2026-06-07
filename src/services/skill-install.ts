import { cp, mkdir, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

export type SkillInstallTarget =
  | "codex"
  | "claude"
  | "claude-project"
  | "cursor"
  | "windsurf"
  | "copilot"
  | "agents";

export interface InstallSkillOptions {
  targets?: string[];
  homeDir?: string;
  projectDir?: string;
  force?: boolean;
  dryRun?: boolean;
}

export interface SkillInstallResult {
  result: "installed";
  source: string;
  targets: SkillInstallTargetResult[];
  notes: string[];
}

export interface SkillInstallTargetResult {
  target: SkillInstallTarget;
  kind: "skill" | "rule";
  path: string;
  action: "installed" | "skipped" | "would_install" | "would_skip";
  reason?: string;
}

export const installTargets: SkillInstallTarget[] = [
  "codex",
  "claude",
  "claude-project",
  "cursor",
  "windsurf",
  "copilot",
  "agents"
];

const userTargets: SkillInstallTarget[] = ["codex", "claude"];

export const installTargetDescriptions: Record<SkillInstallTarget, string> = {
  codex: "Install the Harn skill to ~/.codex/skills/harn.",
  claude: "Install the Harn skill to ~/.claude/skills/harn.",
  "claude-project": "Install the Harn skill to .claude/skills/harn in this project.",
  cursor: "Create .cursor/rules/harn.mdc in this project.",
  windsurf: "Create .windsurf/rules/harn.md in this project.",
  copilot: "Create .github/instructions/harn.instructions.md in this project.",
  agents: "Create AGENTS.md in this project."
};

export async function installHarnSkill(options: InstallSkillOptions = {}): Promise<SkillInstallResult> {
  const home = options.homeDir ?? homedir();
  const project = options.projectDir ?? process.cwd();
  const source = skillSourceDir();
  const selectedTargets = await resolveTargets(options.targets ?? ["auto"], home, project);
  const notes: string[] = [];
  const targets: SkillInstallTargetResult[] = [];

  for (const target of selectedTargets) {
    targets.push(await installTarget(target, source, home, project, options));
  }

  if (selectedTargets.some((target) => target === "cursor" || target === "windsurf" || target === "copilot" || target === "agents")) {
    notes.push("Project rule targets create instruction files in the current project; commit them if the whole team should use Harn.");
  }

  if (selectedTargets.includes("claude-project")) {
    notes.push("Claude Code project skills are loaded from .claude/skills in the project tree.");
  }

  return {
    result: "installed",
    source,
    targets,
    notes
  };
}

export async function getAutoInstallTargets(home: string, project: string): Promise<SkillInstallTarget[]> {
  const detected = await detectTargets(home, project);
  return detected.length > 0 ? detected : userTargets;
}

async function resolveTargets(targets: string[], home: string, project: string): Promise<SkillInstallTarget[]> {
  const normalized = targets.flatMap((target) => target.split(",")).map((target) => target.trim()).filter(Boolean);

  if (normalized.length === 0 || normalized.includes("auto")) {
    return getAutoInstallTargets(home, project);
  }

  if (normalized.includes("all")) {
    return installTargets;
  }

  const resolved: SkillInstallTarget[] = [];
  for (const target of normalized) {
    if (!isInstallTarget(target)) {
      throw new Error(`Unknown install target: ${target}`);
    }

    if (!resolved.includes(target)) {
      resolved.push(target);
    }
  }

  return resolved;
}

async function detectTargets(home: string, project: string): Promise<SkillInstallTarget[]> {
  const detected: SkillInstallTarget[] = [];

  if (await exists(join(home, ".codex"))) {
    detected.push("codex");
  }

  if (await exists(join(home, ".claude"))) {
    detected.push("claude");
  }

  if (await exists(join(project, ".claude"))) {
    detected.push("claude-project");
  }

  if (await exists(join(project, ".cursor"))) {
    detected.push("cursor");
  }

  if (await exists(join(project, ".windsurf"))) {
    detected.push("windsurf");
  }

  if (await exists(join(project, ".github"))) {
    detected.push("copilot");
  }

  return detected;
}

async function installTarget(
  target: SkillInstallTarget,
  source: string,
  home: string,
  project: string,
  options: InstallSkillOptions
): Promise<SkillInstallTargetResult> {
  switch (target) {
    case "codex":
      return copySkillTarget(target, source, join(home, ".codex", "skills", "harn"), options);
    case "claude":
      return copySkillTarget(target, source, join(home, ".claude", "skills", "harn"), options);
    case "claude-project":
      return copySkillTarget(target, source, join(project, ".claude", "skills", "harn"), options);
    case "cursor":
      return writeRuleTarget(target, join(project, ".cursor", "rules", "harn.mdc"), cursorRule(), options);
    case "windsurf":
      return writeRuleTarget(target, join(project, ".windsurf", "rules", "harn.md"), ruleMarkdown(), options);
    case "copilot":
      return writeRuleTarget(target, join(project, ".github", "instructions", "harn.instructions.md"), ruleMarkdown(), options);
    case "agents":
      return writeRuleTarget(target, join(project, "AGENTS.md"), ruleMarkdown(), options);
  }
}

async function copySkillTarget(
  target: SkillInstallTarget,
  source: string,
  destination: string,
  options: InstallSkillOptions
): Promise<SkillInstallTargetResult> {
  const alreadyExists = await exists(destination);
  if (alreadyExists && !options.force) {
    return {
      target,
      kind: "skill",
      path: destination,
      action: options.dryRun ? "would_skip" : "skipped",
      reason: "Destination already exists; pass --force to replace it."
    };
  }

  if (options.dryRun) {
    return {
      target,
      kind: "skill",
      path: destination,
      action: "would_install"
    };
  }

  await mkdir(dirname(destination), { recursive: true });
  await cp(source, destination, { recursive: true, force: true });

  return {
    target,
    kind: "skill",
    path: destination,
    action: "installed"
  };
}

async function writeRuleTarget(
  target: SkillInstallTarget,
  destination: string,
  content: string,
  options: InstallSkillOptions
): Promise<SkillInstallTargetResult> {
  const alreadyExists = await exists(destination);
  if (alreadyExists && !options.force) {
    return {
      target,
      kind: "rule",
      path: destination,
      action: options.dryRun ? "would_skip" : "skipped",
      reason: "Destination already exists; pass --force to replace it."
    };
  }

  if (options.dryRun) {
    return {
      target,
      kind: "rule",
      path: destination,
      action: "would_install"
    };
  }

  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, content);

  return {
    target,
    kind: "rule",
    path: destination,
    action: "installed"
  };
}

function skillSourceDir(): string {
  return fileURLToPath(new URL("../../skill/", import.meta.url));
}

function cursorRule(): string {
  return [
    "---",
    "description: Use Harn's assumption-impact workflow in Harn-enabled repos",
    "alwaysApply: false",
    "---",
    "",
    ruleMarkdown()
  ].join("\n");
}

function ruleMarkdown(): string {
  return [
    "# Harn",
    "",
    "When working in a repository that contains `.harn/`, use Harn before making code changes.",
    "",
    "Required workflow:",
    "",
    "1. Run `harn find`.",
    "2. Use `harn find --file <path>` before editing relevant files.",
    "3. Draft or update a plan in `.harn/plans/`.",
    "4. Run `harn plan check <plan-id>`.",
    "5. Run `harn plan lock <plan-id>` before implementation.",
    "6. Keep edits inside the locked plan scope.",
    "7. Run `harn check <plan-id>` before committing.",
    "",
    "Harn source of truth:",
    "",
    "```txt",
    ".harn/assumptions/ = current assumption truth",
    ".harn/plans/       = proposed and applied assumption transitions",
    "source anchors     = code locations tied to assumptions",
    "git diff           = what actually changed",
    "```",
    ""
  ].join("\n");
}

function isInstallTarget(target: string): target is SkillInstallTarget {
  return installTargets.includes(target as SkillInstallTarget);
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export function relativeInstallPath(path: string, root = process.cwd()): string {
  const relativePath = relative(root, path);
  return relativePath === "" || relativePath.startsWith("..") ? path : relativePath;
}
