const USD_AMOUNT = /^(\d+)\.(\d{2})$/;

export function usdToCents(value: string): number {
  const match = USD_AMOUNT.exec(value);
  if (!match) {
    throw new Error(`Amount must be a USD decimal with two fraction digits, received "${value}".`);
  }

  return Number(match[1]) * 100 + Number(match[2]);
}

export function centsToUsd(cents: number): string {
  if (!Number.isInteger(cents) || cents < 0) {
    throw new Error("Cents must be a non-negative integer.");
  }

  const dollars = Math.floor(cents / 100);
  const remainder = cents % 100;
  return `${dollars}.${remainder.toString().padStart(2, "0")}`;
}
