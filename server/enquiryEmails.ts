/**
 * A finished enquiry's two emails: "New Event Enquiry" to the venue (kind
 * "venue") and the visitor's "we've got your enquiry" (kind "auto_reply").
 *
 * leads.submit used to send both inside the request, one after the other,
 * with nodemailer's default timeouts, so a slow mail server kept the visitor
 * on "SUBMITTING…" for a minute or more, and a refused venue email was tried
 * once and never again. Now submit queues one enquiry_emails row per kind
 * (the unique index means a lead can never queue a second), answers the
 * visitor, and only then sends them, each on its own. A failed send is tried
 * again with growing gaps (shared/emailDelivery.ts) by the enquiry-emails
 * job; when the venue's email finally gives up, a bell row says so.
 *
 * Both emails are built from the stored lead, not from the request, so a
 * retry an hour later sends the same thing.
 */
import { and, desc, eq, gte, inArray, isNull, lt, lte, ne, sql } from "drizzle-orm";
import { getDb, addLeadActivity, getLeadById } from "./db";
import { bookings, enquiryEmails, leads, venueNotifications, venueSettings, type EnquiryEmail, type Lead, type VenueSettings } from "../drizzle/schema";
import { buildVenueMailer } from "./paymentsEmail";
import { registerJob } from "./jobs";
import { venueTimeZone } from "./enquiryForm";
import { escapeHtml as esc } from "./sanitizeHtml";
import { eventFormatLabel, budgetRangeLabel } from "@shared/formFields";
import { formatEventDate } from "@shared/eventDate";
import { venueDayWindow, wallDateKeyInTz } from "@shared/enquiryWallTime";
import { POSSIBLE_SPAM_NOTE, partialAlertDedupeKey } from "@shared/leadConstants";
import {
  AUTO_REPLY_RETRY, EMAIL_SENDING_LEASE_MS, VENUE_EMAIL_RETRY, describeSmtpError, nextEmailAttemptAt,
  type EmailDeliveryStatus,
} from "@shared/emailDelivery";

export type EnquiryEmailKind = "venue" | "auto_reply";

/** What the success screen may promise about the visitor's copy. */
export type AutoReplyNote = "sent" | "sending" | "none";

const DAY_MS = 24 * 3_600_000;

// ─── Queueing (inside leads.submit, before the reply) ────────────────────────

type QueueSettings = Pick<VenueSettings, "notificationEmail" | "smtpHost" | "smtpUser" | "smtpPass" | "enquiryAutoReplyEnabled">;

const smtpReady = (vs: QueueSettings | null | undefined) => !!(vs?.smtpHost && vs?.smtpUser && vs?.smtpPass);

/**
 * Queue both emails for a saved enquiry: "pending" when it can be sent,
 * "skipped" when the venue has no notification address or no SMTP, or the
 * auto-reply is switched off. A lead that already has its rows keeps them
 * (a repeated SUBMIT never queues a second email). Returns each row's status.
 */
export async function queueEnquiryEmails(
  lead: Pick<Lead, "id" | "ownerId" | "email">,
  vs: QueueSettings | null | undefined,
  now: Date = new Date(),
): Promise<Record<EnquiryEmailKind, EmailDeliveryStatus>> {
  const db = await getDb();
  if (!db) return { venue: "skipped", auto_reply: "skipped" };
  const venueOk = !!vs?.notificationEmail?.trim() && smtpReady(vs);
  if (!venueOk) {
    const missing = [];
    if (!vs?.notificationEmail) missing.push("notificationEmail");
    if (!vs?.smtpHost) missing.push("smtpHost");
    if (!vs?.smtpUser) missing.push("smtpUser");
    if (!vs?.smtpPass) missing.push("smtpPass");
    if (missing.length) console.log(`[LeadSubmit] Notification email skipped — missing settings: ${missing.join(", ")}`);
  }
  const autoReplyOn = (vs?.enquiryAutoReplyEnabled ?? 1) !== 0;
  const autoOk = autoReplyOn && smtpReady(vs) && !!lead.email?.trim();
  const row = (kind: EnquiryEmailKind, ok: boolean) => ({
    ownerId: lead.ownerId, leadId: lead.id, kind, status: ok ? "pending" : "skipped",
    nextAttemptAt: now, createdAt: now, updatedAt: now,
  });
  await db.insert(enquiryEmails).values([row("venue", venueOk), row("auto_reply", autoOk)]).onConflictDoNothing();
  const rows = await db.select({ kind: enquiryEmails.kind, status: enquiryEmails.status }).from(enquiryEmails).where(eq(enquiryEmails.leadId, lead.id));
  const status = (kind: EnquiryEmailKind) => (rows.find(r => r.kind === kind)?.status ?? "skipped") as EmailDeliveryStatus;
  return { venue: status("venue"), auto_reply: status("auto_reply") };
}

