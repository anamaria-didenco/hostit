/**
 * Run async jobs one at a time per key (in this server process).
 *
 * Used where a handler reads "does it exist yet?" and then creates it: two
 * requests for the same thing arriving together (a double-click, a click that
 * reaches two handlers) would both see "no" and both create. Jobs with
 * different keys still run in parallel. A failing job doesn't block the next.
 */
const tails = new Map<string, Promise<unknown>>();

export async function withKeyedLock<T>(key: string, job: () => Promise<T>): Promise<T> {
  const previous = tails.get(key) ?? Promise.resolve();
  const run = previous.then(job, job);
  const tail = run.then(() => undefined, () => undefined);
  tails.set(key, tail);
  try {
    return await run;
  } finally {
    // Forget the key once nothing newer has queued behind this job.
    if (tails.get(key) === tail) tails.delete(key);
  }
}
