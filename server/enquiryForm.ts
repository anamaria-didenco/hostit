/**
 * Database-backed side of the public enquiry form's conversion features:
 * the form's public config, the date picker's availability, walkthrough
 * slots + booking, and spam checks (honeypot, timing token, Turnstile).
 *
 * Everything here is reachable without a login, so it returns dates, states
 * and the venue's own published prices only — never a client's name or
 * details. The pure logic it leans on is in enquiryConversion.ts.
 */
import { and, eq, gte, inArray, isNotNull, lt, ne, notInArray, sql } from "drizzle-orm";
import { getDb, addLeadActivity } from "./db";
import { bookings, eventSpaces, leads, tasks, venueSettings } from "../drizzle/schema";
import { ENV } from "./_core/env";
import {
  VENUE_TZ, addDaysToKey, aggregateAvailability, buildIcs, dateKeyInTz, describeWalkthroughRequest, formStartToken,
  formatSlotLabel, looksLikeBot, parseWalkthroughSettings, walkthroughRequestDays, zonedTimeToUtc,
  type Occupancy, type WalkthroughTimeOfDay,
} from "./enquiryConversion";


const num = (v: unknown): number | null => {
  const n = Number(v);
  return v != null && v !== "" && Number.isFinite(n) && n > 0 ? n : null;
};

// ─── Spam ────────────────────────────────────────────────────────────────────

export function turnstileSiteKey(): string | null {
  const site = process.env.TURNSTILE_SITE_KEY?.trim();
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  return site && secret ? site : null;
}

/**
 * Cloudflare Turnstile check — only when both env vars are set; otherwise a
 * no-op. A Cloudflare outage fails open (logged): a lost enquiry costs the
 * venue more than one spam message does.
 */
export async function verifyTurnstile(token: string | null | undefined, ip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret || !turnstileSiteKey()) return true;
  if (!token) return false;
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip && ip !== "unknown") body.set("remoteip", ip);
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST", body, signal: AbortSignal.timeout(5000),
    });
    const json: any = await res.json();
    return json?.success === true;
  } catch (err: any) {
    console.warn("[Turnstile] verify unavailable, allowing:", err?.message ?? err);
    return true;
  }
}

/** Honeypot + timing token. True means: pretend it worked, store nothing. */
export function isBotSubmission(ownerId: number, honeypot?: string | null, formToken?: string | null): boolean {
  const r = looksLikeBot({ honeypot, formToken, ownerId, now: Date.now(), secret: ENV.cookieSecret });
  if (r.bot) console.log(`[EnquirySpam] dropped a submission for owner ${ownerId} (${r.reason})`);
  return r.bot;
}

// ─── Public form config ──────────────────────────────────────────────────────

export async function getPublicFormConfig(ownerId: number) {
  const db = await getDb();
  const base = {
    showAvailability: false,
    walkthroughEnabled: false,
    spaces: [] as Array<{
      id: number; name: string; minCapacity: number | null; maxCapacity: number | null;
      pricing: { minSpend: number | null; minSpendWeekend: number | null; packagesFromPp: number | null } | null;
    }>,
    turnstileSiteKey: turnstileSiteKey(),
    formToken: formStartToken(ownerId, Date.now(), ENV.cookieSecret),
  };
  if (!db) return base;
  const [vs] = await db.select().from(venueSettings).where(eq(venueSettings.ownerId, ownerId)).limit(1);
  const rows = await db.select().from(eventSpaces)
    .where(and(eq(eventSpaces.ownerId, ownerId), eq(eventSpaces.isActive, true)))
    .orderBy(eventSpaces.id);
  return {
    ...base,
    showAvailability: (vs?.showAvailabilityOnForm ?? 1) !== 0,
    walkthroughEnabled: parseWalkthroughSettings(vs).enabled,
    spaces: rows.map(s => {
      const pricing = {
        minSpend: num(s.minSpend), minSpendWeekend: num(s.minSpendWeekend), packagesFromPp: num(s.packagesFromPp),
      };
      const hasPricing = pricing.minSpend != null || pricing.minSpendWeekend != null || pricing.packagesFromPp != null;
      return {
        id: s.id, name: s.name, minCapacity: s.minCapacity, maxCapacity: s.maxCapacity,
        // Prices stay private unless the venue turned this space's switch on.
        pricing: s.showPricingOnForm && hasPricing ? pricing : null,
      };
    }),
  };
}

// ─── Availability ────────────────────────────────────────────────────────────

