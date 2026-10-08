/**
 * Date holds — "we'll keep Saturday for you until Friday".
 *
 * A lead holds its date while its status is `tentative` and `holdUntil` is in
 * the future. Placing a hold remembers the status it came from
 * (`statusBeforeHold`) so releasing it — by hand, or by the expiry job when
 * the venue's "release holds automatically" setting (autoCancelTentative) is
 * on — puts the lead back where it was and frees the date.
 *
 * The expiry job (registerHoldJobs) runs every 30 minutes:
 *  - a day before expiry it alerts the venue (`hold_expiring`), and emails the
 *    client a reminder only if the venue turned that on (off by default);
 *  - at expiry it releases the hold and alerts the venue (`hold_released`), or,
 *    with auto-release off, just tells the venue the hold has lapsed.
 * Everything it has done is recorded in the DB (cleared holdUntil, a
 * notifyVenue dedupeKey, holdReminderSentAt), so re-runs never repeat.
 */
import { TRPCError } from "@trpc/server";
import { and, eq, isNotNull, lte } from "drizzle-orm";
import { getDb, getLeadById, addLeadActivity } from "./db";
import { leads, venueSettings, type Lead } from "../drizzle/schema";
import { VENUE_TZ, dayBoundsFromYmd, zonedYmd, fmtNzDay, findClashes, assertNoClashes, type Clash } from "./availability";
import { notifyVenue } from "./notify";
import { registerJob } from "./jobs";

export const HOLD_STATUS = "tentative";
const DAY_MS = 86_400_000;
const WARN_BEFORE_MS = 36 * 3600_000;
const LIVE_BOOKED = ["booked", "confirmed", "finished"];

const DEFAULT_STATUS_LABELS: Record<string, string> = {
  new: "New Enquiry", contacted: "Contacted", proposal_sent: "Proposal Sent", negotiating: "Negotiating",
  tentative: "On Hold", booked: "Confirmed", finished: "Finished", lost: "Lost", cancelled: "Cancelled",
};

export function statusLabel(key: string, customStatuses?: string | null): string {
  try {
    const list = customStatuses ? JSON.parse(customStatuses) : null;
    const hit = Array.isArray(list) ? list.find((s: any) => s?.key === key) : null;
    if (hit?.label) return String(hit.label);
  } catch { /* fall through */ }
  return DEFAULT_STATUS_LABELS[key] ?? key.replace(/_/g, " ");
}

/** The instant a hold "until Fri 17 Oct" ends: the last second of that NZ day. */
export function holdUntilFromYmd(ymd: string): Date {
  return new Date(dayBoundsFromYmd(ymd).end.getTime() - 1000);
}

/** "YYYY-MM-DD", `days` NZ calendar days after `now`. */
export function ymdInDays(now: Date, days: number): string {
  return zonedYmd(new Date(dayBoundsFromYmd(zonedYmd(now)).start.getTime() + days * DAY_MS + 12 * 3600_000));
}

/** Where a released hold goes back to. A hold placed on a brand-new enquiry
 *  comes back as "contacted" — someone has clearly spoken to them. */
export function statusAfterRelease(statusBeforeHold: string | null | undefined): string {
  const s = (statusBeforeHold ?? "").trim();
  if (!s || s === HOLD_STATUS || s === "new" || LIVE_BOOKED.includes(s)) return "contacted";
  return s;
}

/** "Saturday 18 October" (client emails use the long month). */
function fmtLongNzDate(d: Date): string {
  return new Intl.DateTimeFormat("en-NZ", { timeZone: VENUE_TZ, weekday: "long", day: "numeric", month: "long" })
    .format(d).replace(",", "");
}

async function venueRow(ownerId: number) {
  const db = await getDb();
  if (!db) return null;
  const [vs] = await db.select().from(venueSettings).where(eq(venueSettings.ownerId, ownerId)).limit(1);
  return vs ?? null;
}

export function clashSpace(lead: Pick<Lead, "eventDate" | "eventEndDate" | "spaceId" | "spaceName" | "id">) {
  return { start: lead.eventDate!, end: lead.eventEndDate, spaceId: lead.spaceId, spaceName: lead.spaceName, excludeLeadId: lead.id };
}

