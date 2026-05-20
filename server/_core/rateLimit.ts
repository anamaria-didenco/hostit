// Tiny in-memory rate limiter shared across public endpoints (tRPC publicProcedure
// + Express PDF/portal routes). Each bucket key (usually `${name}::${ip}`) tracks
// count and reset time, with lazy pruning to keep the map bounded.
//
// This is process-local — fine for a single-instance deployment. If we ever
// scale horizontally, swap with Redis. For now it's enough to blunt brute-force
// and runaway-cost attacks against public surfaces.

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

function prune(now: number) {
  if (buckets.size <= 5000) return;
  for (const [k, v] of buckets) if (v.resetAt < now) buckets.delete(k);
  if (buckets.size > 10000) {
    const sorted = [...buckets.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt);
    for (let i = 0; i < sorted.length - 5000; i++) buckets.delete(sorted[i][0]);
  }
}

/**
 * Returns true if the request is allowed, false if the caller has exceeded
 * `max` requests within `windowMs`. Increments the counter on each call.
 */
export function rateLimit(name: string, ip: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  prune(now);
  const key = `${name}::${ip}`;
  const entry = buckets.get(key);
  if (!entry || entry.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  entry.count += 1;
  return entry.count <= max;
}

/** Throws a tRPC-friendly error when the bucket is exhausted. */
export function enforceRateLimit(
  name: string,
  ip: string,
  max: number,
  windowMs: number,
  errMessage = 'Too many requests. Please slow down and try again in a few minutes.',
) {
  if (!rateLimit(name, ip, max, windowMs)) {
    throw new Error(errMessage);
  }
}

/** Pull a stable-ish client IP from an Express request (works behind the Replit proxy). */
export function getRequestIp(req: any): string {
  return req?.ip || req?.headers?.['x-forwarded-for']?.toString().split(',')[0]?.trim() || 'unknown';
}

/** Express middleware factory — drop straight into `app.get(path, expressRateLimit(...), handler)`. */
export function expressRateLimit(name: string, max: number, windowMs: number) {
  return (req: any, res: any, next: any) => {
    if (rateLimit(name, getRequestIp(req), max, windowMs)) return next();
    res.status(429).json({ error: 'Too many requests. Please wait a few minutes and try again.' });
  };
}