/**
 * Active date holds (server/holds.ts): enquiries pencilled in with a
 * holdUntil still in the future. Only the date and space leave here.
 */
async function activeHolds(ownerId: number, from: Date, to: Date): Promise<Occupancy[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select({ at: leads.eventDate, spaceName: leads.spaceName }).from(leads)
    .where(and(
      eq(leads.ownerId, ownerId), eq(leads.status, "tentative"),
      isNotNull(leads.holdUntil), gte(leads.holdUntil, new Date()),
      isNotNull(leads.eventDate), gte(leads.eventDate, from), lt(leads.eventDate, to),
    ));
  return rows.filter((r): r is Occupancy => r.at != null) as Occupancy[];
}

export async function getMonthAvailability(ownerId: number, monthKey: string, spaceId?: number | null) {
  const db = await getDb();
  if (!db) return { enabled: false, booked: [] as string[], limited: [] as string[] };
  const [vs] = await db.select({ show: venueSettings.showAvailabilityOnForm })
    .from(venueSettings).where(eq(venueSettings.ownerId, ownerId)).limit(1);
  if ((vs?.show ?? 1) === 0) return { enabled: false, booked: [], limited: [] };

  const [y, m] = monthKey.split("-").map(Number);
  // The NZ month, padded a day each side; aggregateAvailability re-keys every
  // booking on the NZ calendar and drops anything outside the month.
  const from = new Date(zonedTimeToUtc(y, m, 1, 0, 0, VENUE_TZ)!.getTime() - 86400_000);
  const to = new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 2));
  const spaces = await db.select({ id: eventSpaces.id, name: eventSpaces.name }).from(eventSpaces)
    .where(and(eq(eventSpaces.ownerId, ownerId), eq(eventSpaces.isActive, true)));
  // Confirmed bookings only — and only the date and space ever leave here.
  const confirmed = await db.select({ at: bookings.eventDate, spaceName: bookings.spaceName }).from(bookings)
    .where(and(eq(bookings.ownerId, ownerId), eq(bookings.status, "confirmed"), gte(bookings.eventDate, from), lt(bookings.eventDate, to)));
  const occupancies: Occupancy[] = [...confirmed, ...(await activeHolds(ownerId, from, to))];
  const result = aggregateAvailability({ monthKey, spaces, occupancies, spaceId });
  return { enabled: true, ...result };
}

// ─── Walkthroughs ────────────────────────────────────────────────────────────
// The thank-you screen takes a walkthrough REQUEST (which days and times suit
// the client); staff confirm a real time from the enquiry once they know
// someone will be on site. Nothing here books a time on its own.

/** The days a client can suggest, for the thank-you screen. */
export async function getWalkthroughRequestOptions(ownerId: number) {
  const db = await getDb();
  if (!db) return { enabled: false, days: [] as Array<{ key: string; label: string }> };
  const [vs] = await db.select().from(venueSettings).where(eq(venueSettings.ownerId, ownerId)).limit(1);
  const settings = parseWalkthroughSettings(vs);
  const days = walkthroughRequestDays(new Date(), settings);
  return { enabled: settings.enabled && days.length > 0, days };
}

const TASK_PREFIX_REQUEST = "Arrange a walkthrough with ";
const TASK_PREFIX_CONFIRMED = "Walkthrough with ";

/** One open walkthrough task per lead — created, or updated in place. */
async function upsertWalkthroughTask(ownerId: number, leadId: number, task: { title: string; description: string; dueDate: number }) {
  const db = await getDb();
  if (!db) return;
  const ts = Date.now();
  const [existing] = await db.select({ id: tasks.id }).from(tasks)
    .where(and(
      eq(tasks.ownerId, ownerId), eq(tasks.linkedLeadId, leadId), eq(tasks.completed, false),
      sql`(${tasks.title} LIKE ${TASK_PREFIX_REQUEST + "%"} OR ${tasks.title} LIKE ${TASK_PREFIX_CONFIRMED + "%"})`,
    ))
    .limit(1);
  if (existing) {
    await db.update(tasks).set({ ...task, updatedAt: ts }).where(eq(tasks.id, existing.id));
  } else {
    await db.insert(tasks).values({
      ownerId, ...task, linkedLeadId: leadId, priority: "high", completed: false, createdAt: ts, updatedAt: ts,
    });
  }
}

const personName = (l: { firstName: string; lastName?: string | null }) => `${l.firstName}${l.lastName ? " " + l.lastName : ""}`;

