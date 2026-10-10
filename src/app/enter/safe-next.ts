export function safeNextPath(next: string | null, currentOrigin: string): string {
  if (!next?.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return "/";
  }

  try {
    const origin = new URL(currentOrigin);
    const destination = new URL(next, origin);
    if (
      destination.origin !== origin.origin ||
      !destination.pathname.startsWith("/") ||
      destination.pathname.startsWith("//")
    ) {
      return "/";
    }

    return `${destination.pathname}${destination.search}${destination.hash}`;
  } catch {
    return "/";
  }
}
