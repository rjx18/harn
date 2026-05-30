import { createHash } from "node:crypto";

export function hashAssumptionContent(input: { title: string; statement: string }): string {
  const payload = {
    statement: input.statement.trim(),
    title: input.title.trim()
  };

  return `a-${createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 12)}`;
}
