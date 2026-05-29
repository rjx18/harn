import { ValidationError } from "../core/errors.js";

export function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ValidationError(`${label} must be a mapping.`, [`${label} must be a mapping.`]);
  }

  return value as Record<string, unknown>;
}

export function getRequiredString(record: Record<string, unknown>, key: string, issues: string[]): string {
  const value = record[key];
  if (typeof value !== "string" || value.trim() === "") {
    issues.push(`${key} must be a non-empty string.`);
    return "";
  }

  return value;
}

export function getOptionalString(record: Record<string, unknown>, key: string, issues: string[]): string | undefined {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" || value.trim() === "") {
    issues.push(`${key} must be a non-empty string when provided.`);
    return undefined;
  }

  return value;
}

export function getStringArray(record: Record<string, unknown>, key: string, issues: string[]): string[] {
  const value = record[key];
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim() === "")) {
    issues.push(`${key} must be a list of non-empty strings.`);
    return [];
  }

  return value;
}

export function failIfIssues(label: string, issues: string[]): void {
  if (issues.length > 0) {
    throw new ValidationError(`${label} is invalid.`, issues);
  }
}
