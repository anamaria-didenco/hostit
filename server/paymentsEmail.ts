/**
 * Shared helpers for the owner-triggered client payment emails (deposit
 * requests and payment receipts). Mirrors the SMTP setup used by the proposal
 * send so all client email goes out the same way (venue's own SMTP, never a
 * shared sender).
 */
import { smtpTls } from "./smtpTls";
import { publicBaseUrl } from "./publicUrl";

/** The app's public base URL, for building client-facing links. */
export function appBaseUrl(): string {
  return publicBaseUrl();
}

/**
 * Build a nodemailer transporter from the owner's venue SMTP settings, or null
 * when SMTP isn't configured (so callers can report "not configured" instead of
 * throwing). Also returns the from name/email and the venue row.
 */
export async function buildVenueMailer(ownerId: number): Promise<
  | { transporter: any; fromName: string; fromEmail: string; venue: any }
  | null
> {
  const { getDb } = await import("./db");
  const { venueSettings } = await import("../drizzle/schema");
  const { eq } = await import("drizzle-orm");
  const db = await getDb();
  if (!db) return null;
  const [vs] = await db.select().from(venueSettings).where(eq(venueSettings.ownerId, ownerId)).limit(1);
  if (!vs?.smtpHost || !vs?.smtpUser || !vs?.smtpPass) return null;
  const nodemailer = await import("nodemailer");
  const transporter = nodemailer.default.createTransport({
    host: vs.smtpHost,
    port: vs.smtpPort ?? 587,
    secure: (vs.smtpSecure ?? 0) === 1 || (vs.smtpPort ?? 587) === 465,
    auth: { user: vs.smtpUser, pass: vs.smtpPass },
    tls: smtpTls(),
  });
  const fromName = (vs.smtpFromName ?? vs.name ?? "VenueFlowHQ") as string;
  const fromEmail = (vs.smtpFromEmail ?? vs.smtpUser) as string;
  return { transporter, fromName, fromEmail, venue: vs };
}

export const fmtNzd = (n: number): string =>
  `$${Number(n ?? 0).toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Find a live client-portal link for a booking, if one exists (for "track your
 *  balance" links in the emails). Does not create one. */
export async function findPortalUrl(ownerId: number, bookingId: number): Promise<string | null> {
  const { getDb } = await import("./db");
  const { clientPortalTokens } = await import("../drizzle/schema");
  const { eq, and, desc } = await import("drizzle-orm");
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select({ token: clientPortalTokens.token })
    .from(clientPortalTokens)
    .where(and(eq(clientPortalTokens.ownerId, ownerId), eq(clientPortalTokens.bookingId, bookingId)))
    .orderBy(desc(clientPortalTokens.createdAt))
    .limit(1);
  const base = appBaseUrl();
  return row?.token && base ? `${base}/portal/${row.token}` : null;
}
