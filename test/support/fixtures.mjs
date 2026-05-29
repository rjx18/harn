import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function runHarn(root, ...args) {
  return execFileSync("node", [join(process.cwd(), "dist/index.js"), ...args], {
    cwd: root,
    encoding: "utf8"
  });
}

export async function createLockFixture() {
  const root = await mkdtemp(join(tmpdir(), "harn-lock-"));
  await mkdir(join(root, ".harn", "assumptions"), { recursive: true });
  await mkdir(join(root, ".harn", "plans"), { recursive: true });
  await mkdir(join(root, "backend"), { recursive: true });

  await writeFile(
    join(root, ".harn", "assumptions", "a-7k3p9x.yaml"),
    [
      "id: a-7k3p9x",
      "title: Single active workflow per case",
      "state: active",
      "statement: A case has at most one active workflow.",
      "depends_on: []"
    ].join("\n")
  );

  await writeFile(
    join(root, "backend", "workflow.py"),
    [
      "# harn:assume a-7k3p9x ref=workflow-guard",
      "if active:",
      "    raise Error()",
      "# harn:end a-7k3p9x"
    ].join("\n")
  );

  await writeFile(
    join(root, ".harn", "plans", "p-d4f8qa.yaml"),
    [
      "id: p-d4f8qa",
      "title: Support multiple active workflows",
      "assumptions:",
      "  retire:",
      "    - id: a-7k3p9x",
      "      reason: Cases can now have multiple active workflows.",
      "  create: []",
      "  reviewed: []",
      "anchors:",
      "  a-7k3p9x:",
      "    workflow-guard:",
      "      action: remove",
      "      reason: Guard rejects second active workflow.",
      "files:",
      "  - backend/workflow.py"
    ].join("\n")
  );

  execFileSync("git", ["init"], { cwd: root });
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "initial"], {
    cwd: root
  });

  return root;
}
