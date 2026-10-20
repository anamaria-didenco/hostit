// The "signal" that leads every enquiry row and the enquiry drawer in the
// Option-C design: a tone + icon + short human line that says, at a glance,
// what this enquiry needs from you right now — and a sort key so the most
// urgent rises to the top of its group.
//
// It composes the existing enquiry helpers (needsReply, followUp) rather than
// re-deriving status, so the list, the drawer and the Overview all agree.

import { leadNeedsReply, leadReplyWaitMs, type LeadNeedsReplyInput } from "./needsReply";
import {
  leadFollowUpState,
  leadDatePassed,
  leadLastActivityMs,
  CLOSED_LEAD_STATUSES,
  type LeadFollowUpInput,
} from "./followUp";

export type SignalTone = "red" | "amber" | "blue" | "green" | "gray";

/** Which band of the list an enquiry falls into. Drives the view tabs. */
export type EnquiryGroup = "reply" | "followup" | "progress" | "confirmed" | "closed";

export interface EnquirySignal {
  group: EnquiryGroup;
  tone: SignalTone;
  /** lucide icon name */
  icon: string;
  /** short line, e.g. "Waiting 2d 1h", "Follow-up overdue", "Gone quiet · 9d" */
  text: string;
  /**
   * Ordering within the group — larger is more urgent, so a descending sort
   * puts the longest wait / most-overdue follow-up / soonest event first.
   */
  sortKey: number;
}

/** Everything the signal needs that isn't on the lead row itself. */
export interface SignalContext {
  nowMs?: number;
  /** Is the enquiry form half-finished? */
  partial?: boolean;
  /** The client's last message was inbound and is awaiting your reply. */
  clientRepliedAtMs?: number | null;
  /** The date+space is already taken (a real clash exists). */
  hasClash?: boolean;
  /** A date is held until this epoch-ms (tentative holds). */
  holdUntilMs?: number | null;
  /** Epoch-ms of the event date, for ordering confirmed events by soonest. */
  eventDateMs?: number | null;
}

export type SignalLead = LeadNeedsReplyInput &
  LeadFollowUpInput & { status?: string | null };

const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

/**
 * A compact, human wait like "2d 1h", "4h 49m", "40m", "just now". Always two
 * units at most, largest first; never shows a zero leading unit.
 */
export function formatWait(ms: number): string {
  if (ms < MIN) return "just now";
  const days = Math.floor(ms / DAY);
  const hours = Math.floor((ms % DAY) / HOUR);
  const mins = Math.floor((ms % HOUR) / MIN);
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  return `${mins}m`;
}

/** Whole days between two epoch-ms, rounded down, never negative. */
function daysBetween(a: number, b: number): number {
  return Math.max(0, Math.floor((a - b) / DAY));
}

/**
 * Compute the signal for one enquiry. Pure: everything time-dependent comes in
 * through `ctx` so it's deterministic and unit-testable.
 */
