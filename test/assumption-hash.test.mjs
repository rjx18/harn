import assert from "node:assert/strict";
import { test } from "node:test";
import { hashAssumptionContent } from "../dist/domain/assumption-hash.js";
import { parseAssumption } from "../dist/domain/assumption.js";

test("computes a prefixed 12 character assumption hash", () => {
  const hash = hashAssumptionContent({
    title: "Single active workflow",
    statement: "A case has at most one active workflow."
  });

  assert.match(hash, /^a-[a-f0-9]{12}$/);
});

test("accepts a matching assumption hash", () => {
  const hash = hashAssumptionContent({
    title: "Single active workflow",
    statement: "A case has at most one active workflow."
  });

  const assumption = parseAssumption({
    id: "single-active-workflow",
    hash,
    title: "Single active workflow",
    state: "active",
    statement: "A case has at most one active workflow.",
    depends_on: []
  });

  assert.equal(assumption.hash, hash);
});

test("rejects a mismatched assumption hash", () => {
  assert.throws(
    () =>
      parseAssumption({
        id: "single-active-workflow",
        hash: "a-deadbeef0000",
        title: "Single active workflow",
        state: "active",
        statement: "A case has at most one active workflow.",
        depends_on: []
      }),
    (error) =>
      Array.isArray(error.issues) && error.issues.some((issue) => issue.includes("hash must match"))
  );
});
