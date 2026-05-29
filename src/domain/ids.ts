export function isAssumptionId(value: string): boolean {
  return /^a-[a-z0-9]{6,}$/.test(value);
}

export function isPlanId(value: string): boolean {
  return /^p-[a-z0-9]{6,}$/.test(value);
}