/**
 * Record a client's walkthrough request from the thank-you screen: saved on
 * the lead, a task for the venue to arrange it (due the next day), an
 * activity entry and an alert. The client gets an "we'll be in touch"
 * acknowledgement when the venue's email is set up — never a booking.
 */
export async function requestWalkthrough(
  ownerId: number, leadId: number,
  req: { dates: string[]; timeOfDay: WalkthroughTimeOfDay; note?: string | null },
) {
  const db = await getDb();
  if (!db) throw new Error("Requests aren't available right now — please try again.");
  const [lead] = await db.select().from(leads).where(and(eq(leads.id, leadId), eq(leads.ownerId, ownerId))).limit(1);
  if (!lead) throw new Error("Enquiry not found.");
  const [vs] = await db.select().from(venueSettings).where(eq(venueSettings.ownerId, ownerId)).limit(1);
  // Only days the form actually offered (it's a public endpoint).
  const offered = new Set(walkthroughRequestDays(new Date(), parseWalkthroughSettings(vs)).map(d => d.key));
  const dates = [...new Set(req.dates)].filter(d => offered.has(d)).sort().slice(0, 5);
  const summary = describeWalkthroughRequest({ dates, timeOfDay: req.timeOfDay, note: req.note });
  const now = new Date();
  const changed = !!lead.walkthroughRequest;
  await db.update(leads).set({ walkthroughRequest: summary, walkthroughRequestedAt: now, updatedAt: now })
    .where(and(eq(leads.id, leadId), eq(leads.ownerId, ownerId)));

  const name = personName(lead);
  const about = [lead.eventType, lead.guestCount ? `${lead.guestCount} guests` : null, lead.spaceName].filter(Boolean).join(", ");
  // Due midday tomorrow (NZ), so it shows up as tomorrow's job.
  const tomorrow = addDaysToKey(dateKeyInTz(now), 1).split("-").map(Number);
  const due = zonedTimeToUtc(tomorrow[0], tomorrow[1], tomorrow[2], 12, 0, VENUE_TZ) ?? new Date(now.getTime() + 86400_000);
  await upsertWalkthroughTask(ownerId, leadId, {
    title: `${TASK_PREFIX_REQUEST}${name}`.slice(0, 255),
    description: `${name} asked for a walkthrough from the enquiry form. Suits them: ${summary}.${about ? ` ${about}.` : ""} Confirm a time from the enquiry once you know someone's on site.`,
    dueDate: due.getTime(),
  });
  await addLeadActivity({
    leadId, ownerId, type: "note",
    content: `${changed ? "Walkthrough request updated" : "Walkthrough requested"} from the enquiry form. Suits them: ${summary}.`,
  }, { countsAsReply: false });
  const { notifyVenue } = await import("./notify");
  await notifyVenue(ownerId, {
    kind: "walkthrough_requested",
    title: `Walkthrough requested: ${name}`,
    body: `Suits them: ${summary}\nConfirm a time from the enquiry once you know someone's on site.`,
    leadId,
    dedupeKey: `walkthrough_requested:lead:${leadId}:${now.getTime()}`,
  });
  const email = await sendWalkthroughEmail(ownerId, lead, { kind: "requested", summary });
  return { ok: true as const, summary, ...email };
}

/**
 * Staff confirm a real walkthrough time for an enquiry (or move it). Updates
 * the task, logs it, and — when asked and the venue's email is set up —
 * emails the client a confirmation with a calendar invite.
 */
