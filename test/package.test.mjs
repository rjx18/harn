import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("package exposes harn as a bin for npx", async () => {
  const pkg = JSON.parse(await readFile("package.json", "utf8"));

  assert.equal(pkg.bin.harn, "dist/index.js");
  assert.ok(pkg.scripts.prepack.includes("npm run build"));
  assert.ok(pkg.files.includes("dist"));
  assert.ok(pkg.files.includes("hooks"));
});

test("cli reports package version", async () => {
  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  const output = execFileSync("node", ["dist/index.js", "--version"], { encoding: "utf8" });

  assert.equal(output.trim(), pkg.version);
});
