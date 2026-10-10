const RULES: { name: string; pattern: RegExp }[] = [
  {
    name: "postgres URL with a password",
    pattern: /postgres(?:ql)?:\/\/[^\s:/]+:[^\s@/]+@/i,
  },
  {
    name: "AIza API key",
    pattern: /AIza[0-9A-Za-z_-]{10,}/,
  },
  {
    name: "password line",
    pattern:
      /(?:^|\n)[ \t]*(?:export[ \t]+)?[A-Za-z0-9_.-]*(?:password|passwd|pwd)[A-Za-z0-9_.-]*[ \t]*(?:[:=][ \t]*\S+|\r?\n[ \t]*\S)/i,
  },
];

export function secretViolations(content: string): string[] {
  return RULES.filter((rule) => rule.pattern.test(content)).map((rule) => rule.name);
}
