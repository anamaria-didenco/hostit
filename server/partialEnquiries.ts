/**
 * Unfinished enquiries: someone typed their name, email and phone on step 1
 * of the website form, then left before sending it. leads.startCapture saves
 * them straight away (so they're never lost), but only a full submit emails
 * the venue — so these used to land in VenueFlow silently, and an interested
 * client could go a day without anyone noticing.
 *
 * Once one has sat unfinished for 20 minutes, tell the venue — the bell and
 * an email to the notification address — once per enquiry (notifyVenue's
 * dedupeKey). If they finish the form inside those 20 minutes, the normal
 * "New Event Enquiry" email goes instead and this never fires.
 */
import { and, eq, gte, lte } from "drizzle-orm";
import { getDb } from "./db";
import { leads } from "../drizzle/schema";
import { PARTIAL_LEAD_NOTE } from "@shared/leadConstants";
import { notifyVenue, type VenueAlert } from "./notify";
import { registerJob } from "./jobs";

/** How long a step-1 enquiry is given to finish before the venue is told. */
export const PARTIAL_ALERT_AFTER_MS = 20 * 60_000;
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
};

/** The alert for one unfinished enquiry. */
export function partialEnquiryAlert(lead: PartialLead, tz = "Pacific/Auckland"): VenueAlert {
  const name = [lead.firstName, lead.lastName].filter(Boolean).join(" ").trim() || "Someone";
  const started = new Intl.DateTimeFormat("en-NZ", {
    timeZone: tz, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true,
  }).format(lead.createdAt);
  const lines = [
    "They filled in their details on the website enquiry form but didn't send it, so there are no event details yet. Worth a quick call or email while they're still keen.",
    "",
    `Name: ${name}`,
    lead.email ? `Email: ${lead.email}` : "",
    lead.phone ? `Phone: ${lead.phone}` : "",
    lead.company ? `Company: ${lead.company}` : "",
    `Started: ${started}`,
  ].filter((l, i) => l !== "" || i === 1);
  return {
    kind: "partial_enquiry",
    title: `Unfinished enquiry: ${name}`,
    body: lines.join("\n"),
    leadId: lead.id,
    dedupeKey: `partial-enquiry:${lead.id}`,
  };
}

/** Alert on every enquiry still unfinished 20 minutes after it was started. */
export async function alertUnfinishedEnquiries(now = new Date()): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db.select({
    id: leads.id, ownerId: leads.ownerId,
    firstName: leads.firstName, lastName: leads.lastName,
    email: leads.email, phone: leads.phone, company: leads.company,
    createdAt: leads.createdAt,
  }).from(leads).where(and(
    eq(leads.internalNotes, PARTIAL_LEAD_NOTE),
    eq(leads.status, "new"),
    lte(leads.createdAt, new Date(now.getTime() - PARTIAL_ALERT_AFTER_MS)),
    gte(leads.createdAt, new Date(now.getTime() - PARTIAL_ALERT_WINDOW_MS)),
  ));
  let sent = 0;
  for (const r of rows) {
    const res = await notifyVenue(r.ownerId, partialEnquiryAlert(r));
    if (res.created) sent++;
  }
  return sent;
}

export function registerPartialEnquiryJobs() {
  registerJob("partial-enquiry-alerts", 5 * 60_000, async () => { await alertUnfinishedEnquiries(); });
}
