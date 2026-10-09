import { createHash } from "node:crypto";

const REQUEST_ID_LENGTH = 32;

export function paypalRequestId(key: string): string {
  const trimmed = key.trim();
  if (!trimmed) {
    throw new Error("PayPal request key is required.");
  }

  return createHash("sha256").update(trimmed).digest("hex").slice(0, REQUEST_ID_LENGTH);
}
