export function normalizeMerchant(value: string): string {
  const lowered = value.trim().toLowerCase();
  return lowered.startsWith("www.") ? lowered.slice(4) : lowered;
}
