const WINDOW_MS = 60_000;
const LIMIT = 8;

export const SESSION_LIMIT = 5;
export const SESSION_WINDOW_MS = 10 * 60 * 1000;
export const SESSION_FAILURE_DELAY_MS = 500;

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/**
 * Client address for rate limits.
 *
 * Render is the one trusted proxy in front of this app. It records the
 * connecting client as the last X-Forwarded-For hop. Earlier hops are
 * ignored because the caller can set them. A request with no header, which
 * is local development, shares the bucket "local".
 *
 * https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/X-Forwarded-For
 */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (!forwarded) {
    return "local";
  }
  const hops = forwarded
    .split(",")
    .map((hop) => hop.trim())
    .filter((hop) => hop.length > 0);
  return hops.at(-1) ?? "local";
}

export function takeRateLimit(key: string, now = Date.now(), limit = LIMIT, windowMs = WINDOW_MS): boolean {
  const bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= limit) {
    return false;
  }
  bucket.count += 1;
  return true;
}

export function delayFailure(ms = SESSION_FAILURE_DELAY_MS): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function clearRateLimits(): void {
  buckets.clear();
}

export const RATE_LIMIT = LIMIT;
export const RATE_WINDOW_MS = WINDOW_MS;