export function enquirySignal(lead: SignalLead, ctx: SignalContext = {}): EnquirySignal {
  const now = ctx.nowMs ?? Date.now();
  const status = (lead.status ?? "").toLowerCase();

  // ── Confirmed / closed ──────────────────────────────────────────────────
  if (status === "booked" || status === "confirmed") {
    const ev = ctx.eventDateMs ?? null;
    return {
      group: "confirmed",
      tone: "green",
      icon: "circle-check",
      text: "Confirmed",
      // Soonest upcoming event first: negate the time-until so nearer = larger.
      sortKey: ev != null ? -Math.abs(ev - now) : -Infinity,
    };
  }
  if (CLOSED_LEAD_STATUSES.includes(status)) {
    return { group: "closed", tone: "gray", icon: "circle-minus", text: status === "finished" ? "Finished" : status === "lost" ? "Lost" : "Closed", sortKey: 0 };
  }

  // ── Partial enquiry (form never finished) ───────────────────────────────
  if (ctx.partial) {
    return { group: "progress", tone: "gray", icon: "circle-dashed", text: "Didn't finish the form", sortKey: 0 };
  }

  // ── Needs reply: no first reply yet, or the client is waiting on you ─────
  const clientWaitMs =
    ctx.clientRepliedAtMs != null ? Math.max(0, now - ctx.clientRepliedAtMs) : null;
  if (clientWaitMs != null) {
    // Client sent something and it's unanswered — treat like needs-reply.
    return {
      group: "reply",
      tone: clientWaitMs >= DAY ? "red" : "blue",
      icon: "corner-up-left",
      text: `Replied ${formatWait(clientWaitMs)} ago`,
      sortKey: clientWaitMs,
    };
  }
  if (leadNeedsReply(lead)) {
    const waitMs = leadReplyWaitMs(lead, now) ?? 0;
    return {
      group: "reply",
      tone: waitMs >= DAY ? "red" : "amber",
      icon: "clock",
      text: `Waiting ${formatWait(waitMs)}`,
      sortKey: waitMs,
    };
  }

  // ── Event date has passed: nothing left to chase, offer to close it ──────
  if (leadDatePassed(lead, now)) {
    return { group: "progress", tone: "gray", icon: "calendar-clock", text: "Date passed", sortKey: 0 };
  }
  // ── Follow-up due (overdue after a quote, or gone quiet) ─────────────────
  const fu = leadFollowUpState(lead, now);
  if (fu.needs) {
    if (fu.reason === "overdue") {
      const dueMs = lead.followUpDate ? new Date(lead.followUpDate as any).getTime() : now;
      const overdueDays = daysBetween(now, dueMs);
      return {
        group: "followup",
        tone: overdueDays >= 1 ? "red" : "amber",
        icon: "bell",
        text: overdueDays >= 1 ? `Follow-up overdue · ${overdueDays}d` : "Follow up today",
        sortKey: HOUR + Math.max(0, now - dueMs), // overdue sorts above idle
      };
    }
    // idle — gone quiet
    const lastMs = leadLastActivityMs(lead) ?? now;
    const quietDays = daysBetween(now, lastMs);
    return {
      group: "followup",
      tone: "amber",
      icon: "hourglass",
      text: `Gone quiet · ${quietDays}d`,
      sortKey: Math.max(0, now - lastMs),
    };
  }

  // ── On hold (tentative with a held date) ─────────────────────────────────
  if (status === "tentative" && ctx.holdUntilMs != null) {
    const daysLeft = daysBetween(ctx.holdUntilMs, now);
    return {
      group: "progress",
      tone: ctx.holdUntilMs <= now ? "red" : "amber",
      icon: "calendar-clock",
      text: ctx.holdUntilMs <= now ? "Hold expired" : `Hold ends · ${daysLeft}d`,
      sortKey: -Math.abs(ctx.holdUntilMs - now),
    };
  }

  // ── Date clash flagged ───────────────────────────────────────────────────
  if (ctx.hasClash) {
    return { group: "progress", tone: "red", icon: "triangle-alert", text: "Date clash", sortKey: 1 };
  }

  // ── In progress, nothing pressing ────────────────────────────────────────
  return { group: "progress", tone: "blue", icon: "arrow-right", text: "In progress", sortKey: 0 };
}

/** The context-aware primary action a row offers. */
export interface EnquiryAction {
  label: string;
  icon: string;
  /** Filled primary button vs quiet paper button. */
  primary: boolean;
  /** Opens the inline quick-reply (vs just opening the drawer). */
  reply: boolean;
}

export function enquiryAction(group: EnquiryGroup): EnquiryAction {
  switch (group) {
    case "reply":
      return { label: "Reply", icon: "corner-up-left", primary: true, reply: true };
    case "followup":
      // A quiet button: a list of follow-ups is a dozen rows deep, and a dozen
      // identical filled buttons drown out the one "Reply" that is urgent.
      return { label: "Nudge", icon: "send", primary: false, reply: true };
    default:
      return { label: "Open", icon: "arrow-right", primary: false, reply: false };
  }
}