/**
 * What the success screen may say about the visitor's copy of a fresh
 * enquiry. Nothing has been sent when submit answers, so it is "sending" at
 * best, and only while the venue's mail is working: when the venue's last
 * auto-reply in the past day failed for good, the form promises nothing.
 */
export async function promisedAutoReply(ownerId: number, leadId: number, queued: EmailDeliveryStatus, now: Date = new Date()): Promise<AutoReplyNote> {
  if (queued !== "pending") return "none";
  const db = await getDb();
  if (!db) return "none";
  const [latest] = await db.select({ status: enquiryEmails.status }).from(enquiryEmails)
    .where(and(
      eq(enquiryEmails.ownerId, ownerId), eq(enquiryEmails.kind, "auto_reply"), ne(enquiryEmails.leadId, leadId),
      inArray(enquiryEmails.status, ["sent", "failed"]), gte(enquiryEmails.updatedAt, new Date(now.getTime() - DAY_MS)),
    ))
    .orderBy(desc(enquiryEmails.updatedAt))
    .limit(1);
  return latest?.status === "failed" ? "none" : "sending";
}

/** For a repeated SUBMIT: what became of this enquiry's auto-reply so far. */
export async function autoReplyNoteFor(leadId: number): Promise<AutoReplyNote> {
  const db = await getDb();
  if (!db) return "none";
  const [row] = await db.select({ status: enquiryEmails.status }).from(enquiryEmails)
    .where(and(eq(enquiryEmails.leadId, leadId), eq(enquiryEmails.kind, "auto_reply"))).limit(1);
  if (row?.status === "sent") return "sent";
  if (row?.status === "pending" || row?.status === "sending") return "sending";
  return "none";
}

/**
 * Finishing a partial the venue was already told was unfinished: that bell
 * row is marked read, so it doesn't sit there saying they gave up. Only that
 * row (by its dedupe key), never the new enquiry's own. Its time goes into
 * the venue's email (see buildVenueEnquiryEmail).
 */
export async function markPartialAlertRead(ownerId: number, leadId: number, now: Date = new Date()): Promise<Date | null> {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.update(venueNotifications).set({ readAt: now })
    .where(and(eq(venueNotifications.ownerId, ownerId), eq(venueNotifications.dedupeKey, partialAlertDedupeKey(leadId)), isNull(venueNotifications.readAt)))
    .returning({ createdAt: venueNotifications.createdAt });
  return row?.createdAt ?? null;
}

// ─── Building the emails (from the stored lead) ──────────────────────────────

type Built = { to: string | string[]; replyTo: string; fromName: string; subject: string; html: string; text: string; attachments?: Array<{ filename: string; content: Buffer; contentType: string; cid: string }> };

/** "8:56 pm", or "Tuesday 3 March at 8:56 pm" when it wasn't today, in the venue's zone. */
function alertTimeText(at: Date, tz: string, now: Date): string {
  const time = new Intl.DateTimeFormat("en-NZ", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true }).format(at);
  if (wallDateKeyInTz(at, tz) === wallDateKeyInTz(now, tz)) return time;
  const day = new Intl.DateTimeFormat("en-NZ", { timeZone: tz, weekday: "long", day: "numeric", month: "long" }).format(at).replace(",", "");
  return `${day} at ${time}`;
}