export async function confirmWalkthrough(ownerId: number, leadId: number, at: Date, opts: { emailClient: boolean }) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  if (isNaN(at.getTime())) throw new Error("Pick a date and time.");
  const [lead] = await db.select().from(leads).where(and(eq(leads.id, leadId), eq(leads.ownerId, ownerId))).limit(1);
  if (!lead) throw new Error("Enquiry not found.");
  const [vs] = await db.select().from(venueSettings).where(eq(venueSettings.ownerId, ownerId)).limit(1);
  const settings = parseWalkthroughSettings(vs);
  const label = formatSlotLabel(at);
  const moved = !!lead.walkthroughAt;
  await db.update(leads).set({ walkthroughAt: at, walkthroughSlot: label, updatedAt: new Date() })
    .where(and(eq(leads.id, leadId), eq(leads.ownerId, ownerId)));
  const name = personName(lead);
  await upsertWalkthroughTask(ownerId, leadId, {
    title: `${TASK_PREFIX_CONFIRMED}${name}`.slice(0, 255),
    description: `Walkthrough confirmed for ${label} (${settings.slotMinutes} min).${lead.walkthroughRequest ? ` They'd asked for: ${lead.walkthroughRequest}.` : ""}`,
    dueDate: at.getTime(),
  });
  await addLeadActivity({ leadId, ownerId, type: "note", content: `Walkthrough ${moved ? "moved to" : "confirmed for"} ${label}.` });

  let email: { emailed: boolean; emailNote: string } = { emailed: false, emailNote: "not_requested" };
  if (opts.emailClient) {
    const venueName = String(vs?.name ?? "the venue");
    const location = [vs?.addressLine1 || vs?.address, vs?.suburb, vs?.city].filter(Boolean).join(", ");
    const { publicBaseUrl } = await import("./publicUrl");
    const host = (() => { try { return new URL(publicBaseUrl()).hostname; } catch { return "venueflowhq.com"; } })();
    const ics = buildIcs({
      uid: `walkthrough-${ownerId}-${leadId}@${host}`,
      start: at, end: new Date(at.getTime() + settings.slotMinutes * 60_000),
      summary: `Walkthrough at ${venueName}`,
      description: `Your ${settings.slotMinutes}-minute walkthrough at ${venueName}.${vs?.phone ? ` Need to change it? Call ${vs.phone} or reply to the confirmation email.` : " Need to change it? Reply to the confirmation email."}`,
      location: location || undefined,
      organizerName: venueName,
      organizerEmail: vs?.email || undefined,
      now: new Date(),
    });
    email = await sendWalkthroughEmail(ownerId, lead, { kind: "confirmed", label, minutes: settings.slotMinutes, location, ics });
    if (email.emailed) await addLeadActivity({ leadId, ownerId, type: "email", content: `Walkthrough confirmation (with calendar invite) emailed to ${lead.email}.` });
  }
  return { ok: true as const, label, walkthroughAt: at.toISOString(), ...email };
}

/** Staff clear a confirmed walkthrough time (the request itself is kept). */
export async function clearWalkthrough(ownerId: number, leadId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [lead] = await db.select().from(leads).where(and(eq(leads.id, leadId), eq(leads.ownerId, ownerId))).limit(1);
  if (!lead) throw new Error("Enquiry not found.");
  await db.update(leads).set({ walkthroughAt: null, walkthroughSlot: null, updatedAt: new Date() })
    .where(and(eq(leads.id, leadId), eq(leads.ownerId, ownerId)));
  await db.update(tasks).set({ completed: true, updatedAt: Date.now() })
    .where(and(
      eq(tasks.ownerId, ownerId), eq(tasks.linkedLeadId, leadId), eq(tasks.completed, false),
      sql`${tasks.title} LIKE ${TASK_PREFIX_CONFIRMED + "%"}`,
    ));
  if (lead.walkthroughSlot) await addLeadActivity({ leadId, ownerId, type: "note", content: `Walkthrough on ${lead.walkthroughSlot} cancelled.` });
  return { ok: true as const };
}

type WalkthroughEmail =
  | { kind: "requested"; summary: string }
  | { kind: "confirmed"; label: string; minutes: number; location: string; ics: string };

