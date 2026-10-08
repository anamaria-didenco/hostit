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
  VENUE_TZ, aggregateAvailability, buildIcs, formStartToken, formatDayLabel, generateWalkthroughSlots,
  looksLikeBot, parseWalkthroughSettings, zonedTimeToUtc, type Interval, type Occupancy,
} from "./enquiryConversion";

/** An event with no end time is assumed to run this long. */
const DEFAULT_EVENT_MS = 3 * 3600_000;

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

async function busyIntervals(ownerId: number, from: Date, to: Date, slotMinutes: number, excludeLeadId?: number): Promise<Interval[]> {
  const db = await getDb();
  if (!db) return [];
  const walkthroughs = await db.select({ at: leads.walkthroughAt }).from(leads)
    .where(and(
      eq(leads.ownerId, ownerId), isNotNull(leads.walkthroughAt),
      gte(leads.walkthroughAt, new Date(from.getTime() - 4 * 3600_000)), lt(leads.walkthroughAt, to),
      notInArray(leads.status, ["lost", "cancelled"]),
      excludeLeadId ? ne(leads.id, excludeLeadId) : undefined,
    ));
  // Any event that could still be running inside the window.
  const events = await db.select({ start: bookings.eventDate, end: bookings.eventEndDate }).from(bookings)
    .where(and(
      eq(bookings.ownerId, ownerId), inArray(bookings.status, ["confirmed", "tentative"]),
      gte(bookings.eventDate, new Date(from.getTime() - 24 * 3600_000)), lt(bookings.eventDate, to),
    ));
  return [
    ...walkthroughs.map(w => ({ start: w.at!, end: new Date(w.at!.getTime() + slotMinutes * 60_000) })),
    ...events.map(e => ({
      start: e.start,
      end: e.end && e.end > e.start ? e.end : new Date(e.start.getTime() + DEFAULT_EVENT_MS),
    })),
  ];
}

async function computeSlots(ownerId: number, now: Date, excludeLeadId?: number) {
  const db = await getDb();
  if (!db) return { settings: parseWalkthroughSettings(null), slots: [] };
  const [vs] = await db.select().from(venueSettings).where(eq(venueSettings.ownerId, ownerId)).limit(1);
  const settings = parseWalkthroughSettings(vs);
  if (!settings.enabled) return { settings, slots: [] };
  const to = new Date(now.getTime() + (settings.daysAhead + 2) * 86400_000);
  const busy = await busyIntervals(ownerId, now, to, settings.slotMinutes, excludeLeadId);
  return { settings, slots: generateWalkthroughSlots({ now, settings, busy }) };
}

/** Open slots grouped by day, for the thank-you screen. */
export async function getWalkthroughSlots(ownerId: number) {
  const { settings, slots } = await computeSlots(ownerId, new Date());
  const days: Array<{ key: string; label: string; slots: Array<{ start: string; label: string; timeLabel: string }> }> = [];
  for (const s of slots) {
    let day = days.find(d => d.key === s.dayKey);
    if (!day) { day = { key: s.dayKey, label: formatDayLabel(s.dayKey), slots: [] }; days.push(day); }
    day.slots.push({ start: s.start.toISOString(), label: s.label, timeLabel: s.timeLabel });
  }
  return { enabled: settings.enabled, slotMinutes: settings.slotMinutes, days };
}

export class SlotTakenError extends Error {}

/**
 * Book (or move) a lead's walkthrough. The slot is re-checked under a
 * per-venue lock, so two people can't take the same time. Creates or moves
 * the venue's task, logs activity, alerts the venue and emails the client a
 * confirmation with a calendar file — reporting honestly whether it went.
 */
