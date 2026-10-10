const PATH_SPLIT = /[/|>]+/;
const SEPARATORS = /[-_\s]+/g;

export function categorySegments(value: string): string[] {
  return value
    .split(PATH_SPLIT)
    .map((part) => part.trim().toLowerCase().replace(SEPARATORS, ""))
    .filter((part) => part.length > 0);
}

export function categoryMatches(allowed: readonly string[], candidate: string): boolean {
  const candidateSegments = new Set(categorySegments(candidate));
  return allowed.some((entry) => categorySegments(entry).some((segment) => candidateSegments.has(segment)));
}

export function joinCategoryParts(parts: readonly string[]): string | null {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const part of parts) {
    const [segment] = categorySegments(part);
    if (!segment || seen.has(segment)) {
      continue;
    }
    seen.add(segment);
    unique.push(part.trim());
  }

  return unique.length > 0 ? unique.join("/") : null;
}
