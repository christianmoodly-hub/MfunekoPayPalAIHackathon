const SECRET_PATTERNS = [/AIza[0-9A-Za-z_-]{10,}/g, /key=[^&\s]+/gi, /postgres(?:ql)?:\/\/\S+/gi];

export function redactSecrets(value: string): string {
  return SECRET_PATTERNS.reduce((text, pattern) => text.replace(pattern, "[redacted]"), value);
}