/** The New Event Enquiry email to the venue (moved here from leads.submit). */
export async function buildVenueEnquiryEmail(lead: Lead, vs: VenueSettings, opts: { fromEmail: string; now?: Date }): Promise<Built> {
  const db = (await getDb())!;
  const now = opts.now ?? new Date();
  const tz = venueTimeZone(vs);
  const fromName = 'VenueFlowHQ';
  const fromEmail = opts.fromEmail;
  const clientName = [lead.firstName, lead.lastName].filter(Boolean).join(' ');
  // Format event date as "Saturday 12 April 2026", on the venue's calendar.
  const formattedEventDate = lead.eventDate
    ? formatEventDate(lead.eventDate, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }, tz)
    : null;

  // Check for existing bookings/leads on the same event date: the venue's
  // whole day (the server's own day is UTC, which missed same-day lunches
  // and listed the next morning).
  let existingOnDayHtml = '';
  const day = lead.eventDate ? venueDayWindow(lead.eventDate, tz) : null;
  if (day) {
    try {
      const [existingBookings, existingLeads] = await Promise.all([
        db.select().from(bookings).where(
          and(eq(bookings.ownerId, lead.ownerId), gte(bookings.eventDate, day.start), lt(bookings.eventDate, day.end))
        ),
        db.select().from(leads).where(
          and(eq(leads.ownerId, lead.ownerId), gte(leads.eventDate as any, day.start), lt(leads.eventDate as any, day.end))
        ),
      ]);
      // Build a lookup from status key → custom label using venue's stored customStatuses
      const customStatusLabels: Record<string, string> = {};
      try {
        const rawStatuses = vs.customStatuses ? JSON.parse(vs.customStatuses as string) : [];
        for (const s of rawStatuses) customStatusLabels[s.key] = s.label;
      } catch { /* ignore */ }
      const statusLabel = (s: string) => customStatusLabels[s] ?? s.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
      const statusColor: Record<string, string> = {
        confirmed: '#16a34a', booked: '#16a34a',
        negotiating: '#d97706', tentative: '#d97706',
        proposal_sent: '#f59e0b', function_pack_sent: '#facc15',
        new: '#6b7280', contacted: '#3b82f6',
        cancelled: '#dc2626', lost: '#6b7280',
      };
      const bookingRows = existingBookings
        .filter(b => b.status !== 'cancelled')
        .map(b => `<tr style="border-bottom:1px solid #f3f4f6">
          <td style="padding:5px 8px;font-size:13px">${esc(b.firstName)} ${esc(b.lastName ?? '')}</td>
          <td style="padding:5px 8px;font-size:13px">${esc(b.eventType ?? '—')}</td>
          <td style="padding:5px 8px;font-size:13px">${b.spaceName ? `<span style="color:#6b7280">${esc(b.spaceName)}</span>` : '—'}</td>
          <td style="padding:5px 8px;font-size:13px">${esc(b.guestCount ?? '—')} guests</td>
          <td style="padding:5px 8px;font-size:12px"><span style="background:${statusColor[b.status] ?? '#6b7280'};color:#fff;padding:2px 7px;border-radius:3px;font-weight:600">${esc(statusLabel(b.status))}</span></td>
        </tr>`);
      const leadRows = existingLeads
        .filter((l: any) => l.id !== lead.id && !['lost','cancelled'].includes(l.status))
        .map((l: any) => `<tr style="border-bottom:1px solid #f3f4f6">
          <td style="padding:5px 8px;font-size:13px">${esc(l.firstName)} ${esc(l.lastName ?? '')}</td>
          <td style="padding:5px 8px;font-size:13px">${esc(l.eventType ?? '—')}</td>
          <td style="padding:5px 8px;font-size:13px">${(l as any).spaceName ? `<span style="color:#6b7280">${esc((l as any).spaceName)}</span>` : '—'}</td>
          <td style="padding:5px 8px;font-size:13px">${esc(l.guestCount ?? '—')} guests</td>
          <td style="padding:5px 8px;font-size:12px"><span style="background:${statusColor[l.status] ?? '#6b7280'};color:#fff;padding:2px 7px;border-radius:3px;font-weight:600">${esc(statusLabel(l.status))} (enquiry)</span></td>
        </tr>`);
      const allRows = [...bookingRows, ...leadRows];
      if (allRows.length > 0) {
        existingOnDayHtml = `
        <div style="margin-top:16px;background:#fef3c7;border:1px solid #fbbf24;border-radius:6px;padding:12px 14px">
          <div style="font-size:12px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">⚠ You Already Have ${allRows.length} Event${allRows.length > 1 ? 's' : ''} on This Day</div>
          <table style="width:100%;border-collapse:collapse">
            <thead><tr style="background:#fde68a">
              <th style="padding:4px 8px;font-size:11px;text-align:left;color:#78350f">Name</th>
              <th style="padding:4px 8px;font-size:11px;text-align:left;color:#78350f">Type</th>
              <th style="padding:4px 8px;font-size:11px;text-align:left;color:#78350f">Space / Room</th>
              <th style="padding:4px 8px;font-size:11px;text-align:left;color:#78350f">Guests</th>
              <th style="padding:4px 8px;font-size:11px;text-align:left;color:#78350f">Status</th>
            </tr></thead>
            <tbody>${allRows.join('')}</tbody>
          </table>
        </div>`;
      }
    } catch (checkErr) {
      console.warn('[LeadSubmit] Could not check existing bookings:', checkErr);
    }
  }

  // Lines above the details: this finishes an enquiry the venue was told
  // was unfinished, and/or the form's hidden anti-spam field was filled in.
  const notes: string[] = [];
  const [alerted] = await db.select({ createdAt: venueNotifications.createdAt }).from(venueNotifications)
    .where(and(eq(venueNotifications.ownerId, lead.ownerId), eq(venueNotifications.dedupeKey, partialAlertDedupeKey(lead.id)))).limit(1);
  if (alerted) notes.push(`They finished the enquiry we told you was unfinished at ${alertTimeText(alerted.createdAt, tz, now)}.`);
  if (lead.internalNotes === POSSIBLE_SPAM_NOTE) notes.push("The form's hidden anti-spam field was filled in, so this may not be real. Check it looks genuine before you reply.");
  const notesHtml = notes.map(n => `<div style="margin:0 0 12px;background:#f3f4f6;border-radius:6px;padding:10px 12px;font-size:14px;color:#374151">${esc(n)}</div>`).join('');

  const budget = Number(lead.budget ?? 0);
  const rows = [
    lead.email && `<tr><td style="padding:4px 0;color:#666;font-size:14px;width:130px">Email</td><td style="padding:4px 0;font-size:14px"><a href="mailto:${esc(lead.email)}">${esc(lead.email)}</a></td></tr>`,
    lead.phone && `<tr><td style="padding:4px 0;color:#666;font-size:14px">Phone</td><td style="padding:4px 0;font-size:14px">${esc(lead.phone)}</td></tr>`,
    lead.company && `<tr><td style="padding:4px 0;color:#666;font-size:14px">Company</td><td style="padding:4px 0;font-size:14px">${esc(lead.company)}</td></tr>`,
    lead.eventType && `<tr><td style="padding:4px 0;color:#666;font-size:14px">Event type</td><td style="padding:4px 0;font-size:14px">${esc(lead.eventType)}</td></tr>`,
    formattedEventDate && `<tr><td style="padding:4px 0;color:#666;font-size:14px">Event date</td><td style="padding:4px 0;font-size:14px;font-weight:bold;color:#2D4A3E">${esc(formattedEventDate)}</td></tr>`,
    lead.guestCount && `<tr><td style="padding:4px 0;color:#666;font-size:14px">Guests</td><td style="padding:4px 0;font-size:14px">${esc(lead.guestCount)}</td></tr>`,
    lead.eventFormat && `<tr><td style="padding:4px 0;color:#666;font-size:14px">Format</td><td style="padding:4px 0;font-size:14px">${esc(eventFormatLabel(lead.eventFormat) ?? lead.eventFormat)}</td></tr>`,
    lead.budgetRange && `<tr><td style="padding:4px 0;color:#666;font-size:14px">Budget</td><td style="padding:4px 0;font-size:14px;font-weight:bold;color:#2D4A3E">${esc(budgetRangeLabel(lead.budgetRange) ?? lead.budgetRange)}</td></tr>`,
    budget > 0 && `<tr><td style="padding:4px 0;color:#666;font-size:14px">Budget</td><td style="padding:4px 0;font-size:14px">$${esc(budget)} NZD</td></tr>`,
    lead.message && `<tr><td style="padding:4px 0;color:#666;font-size:14px;vertical-align:top">Message</td><td style="padding:4px 0;font-size:14px">${esc(lead.message)}</td></tr>`,
    // Where the enquiry came from — the UTM trail an embedding site
    // set (or the campaign that drove the click), so the venue can
    // see which page/ad produced it without opening the CRM.
    (() => {
      const bits = [lead.utmSource, lead.utmMedium, lead.utmCampaign].filter(Boolean).map(v => esc(String(v)));
      const label = bits.join(' · ') || (lead.source ? esc(String(lead.source)) : (lead.gclid ? 'Google Ads click' : ''));
      return label ? `<tr><td style="padding:4px 0;color:#666;font-size:14px">Source</td><td style="padding:4px 0;font-size:14px">${label}</td></tr>` : '';
    })(),
  ].filter(Boolean).join('');
  const html = `<div style="font-family:sans-serif;max-width:520px;margin:0 auto">
  <div style="background:#6b98e7;color:#fff;padding:20px 24px;border-radius:8px 8px 0 0">
    <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;opacity:0.8">VenueFlowHQ</div>
    <div style="font-size:22px;font-weight:bold;margin-top:4px">New Enquiry Received</div>
    <div style="font-size:15px;opacity:0.9;margin-top:2px">${esc(clientName)}</div>
  </div>
  <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;padding:20px 24px;border-radius:0 0 8px 8px">
    ${notesHtml}
    <table style="width:100%;border-collapse:collapse">${rows}</table>
    ${existingOnDayHtml}
    <div style="margin-top:16px;padding-top:16px;border-top:1px solid #f3f4f6;font-size:12px;color:#9ca3af">
      This notification was sent by VenueFlowHQ · Log in to your dashboard to respond.
    </div>
  </div>
</div>`;
  // notificationEmail may hold several addresses separated by commas
  // or semicolons (e.g. "owner@venue.nz, events@venue.nz") — send to all.
  const notifyRecipients = String(vs.notificationEmail).split(/[,;]+/).map(s => s.trim()).filter(Boolean);
  return {
    fromName,
    replyTo: lead.email || fromEmail,
    to: notifyRecipients,
    subject: `New Event Enquiry: ${clientName}`,
    html,
    text: `New Enquiry from ${clientName}\n${notes.map(n => n + '\n').join('')}Email: ${lead.email}\n${lead.phone ? 'Phone: ' + lead.phone + '\n' : ''}${lead.eventType ? 'Event type: ' + lead.eventType + '\n' : ''}${formattedEventDate ? 'Event date: ' + formattedEventDate + '\n' : ''}${lead.guestCount ? 'Guests: ' + lead.guestCount + '\n' : ''}${lead.message ? 'Message: ' + lead.message : ''}`,
  };
}