// ─── Client emails ─────────────────────────────────────────────────────────

export type HoldEmailInput = {
  /** Reminder only: does the hold end today or tomorrow (NZ)? Default tomorrow. */
  ends?: "today" | "tomorrow";
  firstName: string | null;
  venueName: string;
  accent: string;
  eventDate: Date;
  spaceName: string | null;
  eventType: string | null;
  holdUntil: Date;
};

/** Pure: subject/html/text for the "we're holding your date" and reminder emails. */
export function buildHoldEmail(kind: "placed" | "reminder", p: HoldEmailInput, esc: (s: string) => string) {
  const dateLabel = fmtLongNzDate(p.eventDate);
  const untilLabel = fmtLongNzDate(p.holdUntil);
  const space = (p.spaceName ?? "").split(",").map(s => s.trim()).filter(Boolean).join(" and ");
  const where = space ? ` in the ${space}` : "";
  const what = p.eventType ? ` for your ${p.eventType.toLowerCase()}` : "";
  const name = p.firstName?.trim() || "there";
  const lines = kind === "placed"
    ? [
        `We've put a hold on ${dateLabel}${where}${what}. We'll keep the date for you until ${untilLabel}.`,
        `If you'd like to go ahead, just reply to this email before then and we'll lock it in.`,
      ]
    : [
        `Just a reminder that we're holding ${dateLabel}${where} for you until ${p.ends === "today" ? "the end of today" : "tomorrow"}, ${untilLabel}.`,
        `If you'd like to go ahead, reply to this email and we'll lock it in. If your plans have changed, no problem — let us know and we'll free up the date.`,
      ];
  const subject = kind === "placed"
    ? `We're holding ${dateLabel} for you — ${p.venueName}`
    : `Your hold on ${dateLabel} ends ${p.ends ?? "tomorrow"} — ${p.venueName}`;
  const heading = kind === "placed" ? "Your date is on hold" : `Your hold ends ${p.ends ?? "tomorrow"}`;
  const html = `<div style="font-family:Georgia,'Times New Roman',serif;max-width:520px;margin:0 auto;color:#1f2430">
  <div style="background:${p.accent};color:#fff;padding:22px 26px;border-radius:10px 10px 0 0">
    <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;opacity:0.85;font-family:Arial,sans-serif">${esc(p.venueName)}</div>
    <div style="font-size:22px;font-weight:bold;margin-top:4px">${heading}</div>
  </div>
  <div style="background:#fffdf9;border:1px solid #ece3d2;border-top:none;padding:22px 26px;border-radius:0 0 10px 10px">
    <p style="font-size:16px;margin:0 0 12px">Hi ${esc(name)},</p>
    ${lines.map(l => `<p style="font-size:15px;line-height:1.6;margin:0 0 14px">${esc(l)}</p>`).join("\n    ")}
    <p style="font-size:15px;margin:16px 0 0">Warm regards,<br/><strong>${esc(p.venueName)}</strong></p>
  </div>
</div>`;
  const text = `Hi ${name},\n\n${lines.join("\n\n")}\n\nWarm regards,\n${p.venueName}`;
  return { subject, html, text };
}

export type EmailResult = { sent: boolean; reason?: "no_client_email" | "smtp_not_configured" | "send_failed" };

