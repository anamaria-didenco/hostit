/**
 * Shared "does this lead need a follow-up?" logic, so the dashboard count, the
 * server query that lists them, and the client all agree on one rule.
 *
 * A lead needs a follow-up when it's still active (not won/lost/cancelled) and
 * either:
 *  - its follow-up date has arrived/passed ("overdue"), or
 *  - it has no pending follow-up and nothing has happened on it (no activity,
 *    status change or email — `lastActivityAt`) beyond the idle threshold
 *    ("idle", shown as "gone quiet").
 * A lead with a follow-up scheduled in the future is considered handled.
 */

export const IDLE_FOLLOWUP_DAYS = 7;
export const FOLLOWUP_AFTER_QUOTE_DAYS = 3;

// Statuses that take a lead out of the follow-up pipeline.
export const CLOSED_LEAD_STATUSES = ["booked", "confirmed", "finished", "lost", "cancelled"];
const CLOSED_STATUSES = CLOSED_LEAD_STATUSES;

export type FollowUpReason = "overdue" | "idle" | null;

export type LeadFollowUpInput = {
  status?: string | null;
  followUpDate?: Date | string | number | null;
  lastActivityAt?: Date | string | number | null;
  // Fallbacks for rows read before lastActivityAt existed.
  updatedAt?: Date | string | number | null;
  createdAt?: Date | string | number | null;
};

/** When anything last happened on the lead (falls back for older rows). */
export function leadLastActivityMs(lead: LeadFollowUpInput): number | null {
  return toMs(lead.lastActivityAt) ?? toMs(lead.updatedAt) ?? toMs(lead.createdAt);
}

const toMs = (v: Date | string | number | null | undefined): number | null => {
  if (v == null) return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
};

export function leadFollowUpState(lead: LeadFollowUpInput, nowMs: number = Date.now()): { needs: boolean; reason: FollowUpReason } {
  const status = lead.status ?? "";
  if (CLOSED_STATUSES.includes(status)) return { needs: false, reason: null };
  const fu = toMs(lead.followUpDate);
  if (fu != null) {
    // A set follow-up date is the explicit signal: due/past = needs it now,
    // future = already handled.
    return fu <= nowMs ? { needs: true, reason: "overdue" } : { needs: false, reason: null };
  }
  const last = leadLastActivityMs(lead);
  if (last != null && nowMs - last > IDLE_FOLLOWUP_DAYS * 86_400_000) {
    return { needs: true, reason: "idle" };
  }
  return { needs: false, reason: null };
}

export function leadNeedsFollowUp(lead: LeadFollowUpInput, nowMs: number = Date.now()): boolean {
  return leadFollowUpState(lead, nowMs).needs;
}
