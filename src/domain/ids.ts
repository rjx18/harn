export function isAssumptionId(value: string): boolean {
  return isSlugId(value);
}

export function isPlanId(value: string): boolean {
  return isSlugId(value);
}

export function isSlugId(value: string): boolean {
  return /^[a-z][a-z0-9-]*$/.test(value);
}
