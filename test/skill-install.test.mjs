import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

test("harn install dry-runs the global CLI install and skips agents when requested", async () => {
  const output = runHarn("install", "--dry-run", "--skip-agents");

  assert.match(output, /cli:/);
  assert.match(output, /package: "@richhardry\/harn@latest"/);
  assert.match(output, /action: would_install/);
  assert.match(output, /agents:/);
  assert.match(output, /result: skipped/);
});

test("harn install can install CLI and selected agent targets in one command", async () => {
  const home = await mkdtemp(join(tmpdir(), "harn-install-home-"));
  const project = await mkdtemp(join(tmpdir(), "harn-install-project-"));

  const output = runHarn(
    "install",
    "--dry-run",
    "--target",
    "codex,cursor",
    "--home",
    home,
    "--project",
    project
  );

  assert.match(output, /cli:/);
  assert.match(output, /action: would_install/);
  assert.match(output, /target: codex/);
  assert.match(output, /target: cursor/);
  assert.equal(existsSync(join(home, ".codex", "skills", "harn", "SKILL.md")), false);
  assert.equal(existsSync(join(project, ".cursor", "rules", "harn.mdc")), false);
});

test("harn install interactive menu exits after skipping assistant setup", { skip: !hasScriptCommand() }, async () => {
  const output = await runInteractiveHarn("\r");

  assert.match(output, /Harn is ready/);
  assert.match(output, /No assistant targets selected/);
});

test("harn install interactive menu handles coalesced input chunks", { skip: !hasScriptCommand() }, async () => {
  const home = await mkdtemp(join(tmpdir(), "harn-interactive-home-"));
  const project = await mkdtemp(join(tmpdir(), "harn-interactive-project-"));
  const output = await runInteractiveHarn(" \r", "--home", home, "--project", project);

  assert.match(output, /Harn is ready/);
  assert.match(output, /target: codex/);
});

test("harn install-skill installs user-scoped Codex and Claude skills", async () => {
  const home = await mkdtemp(join(tmpdir(), "harn-skill-home-"));

  const output = runHarn("install-skill", "--target", "codex,claude", "--home", home);

  assert.match(output, /target: codex/);
  assert.match(output, /target: claude/);
  assert.equal(existsSync(join(home, ".codex", "skills", "harn", "SKILL.md")), true);
  assert.equal(existsSync(join(home, ".claude", "skills", "harn", "SKILL.md")), true);
});

test("harn install-skill creates project rules for assistant harnesses", async () => {
  const project = await mkdtemp(join(tmpdir(), "harn-skill-project-"));

  const output = runHarn("install-skill", "--target", "cursor,windsurf,copilot,agents", "--project", project);

  assert.match(output, /target: cursor/);
  assert.match(output, /target: windsurf/);
  assert.match(output, /target: copilot/);
  assert.match(output, /target: agents/);
  assert.match(readFileSync(join(project, ".cursor", "rules", "harn.mdc"), "utf8"), /use Harn/i);
  assert.match(readFileSync(join(project, ".windsurf", "rules", "harn.md"), "utf8"), /use Harn/i);
  assert.match(readFileSync(join(project, ".github", "instructions", "harn.instructions.md"), "utf8"), /use Harn/i);
  assert.match(readFileSync(join(project, "AGENTS.md"), "utf8"), /use Harn/i);
});

test("harn install-skill auto-detects existing harness directories", async () => {
  const home = await mkdtemp(join(tmpdir(), "harn-skill-auto-home-"));
  const project = await mkdtemp(join(tmpdir(), "harn-skill-auto-project-"));
  await mkdir(join(home, ".codex"), { recursive: true });
  await mkdir(join(project, ".cursor"), { recursive: true });

  const output = runHarn("install-skill", "--yes", "--home", home, "--project", project);

  assert.match(output, /target: codex/);
  assert.match(output, /target: cursor/);
  assert.doesNotMatch(output, /target: claude\n/);
  assert.equal(existsSync(join(home, ".codex", "skills", "harn", "SKILL.md")), true);
  assert.equal(existsSync(join(project, ".cursor", "rules", "harn.mdc")), true);
});

test("harn-install-skill bin runs the installer command directly", async () => {
  const home = await mkdtemp(join(tmpdir(), "harn-skill-bin-home-"));

  const output = execFileSync("node", [join(process.cwd(), "dist/install-skill.js"), "--target", "codex", "--home", home], {
    encoding: "utf8"
  });

  assert.match(output, /target: codex/);
  assert.equal(existsSync(join(home, ".codex", "skills", "harn", "SKILL.md")), true);
});

test("harn install-skill dry-run does not write files", async () => {
  const home = await mkdtemp(join(tmpdir(), "harn-skill-dry-home-"));

  const output = runHarn("install-skill", "--target", "codex", "--home", home, "--dry-run");

  assert.match(output, /action: would_install/);
  assert.equal(existsSync(join(home, ".codex", "skills", "harn", "SKILL.md")), false);
});

function runHarn(...args) {
  return execFileSync("node", [join(process.cwd(), "dist/index.js"), ...args], {
    encoding: "utf8"
  });
}

function runInteractiveHarn(input, ...args) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "script",
      [
        "-qfec",
        ["node", "dist/index.js", "install", "--dry-run", "--skip-cli", ...args].join(" "),
        "/dev/null"
      ],
      {
        cwd: process.cwd(),
        stdio: ["pipe", "pipe", "pipe"]
      }
    );
    let output = "";
    let wroteInput = false;

    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`interactive install did not exit.\n${output}`));
    }, 4000);

    function collect(data) {
      output += data.toString("utf8");
      if (!wroteInput && output.includes("Choose assistants for Harn")) {
        wroteInput = true;
        child.stdin.write(input);
      }
    }

    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("exit", (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve(output);
      } else {
        reject(new Error(`interactive install exited with code ${code ?? "unknown"}.\n${output}`));
      }
    });
  });
}

function hasScriptCommand() {
  try {
    execFileSync("bash", ["-lc", "command -v script"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
