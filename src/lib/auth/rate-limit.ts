const WINDOW_MS = 60_000;
const LIMIT = 8;

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  if (first) {
    return first;
  }
  return "local";
}

export function takeRateLimit(key: string, now = Date.now()): boolean {
  const bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (bucket.count >= LIMIT) {
    return false;
  }
  bucket.count += 1;
  return true;
}

export function clearRateLimits(): void {
  buckets.clear();
}

export const RATE_LIMIT = LIMIT;
export const RATE_WINDOW_MS = WINDOW_MS;
