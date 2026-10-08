/**
 * One place for recurring background work (follow-up sequences, reply-overdue
 * checks, hold expiry, inbox polling…).
 *
 * Render's "starter" plan is always-on, so a plain in-process timer is enough.
 * Jobs must be idempotent — they will re-run after every deploy/restart —
 * so each one records what it has already done in the database (a stage
 * column, a sent-at timestamp, or notifyVenue's dedupeKey) rather than in
 * memory.
 */
type Job = { name: string; everyMs: number; firstDelayMs: number; run: () => Promise<void> };

const jobs = new Map<string, Job>();
const running = new Set<string>();
let started = false;

export function registerJob(name: string, everyMs: number, run: () => Promise<void>, firstDelayMs = 45_000) {
  jobs.set(name, { name, everyMs, firstDelayMs, run });
  if (started) schedule(jobs.get(name)!);
}

/** Run a job now (tests, admin "run now"). Skips if it's already running. */
export async function runJob(name: string): Promise<void> {
  const job = jobs.get(name);
  if (!job || running.has(name)) return;
  running.add(name);
  try {
    await job.run();
  } catch (err) {
    console.error(`[jobs] ${name} failed:`, err);
  } finally {
    running.delete(name);
  }
}

function schedule(job: Job) {
  setTimeout(() => { void runJob(job.name); }, job.firstDelayMs);
  setInterval(() => { void runJob(job.name); }, job.everyMs);
}

export function startJobs() {
  if (started) return;
  started = true;
  if (process.env.DISABLE_BACKGROUND_JOBS === "true") {
    console.log("[jobs] DISABLE_BACKGROUND_JOBS=true — background jobs not started");
    return;
  }
  jobs.forEach(schedule);
  console.log(`[jobs] started: ${Array.from(jobs.keys()).join(", ") || "(none)"}`);
}
