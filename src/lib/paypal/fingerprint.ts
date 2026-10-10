import { createHash } from "node:crypto";

export function secretFingerprint(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("Fingerprint value is required.");
  }

  return createHash("sha256").update(trimmed).digest("hex").slice(0, 12);
}

export function redactSecret(message: string, secret: string): string {
  const trimmed = secret.trim();
  if (!trimmed) {
    return message;
  }

  return message.split(trimmed).join("[redacted]");
}
