/**
 * Speed-to-lead: record when staff first respond to an enquiry, and alert the
 * venue when a new enquiry has waited too long for a reply.
 *
 * "Responded" means a person did something the client can see or that moves
 * the enquiry on: an email sent from the app (email.send, leads.sendFollowUp,
 * proposals.send) or a manual status change away from "new". Automatic emails
 * never count.
 */
import { and, eq, gte, inArray, isNull, notInArray, or, ne, sql } from "drizzle-orm";
import { getDb } from "./db";
import { leads, venueSettings } from "../drizzle/schema";
import { PARTIAL_LEAD_NOTE } from "@shared/leadConstants";
import { addBusinessHours, DEFAULT_BUSINESS_HOURS, type BusinessHours } from "@shared/businessHours";
import { notifyVenue } from "./notify";
import { registerJob } from "./jobs";

/** Sources that aren't inbound enquiries — staff typed or imported them, so
 *  there's nobody waiting on a reply. */
export const NON_ENQUIRY_SOURCES = ["manual", "csv_import", "healthcheck", "express_book", "xero"];

/** Never alert about a lead whose reply fell due longer ago than this — keeps
 *  the first run after a deploy from alerting on every old enquiry. */
const OVERDUE_FRESHNESS_MS = 24 * 3_600_000;

export const DEFAULT_REPLY_OVERDUE_HOURS = 2;

/**
 * Staff responded to this lead. Sets firstResponseAt the first time; when an
 * email went to the client, also records it as the latest staff email (the
 * trigger for the "client hasn't replied" follow-up). Never throws.
 */
export async function markStaffResponse(ownerId: number, leadId: number, opts: { emailed: boolean; at?: Date }) {
  try {
    const db = await getDb();
    if (!db) return;
    const at = opts.at ?? new Date();
    await db.update(leads)
      .set({
        firstResponseAt: sql`COALESCE(${leads.firstResponseAt}, ${at})`,
        ...(opts.emailed ? { lastStaffEmailAt: at } : {}),
      })
      .where(and(eq(leads.id, leadId), eq(leads.ownerId, ownerId)));
  } catch (err) {
    console.error(`[speedToLead] markStaffResponse lead ${leadId} failed (non-fatal):`, err);
  }
}

/** A bulk status change away from "new" counts as a response for each lead
 *  that was still new. Call BEFORE the status update. */
export async function markBulkStatusResponse(ownerId: number, leadIds: number[], newStatus: string) {
  if (newStatus === "new" || leadIds.length === 0) return;
  try {
    const db = await getDb();
    if (!db) return;
    await db.update(leads)
      .set({ firstResponseAt: new Date() })
      .where(and(
        inArray(leads.id, leadIds), eq(leads.ownerId, ownerId),
        eq(leads.status, "new"), isNull(leads.firstResponseAt),
      ));
  } catch (err) {
    console.error("[speedToLead] markBulkStatusResponse failed (non-fatal):", err);
  }
}

export type ReplyWaitLead = {
  status: string | null;
  source: string | null;
  internalNotes: string | null;
  createdAt: Date;
  firstResponseAt: Date | null;
};

/** Is this a real, complete inbound enquiry still waiting for its first reply? */
export function isAwaitingFirstReply(lead: ReplyWaitLead): boolean {
  return lead.status === "new"
    && !lead.firstResponseAt
    && lead.internalNotes !== PARTIAL_LEAD_NOTE
    && !NON_ENQUIRY_SOURCES.includes(lead.source ?? "");
}

/** When the reply to this enquiry falls due (N business hours after it came in). */
export function replyDueAt(createdAt: Date, hours: number, bh: BusinessHours = DEFAULT_BUSINESS_HOURS): Date {
  return addBusinessHours(createdAt, hours, bh);
}

/** Should the overdue alert go out now? Due, and not so long ago that it's stale. */
export function shouldAlertReplyOverdue(lead: ReplyWaitLead, hours: number, now: Date, bh: BusinessHours = DEFAULT_BUSINESS_HOURS): boolean {
  if (!isAwaitingFirstReply(lead)) return false;
  const due = replyDueAt(lead.createdAt, hours, bh).getTime();
  return now.getTime() >= due && now.getTime() - due <= OVERDUE_FRESHNESS_MS;
}

const fmtWhen = (d: Date) => d.toLocaleString("en-NZ", {
  timeZone: DEFAULT_BUSINESS_HOURS.timeZone, weekday: "short", day: "numeric", month: "short",
  hour: "numeric", minute: "2-digit", hour12: true,
});

/** One pass of the reply-overdue check. Exported so tests can run it directly. */
export async function runReplyOverdueCheck(now: Date = new Date(), opts: { ownerIds?: number[] } = {}): Promise<{ alerted: number[] }> {
  const alerted: number[] = [];
  const db = await getDb();
  if (!db) return { alerted };
  const venues = await db.select({
    ownerId: venueSettings.ownerId,
    enabled: venueSettings.replyOverdueEnabled,
    hours: venueSettings.replyOverdueHours,
  }).from(venueSettings)
    .where(opts.ownerIds ? inArray(venueSettings.ownerId, opts.ownerIds) : undefined);
  // Leads older than this can't still be inside the freshness window for any
  // allowed N (max 24 business hours ≈ 3 working days, plus a long weekend).
  const since = new Date(now.getTime() - 10 * 86_400_000);
  for (const v of venues) {
    if ((v.enabled ?? 1) === 0) continue;
    const hours = Math.min(24, Math.max(1, v.hours ?? DEFAULT_REPLY_OVERDUE_HOURS));
    const rows = await db.select({
      id: leads.id, firstName: leads.firstName, lastName: leads.lastName,
      status: leads.status, source: leads.source, internalNotes: leads.internalNotes,
      createdAt: leads.createdAt, firstResponseAt: leads.firstResponseAt, eventType: leads.eventType,
    }).from(leads).where(and(
      eq(leads.ownerId, v.ownerId),
      eq(leads.status, "new"),
      isNull(leads.firstResponseAt),
      gte(leads.createdAt, since),
      or(isNull(leads.source), notInArray(leads.source, NON_ENQUIRY_SOURCES)),
      or(isNull(leads.internalNotes), ne(leads.internalNotes, PARTIAL_LEAD_NOTE)),
    ));
    for (const lead of rows) {
      if (!shouldAlertReplyOverdue(lead, hours, now)) continue;
      const name = [lead.firstName, lead.lastName].filter(Boolean).join(" ") || "A client";
      const res = await notifyVenue(v.ownerId, {
        kind: "reply_overdue",
        title: `${name} is waiting for a reply`,
        body: `Their ${lead.eventType ? `${lead.eventType} ` : ""}enquiry came in ${fmtWhen(lead.createdAt)} and nobody has replied after ${hours} business hour${hours === 1 ? "" : "s"}. Replying first often wins the booking.`,
        leadId: lead.id,
        dedupeKey: `reply_overdue:${lead.id}`,
      });
      if (res.created) alerted.push(lead.id);
    }
  }
  return { alerted };
}

/** Reply-overdue alerts (every 5 min) and automatic follow-ups (every 15 min). */
export function registerSpeedToLeadJobs() {
  registerJob("reply-overdue", 5 * 60_000, async () => { await runReplyOverdueCheck(); });
  registerJob("follow-up-sequences", 15 * 60_000, async () => {
    const { runFollowUpSequences } = await import("./followUpSequences");
    await runFollowUpSequences();
  }, 90_000);
}