/**
 * The visitor's auto-reply — a branded "we've got it" confirmation so
 * they're not left wondering whether the form worked. A transactional
 * confirmation the enquirer initiated by submitting (like a receipt), on by
 * default and switchable in Settings. (Moved here from leads.submit.)
 */
export async function buildEnquiryAutoReply(lead: Lead, vs: VenueSettings, mailer: { fromName: string; fromEmail: string }): Promise<Built> {
  const { DEFAULT_AUTO_REPLY_INTRO } = await import('../shared/enquiryCopy');
  const { venueBrand } = await import('@shared/brand');
  const tz = venueTimeZone(vs);
  const venueName = String(vs.name ?? mailer.fromName ?? 'our venue');
  // Brand Pack: accent colour, ink-on-accent and the font pairing,
  // so the auto-reply wears the venue's branding like the proposal
  // and BEO — not a generic green serif.
  const brand = venueBrand(vs);
  const accent = brand.accent;
  const onAccent = brand.onAccent;
  const firstName = esc(lead.firstName);
  const introRaw = vs.enquiryAutoReplyMessage?.trim();
  const intro = introRaw ? esc(introRaw) : DEFAULT_AUTO_REPLY_INTRO;
  const fmtDate = lead.eventDate
    ? formatEventDate(lead.eventDate, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }, tz)
    : null;
  // The venue logo, embedded as an inline (CID) image: logos are
  // stored as data: URLs, which Gmail/Outlook block in <img src>.
  // A dark accent gets the same whitening the proposal/BEO use.
  const logoAttachments: Array<{ filename: string; content: Buffer; contentType: string; cid: string }> = [];
  let logoHtml = '';
  const logoRaw = String(vs.logoUrl ?? '');
  const logoStyle = `max-height:46px;max-width:190px;object-fit:contain;display:block;margin-bottom:10px${onAccent === '#fff' ? ';filter:brightness(0) invert(1)' : ''}`;
  const dataM = /^data:([^;]+);base64,(.+)$/s.exec(logoRaw);
  if (dataM) {
    logoAttachments.push({ filename: 'logo', content: Buffer.from(dataM[2], 'base64'), contentType: dataM[1], cid: 'venuelogo' });
    logoHtml = `<img src="cid:venuelogo" alt="${esc(venueName)}" style="${logoStyle}"/>`;
  } else if (/^https?:\/\//.test(logoRaw)) {
    logoHtml = `<img src="${esc(logoRaw)}" alt="${esc(venueName)}" style="${logoStyle}"/>`;
  }
  const details = [
    lead.eventType && `<tr><td style="padding:3px 0;color:#6b7280;font-size:14px;width:120px">Event</td><td style="padding:3px 0;font-size:14px">${esc(lead.eventType)}</td></tr>`,
    fmtDate && `<tr><td style="padding:3px 0;color:#6b7280;font-size:14px">Date</td><td style="padding:3px 0;font-size:14px;font-weight:600">${esc(fmtDate)}${lead.dateFlexible ? ' (flexible)' : ''}</td></tr>`,
    lead.guestCount && `<tr><td style="padding:3px 0;color:#6b7280;font-size:14px">Guests</td><td style="padding:3px 0;font-size:14px">${esc(lead.guestCount)}</td></tr>`,
  ].filter(Boolean).join('');
  const contactBits = [vs.phone && esc(vs.phone), esc(mailer.fromEmail)].filter(Boolean).join(' · ');
  const html = `<div style="font-family:${brand.sans};max-width:520px;margin:0 auto;color:#1f2430">
  <div style="background:${accent};color:${onAccent};padding:22px 26px;border-radius:10px 10px 0 0">
    ${logoHtml}
    <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;opacity:0.85;font-family:${brand.sans}">${esc(venueName)}</div>
    <div style="font-size:23px;font-weight:bold;margin-top:4px;font-family:${brand.serif}">We've got your enquiry</div>
  </div>
  <div style="background:#fffdf9;border:1px solid #ece3d2;border-top:none;padding:22px 26px;border-radius:0 0 10px 10px">
    <p style="font-size:16px;margin:0 0 12px;font-family:${brand.serif}">Hi ${firstName},</p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 ${details ? '16px' : '18px'}">${intro}</p>
    ${details ? `<table style="width:100%;border-collapse:collapse;background:#f7f2e9;border-radius:8px;padding:6px 12px"><tbody>${details}</tbody></table>` : ''}
    <p style="font-size:14px;line-height:1.6;color:#4b5563;margin:18px 0 0">If anything's changed in the meantime, just reply to this email${contactBits ? ` or reach us on ${contactBits}` : ''}.</p>
    <p style="font-size:15px;margin:16px 0 0;font-family:${brand.serif}">Warm regards,<br/><strong>${esc(venueName)}</strong></p>
  </div>
</div>`;
  const text = `Hi ${lead.firstName},\n\n${introRaw || DEFAULT_AUTO_REPLY_INTRO}\n\n${[lead.eventType && `Event: ${lead.eventType}`, fmtDate && `Date: ${fmtDate}`, lead.guestCount && `Guests: ${lead.guestCount}`].filter(Boolean).join('\n')}\n\nWarm regards,\n${venueName}`;
  const subject = `We've received your enquiry — ${venueName}`;
  return {
    fromName: mailer.fromName,
    to: lead.email,
    replyTo: mailer.fromEmail,
    subject,
    html,
    text,
    ...(logoAttachments.length ? { attachments: logoAttachments } : {}),
  };
}

