/**
 * Unfinished enquiries: someone typed their name, email and phone on step 1
 * of the website form, then left before sending it. leads.startCapture saves
 * them straight away (so they're never lost), but only a full submit emails
 * the venue — so these used to land in VenueFlow silently, and an interested
 * client could go a day without anyone noticing.
 *
 * Once one has sat unfinished for 20 minutes, tell the venue — the bell and
 * an email to the notification address — once per enquiry (notifyVenue's
 * dedupeKey). The 20 minutes count from when the visitor was last on the
 * form: step 1, or the form's latest "still here" ping from step 2
 * (leads.partialSeenAt), so someone who takes half an hour over step 2 isn't
 * reported as gone. No ping counts more than 2 hours after step 1, so a tab
 * left open can't hold the alert back for ever (shared/enquiryTiming.ts). If
 * they finish the form first, the normal "New Event Enquiry" email goes
 * instead and this never fires.
 *
 * Nor does it fire when the same person carried on (isPartialSuperseded):
 * a newer enquiry for the same venue with the same email (finished, or
 * started again) means this one was left behind, not abandoned; so does a
 * finished one from the same email sent up to a day before it (they had
 * already sent it: a reload after sending, the form open in two tabs, or a
 * step-1 save that arrived late). An older unfinished one never counts, so a
 * genuinely abandoned attempt still alerts. Only an enquiry that reaches the
 * venue itself counts: not one staff typed or imported, an Express Book
 * request (that sends the venue no email) or a health check (hidden from the
 * list), so none of those can silence this alert. Nothing is merged or
 * deleted.
 */
import { and, eq, gte, isNotNull, lte, ne, notExists, notInArray, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb } from "./db";
import { leads } from "../drizzle/schema";
import { NON_ENQUIRY_SOURCES, PARTIAL_LEAD_NOTE, partialAlertDedupeKey } from "@shared/leadConstants";
import {
  FINISHED_ENQUIRY_SILENCES_MS, PARTIAL_ALERT_AFTER_MS, PARTIAL_PING_CAP_MS, partialLastSeenAt,
} from "@shared/enquiryTiming";
import { notifyVenue, type VenueAlert } from "./notify";
import { registerJob } from "./jobs";

/** How long a step-1 enquiry is given, after the visitor was last on the form, before the venue is told. */
export { PARTIAL_ALERT_AFTER_MS };
/** Older than this, don't alert — keeps the first run after a deploy from
 *  emailing about every unfinished enquiry ever. */
export const PARTIAL_ALERT_WINDOW_MS = 48 * 3_600_000;

export type PartialLead = {
  id: number;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  createdAt: Date;
  /** The form's last "still here" ping from step 2, if any. */
  partialSeenAt?: Date | null;
};

/** The alert for one unfinished enquiry. */
export function partialEnquiryAlert(lead: PartialLead, tz = "Pacific/Auckland"): VenueAlert {
  const name = [lead.firstName, lead.lastName].filter(Boolean).join(" ").trim() || "Someone";
  const fmt = (d: Date) => new Intl.DateTimeFormat("en-NZ", {
    timeZone: tz, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true,
  }).format(d);
  const lastSeen = partialLastSeenAt(lead.createdAt, lead.partialSeenAt);
  // Only worth a line when step 2 was open a while after step 1.
  const seenLater = lastSeen.getTime() - new Date(lead.createdAt).getTime() >= 60_000;
  const lines = [
    "They filled in their details on the website enquiry form but didn't send it, so there are no event details yet. Worth a quick call or email while they're still keen.",
    "",
    `Name: ${name}`,
    lead.email ? `Email: ${lead.email}` : "",
    lead.phone ? `Phone: ${lead.phone}` : "",
    lead.company ? `Company: ${lead.company}` : "",
    `Started: ${fmt(lead.createdAt)}`,
    seenLater ? `Last on the form: ${fmt(lastSeen)}` : "",
  ].filter((l, i) => l !== "" || i === 1);
  return {
    kind: "partial_enquiry",
    title: `Unfinished enquiry: ${name}`,
    body: lines.join("\n"),
    leadId: lead.id,
    dedupeKey: partialAlertDedupeKey(lead.id),
  };
}

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

