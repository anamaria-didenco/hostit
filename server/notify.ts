/**
 * Tell the venue something happened that needs a human — a proposal was
 * opened / accepted / declined, an enquiry has waited too long for a reply,
 * a date hold is about to lapse, a client replied.
 *
 * Every alert lands in the in-app bell (venue_notifications) and, unless
 * `email: false`, is also emailed to the venue's notification address through
 * their own SMTP. Pass a `dedupeKey` from scheduled jobs so a re-run never
 * repeats an alert.
 *
 * The email is tried straight away, and if the venue's mail server refuses
 * or times out, it is tried again later with growing gaps
 * (shared/emailDelivery.ts) by the alert-email job below, so a hiccup at the
 * wrong moment no longer loses it. The bell row carries the email's status:
 * inserting the row is what claims the first try (so a dedupe hit never
 * emails), and each later try is claimed by one conditional update, so two
 * runs at once still send it once. Rows with no email status (`email: false`,
 * or from before retries existed) are never emailed.
 *
 * Never throws: an alert failing must not break the action that caused it.
 */
import { and, eq, inArray, lte, sql } from "drizzle-orm";
import { getDb } from "./db";
import { venueNotifications, venueSettings, type VenueNotification } from "../drizzle/schema";
import { buildVenueMailer } from "./paymentsEmail";
import { escapeHtml } from "./sanitizeHtml";
import { publicBaseUrl } from "./publicUrl";
import { registerJob } from "./jobs";
import {
  EMAIL_SENDING_LEASE_MS, VENUE_EMAIL_RETRY, describeSmtpError, nextEmailAttemptAt, type EmailDeliveryStatus,
} from "@shared/emailDelivery";

export type VenueAlert = {
  kind: string;
  title: string;
  body?: string;
  leadId?: number | null;
  bookingId?: number | null;
  /** In-app path, e.g. leadLink(12). Defaults from leadId / bookingId. */
  link?: string | null;
  dedupeKey?: string | null;
  /** Also email the venue's notification address. Default true. */
  email?: boolean;
};

export const leadLink = (leadId: number) => `/dashboard?tab=enquiries&leadId=${leadId}`;
export const bookingLink = (bookingId: number) => `/event/${bookingId}`;

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export async function notifyVenue(ownerId: number, alert: VenueAlert): Promise<{ created: boolean; emailed: boolean }> {
  const result = { created: false, emailed: false };
  try {
    const db = await getDb();
    if (!db) return result;
    const now = new Date();
    const link = alert.link ?? (alert.leadId ? leadLink(alert.leadId) : alert.bookingId ? bookingLink(alert.bookingId) : null);
    const wantEmail = alert.email !== false;
    const inserted = await db.insert(venueNotifications).values({
      ownerId,
      kind: alert.kind.slice(0, 40),
      title: alert.title.slice(0, 255),
      body: alert.body ?? null,
      leadId: alert.leadId ?? null,
      bookingId: alert.bookingId ?? null,
      link,
      dedupeKey: alert.dedupeKey ?? null,
      // Writing the row claims the email's first try.
      ...(wantEmail ? { emailStatus: "sending", emailAttempts: 1, emailNextAt: new Date(now.getTime() + EMAIL_SENDING_LEASE_MS) } : {}),
    }).onConflictDoNothing().returning();
    // A dedupe hit means this alert already exists — its email (if any) is
    // that row's, and the retry job looks after it.
    if (inserted.length === 0) return result;
    result.created = true;
    if (!wantEmail) return result;
    result.emailed = (await sendAlertEmail(db, inserted[0], now)) === "sent";
  } catch (err) {
    console.error(`[notify] ${alert.kind} for owner ${ownerId} failed (non-fatal):`, err);
  }
  return result;
}

/** The alert email, built from the stored bell row so a retry sends the same thing. */
function alertEmail(row: Pick<VenueNotification, "title" | "body" | "link">): { subject: string; html: string; text: string } {
  const url = row.link ? `${publicBaseUrl()}${row.link}` : publicBaseUrl();
  const bodyHtml = row.body
    ? `<p style="font-size:15px;line-height:1.5;margin:0 0 16px;white-space:pre-line">${escapeHtml(row.body)}</p>`
    : "";
  return {
    subject: row.title,
    html: `<div style="font-family:sans-serif;max-width:520px"><div style="background:#2d3a2e;color:#fffdf9;padding:18px 22px;border-radius:8px 8px 0 0"><div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;opacity:0.8">VenueFlowHQ</div><div style="font-size:18px;font-weight:bold;margin-top:4px">${escapeHtml(row.title)}</div></div><div style="background:#fff;border:1px solid #e5e7eb;border-top:none;padding:20px 22px;border-radius:0 0 8px 8px">${bodyHtml}<a href="${escapeHtml(url)}" style="background:#2d3a2e;color:#fffdf9;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block">Open in VenueFlow</a></div></div>`,
    text: `${row.title}\n\n${row.body ?? ""}\n\n${url}`,
  };
}

