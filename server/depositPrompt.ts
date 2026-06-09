/**
 * Deposit-prompt notification.
 *
 * Fires whenever an event is CONFIRMED — i.e. a lead is moved to "booked",
 * a proposal is accepted, or a booking is set to "confirmed". Emails the
 * venue's events manager a reminder to send that client their deposit
 * request, with the event details and a deep link to the booking.
 *
 * Recipient: the DEPOSIT_PROMPT_EMAIL env var if set, otherwise
 * anamaria@barfranco.nz (Bar Franco's events manager). Multiple addresses
 * may be comma/semicolon separated.
 *
 * Never throws — any failure is logged so it can't break the confirm flow.
 */
import { getDb } from "./db";
import { bookings, venueSettings, leads, contacts } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";

function fmtCurrency(v: string | number | null | undefined): string | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!isFinite(n) || n <= 0) return null;
  return `$${n.toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export async function sendDepositPromptEmail(
  bookingId: number,
  ownerId: number,
  opts: { source: string } = { source: "unknown" }
): Promise<{ sent: boolean; reason?: string }> {
  try {
    const db = await getDb();
    if (!db) return { sent: false, reason: "db_unavailable" };

    const [booking] = await db.select().from(bookings)
      .where(and(eq(bookings.id, bookingId), eq(bookings.ownerId, ownerId))).limit(1);
    if (!booking) return { sent: false, reason: "booking_not_found" };

    // If the deposit is already recorded as paid, there's nothing to chase.
    if ((booking as any).depositPaid) {
      console.log(`[DepositPrompt:${opts.source}] booking ${bookingId} — deposit already paid, skip`);
      return { sent: false, reason: "already_paid" };
    }

    const [vs] = await db.select().from(venueSettings).where(eq(venueSettings.ownerId, ownerId)).limit(1);
    if (!vs?.smtpHost || !vs?.smtpUser || !vs?.smtpPass) {
      console.log(`[DepositPrompt:${opts.source}] booking ${bookingId} — SMTP not configured, skip`);
      return { sent: false, reason: "smtp_not_configured" };
    }

    const to = (process.env.DEPOSIT_PROMPT_EMAIL || "anamaria@barfranco.nz").trim();

    // Enrich client phone/email from the linked contact / lead for convenience.
    let clientPhone = "";
    let clientEmail = booking.email ?? "";
    if ((booking as any).contactId) {
      const [c] = await db.select().from(contacts).where(eq(contacts.id, (booking as any).contactId)).limit(1);
      if (c) { clientPhone = (c as any).phone ?? ""; if (!clientEmail) clientEmail = (c as any).email ?? ""; }
    }
    if ((!clientPhone || !clientEmail) && booking.leadId) {
      const [l] = await db.select().from(leads).where(eq(leads.id, booking.leadId)).limit(1);
      if (l) { if (!clientPhone) clientPhone = (l as any).phone ?? ""; if (!clientEmail) clientEmail = (l as any).email ?? clientEmail; }
    }

    const clientName = `${booking.firstName ?? ""}${booking.lastName ? " " + booking.lastName : ""}`.trim() || "Client";
    const tz = vs.timezone || "Pacific/Auckland";
    const dateObj = booking.eventDate ? new Date(booking.eventDate) : null;
    const dateLong = dateObj
      ? new Intl.DateTimeFormat("en-NZ", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: tz }).format(dateObj)
      : "—";
    const dateShort = dateObj
      ? new Intl.DateTimeFormat("en-NZ", { day: "numeric", month: "short", timeZone: tz }).format(dateObj)
      : "";
    const deposit = fmtCurrency((booking as any).depositNzd);
    const total = fmtCurrency((booking as any).totalNzd);
    const base = (process.env.PUBLIC_BASE_URL || "https://venueflowhq.com").replace(/\/$/, "");
    const link = `${base}/event/${bookingId}`;

    const esc = (s: any) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const rowData: Array<[string, string] | null> = [
      ["Client", esc(clientName)],
      ["Date", esc(dateLong)],
      booking.eventType ? ["Event", esc(booking.eventType)] : null,
      booking.guestCount ? ["Guests", String(booking.guestCount)] : null,
      booking.spaceName ? ["Space", esc(booking.spaceName)] : null,
      clientEmail ? ["Client email", esc(clientEmail)] : null,
      clientPhone ? ["Client phone", esc(clientPhone)] : null,
      deposit ? ["Deposit due", deposit] : null,
      total ? ["Total", total] : null,
    ];
    const rows = rowData.filter((r): r is [string, string] => r !== null).map(([k, v]) =>
      `<tr><td style="padding:5px 0;color:#666;font-size:14px;width:120px;vertical-align:top">${k}</td><td style="padding:5px 0;font-size:14px;font-weight:600">${v}</td></tr>`
    ).join("");

    const depositLine = deposit
      ? `This event is confirmed. Please send <strong>${esc(clientName)}</strong> their deposit request for <strong>${deposit}</strong> to lock in the date.`
      : `This event is confirmed. Please send <strong>${esc(clientName)}</strong> their deposit request to lock in the date.`;

    const html = `<div style="font-family:sans-serif;max-width:520px;margin:0 auto">
  <div style="background:#16a34a;color:#fff;padding:20px 24px;border-radius:8px 8px 0 0">
    <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;opacity:0.85">${esc(vs.name ?? "VenueFlowHQ")}</div>
    <div style="font-size:22px;font-weight:bold;margin-top:4px">✅ Event Confirmed — Send Deposit</div>
    <div style="font-size:15px;opacity:0.9;margin-top:2px">${esc(clientName)}${dateShort ? " · " + dateShort : ""}</div>
  </div>
  <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;padding:20px 24px;border-radius:0 0 8px 8px">
    <p style="font-size:15px;margin:0 0 14px;line-height:1.5">${depositLine}</p>
    <table style="width:100%;border-collapse:collapse">${rows}</table>
    <div style="margin-top:18px">
      <a href="${link}" style="display:inline-block;background:#16a34a;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 18px;border-radius:6px">Open this event</a>
    </div>
    <div style="margin-top:16px;padding-top:16px;border-top:1px solid #f3f4f6;font-size:12px;color:#9ca3af">
      Automatic reminder from VenueFlowHQ — sent because this event was just confirmed.
    </div>
  </div>