async function sendWalkthroughEmail(
  ownerId: number, lead: { firstName: string; email: string }, msg: WalkthroughEmail,
): Promise<{ emailed: boolean; emailNote: string }> {
  try {
    const { buildVenueMailer } = await import("./paymentsEmail");
    const mailer = await buildVenueMailer(ownerId);
    if (!mailer) {
      console.log(`[Walkthrough] ${msg.kind} email not sent for owner ${ownerId} — SMTP isn't set up`);
      return { emailed: false, emailNote: "smtp_not_configured" };
    }
    const { escapeHtml: esc } = await import("./sanitizeHtml");
    const vs = mailer.venue;
    const venueName = String(vs.name ?? mailer.fromName ?? "our venue");
    const accent = (vs.primaryColor && /^#[0-9a-fA-F]{6}$/.test(vs.primaryColor)) ? vs.primaryColor : "#2D4A3E";
    const contact = [vs.phone && esc(vs.phone), esc(mailer.fromEmail)].filter(Boolean).join(" · ");
    const confirmed = msg.kind === "confirmed";
    const heading = confirmed ? "Your walkthrough is confirmed" : "We've got your walkthrough request";
    const intro = confirmed
      ? "We're looking forward to showing you around. Here are the details — a calendar invite is attached."
      : "Thanks for asking to see the venue. We'll check when the team is on site and be in touch to confirm a time.";
    const rows = confirmed
      ? `<tr><td style="padding:8px 12px 3px;color:#6b7280;font-size:14px;width:90px">When</td><td style="padding:8px 12px 3px;font-size:14px;font-weight:600">${esc(msg.label)} (${msg.minutes} min)</td></tr>
      ${msg.location ? `<tr><td style="padding:3px 12px 8px;color:#6b7280;font-size:14px">Where</td><td style="padding:3px 12px 8px;font-size:14px">${esc(msg.location)}</td></tr>` : ""}`
      : `<tr><td style="padding:8px 12px;color:#6b7280;font-size:14px;width:110px">You suggested</td><td style="padding:8px 12px;font-size:14px">${esc(msg.summary)}</td></tr>`;
    const outro = confirmed
      ? `Need to change the time? Just reply to this email${contact ? ` or reach us on ${contact}` : ""}.`
      : `Anything else we should know? Just reply to this email${contact ? ` or reach us on ${contact}` : ""}.`;
    const html = `<div style="font-family:Georgia,'Times New Roman',serif;max-width:520px;margin:0 auto;color:#1f2430">
  <div style="background:${accent};color:#fff;padding:22px 26px;border-radius:10px 10px 0 0">
    <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;opacity:0.85;font-family:Arial,sans-serif">${esc(venueName)}</div>
    <div style="font-size:23px;font-weight:bold;margin-top:4px">${heading}</div>
  </div>
  <div style="background:#fffdf9;border:1px solid #ece3d2;border-top:none;padding:22px 26px;border-radius:0 0 10px 10px">
    <p style="font-size:16px;margin:0 0 12px">Hi ${esc(lead.firstName)},</p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 16px">${intro}</p>
    <table style="width:100%;border-collapse:collapse;background:#f7f2e9;border-radius:8px"><tbody>
      ${rows}
    </tbody></table>
    <p style="font-size:14px;line-height:1.6;color:#4b5563;margin:18px 0 0">${outro}</p>
    <p style="font-size:15px;margin:16px 0 0">${confirmed ? "See you soon" : "Speak soon"},<br/><strong>${esc(venueName)}</strong></p>
  </div>
</div>`;
    const text = confirmed
      ? `Hi ${lead.firstName},\n\nYour walkthrough at ${venueName} is confirmed for ${msg.label} (${msg.minutes} min).${msg.location ? `\nWhere: ${msg.location}` : ""}\n\nNeed to change the time? Just reply to this email.\n\n${venueName}`
      : `Hi ${lead.firstName},\n\nThanks for asking to see ${venueName}. We'll check when the team is on site and be in touch to confirm a time.\n\nYou suggested: ${msg.summary}\n\n${venueName}`;
    await mailer.transporter.sendMail({
      from: `"${mailer.fromName}" <${mailer.fromEmail}>`,
      to: lead.email,
      replyTo: mailer.fromEmail,
      subject: confirmed ? `Your walkthrough at ${venueName} — ${msg.label}` : `Your walkthrough request — ${venueName}`,
      html,
      text,
      ...(confirmed ? { attachments: [{ filename: "walkthrough.ics", content: msg.ics, contentType: "text/calendar; charset=utf-8; method=PUBLISH" }] } : {}),
    });
    return { emailed: true, emailNote: "sent" };
  } catch (err: any) {
    console.error(`[Walkthrough] ${msg.kind} email failed:`, err?.message ?? err);
    return { emailed: false, emailNote: "send_failed" };
  }
}

/** The venue's walkthroughs for one NZ month — for the dashboard calendar. */
export async function walkthroughsForMonth(ownerId: number, year: number, month: number) {
  const db = await getDb();
  if (!db) return [];
  const from = zonedTimeToUtc(year, month, 1, 0, 0, VENUE_TZ)!;
  const to = zonedTimeToUtc(month === 12 ? year + 1 : year, month === 12 ? 1 : month + 1, 1, 0, 0, VENUE_TZ)!;
  return db.select({
    id: leads.id, firstName: leads.firstName, lastName: leads.lastName, status: leads.status,
    walkthroughAt: leads.walkthroughAt, walkthroughSlot: leads.walkthroughSlot,
  }).from(leads).where(and(
    eq(leads.ownerId, ownerId), gte(leads.walkthroughAt, from), lt(leads.walkthroughAt, to),
    notInArray(leads.status, ["lost", "cancelled"]),
  )).orderBy(leads.walkthroughAt);
}

