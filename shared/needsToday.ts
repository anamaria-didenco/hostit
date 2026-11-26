/**
 * The rules behind the Overview's "Needs you today" card, its action tiles and
 * the enquiry counts, in one place so the server query, the dashboard tiles
 * and the lists they open all agree.
 *
 * ── Enquiry counts: one definition each ────────────────────────────────────
 * (The list's views are built in shared/enquiryFilters.ts on enquirySignal.)
 *  NEEDS REPLY nobody has answered a new enquiry yet, or the client wrote last
 *              and is waiting on you. NEEDS REPLY = sidebar badge = Needs reply
 *              tab = Today's "waiting on a reply". The reply rows in "Needs
 *              you today" are these, less brand-new enquiries still inside the
 *              venue's reply hours (needsTodayEnquiries).
 *  OPEN        every enquiry still in play: not confirmed / finished / lost /
 *              cancelled. NEEDS REPLY is part of OPEN. This is the "Open
 *              enquiries" tile, and the Open view it opens shows exactly these.
 *  FOLLOW-UP   open enquiries whose follow-up date has arrived, or that have
 *              gone quiet (shared/followUp.ts), and that are not waiting on a
 *              reply. The "Needs follow-up" tile, the Follow-up due view and
 *              the follow-up rows in "Needs you today".
 *  The Board's "New Enquiry" column counts the status New (isNewEnquiry): a
 *  status, under its own name, not the Needs reply count.
 *  The alerts bell counts unread ALERTS (one enquiry can raise several, and
 *  alerts are also about proposals and holds), so it is not an enquiry count.
 */
import { CLOSED_LEAD_STATUSES } from "./followUp";
import { EMPTY_FILTERS, listRows, viewDefaultSort, type ListCtx, type ListRow } from "./enquiryFilters";
import { rowLane, type Lane } from "./enquiryLane";
import { leadNeedsReply } from "./needsReply";

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

// ── The enquiries in "Needs you today" ─────────────────────────────────────

/** One enquiry in "Needs you today", with the lane and words its row shows on the Enquiries list. */
export interface EnquiryNeed {
  leadId: number;
  name: string;
  eventType: string | null;
  lane: Lane;
  /** The row's dot words: "Waiting 3d 4h", "Replied 2d ago", "Follow-up overdue · 2d". */
  text: string;
  /** A second line when the lane's reason isn't the Needs line ("Waiting 9d 22h" under "Date clash"). */
  sub?: string;
  /**
   * A brand-new enquiry past the venue's reply hours: the list shows it blue
   * ("new") however long it has waited, but "Needs you today" shows it red as
   * "Reply overdue", as it always has.
   */
  replyOverdue?: true;
}

export interface EnquiryNeeds {
  reply: EnquiryNeed[];
  followup: EnquiryNeed[];
}

/**
 * The enquiries "Needs you today" lists (Overview and the Calendar panel): the
 * Enquiries list's own Needs reply and Follow-up due views, with no filter or
 * search, in the list's default order, each with its row's lane and words
 * (shared/enquiryLane.ts).
 *
 * The follow-ups are exactly the "Needs follow-up" tile and the Follow-up due
 * tab. The reply rows are the Needs reply tab less the brand-new enquiries (no
 * reply from the venue yet) still inside the venue's reply hours: those were
 * never in "Needs you today" (the badge and the tab still count them).
 * `replyOverdueIds` are the brand-new enquiries past those hours, by the
 * server's own rule (dashboard.needsAttention, enquiries.replyOverdueIds);
 * until it loads, no brand-new enquiry is listed. Every row is in the tab its
 * group's "+N more" link opens.
 */
export function needsTodayEnquiries(rows: readonly ListRow[], ctx: ListCtx, replyOverdueIds: ReadonlySet<number> = new Set()): EnquiryNeeds {
  const pick = (view: "reply" | "followup"): EnquiryNeed[] =>
    listRows(rows, { view, filters: EMPTY_FILTERS, q: "", sort: viewDefaultSort(view) }, ctx).rows.flatMap(row => {
      const l = row.lead;
      const brandNew = view === "reply" && leadNeedsReply(l);
      const replyOverdue = brandNew && replyOverdueIds.has(Number(l.id));
      if (brandNew && !replyOverdue) return [];
      const lane = rowLane(row, ctx);
      const name = [l.firstName, l.lastName].filter(Boolean).join(" ").trim() || String(l.company ?? "").trim() || "Enquiry";
      return [{
        leadId: l.id, name, eventType: l.eventType ?? null, lane: lane.lane, text: lane.text,
        ...(lane.sub ? { sub: lane.sub } : {}), ...(replyOverdue ? { replyOverdue: true as const } : {}),
      }];
    });
  return { reply: pick("reply"), followup: pick("followup") };
}