// Durations from the shared constants as SQL interval literals (numbers only).
const interval = (ms: number) => sql.raw(`interval '${Math.round(ms / 1000)} seconds'`);

/**
 * The enquiries that show the unfinished enquiry `partial` (the leads table
 * in the outer query) was left behind: isPartialSuperseded
 * (shared/enquiryTiming.ts) in SQL. Use under NOT EXISTS / EXISTS.
 */
function supersedingLeads(db: Db, partial: typeof leads) {
  const other = alias(leads, "superseding");
  return db.select({ one: sql`1` }).from(other).where(and(
    eq(other.ownerId, partial.ownerId),
    ne(other.id, partial.id),
    isNotNull(other.source),
    notInArray(other.source, NON_ENQUIRY_SOURCES),
    sql`trim(coalesce(${partial.email}, '')) <> ''`,
    sql`lower(trim(${other.email})) = lower(trim(${partial.email}))`,
    or(
      // Any newer one, finished or not: they came back.
      sql`${other.createdAt} > ${partial.createdAt}`,
      sql`(${other.createdAt} = ${partial.createdAt} and ${other.id} > ${partial.id})`,
      // A finished one from up to a day before: they had already sent it.
      sql`(${other.internalNotes} is distinct from ${PARTIAL_LEAD_NOTE} and ${other.createdAt} >= ${partial.createdAt} - ${interval(FINISHED_ENQUIRY_SILENCES_MS)})`,
    ),
  ));
}

/** When the visitor was last on the form, in SQL: partialLastSeenAt. */
const lastSeenSql = sql`greatest(${leads.createdAt}, least(coalesce(${leads.partialSeenAt}, ${leads.createdAt}), ${leads.createdAt} + ${interval(PARTIAL_PING_CAP_MS)}))`;

/** Alert on every enquiry still unfinished 20 minutes after the visitor was last on the form. */
export async function alertUnfinishedEnquiries(now = new Date()): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const dueBy = new Date(now.getTime() - PARTIAL_ALERT_AFTER_MS);
  const rows = await db.select({
    id: leads.id, ownerId: leads.ownerId,
    firstName: leads.firstName, lastName: leads.lastName,
    email: leads.email, phone: leads.phone, company: leads.company,
    createdAt: leads.createdAt, partialSeenAt: leads.partialSeenAt,
  }).from(leads).where(and(
    eq(leads.internalNotes, PARTIAL_LEAD_NOTE),
    eq(leads.status, "new"),
    lte(leads.createdAt, dueBy),
    gte(leads.createdAt, new Date(now.getTime() - PARTIAL_ALERT_WINDOW_MS)),
    // partialAlertDueAt(createdAt, partialSeenAt) <= now
    sql`${lastSeenSql} <= ${dueBy.toISOString()}::timestamp`,
    notExists(supersedingLeads(db, leads)),
  ));
  let sent = 0;
  for (const r of rows) {
    const res = await notifyVenue(r.ownerId, partialEnquiryAlert(r));
    if (res.created) sent++;
  }
  return sent;
}

/**
 * Is this lead still an unfinished enquiry nobody has touched, that the
 * person hasn't since carried on from? The alert-email retry job asks before
 * sending an Unfinished alert again.
 */
export async function isPartialStillUnfinished(ownerId: number, leadId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const [row] = await db.select({ id: leads.id }).from(leads).where(and(
    eq(leads.id, leadId),
    eq(leads.ownerId, ownerId),
    eq(leads.internalNotes, PARTIAL_LEAD_NOTE),
    eq(leads.status, "new"),
    notExists(supersedingLeads(db, leads)),
  )).limit(1);
  return !!row;
}

export function registerPartialEnquiryJobs() {
  registerJob("partial-enquiry-alerts", 5 * 60_000, async () => { await alertUnfinishedEnquiries(); });
}
