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
 * genuinely abandoned attempt still alerts. Only an enquiry that came through
 * the form counts (step 1's save, or one the form sent: its queued emails or
 * its "New enquiry" bell row), never one staff typed or imported, whatever
 * source they gave it ("Phone", "Website"), nor an Express Book request or a
 * health check. So none of those can silence this alert. Nothing is merged or
 * deleted.
 */
import { and, eq, exists, gte, inArray, isNotNull, lte, ne, notExists, notInArray, or, sql, type SQL } from "drizzle-orm";
import { alias, type PgColumn } from "drizzle-orm/pg-core";
import { getDb } from "./db";
import { enquiryEmails, leads, venueNotifications, venueSettings } from "../drizzle/schema";
import { venueTimeZone } from "./enquiryForm";
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

const looseName = (v: string | null | undefined) => (v ?? "").trim().replace(/\s+/g, " ").toLowerCase();

/** Who an Unfinished alert was about, read back from its body (the "Name:" and "Email:" lines above). */
export function alertedContact(body: string | null | undefined): { name: string | null; email: string | null } {
  const line = (label: string) => {
    const m = new RegExp(`^${label}: (.*)$`, "m").exec(body ?? "");
    return m ? m[1].trim() : null;
  };
  return { name: line("Name"), email: line("Email") };
}

/**
 * Is this finished enquiry the one the Unfinished alert was about? The same
 * email, or the same name (someone fixing a mistyped email keeps their
 * name). Only then is the alert marked read and the venue told "they
 * finished": a step-1 lead someone else's details were put on must not hide
 * the first person's alert.
 */
export function finishedMatchesAlert(
  alertBody: string | null | undefined,
  lead: { firstName?: string | null; lastName?: string | null; email?: string | null },
): boolean {
  const was = alertedContact(alertBody);
  const email = (lead.email ?? "").trim().toLowerCase();
  if (was.email && email && was.email.toLowerCase() === email) return true;
  const name = looseName([lead.firstName, lead.lastName].filter(Boolean).join(" "));
  return !!was.name && !!name && looseName(was.name) === name;
}

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

// Durations from the shared constants as SQL interval literals (numbers only).
const interval = (ms: number) => sql.raw(`interval '${Math.round(ms / 1000)} seconds'`);

/**
 * True (in SQL) when the lead `l` is a finished enquiry the website form
 * sent: leads.submit queued its emails, or (forms from before those were
 * queued) wrote its "New enquiry" bell row. Nothing else writes either, so a
 * lead staff typed or imported never passes, whatever source it was given.
 * SupersedeCandidate.reachedVenue.
 */
export function sentThroughFormSql(db: Db, l: { id: PgColumn; ownerId: PgColumn }): SQL {
  return or(
    exists(db.select({ one: sql`1` }).from(enquiryEmails).where(eq(enquiryEmails.leadId, l.id))),
    exists(db.select({ one: sql`1` }).from(venueNotifications).where(and(
      eq(venueNotifications.ownerId, l.ownerId),
      sql`${venueNotifications.dedupeKey} = 'new_enquiry:' || ${l.id}`,
    ))),
  )!;
}

/**
 * The enquiries that show the unfinished enquiry `partial` (the leads table
 * in the outer query) was left behind: isPartialSuperseded
 * (shared/enquiryTiming.ts) in SQL. Use under NOT EXISTS / EXISTS.
 */
function supersedingLeads(db: Db, partial: typeof leads) {
  const other = alias(leads, "superseding");
  const startedOnForm = sql`${other.internalNotes} = ${PARTIAL_LEAD_NOTE}`;
  return db.select({ one: sql`1` }).from(other).where(and(
    eq(other.ownerId, partial.ownerId),
    ne(other.id, partial.id),
    isNotNull(other.source),
    notInArray(other.source, NON_ENQUIRY_SOURCES),
    sql`trim(coalesce(${partial.email}, '')) <> ''`,
    sql`lower(trim(${other.email})) = lower(trim(${partial.email}))`,
    or(
      // Any newer one from the form, finished or not: they came back.
      and(
        or(sql`${other.createdAt} > ${partial.createdAt}`, sql`(${other.createdAt} = ${partial.createdAt} and ${other.id} > ${partial.id})`),
        or(startedOnForm, sentThroughFormSql(db, other)),
      ),
      // One the form sent up to a day before: they had already sent it.
      and(
        sql`${other.internalNotes} is distinct from ${PARTIAL_LEAD_NOTE}`,
        sql`${other.createdAt} >= ${partial.createdAt} - ${interval(FINISHED_ENQUIRY_SILENCES_MS)}`,
        sentThroughFormSql(db, other),
      ),
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
  )).orderBy(leads.createdAt, leads.id);
  // Times in the alert are the venue's own (Settings), not always NZ.
  const owners = Array.from(new Set(rows.map(r => r.ownerId)));
  const zones = new Map<number, string>();
  if (owners.length) {
    const vs = await db.select({ ownerId: venueSettings.ownerId, timezone: venueSettings.timezone }).from(venueSettings).where(inArray(venueSettings.ownerId, owners));
    for (const v of vs) zones.set(v.ownerId, venueTimeZone(v));
  }
  let sent = 0;
  for (const r of rows) {
    // Each alert's first email is sent as it is made, which can take a
    // while: someone may have finished meanwhile. Checked again just before.
    if (!(await isPartialStillUnfinished(r.ownerId, r.id))) continue;
    const res = await notifyVenue(r.ownerId, partialEnquiryAlert(r, zones.get(r.ownerId) ?? venueTimeZone(null)));
    if (!res.created) continue;
    sent++;
    // Finished while this alert was being made: SUBMIT looked for the alert
    // to mark read before it existed, so it is marked read here instead.
    if (!(await isPartialStillUnfinished(r.ownerId, r.id))) {
      const [lead] = await db.select().from(leads).where(and(eq(leads.id, r.id), eq(leads.ownerId, r.ownerId))).limit(1);
      if (lead) {
        const { markPartialAlertRead } = await import("./enquiryEmails");
        await markPartialAlertRead(r.ownerId, lead);
      }
    }
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