export async function sendHoldEmail(ownerId: number, lead: Lead, kind: "placed" | "reminder", ends?: "today" | "tomorrow"): Promise<EmailResult> {
  if (!lead.email?.trim()) return { sent: false, reason: "no_client_email" };
  if (!lead.eventDate || !lead.holdUntil) return { sent: false, reason: "send_failed" };
  const { buildVenueMailer } = await import("./paymentsEmail");
  const mailer = await buildVenueMailer(ownerId);
  if (!mailer) return { sent: false, reason: "smtp_not_configured" };
  const { escapeHtml } = await import("./sanitizeHtml");
  const vs = mailer.venue;
  const venueName = String(vs?.name ?? mailer.fromName);
  const accent = (vs?.primaryColor && /^#[0-9a-fA-F]{6}$/.test(vs.primaryColor)) ? vs.primaryColor : "#2D4A3E";
  const { subject, html, text } = buildHoldEmail(kind, {
    ends, firstName: lead.firstName, venueName, accent, eventDate: lead.eventDate, spaceName: lead.spaceName,
    eventType: lead.eventType, holdUntil: lead.holdUntil,
  }, (s) => escapeHtml(s));
  const clientName = [lead.firstName, lead.lastName].filter(Boolean).join(" ") || "there";
  try {
    await mailer.transporter.sendMail({
      from: `"${mailer.fromName}" <${mailer.fromEmail}>`,
      to: `"${clientName}" <${lead.email}>`,
      replyTo: mailer.fromEmail,
      subject, html, text,
    });
    return { sent: true };
  } catch (err) {
    console.error(`[holds] ${kind} email for lead ${lead.id} failed`, err);
    return { sent: false, reason: "send_failed" };
  }
}

// ─── Place / extend / release ──────────────────────────────────────────────

function parseYmd(ymd: string, now: Date): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) throw new TRPCError({ code: "BAD_REQUEST", message: "Pick a date for the hold to end." });
  const until = holdUntilFromYmd(ymd);
  if (until.getTime() <= now.getTime()) throw new TRPCError({ code: "BAD_REQUEST", message: "Pick an end date for the hold that's today or later." });
  return until;
}

export async function placeHold(ownerId: number, input: {
  leadId: number; untilYmd: string; note?: string | null; notifyClient?: boolean; allowClash?: boolean;
}, now: Date = new Date()): Promise<{ holdUntil: Date; clashes: Clash[]; email: EmailResult | null }> {
  const lead = await getLeadById(input.leadId, ownerId);
  if (!lead) throw new TRPCError({ code: "NOT_FOUND", message: "Enquiry not found" });
  if (!lead.eventDate) throw new TRPCError({ code: "BAD_REQUEST", message: "Add an event date before holding it." });
  if (!lead.spaceName?.trim()) throw new TRPCError({ code: "BAD_REQUEST", message: "Pick a space before holding the date." });
  if (LIVE_BOOKED.includes(lead.status)) throw new TRPCError({ code: "BAD_REQUEST", message: "This event is already confirmed — no hold needed." });
  const holdUntil = parseYmd(input.untilYmd, now);
  const clashes = await findClashes(ownerId, clashSpace(lead), now);
  assertNoClashes(clashes, input.allowClash);

  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  const statusBeforeHold = lead.status === HOLD_STATUS ? (lead.statusBeforeHold ?? null) : lead.status;
  await db.update(leads).set({
    status: HOLD_STATUS, holdUntil, holdNote: input.note?.trim() || null, statusBeforeHold,
    holdReminderSentAt: null, updatedAt: now,
  }).where(and(eq(leads.id, lead.id), eq(leads.ownerId, ownerId)));
  const real = clashes.filter(c => c.certainty === "clash");
  await addLeadActivity({
    leadId: lead.id, ownerId, type: "status_change",
    content: `Date held until ${fmtNzDay(holdUntil)}${input.note?.trim() ? ` — ${input.note.trim()}` : ""}`
      + (real.length ? `. Held despite a clash: ${real.map(c => c.summary).join(" ")}` : ""),
  });

  let email: EmailResult | null = null;
  if (input.notifyClient) {
    email = await sendHoldEmail(ownerId, { ...lead, holdUntil }, "placed");
    await addLeadActivity({
      leadId: lead.id, ownerId, type: "email",
      content: email.sent ? `Told ${lead.email} the date is held until ${fmtNzDay(holdUntil)}` : `Hold email not sent (${email.reason?.replace(/_/g, " ")})`,
    });
  }
  return { holdUntil, clashes, email };
}

export async function extendHold(ownerId: number, input: { leadId: number; untilYmd: string }, now: Date = new Date()) {
  const lead = await getLeadById(input.leadId, ownerId);
  if (!lead) throw new TRPCError({ code: "NOT_FOUND", message: "Enquiry not found" });
  if (lead.status !== HOLD_STATUS) throw new TRPCError({ code: "BAD_REQUEST", message: "This enquiry isn't holding a date." });
  const holdUntil = parseYmd(input.untilYmd, now);
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  await db.update(leads).set({ holdUntil, holdReminderSentAt: null, updatedAt: now })
    .where(and(eq(leads.id, lead.id), eq(leads.ownerId, ownerId)));
  await addLeadActivity({ leadId: lead.id, ownerId, type: "status_change", content: `Hold changed — now held until ${fmtNzDay(holdUntil)}` });
  return { holdUntil };
}