export async function bookWalkthrough(ownerId: number, leadId: number, slotStartIso: string) {
  const db = await getDb();
  if (!db) throw new Error("Booking isn't available right now — please try again.");
  const now = new Date();
  const wanted = new Date(slotStartIso);
  if (isNaN(wanted.getTime())) throw new SlotTakenError("That time isn't available.");

  const booked = await db.transaction(async (tx) => {
    // Serialise bookings per venue so the availability check below can't race.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(7401, ${ownerId})`);
    const { settings, slots } = await computeSlots(ownerId, now, leadId);
    const slot = slots.find(s => s.start.getTime() === wanted.getTime());
    if (!slot) throw new SlotTakenError("Sorry — that time was just taken. Please pick another.");
    const [lead] = await tx.select().from(leads).where(and(eq(leads.id, leadId), eq(leads.ownerId, ownerId))).limit(1);
    if (!lead) throw new Error("Enquiry not found.");
    const moved = !!lead.walkthroughAt;
    await tx.update(leads).set({ walkthroughAt: slot.start, walkthroughSlot: slot.label, updatedAt: now })
      .where(and(eq(leads.id, leadId), eq(leads.ownerId, ownerId)));

    // One open walkthrough task per lead: move it if the client rebooks.
    const name = `${lead.firstName}${lead.lastName ? " " + lead.lastName : ""}`;
    const title = `Walkthrough with ${name}`.slice(0, 255);
    const about = [lead.eventType, lead.guestCount ? `${lead.guestCount} guests` : null, lead.spaceName].filter(Boolean).join(", ");
    const description = `Booked from the enquiry form for ${slot.label} (${settings.slotMinutes} min).${about ? ` ${about}.` : ""}`;
    const ts = Date.now();
    const [existingTask] = await tx.select({ id: tasks.id }).from(tasks)
      .where(and(eq(tasks.ownerId, ownerId), eq(tasks.linkedLeadId, leadId), eq(tasks.completed, false), sql`${tasks.title} LIKE 'Walkthrough with %'`))
      .limit(1);
    if (existingTask) {
      await tx.update(tasks).set({ title, description, dueDate: slot.start.getTime(), updatedAt: ts }).where(eq(tasks.id, existingTask.id));
    } else {
      await tx.insert(tasks).values({
        ownerId, title, description, dueDate: slot.start.getTime(), linkedLeadId: leadId,
        priority: "high", completed: false, createdAt: ts, updatedAt: ts,
      });
    }
    return { lead, slot, settings, moved, name };
  });

  const { lead, slot, settings, moved, name } = booked;
  await addLeadActivity({
    leadId, ownerId, type: "note",
    content: `${moved ? "Walkthrough moved to" : "Walkthrough booked for"} ${slot.label} (from the enquiry form).`,
  });
  const { notifyVenue } = await import("./notify");
  await notifyVenue(ownerId, {
    kind: "walkthrough_booked",
    title: `Walkthrough ${moved ? "moved" : "booked"}: ${name}, ${slot.label}`,
    body: `${name} ${moved ? "moved their walkthrough to" : "booked a walkthrough for"} ${slot.label} from the enquiry form. It's in your tasks.`,
    leadId,
    dedupeKey: `walkthrough_booked:lead:${leadId}:${slot.start.toISOString()}`,
  });

  // Client confirmation with a calendar file.
  const [vs] = await db.select().from(venueSettings).where(eq(venueSettings.ownerId, ownerId)).limit(1);
  const venueName = String(vs?.name ?? "the venue");
  const location = [vs?.addressLine1 || vs?.address, vs?.suburb, vs?.city].filter(Boolean).join(", ");
  const { publicBaseUrl } = await import("./publicUrl");
  const host = (() => { try { return new URL(publicBaseUrl()).hostname; } catch { return "venueflowhq.com"; } })();
  const ics = buildIcs({
    uid: `walkthrough-${ownerId}-${leadId}@${host}`,
    start: slot.start, end: slot.end,
    summary: `Walkthrough at ${venueName}`,
    description: `Your ${settings.slotMinutes}-minute walkthrough at ${venueName}.${vs?.phone ? ` Need to change it? Call ${vs.phone} or reply to the confirmation email.` : " Need to change it? Reply to the confirmation email."}`,
    location: location || undefined,
    organizerName: venueName,
    organizerEmail: vs?.email || undefined,
    now,
  });
  const email = await sendWalkthroughConfirmation(ownerId, lead, slot.label, settings.slotMinutes, location, ics);
  return { ok: true as const, label: slot.label, walkthroughAt: slot.start.toISOString(), ics, ...email };
}

