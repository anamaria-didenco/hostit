/**
 * Tell the venue something happened that needs a human — a proposal was
 * opened / accepted / declined, an enquiry has waited too long for a reply,
 * a date hold is about to lapse, a client replied.
 *
 * Every alert lands in the in-app bell (venue_notifications) and, unless
 * `email: false`, is also emailed to the venue's notificationEmail through
 * their own SMTP. Pass a `dedupeKey` from scheduled jobs so a re-run never
 * repeats an alert.
 *
 * Never throws: an alert failing must not break the action that caused it.
 */
import { and, eq } from "drizzle-orm";
import { getDb } from "./db";
import { venueNotifications, venueSettings } from "../drizzle/schema";
import { buildVenueMailer } from "./paymentsEmail";
import { escapeHtml } from "./sanitizeHtml";
import { publicBaseUrl } from "./publicUrl";

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

export async function notifyVenue(ownerId: number, alert: VenueAlert): Promise<{ created: boolean; emailed: boolean }> {
  const result = { created: false, emailed: false };
  try {
    const db = await getDb();
    if (!db) return result;
    const link = alert.link ?? (alert.leadId ? leadLink(alert.leadId) : alert.bookingId ? bookingLink(alert.bookingId) : null);
    const inserted = await db.insert(venueNotifications).values({
      ownerId,
      kind: alert.kind.slice(0, 40),
      title: alert.title.slice(0, 255),
      body: alert.body ?? null,
      leadId: alert.leadId ?? null,
      bookingId: alert.bookingId ?? null,
      link,
      dedupeKey: alert.dedupeKey ?? null,
    }).onConflictDoNothing().returning({ id: venueNotifications.id });
    // A dedupe hit means this alert already went out — don't email it again.
    if (inserted.length === 0) return result;
    result.created = true;

    if (alert.email === false) return result;
    const [vs] = await db.select({ notificationEmail: venueSettings.notificationEmail })
      .from(venueSettings).where(eq(venueSettings.ownerId, ownerId)).limit(1);
    const to = vs?.notificationEmail?.trim();
    if (!to) return result;
    const mailer = await buildVenueMailer(ownerId);
    if (!mailer) return result;
    const url = link ? `${publicBaseUrl()}${link}` : publicBaseUrl();
    const bodyHtml = alert.body
      ? `<p style="font-size:15px;line-height:1.5;margin:0 0 16px;white-space:pre-line">${escapeHtml(alert.body)}</p>`
      : "";
    await mailer.transporter.sendMail({
      from: `"VenueFlowHQ" <${mailer.fromEmail}>`,
      to,
      subject: alert.title,
      html: `<div style="font-family:sans-serif;max-width:520px"><div style="background:#2d3a2e;color:#fffdf9;padding:18px 22px;border-radius:8px 8px 0 0"><div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;opacity:0.8">VenueFlowHQ</div><div style="font-size:18px;font-weight:bold;margin-top:4px">${escapeHtml(alert.title)}</div></div><div style="background:#fff;border:1px solid #e5e7eb;border-top:none;padding:20px 22px;border-radius:0 0 8px 8px">${bodyHtml}<a href="${escapeHtml(url)}" style="background:#2d3a2e;color:#fffdf9;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block">Open in VenueFlow</a></div></div>`,
      text: `${alert.title}\n\n${alert.body ?? ""}\n\n${url}`,
    });
    result.emailed = true;
  } catch (err) {
    console.error(`[notify] ${alert.kind} for owner ${ownerId} failed (non-fatal):`, err);
  }
  return result;
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

export async function markNotificationsRead(ownerId: number, id?: number) {
  const db = await getDb();
  if (!db) return;
  const { isNull } = await import("drizzle-orm");
  const where = id
    ? and(eq(venueNotifications.ownerId, ownerId), eq(venueNotifications.id, id))
    : and(eq(venueNotifications.ownerId, ownerId), isNull(venueNotifications.readAt));
  await db.update(venueNotifications).set({ readAt: new Date() }).where(where);
}