/**
 * Record how this try ended. Only the run holding the claim (status still
 * "sending" with this try's count) can, so a run that outlived its claim
 * never overwrites a newer one's result.
 */
async function settleAlertEmail(
  db: Db, row: VenueNotification, status: EmailDeliveryStatus,
  extra: Partial<Pick<VenueNotification, "emailNextAt" | "emailLastError" | "emailedAt">> = {},
): Promise<EmailDeliveryStatus> {
  await db.update(venueNotifications)
    .set({ emailStatus: status, emailNextAt: null, ...extra })
    .where(and(
      eq(venueNotifications.id, row.id),
      eq(venueNotifications.emailStatus, "sending"),
      eq(venueNotifications.emailAttempts, row.emailAttempts),
    ));
  return status;
}

/**
 * One try at a bell alert's email, for a row this run has claimed (status
 * "sending", emailAttempts = this try). Honours Settings → Follow-ups →
 * "Email me alerts" and the per-kind mutes as they are now.
 */
async function sendAlertEmail(db: Db, row: VenueNotification, now: Date): Promise<EmailDeliveryStatus> {
  const [vs] = await db.select({
    notificationEmail: venueSettings.notificationEmail,
    alertEmailsEnabled: venueSettings.alertEmailsEnabled,
    alertEmailKinds: venueSettings.alertEmailKinds,
  }).from(venueSettings).where(eq(venueSettings.ownerId, row.ownerId)).limit(1);
  if ((vs?.alertEmailsEnabled ?? 1) === 0) return settleAlertEmail(db, row, "skipped");
  if ((vs?.alertEmailKinds as Record<string, boolean> | null)?.[row.kind] === false) return settleAlertEmail(db, row, "skipped");
  const to = vs?.notificationEmail?.trim();
  if (!to) return settleAlertEmail(db, row, "skipped");
  const mailer = await buildVenueMailer(row.ownerId);
  if (!mailer) return settleAlertEmail(db, row, "skipped");
  const email = alertEmail(row);
  try {
    await mailer.transporter.sendMail({
      from: `"VenueFlowHQ" <${mailer.fromEmail}>`,
      to,
      subject: email.subject,
      html: email.html,
      text: email.text,
    });
  } catch (err) {
    const line = describeSmtpError(err);
    const next = nextEmailAttemptAt(row.emailAttempts, row.createdAt, now, VENUE_EMAIL_RETRY);
    console.error(`[notify] ${row.kind} email for owner ${row.ownerId} failed (try ${row.emailAttempts}${next ? "" : ", giving up"}): ${line}`);
    return next
      ? settleAlertEmail(db, row, "pending", { emailLastError: line, emailNextAt: next })
      : settleAlertEmail(db, row, "failed", { emailLastError: line });
  }
  return settleAlertEmail(db, row, "sent", { emailedAt: new Date() });
}

/**
 * Is a held-back alert still worth emailing? Staff haven't seen it in the
 * app, and what it is about still stands: an Unfinished enquiry still
 * unfinished (not completed, touched or carried on from), an enquiry still
 * waiting for its first reply, a proposal still opened and not answered, a
 * hold still on with the same end, a double booking not yet sorted. A retry
 * can come up to two hours later, and the client may have booked by then.
 */
async function alertStillWanted(db: Db, row: VenueNotification): Promise<boolean> {
  if (row.readAt) return false;
  if (row.kind === "double_booking" && row.bookingId) {
    const { bookings } = await import("../drizzle/schema");
    const [b] = await db.select({ status: bookings.status, clashFlaggedAt: bookings.clashFlaggedAt }).from(bookings)
      .where(and(eq(bookings.id, row.bookingId), eq(bookings.ownerId, row.ownerId))).limit(1);
    if (!b || b.status === "cancelled") return false;
    // Only a clash VenueFlow found sets the flag; a NowBookIt refusal (nbi_409:) never does.
    return (row.dedupeKey ?? "").startsWith("double_booking:") ? !!b.clashFlaggedAt : true;
  }
  if (!row.leadId) return true;
  if (row.kind === "proposal_stalled") {
    const proposalId = Number(/^proposal_stalled:(\d+)$/.exec(row.dedupeKey ?? "")?.[1]);
    const { leads, proposals } = await import("../drizzle/schema");
    const [lead] = await db.select({ status: leads.status }).from(leads).where(and(eq(leads.id, row.leadId), eq(leads.ownerId, row.ownerId))).limit(1);
    if (lead?.status !== "proposal_sent") return false;
    if (!proposalId) return true;
    const [p] = await db.select({ status: proposals.status }).from(proposals).where(and(eq(proposals.id, proposalId), eq(proposals.ownerId, row.ownerId))).limit(1);
    return p?.status === "viewed";
  }
  if (row.kind === "hold_expiring" || row.kind === "hold_lapsed") {
    // The key ends with the hold's end time: an extended or released hold isn't this one.
    const until = Number(/:(\d+)$/.exec(row.dedupeKey ?? "")?.[1]);
    const { leads } = await import("../drizzle/schema");
    const { HOLD_STATUS } = await import("./holds");
    const [lead] = await db.select({ status: leads.status, holdUntil: leads.holdUntil }).from(leads)
      .where(and(eq(leads.id, row.leadId), eq(leads.ownerId, row.ownerId))).limit(1);
    if (!lead || lead.status !== HOLD_STATUS || !lead.holdUntil) return false;
    return !until || new Date(lead.holdUntil).getTime() === until;
  }
  if (row.kind === "partial_enquiry") {
    const { isPartialStillUnfinished } = await import("./partialEnquiries");
    return isPartialStillUnfinished(row.ownerId, row.leadId);
  }
  if (row.kind === "reply_overdue") {
    const { leads } = await import("../drizzle/schema");
    const { isAwaitingFirstReply } = await import("./speedToLead");
    const [lead] = await db.select({
      status: leads.status, source: leads.source, internalNotes: leads.internalNotes,
      createdAt: leads.createdAt, firstResponseAt: leads.firstResponseAt,
    }).from(leads).where(and(eq(leads.id, row.leadId), eq(leads.ownerId, row.ownerId))).limit(1);
    return !!lead && isAwaitingFirstReply(lead);
  }
  return true;
}