// ─── Sending ─────────────────────────────────────────────────────────────────

/**
 * Claim one row for this run: pending or a lapsed "sending" claim, and due.
 * One conditional UPDATE, so two runs (the send after SUBMIT and the retry
 * job, or two instances during a deploy) never both send it.
 */
async function claimEnquiryEmail(id: number, now: Date): Promise<EnquiryEmail | null> {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.update(enquiryEmails).set({
    status: "sending",
    attempts: sql`${enquiryEmails.attempts} + 1`,
    nextAttemptAt: new Date(now.getTime() + EMAIL_SENDING_LEASE_MS),
    updatedAt: now,
  })
    .where(and(eq(enquiryEmails.id, id), inArray(enquiryEmails.status, ["pending", "sending"]), lte(enquiryEmails.nextAttemptAt, now)))
    .returning();
  return row ?? null;
}

async function settle(id: number, set: Partial<EnquiryEmail>) {
  const db = (await getDb())!;
  await db.update(enquiryEmails).set(set).where(eq(enquiryEmails.id, id));
}

/**
 * Send one queued email now if it is due and nobody else has it. Returns
 * its status afterwards (null when it wasn't this run's to send).
 */
export async function sendEnquiryEmail(id: number, now: Date = new Date()): Promise<EmailDeliveryStatus | null> {
  const row = await claimEnquiryEmail(id, now);
  if (!row) return null;
  const kind = row.kind as EnquiryEmailKind;
  const db = (await getDb())!;
  const lead = await getLeadById(row.leadId, row.ownerId);
  const [vs] = await db.select().from(venueSettings).where(eq(venueSettings.ownerId, row.ownerId)).limit(1);
  // Deleted meanwhile, or email switched off since it was queued.
  const wanted = !!lead && !!vs && (kind === "venue"
    ? !!vs.notificationEmail?.trim()
    : (vs.enquiryAutoReplyEnabled ?? 1) !== 0 && !!lead.email?.trim());
  const mailer = wanted ? await buildVenueMailer(row.ownerId) : null;
  if (!lead || !vs || !mailer) {
    await settle(row.id, { status: "skipped", updatedAt: now });
    return "skipped";
  }
  try {
    const mail = kind === "venue"
      ? await buildVenueEnquiryEmail(lead, vs, { fromEmail: mailer.fromEmail, now })
      : await buildEnquiryAutoReply(lead, vs, mailer);
    await mailer.transporter.sendMail({
      from: `"${mail.fromName}" <${mailer.fromEmail}>`,
      to: mail.to,
      replyTo: mail.replyTo,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      ...(mail.attachments ? { attachments: mail.attachments } : {}),
    });
    await settle(row.id, { status: "sent", sentAt: now, updatedAt: now });
    console.log(`[EnquiryEmail] ${kind} for lead ${lead.id} sent (try ${row.attempts})`);
    if (kind === "auto_reply") {
      // On the lead's timeline, but it isn't a reply from the team —
      // the lead still shows "needs reply".
      await addLeadActivity({
        leadId: lead.id,
        ownerId: lead.ownerId,
        type: 'email',
        content: `Automatic reply sent to ${lead.email}\n\nSubject: ${mail.subject}\n\n${mail.text}`,
      }, { countsAsReply: false });
    }
    return "sent";
  } catch (err) {
    const line = describeSmtpError(err);
    console.error(`[EnquiryEmail] ${kind} for lead ${row.leadId} failed (try ${row.attempts}): ${line}`);
    const next = nextEmailAttemptAt(row.attempts, row.createdAt, now, kind === "venue" ? VENUE_EMAIL_RETRY : AUTO_REPLY_RETRY);
    if (next) {
      await settle(row.id, { status: "pending", nextAttemptAt: next, lastError: line, updatedAt: now });
      return "pending";
    }
    await settle(row.id, { status: "failed", lastError: line, updatedAt: now });
    if (kind === "venue") {
      const { notifyVenue } = await import("./notify");
      const name = [lead.firstName, lead.lastName].filter(Boolean).join(' ') || 'a visitor';
      await notifyVenue(lead.ownerId, {
        kind: "venue_email_failed",
        title: `We couldn't email you about ${name}'s enquiry`,
        body: `Your mail server didn't accept the New Event Enquiry email, after ${row.attempts} tries. The enquiry itself is saved here. The mail server's last answer: ${line}`,
        leadId: lead.id,
        dedupeKey: `venue-email-failed:${lead.id}`,
        email: false,
      });
    }
    return "failed";
  }
}