</div>`;

    const text = `Event confirmed — send deposit\n\n${clientName}\nDate: ${dateLong}\n`
      + `${booking.eventType ? "Event: " + booking.eventType + "\n" : ""}`
      + `${booking.guestCount ? "Guests: " + booking.guestCount + "\n" : ""}`
      + `${booking.spaceName ? "Space: " + booking.spaceName + "\n" : ""}`
      + `${deposit ? "Deposit due: " + deposit + "\n" : ""}`
      + `${clientEmail ? "Client email: " + clientEmail + "\n" : ""}`
      + `${clientPhone ? "Client phone: " + clientPhone + "\n" : ""}`
      + `\nOpen this event: ${link}`;

    const nodemailer = await import("nodemailer");
    const port = vs.smtpPort ?? 587;
    const secure = (vs.smtpSecure ?? 0) === 1 || port === 465;
    const transporter = nodemailer.default.createTransport({
      host: vs.smtpHost,
      port,
      secure,
      auth: { user: vs.smtpUser, pass: vs.smtpPass },
      tls: { rejectUnauthorized: false },
    } as any);
    const fromName = vs.smtpFromName ?? vs.name ?? "VenueFlowHQ";
    const fromEmail = vs.smtpFromEmail ?? vs.smtpUser;
    const recipients = to.split(/[,;]+/).map(s => s.trim()).filter(Boolean);

    await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to: recipients,
      replyTo: clientEmail || fromEmail,
      subject: `💰 Deposit to send — ${clientName}${dateShort ? " · " + dateShort : ""}`,
      html,
      text,
    });
    console.log(`[DepositPrompt:${opts.source}] booking ${bookingId} — sent to ${recipients.join(", ")}`);
    return { sent: true };
  } catch (err: any) {
    console.error(`[DepositPrompt:${opts.source}] booking ${bookingId} failed:`, err?.message ?? err);
    return { sent: false, reason: "exception" };
  }
}