export type AlertEmailRetryResult = { sent: number; pending: number; failed: number; skipped: number };

/**
 * One pass of the alert-email retries: every bell alert whose email is due
 * again (a failed try's next time has come, or a run died mid-send and its
 * claim has run out). Exported so tests can run it with their own clock.
 */
export async function retryAlertEmails(now: Date = new Date(), opts: { ownerIds?: number[]; limit?: number } = {}): Promise<AlertEmailRetryResult> {
  const out: AlertEmailRetryResult = { sent: 0, pending: 0, failed: 0, skipped: 0 };
  const db = await getDb();
  if (!db) return out;
  // Written as the partial index's own predicate, so the index is used.
  const due = sql`${venueNotifications.emailStatus} in ('pending', 'sending')`;
  const rows = await db.select({ id: venueNotifications.id }).from(venueNotifications)
    .where(and(
      due, lte(venueNotifications.emailNextAt, now),
      opts.ownerIds ? inArray(venueNotifications.ownerId, opts.ownerIds) : undefined,
    ))
    .orderBy(venueNotifications.emailNextAt)
    .limit(opts.limit ?? 50);
  for (const { id } of rows) {
    try {
      const [row] = await db.update(venueNotifications).set({
        emailStatus: "sending",
        emailAttempts: sql`${venueNotifications.emailAttempts} + 1`,
        emailNextAt: new Date(now.getTime() + EMAIL_SENDING_LEASE_MS),
      }).where(and(eq(venueNotifications.id, id), due, lte(venueNotifications.emailNextAt, now))).returning();
      if (!row) continue; // another run took it
      let status: EmailDeliveryStatus;
      if (row.emailAttempts > VENUE_EMAIL_RETRY.maxAttempts
        || now.getTime() - new Date(row.createdAt).getTime() > VENUE_EMAIL_RETRY.retryForMs) {
        // Out of tries or time (also where a run that died on its last try ends up).
        status = await settleAlertEmail(db, row, "failed");
      } else if (!(await alertStillWanted(db, row))) {
        status = await settleAlertEmail(db, row, "skipped");
      } else {
        status = await sendAlertEmail(db, row, now);
      }
      if (status !== "sending") out[status]++;
    } catch (err) {
      console.error(`[notify] alert email retry for notification ${id} failed (non-fatal):`, err);
    }
  }
  return out;
}

/** Alert-email retries, every 2 minutes. */
export function registerAlertEmailJobs() {
  registerJob("alert-email-retries", 2 * 60_000, async () => { await retryAlertEmails(); });
}

export async function listNotifications(ownerId: number, limit = 30) {
  const db = await getDb();
  if (!db) return [];
  const { desc } = await import("drizzle-orm");
  return db.select().from(venueNotifications)
    .where(eq(venueNotifications.ownerId, ownerId))
    .orderBy(desc(venueNotifications.createdAt), desc(venueNotifications.id))
    .limit(limit);
}

export async function countUnreadNotifications(ownerId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const { isNull, count } = await import("drizzle-orm");
  const [row] = await db.select({ n: count() }).from(venueNotifications)
    .where(and(eq(venueNotifications.ownerId, ownerId), isNull(venueNotifications.readAt)));
  return Number(row?.n ?? 0);
}

/** One alert (id), every unread alert about one enquiry (leadId), or —
 *  with neither — everything unread. */
export async function markNotificationsRead(ownerId: number, id?: number, leadId?: number) {
  const db = await getDb();
  if (!db) return;
  const { isNull } = await import("drizzle-orm");
  const where = id
    ? and(eq(venueNotifications.ownerId, ownerId), eq(venueNotifications.id, id))
    : leadId
      ? and(eq(venueNotifications.ownerId, ownerId), eq(venueNotifications.leadId, leadId), isNull(venueNotifications.readAt))
      : and(eq(venueNotifications.ownerId, ownerId), isNull(venueNotifications.readAt));
  await db.update(venueNotifications).set({ readAt: new Date() }).where(where);
}
