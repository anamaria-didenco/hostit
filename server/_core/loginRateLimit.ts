// Brute-force limiter for the password login: at most `max` failed sign-ins
// per client per window. The old limiter counted every attempt, so ten good
// sign-ins in five minutes (a team signing in on one connection, or one person
// signing in and out) locked the next person out with "Too many login
// attempts" though nobody had guessed anything. Process-local, like rateLimit.ts.
//
// An attempt is counted as soon as it starts (synchronously, so a burst of
// parallel guesses can't all slip in while their password checks run) and
// handed back when it turns out to be a successful sign-in.

export type LoginLimiter = {
  /** Start an attempt: false (and nothing counted) when the client is locked out. */
  attempt(ip: string, now?: number): boolean;
  /** The attempt signed in: it no longer counts against the client. */
  succeeded(ip: string, now?: number): void;
};

export function createLoginLimiter(max: number, windowMs: number): LoginLimiter {
  const counts = new Map<string, { count: number; resetAt: number }>();
  return {
    attempt(ip, now = Date.now()) {
      const entry = counts.get(ip);
      if (!entry || entry.resetAt <= now) {
        // Keep the map bounded: drop windows that have already ended.
        if (counts.size > 5000) for (const [k, v] of counts) if (v.resetAt <= now) counts.delete(k);
        counts.set(ip, { count: 1, resetAt: now + windowMs });
        return true;
      }
      if (entry.count >= max) return false;
      entry.count += 1;
      return true;
    },
    succeeded(ip, now = Date.now()) {
      const entry = counts.get(ip);
      if (entry && entry.resetAt > now && entry.count > 0) entry.count -= 1;
    },
  };
}