/** Free the date: status back to what it was, hold fields cleared. */
export async function releaseHold(ownerId: number, leadId: number, reason: "manual" | "expired", now: Date = new Date()) {
  const lead = await getLeadById(leadId, ownerId);
  if (!lead) throw new TRPCError({ code: "NOT_FOUND", message: "Enquiry not found" });
  if (lead.status !== HOLD_STATUS) throw new TRPCError({ code: "BAD_REQUEST", message: "This enquiry isn't holding a date." });
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  const next = statusAfterRelease(lead.statusBeforeHold);
  // Guard on status (and, for the job, "still expired") so a hold extended a
  // moment ago isn't released by a job run that read the old row.
  const conds = [eq(leads.id, lead.id), eq(leads.ownerId, ownerId), eq(leads.status, HOLD_STATUS)];
  if (reason === "expired") conds.push(lte(leads.holdUntil, now));
  const updated = await db.update(leads).set({
    status: next, holdUntil: null, holdNote: null, statusBeforeHold: null, holdReminderSentAt: null, updatedAt: now,
  }).where(and(...conds)).returning({ id: leads.id });
  if (updated.length === 0) return { released: false, status: lead.status, lead };
  const vs = await venueRow(ownerId);
  const label = statusLabel(next, vs?.customStatuses);
  await addLeadActivity({
    leadId: lead.id, ownerId, type: "status_change",
    content: reason === "expired"
      ? `Hold expired and was released automatically — back to ${label}`
      : `Hold released — back to ${label}`,
  });
  return { released: true, status: next, lead };
}

/**
 * Status-dropdown path: a lead moved to `tentative` without the hold dialog
 * still gets a real hold (default length), so every tentative date expires.
 */
export async function startHoldFromStatusChange(ownerId: number, lead: Lead, now: Date = new Date()): Promise<Date | null> {
  const db = await getDb();
  if (!db) return null;
  const vs = await venueRow(ownerId);
  const days = Math.max(1, Number(vs?.defaultHoldDays ?? 7) || 7);
  const holdUntil = holdUntilFromYmd(ymdInDays(now, days));
  await db.update(leads).set({
    holdUntil,
    statusBeforeHold: lead.status === HOLD_STATUS ? lead.statusBeforeHold : lead.status,
    holdReminderSentAt: null,
  }).where(and(eq(leads.id, lead.id), eq(leads.ownerId, ownerId)));
  await addLeadActivity({ leadId: lead.id, ownerId, type: "status_change", content: `Date held until ${fmtNzDay(holdUntil)}` });
  return holdUntil;
}

/** A lead leaving `tentative` some other way (booked, lost…) ends its hold. */
export async function clearHoldFields(ownerId: number, leadIds: number[]) {
  const db = await getDb();
  if (!db || leadIds.length === 0) return;
  const { inArray } = await import("drizzle-orm");
  await db.update(leads).set({ holdUntil: null, holdNote: null, statusBeforeHold: null, holdReminderSentAt: null })
    .where(and(inArray(leads.id, leadIds), eq(leads.ownerId, ownerId)));
}

// ─── Expiry job ────────────────────────────────────────────────────────────

const fullName = (l: Lead) => [l.firstName, l.lastName].filter(Boolean).join(" ") || "A client";

