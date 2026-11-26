import { useEffect, useState } from "react";

/**
 * The time now, ticking every `intervalMs`. Lists that show "Waiting 2d 1h"
 * or "Event tomorrow" recompute once a tick instead of on every render, and
 * every count taken in the same tick agrees.
 */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