/** Send both of one enquiry's emails, each on its own: the auto-reply never waits on the venue's. */
export async function sendEnquiryEmailsFor(leadId: number, now: Date = new Date()): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const rows = await db.select({ id: enquiryEmails.id }).from(enquiryEmails)
    .where(and(eq(enquiryEmails.leadId, leadId), inArray(enquiryEmails.status, ["pending", "sending"])));
  await Promise.allSettled(rows.map(r => sendEnquiryEmail(r.id, now)));
}

const inFlight = new Set<Promise<void>>();

/**
 * After SUBMIT has answered: send this enquiry's emails in the background,
 * logged, never thrown. Anything that fails stays queued for the job.
 */
export function sendEnquiryEmailsSoon(leadId: number): void {
  const p: Promise<void> = new Promise<void>(resolve => setImmediate(resolve))
    .then(() => sendEnquiryEmailsFor(leadId))
    .catch(err => { console.error(`[EnquiryEmail] sending for lead ${leadId} failed:`, err?.message ?? err); })
    .finally(() => { inFlight.delete(p); });
  inFlight.add(p);
}

/** Wait for the background sends started so far (tests, and a clean shutdown). */
export async function waitForEnquiryEmails(): Promise<void> {
  while (inFlight.size) await Promise.allSettled([...inFlight]);
}

/**
 * The enquiry-emails job: every email that is due (a retry whose gap has
 * passed, or a "sending" claim that lapsed because a run died mid-send).
 * Returns how many were sent.
 */
export async function runEnquiryEmailRetries(now: Date = new Date()): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  // Same predicate as the partial index (enquiry_emails_due_idx).
  const due = await db.select({ id: enquiryEmails.id }).from(enquiryEmails)
    .where(and(inArray(enquiryEmails.status, ["pending", "sending"]), lte(enquiryEmails.nextAttemptAt, now)))
    .orderBy(enquiryEmails.nextAttemptAt)
    .limit(50);
  let sent = 0;
  for (const r of due) {
    try {
      if ((await sendEnquiryEmail(r.id, now)) === "sent") sent++;
    } catch (err: any) {
      console.error(`[EnquiryEmail] retry of email ${r.id} failed:`, err?.message ?? err);
    }
  }
  return sent;
}

/** Registered in server/backgroundJobs.ts, with the other background jobs. */
export function registerEnquiryEmailJobs() {
  registerJob("enquiry-emails", 2 * 60_000, async () => { await runEnquiryEmailRetries(); });
}