export async function runHoldExpiryJob(now: Date = new Date(), opts: { ownerId?: number } = {}): Promise<{ expiring: number; released: number; lapsed: number; reminded: number }> {
  const stats = { expiring: 0, released: 0, lapsed: 0, reminded: 0 };
  const db = await getDb();
  if (!db) return stats;
  const rows = await db.select().from(leads).where(and(
    eq(leads.status, HOLD_STATUS), isNotNull(leads.holdUntil),
    opts.ownerId ? eq(leads.ownerId, opts.ownerId) : undefined,
  ));
  const settings = new Map<number, Awaited<ReturnType<typeof venueRow>>>();
  for (const lead of rows) {
    try {
      if (!settings.has(lead.ownerId)) settings.set(lead.ownerId, await venueRow(lead.ownerId));
      const vs = settings.get(lead.ownerId);
      const until = lead.holdUntil!;
      const when = lead.eventDate ? fmtNzDay(lead.eventDate) : "their date";
      const who = fullName(lead);
      const space = lead.spaceName ? ` (${lead.spaceName})` : "";
      const msLeft = until.getTime() - now.getTime();

      // "A day before": from midday the day before a hold's last day (holds
      // run to the end of an NZ day), so the alert lands in working hours.
      if (msLeft > 0 && msLeft <= WARN_BEFORE_MS) {
        const ends = zonedYmd(until) === zonedYmd(now) ? "today" : "tomorrow";
        const n = await notifyVenue(lead.ownerId, {
          kind: "hold_expiring",
          title: `Hold ends ${ends}: ${who}, ${when}`,
          body: `${who}'s hold on ${when}${space} ends ${ends} (${fmtNzDay(until)}). Confirm the booking, extend the hold, or let it go.`,
          leadId: lead.id,
          dedupeKey: `hold_expiring:${lead.id}:${until.getTime()}`,
        });
        if (n.created) stats.expiring++;
        if ((vs?.holdClientReminderEnabled ?? 0) === 1 && !lead.holdReminderSentAt) {
          const r = await sendHoldEmail(lead.ownerId, lead, "reminder", ends);
          if (r.sent) {
            stats.reminded++;
            await db.update(leads).set({ holdReminderSentAt: now }).where(eq(leads.id, lead.id));
            await addLeadActivity({ leadId: lead.id, ownerId: lead.ownerId, type: "email", content: `Reminded ${lead.email} their hold ends ${fmtNzDay(until)}` });
          }
        }
        continue;
      }

      if (msLeft <= 0) {
        const autoRelease = (vs?.autoCancelTentative ?? 1) === 1;
        if (autoRelease) {
          const r = await releaseHold(lead.ownerId, lead.id, "expired", now);
          if (!r.released) continue;
          stats.released++;
          await notifyVenue(lead.ownerId, {
            kind: "hold_released",
            title: `Hold released: ${who}, ${when}`,
            body: `The hold on ${when}${space} ran out on ${fmtNzDay(until)}, so the date is free again. ${lead.firstName || "The enquiry"} is back in ${statusLabel(r.status, vs?.customStatuses)}.`,
            leadId: lead.id,
            dedupeKey: `hold_released:${lead.id}:${until.getTime()}`,
          });
        } else {
          const n = await notifyVenue(lead.ownerId, {
            kind: "hold_lapsed",
            title: `Hold lapsed: ${who}, ${when}`,
            body: `The hold on ${when}${space} ran out on ${fmtNzDay(until)}. The date is no longer protected — extend the hold, confirm the booking, or release it.`,
            leadId: lead.id,
            dedupeKey: `hold_lapsed:${lead.id}:${until.getTime()}`,
          });
          if (n.created) stats.lapsed++;
        }
      }
    } catch (err) {
      console.error(`[holds] expiry job failed for lead ${lead.id} (continuing):`, err);
    }
  }
  return stats;
}

export function registerHoldJobs() {
  registerJob("hold-expiry", 30 * 60_000, async () => {
    const s = await runHoldExpiryJob();
    if (s.expiring || s.released || s.lapsed || s.reminded) console.log("[holds] expiry job:", s);
  });
}

/**
 * proposals.respond → accepted. Runs after the booking is created: checks the
 * date for clashes (never blocks the client — flags the booking and alerts the
 * venue instead) and ends any hold the lead had. Never throws.
 */
export async function afterProposalAccepted(ownerId: number, bookingId: number, leadId: number) {
  const { flagClashOnAccept } = await import("./availability");
  const clashes = await flagClashOnAccept(ownerId, bookingId);
  try { await clearHoldFields(ownerId, [leadId]); } catch (err) { console.error("[holds] clear after accept failed:", err); }
  return clashes;
}
