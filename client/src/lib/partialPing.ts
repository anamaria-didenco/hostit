/**
 * The step-2 "still here" ping (leads.touchPartial). While someone fills in
 * step 2, the form tells the server now and then, and the venue's
 * "Unfinished enquiry" alert counts its 20 minutes from the last ping instead
 * of from step 1: people who took half an hour over step 2 were reported as
 * gone while still typing.
 *
 * When: once when step 2 comes back after a reload, on the first thing the
 * visitor does on step 2, then at most every `everyMs`, and only if they did
 * something since the last ping while the page was showing. A tab left open
 * with nobody at it sends nothing (and the server takes none after 2 hours).
 * Stops for good once the server says the lead is no longer an untouched
 * partial (`alive: false`). Errors are ignored and never retried.
 * Pure (time comes from `now`); tested in server/leadFormPing.test.ts.
 */

export type PingTarget = { ownerId: number; leadId: number; leadToken: string };

export function createPartialPinger(opts: {
  everyMs: number;
  send: (t: PingTarget) => Promise<unknown>;
  now?: () => number;
}) {
  const now = opts.now ?? (() => Date.now());
  let leadId: number | null = null;
  let lastAt: number | null = null;
  let activitySince = false;
  let stopped = false;
  let inFlight = false;

  // A different lead (a new one after an email change, or after START FRESH) starts afresh.
  const forLead = (t: PingTarget) => {
    if (leadId === t.leadId) return;
    leadId = t.leadId; lastAt = null; activitySince = false; stopped = false; inFlight = false;
  };
  const ping = (t: PingTarget) => {
    inFlight = true;
    lastAt = now();
    activitySince = false;
    const id = t.leadId;
    Promise.resolve()
      .then(() => opts.send(t))
      .then(r => { if (leadId === id && (r as { alive?: unknown } | null)?.alive === false) stopped = true; })
      .catch(() => { /* a missed ping only means the alert keeps its earlier time */ })
      .finally(() => { if (leadId === id) inFlight = false; });
  };

  return {
    /** Step 2 is showing again after a reload. */
    resumed(t: PingTarget | null) {
      if (!t) return;
      forLead(t);
      if (!stopped && !inFlight && lastAt == null) ping(t);
    },
    /** The visitor typed, tapped or pressed a key on step 2. */
    activity(t: PingTarget | null, visible: boolean) {
      if (!t) return;
      forLead(t);
      if (stopped) return;
      activitySince = true;
      if (!visible || inFlight) return;
      if (lastAt == null || now() - lastAt >= opts.everyMs) ping(t);
    },
    /** Called on a timer and when the page becomes visible again. */
    tick(t: PingTarget | null, visible: boolean) {
      if (!t) return;
      forLead(t);
      if (stopped || inFlight || !visible || !activitySince || lastAt == null) return;
      if (now() - lastAt >= opts.everyMs) ping(t);
    },
    /** No more pings for the lead held now (sent, or START FRESH). */
    stop() { stopped = true; },
    /** For tests. */
    state: () => ({ leadId, lastAt, activitySince, stopped, inFlight }),
  };
}
