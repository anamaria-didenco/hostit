/**
 * "Needs reply": a new enquiry nobody at the venue has answered yet — no
 * outbound email, call or status change since it arrived.
 *
 * Separate from `readAt` on purpose: opening a lead clears the unread badge,
 * but looking at an enquiry isn't replying to it. The server stamps
 * `leads.respondedAt` the first time the venue replies (see addLeadActivity in
 * server/db.ts); the venue's automatic "we've got it" email doesn't count.
 *
 * Kept here so the enquiries list and anything built on top of it (e.g.
 * response-time alerts) share one rule.
 */
import { PARTIAL_LEAD_NOTE } from "./leadConstants";

export type LeadNeedsReplyInput = {
  status?: string | null;
  respondedAt?: Date | string | number | null;
  createdAt?: Date | string | number | null;
  internalNotes?: string | null;
};

/**
 * True when the lead is a new enquiry with no reply from the venue yet.
 * Partial leads (visitor left after step 1 of the embed) are excluded unless
 * `includePartial` is set — they didn't finish the enquiry.
 */
export function leadNeedsReply(lead: LeadNeedsReplyInput, opts: { includePartial?: boolean } = {}): boolean {
  if ((lead.status ?? "") !== "new") return false;
  if (lead.respondedAt != null) return false;
  if (!opts.includePartial && lead.internalNotes === PARTIAL_LEAD_NOTE) return false;
  return true;
}

/** How long (ms) a lead has been waiting for a first reply, or null if it isn't. */
export function leadReplyWaitMs(lead: LeadNeedsReplyInput, nowMs: number = Date.now(), opts: { includePartial?: boolean } = {}): number | null {
  if (!leadNeedsReply(lead, opts)) return null;
  const created = lead.createdAt != null ? new Date(lead.createdAt).getTime() : NaN;
  return Number.isFinite(created) ? Math.max(0, nowMs - created) : null;
}