async function sendWalkthroughConfirmation(
  ownerId: number, lead: { firstName: string; email: string }, label: string, minutes: number, location: string, ics: string,
): Promise<{ emailed: boolean; emailNote: string }> {
  try {
    const { buildVenueMailer } = await import("./paymentsEmail");
    const mailer = await buildVenueMailer(ownerId);
    if (!mailer) {
      console.log(`[Walkthrough] confirmation not emailed for owner ${ownerId} — SMTP isn't set up`);
      return { emailed: false, emailNote: "smtp_not_configured" };
    }
    const { escapeHtml: esc } = await import("./sanitizeHtml");
    const vs = mailer.venue;
    const venueName = String(vs.name ?? mailer.fromName ?? "our venue");
    const accent = (vs.primaryColor && /^#[0-9a-fA-F]{6}$/.test(vs.primaryColor)) ? vs.primaryColor : "#2D4A3E";
    const contact = [vs.phone && esc(vs.phone), esc(mailer.fromEmail)].filter(Boolean).join(" · ");
    const html = `<div style="font-family:Georgia,'Times New Roman',serif;max-width:520px;margin:0 auto;color:#1f2430">
  <div style="background:${accent};color:#fff;padding:22px 26px;border-radius:10px 10px 0 0">
    <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;opacity:0.85;font-family:Arial,sans-serif">${esc(venueName)}</div>
    <div style="font-size:23px;font-weight:bold;margin-top:4px">Your walkthrough is booked</div>
  </div>
  <div style="background:#fffdf9;border:1px solid #ece3d2;border-top:none;padding:22px 26px;border-radius:0 0 10px 10px">
    <p style="font-size:16px;margin:0 0 12px">Hi ${esc(lead.firstName)},</p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 16px">We're looking forward to showing you around. Here are the details — a calendar invite is attached.</p>
    <table style="width:100%;border-collapse:collapse;background:#f7f2e9;border-radius:8px"><tbody>
      <tr><td style="padding:8px 12px 3px;color:#6b7280;font-size:14px;width:90px">When</td><td style="padding:8px 12px 3px;font-size:14px;font-weight:600">${esc(label)} (${minutes} min)</td></tr>
      ${location ? `<tr><td style="padding:3px 12px 8px;color:#6b7280;font-size:14px">Where</td><td style="padding:3px 12px 8px;font-size:14px">${esc(location)}</td></tr>` : ""}
    </tbody></table>
    <p style="font-size:14px;line-height:1.6;color:#4b5563;margin:18px 0 0">Need to change the time? Just reply to this email${contact ? ` or reach us on ${contact}` : ""}.</p>
    <p style="font-size:15px;margin:16px 0 0">See you soon,<br/><strong>${esc(venueName)}</strong></p>
  </div>
</div>`;
    await mailer.transporter.sendMail({
      from: `"${mailer.fromName}" <${mailer.fromEmail}>`,
      to: lead.email,
      replyTo: mailer.fromEmail,
      subject: `Your walkthrough at ${venueName} — ${label}`,
      html,
      text: `Hi ${lead.firstName},\n\nYour walkthrough at ${venueName} is booked for ${label} (${minutes} min).${location ? `\nWhere: ${location}` : ""}\n\nNeed to change the time? Just reply to this email.\n\n${venueName}`,
      attachments: [{ filename: "walkthrough.ics", content: ics, contentType: "text/calendar; charset=utf-8; method=PUBLISH" }],
    });
    return { emailed: true, emailNote: "sent" };
  } catch (err: any) {
    console.error("[Walkthrough] confirmation email failed:", err?.message ?? err);
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

