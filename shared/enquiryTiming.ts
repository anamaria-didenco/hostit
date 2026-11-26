/**
 * Timings the enquiry form, leads.* and the "Unfinished enquiry" jobs share,
 * and the rule for when an unfinished enquiry has been left behind rather
 * than abandoned. Pure; tested in server/enquiryTiming.test.ts.
 *
 * The "still here" ping: while someone is filling in step 2, their form tells
 * the server now and then (leads.touchPartial), which stamps
 * leads.partialSeenAt. The Unfinished alert then counts its 20 minutes from
 * the last ping instead of from step 1, so a person who takes half an hour
 * over step 2 isn't reported as gone. A tab left open with nobody using it
 * sends no pings, and no ping counts after PARTIAL_PING_CAP_MS, so nothing can
 * hold an alert back for ever.
 */
import { NON_ENQUIRY_SOURCES, PARTIAL_LEAD_NOTE } from "./leadConstants";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** How long a step-1 enquiry is given, after the visitor was last seen on the form, before the venue is told. */
export const PARTIAL_ALERT_AFTER_MS = 20 * MINUTE;

/** The form pings at most this often, and only after the visitor did something on step 2 since the last ping. */
export const PARTIAL_PING_EVERY_MS = 5 * MINUTE;

/** The server ignores a ping this soon after the last one it kept (a little under the form's interval, for clock and network jitter). */
export const PARTIAL_PING_MIN_GAP_MS = 4 * MINUTE;

/** No ping counts later than this after step 1, so the alert goes by createdAt + this + PARTIAL_ALERT_AFTER_MS at the latest. */
export const PARTIAL_PING_CAP_MS = 2 * HOUR;

/** The last time the visitor was seen on the form: step 1, or the latest ping that counts. */
export function partialLastSeenAt(createdAt: Date, partialSeenAt: Date | null | undefined): Date {
  const created = new Date(createdAt).getTime();
  const seen = partialSeenAt ? new Date(partialSeenAt).getTime() : NaN;
  if (!Number.isFinite(seen) || seen <= created) return new Date(created);
  return new Date(Math.min(seen, created + PARTIAL_PING_CAP_MS));
}

/** When the Unfinished alert for this enquiry falls due. */
export function partialAlertDueAt(createdAt: Date, partialSeenAt: Date | null | undefined): Date {
  return new Date(partialLastSeenAt(createdAt, partialSeenAt).getTime() + PARTIAL_ALERT_AFTER_MS);
}

/**
 * Whether the server keeps a ping now: within PARTIAL_PING_CAP_MS of step 1,
 * and at least PARTIAL_PING_MIN_GAP_MS after the last one it kept. (Whether
 * the lead is still an untouched partial and the token matches is checked
 * separately.)
 */
export function acceptsPartialPing(createdAt: Date, partialSeenAt: Date | null | undefined, now: Date): boolean {
  const created = new Date(createdAt).getTime();
  const t = now.getTime();
  if (t - created > PARTIAL_PING_CAP_MS) return false;
  if (!partialSeenAt) return true;
  return t - new Date(partialSeenAt).getTime() >= PARTIAL_PING_MIN_GAP_MS;
}

/**
 * A finished enquiry from the same email this long before an unfinished one
 * means the unfinished one is the same person again (they reloaded after
 * sending, or had the form open twice), not a new enquiry left behind.
 */
export const FINISHED_ENQUIRY_SILENCES_MS = 24 * HOUR;

/**
 * A SUBMIT with the lead token of an enquiry that was received this recently,
 * with the same email and nobody at the venue has touched it yet, is the same
 * enquiry sent again (the reply was lost, or a second tab): it gets back the
 * enquiry already saved, and nothing is saved or emailed again.
 */
export const IDEMPOTENT_SUBMIT_MS = 30 * MINUTE;

/** The form gives up waiting on NEXT's save or SUBMIT after this and lets the visitor try again. */
export const ENQUIRY_REQUEST_TIMEOUT_MS = 20_000;

/** SUBMIT waits at most this long for step 1's save to answer, then sends without it. */
export const SUBMIT_WAITS_FOR_CAPTURE_MS = 4_000;

/**
 * The form doesn't send a "form opened at" token younger than this by its own
 * clock: the server drops anything under 3 s (MIN_FORM_FILL_MS in
 * server/enquiryConversion.ts) as a bot, and the form's count starts a little
 * after the server issued the token.
 */
export const CLIENT_MIN_TOKEN_AGE_MS = 3_500;

/** After "Enquiry Received!", a reload shows that confirmation again for this long instead of an empty form. */
export const SENT_CONFIRMATION_KEEP_MS = 60 * MINUTE;

// ─── Left behind or abandoned? ──────────────────────────────────────────────

export type SupersedeCandidate = {
  id: number;
  email: string | null;
  source: string | null;
  internalNotes: string | null;
  createdAt: Date;
};

const normEmail = (e: string | null | undefined) => (e ?? "").trim().toLowerCase();

/**
 * True when an unfinished enquiry was left behind, not abandoned: another
 * enquiry for the same venue from the same email (`others`, all for that
 * venue) shows the person carried on.
 *  - Any newer one, finished or not (they came back and started again: the
 *    newest is the one to act on). Same createdAt: the higher id is newer.
 *  - A finished one created up to FINISHED_ENQUIRY_SILENCES_MS before it
 *    (they had already sent it: a reload after sending, two tabs, or a step-1
 *    save that arrived late). An older unfinished one never counts, so two
 *    abandoned attempts still give one alert, for the newest.
 * Only enquiries that reached the venue count: rows staff typed or imported,
 * Express Book requests and health checks (NON_ENQUIRY_SOURCES, or no
 * source) never silence an alert. alertUnfinishedEnquiries and the
 * "finish your enquiry" follow-up use this same rule.
 */
export function isPartialSuperseded(
  partial: { id: number; email: string | null; createdAt: Date },
  others: SupersedeCandidate[],
): boolean {
  const email = normEmail(partial.email);
  if (!email) return false;
  const at = new Date(partial.createdAt).getTime();
  return others.some(o => {
    if (o.id === partial.id || normEmail(o.email) !== email) return false;
    if (!o.source || NON_ENQUIRY_SOURCES.includes(o.source)) return false;
    const t = new Date(o.createdAt).getTime();
    if (t > at || (t === at && o.id > partial.id)) return true;
    const finished = o.internalNotes !== PARTIAL_LEAD_NOTE;
    return finished && at - t <= FINISHED_ENQUIRY_SILENCES_MS;
  });
}
