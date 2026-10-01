/**
 * Fixed-window limiter for the session endpoint.
 *
 * Deliberately in-memory: on Vercel each serverless/edge instance keeps its own
 * counter, so this is a cheap abuse brake, not a hard quota. When a site needs a
 * real quota, pass your own `limiter` to `createSessionRoute` (Upstash, Redis,
 * Vercel KV — anything matching `SiteChatLimiter`).
 */

export interface LimitDecision {
  allowed: boolean;
  /** Seconds until the window resets. Sent as `Retry-After` on a 429. */
  retryAfter: number;
}

export type SiteChatLimiter = (key: string) => LimitDecision | Promise<LimitDecision>;

interface Bucket {
  count: number;
  resetAt: number;
}

const MAX_TRACKED_KEYS = 10_000;

export function createMemoryLimiter(windowMs: number, max: number): SiteChatLimiter {
  const buckets = new Map<string, Bucket>();

  return (key: string): LimitDecision => {
    const now = Date.now();
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      // Opportunistic sweep so a long-lived instance cannot grow without bound.
      if (buckets.size >= MAX_TRACKED_KEYS) {
        for (const [k, v] of buckets) {
          if (v.resetAt <= now) buckets.delete(k);
        }
        if (buckets.size >= MAX_TRACKED_KEYS) buckets.clear();
      }
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return { allowed: true, retryAfter: 0 };
    }

    bucket.count += 1;
    if (bucket.count > max) {
      return { allowed: false, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
    }
    return { allowed: true, retryAfter: 0 };
  };
}

/**
 * Best-effort client identity. Vercel always sets `x-forwarded-for`; the first
 * entry is the real client. Falls back to a shared bucket so a missing header
 * degrades to "everyone shares one limit" rather than "nobody is limited".
 */
export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}
