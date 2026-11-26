/**
 * The rules behind the Overview's "Needs you today" card, its action tiles and
 * the enquiry counts, in one place so the server query, the dashboard tiles
 * and the lists they open all agree.
 *
 * ── Enquiry counts: one definition each ────────────────────────────────────
 * (The list's views are built in shared/enquiryFilters.ts on enquirySignal.)
 *  NEEDS REPLY nobody has answered a new enquiry yet, or the client wrote last
 *              and is waiting on you. NEEDS REPLY = sidebar badge = Needs reply
 *              tab = Overview "Needs reply" card = Today's "waiting on a reply".
 *  OPEN        every enquiry still in play: not confirmed / finished / lost /
 *              cancelled. NEEDS REPLY is part of OPEN. This is the "Open
 *              enquiries" tile, and the Open view it opens shows exactly these.
 *  FOLLOW-UP   open enquiries whose follow-up date has arrived, or that have
 *              gone quiet (shared/followUp.ts), and that are not waiting on a
 *              reply. The "Needs follow-up" tile and the Follow-up due view.
 *  The Board's "New Enquiry" column counts the status New (isNewEnquiry): a
 *  status, under its own name, not the Needs reply count.
 *  The alerts bell counts unread ALERTS (one enquiry can raise several, and
 *  alerts are also about proposals and holds), so it is not an enquiry count.
 */
import { CLOSED_LEAD_STATUSES } from "./followUp";

/** Events this many days ahead (from today, in the venue's zone) are "upcoming" on the Overview. */
export const UPCOMING_DAYS = 14;
/** "Deposit due" looks at confirmed events this many days ahead. */
export const DEPOSIT_WINDOW_DAYS = 21;
/** "No run sheet" looks at events this many days ahead (after today). */
export const RUNSHEET_WINDOW_DAYS = 7;
/** Rows shown per group in the card; the rest become "+N more". */
export const NEEDS_GROUP_CAP = 5;

/** Status "new": the Board's New Enquiry column and the server's stats. */
export function isNewEnquiry(status: string | null | undefined): boolean {
  return (status ?? "") === "new";
}

/** OPEN: still in play (anything not won, lost or cancelled). */
export function isOpenEnquiry(status: string | null | undefined): boolean {
  return !CLOSED_LEAD_STATUSES.includes(status ?? "");
}

/**
 * Same rule as the Payments board's "deposit due" (depositRequired && !depositPaid),
 * for an event that is actually confirmed. A booking marked "no deposit" is never due.
 */
export function isDepositDue(b: { status?: string | null; depositRequired?: boolean | null; depositPaid?: boolean | null }): boolean {
  return b.status === "confirmed" && b.depositRequired !== false && !b.depositPaid;
}

/** "waiting 5h", "waiting 2d" — how long an enquiry has been waiting for a first reply. */
export function formatWait(hours: number): string {
  if (hours < 48) return `${Math.max(1, Math.round(hours))}h`;
  return `${Math.round(hours / 24)}d`;
}

/** "today", "tomorrow", "in 5 days" for a whole-day distance. */
export function daysAwayLabel(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}
