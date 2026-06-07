import { spawn } from "node:child_process";

export interface CliInstallOptions {
  dryRun?: boolean;
  packageSpec?: string;
  onLog?: (line: string) => void;
}

export interface CliInstallResult {
  target: "cli";
  kind: "global_npm_package";
  package: string;
  command: string[];
  action: "installed" | "would_install";
}

export async function installHarnCli(options: CliInstallOptions = {}): Promise<CliInstallResult> {
  const packageSpec = options.packageSpec ?? "@richhardry/harn@latest";
  const command = [npmCommand(), "install", "--global", packageSpec];

  if (options.dryRun) {
    options.onLog?.(`npm install --global ${packageSpec}`);
    options.onLog?.("dry run; no packages installed");
    return {
      target: "cli",
      kind: "global_npm_package",
      package: packageSpec,
      command,
      action: "would_install"
    };
  }

  await runCommand(command, options.onLog);

  return {
    target: "cli",
    kind: "global_npm_package",
    package: packageSpec,
    command,
    action: "installed"
  };
}

function npmCommand(): string {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function runCommand(command: string[], onLog?: (line: string) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command[0], command.slice(1), {
      stdio: onLog ? ["ignore", "pipe", "pipe"] : "inherit"
    });
    let stdoutRemainder = "";
    let stderrRemainder = "";

    child.on("error", reject);
    child.stdout?.on("data", (data: Buffer) => {
      stdoutRemainder = emitLines(`${data}`, stdoutRemainder, onLog);
    });
    child.stderr?.on("data", (data: Buffer) => {
      stderrRemainder = emitLines(`${data}`, stderrRemainder, onLog);
    });
    child.on("exit", (code) => {
      if (stdoutRemainder.trim() !== "") {
        onLog?.(stdoutRemainder.trim());
      }
      if (stderrRemainder.trim() !== "") {
        onLog?.(stderrRemainder.trim());
      }

      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command.join(" ")} exited with code ${code ?? "unknown"}.`));
      }
    });
  });
}

function emitLines(chunk: string, remainder: string, onLog?: (line: string) => void): string {
  const lines = `${remainder}${chunk}`.split(/\r?\n/);
  const nextRemainder = lines.pop() ?? "";

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed !== "") {
      onLog?.(trimmed);
    }
  }

  return nextRemainder;
}
