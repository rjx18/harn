import { createHash } from "node:crypto";

export function hashPlanContent(planValue: unknown): string {
  return createHash("sha256").update(JSON.stringify(stripLock(planValue))).digest("hex");
}

function stripLock(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const record = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};

  for (const key of Object.keys(record).sort()) {
    if (key === "lock") {
      continue;
    }

    result[key] = stripLock(record[key]);
  }

  return result;
}
