/**
 * What a venue manager should do today: the data behind the Overview's
 * "Needs you today" card and its Today / Upcoming Events panels.
 *
 * Everything is scoped to one ownerId and reads days in the venue's time zone
 * (NZ by default) with the shared event-date helpers, so "today" is the
 * venue's today, not the server's (the server runs on UTC).
 */
import { and, desc, eq, inArray, isNull, isNotNull, gte, lte, ne, or } from "drizzle-orm";
import { getDb } from "./db";
import { bookings, leads, runsheets, tasks, venueNotifications, venueSettings, proposals, xeroInvoices } from "../drizzle/schema";
import { zonedYmd, zonedMidnight } from "./availability";
import { eventDayKey, startTimeOf, DEFAULT_VENUE_TZ } from "@shared/eventDate";
import { CLOSED_LEAD_STATUSES, leadDatePassed } from "@shared/followUp";
import { DEFAULT_BUSINESS_HOURS } from "@shared/businessHours";
import { isAwaitingFirstReply, replyDueAt, DEFAULT_REPLY_OVERDUE_HOURS } from "./speedToLead";
import { doubledProposal } from "./proposalDoubleCheck";
import { HOLD_STATUS } from "./holds";
import {
  UPCOMING_DAYS, DEPOSIT_WINDOW_DAYS, RUNSHEET_WINDOW_DAYS, NEEDS_GROUP_CAP, isDepositDue,
} from "@shared/needsToday";

const DAY_MS = 86_400_000;
const fullName = (r: { firstName: string | null; lastName: string | null }, fallback = "Client") =>
  [r.firstName, r.lastName].filter(Boolean).join(" ").trim() || fallback;

function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
function daysBetweenYmd(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / DAY_MS);
}

async function venueTz(ownerId: number): Promise<{ tz: string; replyEnabled: boolean; replyHours: number }> {
  const db = await getDb();
  const [vs] = db ? await db.select({
    timezone: venueSettings.timezone,
    replyOverdueEnabled: venueSettings.replyOverdueEnabled,
    replyOverdueHours: venueSettings.replyOverdueHours,
  }).from(venueSettings).where(eq(venueSettings.ownerId, ownerId)).limit(1) : [];
  return {
    tz: vs?.timezone || DEFAULT_VENUE_TZ,
    replyEnabled: (vs?.replyOverdueEnabled ?? 1) !== 0,
    replyHours: Math.min(24, Math.max(1, vs?.replyOverdueHours ?? DEFAULT_REPLY_OVERDUE_HOURS)),
  };
}

type BookingRow = typeof bookings.$inferSelect;

/** Bookings (not cancelled) falling on venue days today .. today+`days`, with run sheet lookups. */
async function loadWindow(ownerId: number, tz: string, now: Date, days: number) {
  const db = await getDb();
  if (!db) return null;
  const todayKey = zonedYmd(now, tz);
  // A day of slack either side; the exact day is decided by eventDayKey below.
  const from = new Date(zonedMidnight(todayKey, tz).getTime() - DAY_MS);
  const to = new Date(zonedMidnight(addDaysYmd(todayKey, days + 1), tz).getTime() + DAY_MS);
  const rows = await db.select().from(bookings).where(and(
    eq(bookings.ownerId, ownerId), gte(bookings.eventDate, from), lte(bookings.eventDate, to),
  ));
  const inWindow = rows
    .map(b => {
      const dayKey = eventDayKey(b.eventDate, tz);
      return { b, dayKey, diff: daysBetweenYmd(todayKey, dayKey) };
    })
    .filter(x => x.diff >= 0 && x.diff <= days)
    .sort((a, b) => a.b.eventDate.getTime() - b.b.eventDate.getTime());

  // Run sheets: linked to the event, or to its enquiry without an event yet
  // (the same two-way read as runsheets.list).
  const bookingIds = inWindow.map(x => x.b.id);
  const leadIds = inWindow.map(x => x.b.leadId).filter((v): v is number => v != null);
  const sheetByBooking = new Map<number, number>();
  const sheetByLead = new Map<number, number>();
  if (bookingIds.length || leadIds.length) {
    const sheets = await db.select({ id: runsheets.id, bookingId: runsheets.bookingId, leadId: runsheets.leadId })
      .from(runsheets).where(and(
        eq(runsheets.ownerId, ownerId),
        or(
          bookingIds.length ? inArray(runsheets.bookingId, bookingIds) : undefined,
          leadIds.length ? inArray(runsheets.leadId, leadIds) : undefined,
        ),
      )).orderBy(runsheets.id);
    for (const s of sheets) {
      if (s.bookingId != null) { if (!sheetByBooking.has(s.bookingId)) sheetByBooking.set(s.bookingId, s.id); }
      else if (s.leadId != null) { if (!sheetByLead.has(s.leadId)) sheetByLead.set(s.leadId, s.id); }
    }
  }
  const runsheetOf = (b: BookingRow): number | null =>
    sheetByBooking.get(b.id) ?? (b.leadId != null ? sheetByLead.get(b.leadId) ?? null : null);
  return { db, todayKey, inWindow, runsheetOf };
}

export type NeedsAttention = Awaited<ReturnType<typeof getNeedsAttention>>;

export async function getNeedsAttention(ownerId: number, now: Date = new Date()) {
  const { tz, replyEnabled, replyHours } = await venueTz(ownerId);
  const win = await loadWindow(ownerId, tz, now, Math.max(DEPOSIT_WINDOW_DAYS, RUNSHEET_WINDOW_DAYS));
  const empty = {
    todayKey: zonedYmd(now, tz),
    tonight: { total: 0, items: [] as TonightItem[] },
    tasks: { total: 0, items: [] as TaskItem[] },
    enquiries: { total: 0, awaitingTotal: 0, followUpTotal: 0, items: [] as EnquiryItem[] },
    deposits: { total: 0, items: [] as DepositItem[] },
    runsheets: { total: 0, items: [] as RunsheetItem[] },
    alerts: { total: 0, items: [] as AlertItem[] },
    total: 0,
  };
  if (!win) return empty;
  const { db, todayKey, inWindow, runsheetOf } = win;
  const cap = NEEDS_GROUP_CAP;

  // (a) Events today / tonight.
  const todays = inWindow.filter(x => x.diff === 0 && (x.b.status === "confirmed" || x.b.status === "finished"));
  const tonightAll: TonightItem[] = todays.map(({ b }) => ({
    bookingId: b.id, name: fullName(b), eventType: b.eventType ?? null, startTime: startTimeOf(b.eventDate, tz),
    spaceName: b.spaceName ?? null, guestCount: b.guestCount ?? null,
    hasRunSheet: runsheetOf(b) != null, runsheetId: runsheetOf(b),
    deposit: b.depositRequired === false ? "none" : b.depositPaid ? "paid" : "due",
  }));

  // (b) Overdue tasks, most overdue first. Same rule as the Tasks "Overdue" filter.
  const nowMs = now.getTime();
  const overdue = await db.select().from(tasks).where(and(
    eq(tasks.ownerId, ownerId), eq(tasks.completed, false), isNotNull(tasks.dueDate),
  ));
  const overdueRows = overdue.filter(t => t.dueDate != null && t.dueDate < nowMs).sort((a, b) => a.dueDate! - b.dueDate!);
  const shownTasks = overdueRows.slice(0, cap);
  const tLeadIds = Array.from(new Set(shownTasks.map(t => t.linkedLeadId).filter((v): v is number => v != null)));
  const tBookingIds = Array.from(new Set(shownTasks.map(t => t.linkedBookingId).filter((v): v is number => v != null)));
  const leadNames = new Map<number, string>();
  const bookingNames = new Map<number, string>();
  if (tLeadIds.length) {
    for (const r of await db.select({ id: leads.id, firstName: leads.firstName, lastName: leads.lastName }).from(leads)
      .where(and(eq(leads.ownerId, ownerId), inArray(leads.id, tLeadIds)))) leadNames.set(r.id, fullName(r));
  }
  if (tBookingIds.length) {
    for (const r of await db.select({ id: bookings.id, firstName: bookings.firstName, lastName: bookings.lastName }).from(bookings)
      .where(and(eq(bookings.ownerId, ownerId), inArray(bookings.id, tBookingIds)))) bookingNames.set(r.id, fullName(r));
  }
  const taskItems: TaskItem[] = shownTasks.map(t => ({
    id: t.id, title: t.title, dueDate: t.dueDate!, daysOverdue: Math.max(1, Math.floor((nowMs - t.dueDate!) / DAY_MS)),
    leadId: t.linkedLeadId ?? null, bookingId: t.linkedBookingId ?? null,
    linkedName: (t.linkedBookingId != null ? bookingNames.get(t.linkedBookingId) : undefined)
      ?? (t.linkedLeadId != null ? leadNames.get(t.linkedLeadId) : undefined) ?? null,
  }));

  // (c) Enquiries: first reply overdue (the venue's own reply-overdue hours, counted in
  // business hours like the alert), or a follow-up date that has arrived.
  const endOfToday = zonedMidnight(addDaysYmd(todayKey, 1), tz);
  const candidates = await db.select({
    id: leads.id, firstName: leads.firstName, lastName: leads.lastName, status: leads.status, source: leads.source,
    internalNotes: leads.internalNotes, createdAt: leads.createdAt, firstResponseAt: leads.firstResponseAt,
    respondedAt: leads.respondedAt, followUpDate: leads.followUpDate, eventType: leads.eventType,
    eventDate: leads.eventDate,
  }).from(leads).where(and(
    eq(leads.ownerId, ownerId), ne(leads.source, "healthcheck"),
    or(eq(leads.status, "new"), isNotNull(leads.followUpDate)),
  ));
  const awaiting: EnquiryItem[] = [];
  const awaitingIds = new Set<number>();
  if (replyEnabled) {
    for (const l of candidates) {
      if (l.respondedAt != null || !isAwaitingFirstReply(l)) continue;
      if (replyDueAt(l.createdAt, replyHours, DEFAULT_BUSINESS_HOURS).getTime() > nowMs) continue;
      awaitingIds.add(l.id);
      awaiting.push({
        leadId: l.id, name: fullName(l), eventType: l.eventType ?? null, reason: "awaiting_reply",
        waitingHours: Math.max(0, (nowMs - l.createdAt.getTime()) / 3_600_000), followUpDaysOverdue: null,
      });
    }
    awaiting.sort((a, b) => b.waitingHours! - a.waitingHours!);
  }
  const followUps: EnquiryItem[] = candidates
    .filter(l => !awaitingIds.has(l.id) && l.followUpDate != null && !CLOSED_LEAD_STATUSES.includes(l.status ?? "")
      && l.followUpDate.getTime() < endOfToday.getTime()
      // Same rule as the follow-up list: nothing to chase once the date has gone.
      && !leadDatePassed(l, nowMs))
    .sort((a, b) => a.followUpDate!.getTime() - b.followUpDate!.getTime())
    .map(l => ({
      leadId: l.id, name: fullName(l), eventType: l.eventType ?? null, reason: "follow_up" as const,
      waitingHours: null,
      followUpDaysOverdue: Math.max(0, daysBetweenYmd(zonedYmd(l.followUpDate!, tz), todayKey)),
    }));
  const enquiryItems = [...awaiting, ...followUps].slice(0, cap);

  // (d) Deposits due: confirmed events in the next 21 days, deposit required and not paid.
  const depositAll: DepositItem[] = inWindow
    .filter(x => x.diff <= DEPOSIT_WINDOW_DAYS && isDepositDue(x.b))
    .map(({ b, diff, dayKey }) => ({
      bookingId: b.id, name: fullName(b), eventDate: b.eventDate, dayKey, daysAway: diff,
      amount: Number(b.depositNzd ?? 0) || 0, requested: b.depositRequestedAt != null,
    }));

  // (e) Confirmed events in the next 7 days (after today; today is in (a)) with no run sheet.
  const noSheetAll: RunsheetItem[] = inWindow
    .filter(x => x.diff >= 1 && x.diff <= RUNSHEET_WINDOW_DAYS && x.b.status === "confirmed" && runsheetOf(x.b) == null)
    .map(({ b, diff, dayKey }) => ({
      bookingId: b.id, name: fullName(b), eventDate: b.eventDate, dayKey, daysAway: diff, spaceName: b.spaceName ?? null,
      startTime: startTimeOf(b.eventDate, tz),
    }));

  // (f) Unread money / decision alerts that still apply.
  const unread = await db.select().from(venueNotifications).where(and(
    eq(venueNotifications.ownerId, ownerId), isNull(venueNotifications.readAt),
    inArray(venueNotifications.kind, ["proposal_doubled", "double_booking", "hold_expiring"]),
  )).orderBy(desc(venueNotifications.createdAt), desc(venueNotifications.id)).limit(60);
  const alertBookingIds = unread.map(n => n.bookingId).filter((v): v is number => v != null);
  const alertLeadIds = unread.map(n => n.leadId).filter((v): v is number => v != null);
  const flagged = new Set<number>();
  if (alertBookingIds.length) {
    for (const r of await db.select({ id: bookings.id }).from(bookings).where(and(
      eq(bookings.ownerId, ownerId), inArray(bookings.id, alertBookingIds), isNotNull(bookings.clashFlaggedAt), ne(bookings.status, "cancelled"),
    ))) flagged.add(r.id);
  }
  const holding = new Set<number>();
  if (alertLeadIds.length) {
    for (const r of await db.select({ id: leads.id }).from(leads).where(and(
      eq(leads.ownerId, ownerId), inArray(leads.id, alertLeadIds), eq(leads.status, HOLD_STATUS), isNotNull(leads.holdUntil), gte(leads.holdUntil, now),
    ))) holding.add(r.id);
  }
  const stillDoubled = new Set<number>();
  const proposalIdOf = (link: string | null) => { const m = /proposalId=(\d+)/.exec(link ?? ""); return m ? Number(m[1]) : null; };
  const doubledIds = unread.filter(n => n.kind === "proposal_doubled").map(n => proposalIdOf(n.link)).filter((v): v is number => v != null);
  if (doubledIds.length) {
    const rows = await db.select({
      id: proposals.id, ownerId: proposals.ownerId, title: proposals.title, status: proposals.status,
      lineItems: proposals.lineItems, taxPercent: proposals.taxPercent,
    }).from(proposals).where(and(eq(proposals.ownerId, ownerId), inArray(proposals.id, doubledIds)));
    for (const r of rows) if (doubledProposal(r)) stillDoubled.add(r.id);
  }
  const alertAll: AlertItem[] = unread.filter(n => {
    if (n.kind === "double_booking") return n.bookingId != null && flagged.has(n.bookingId);
    if (n.kind === "hold_expiring") return n.leadId != null && holding.has(n.leadId);
    const pid = proposalIdOf(n.link);
    return pid != null && stillDoubled.has(pid);
  }).map(n => ({ id: n.id, kind: n.kind, title: n.title, link: n.link, leadId: n.leadId ?? null, bookingId: n.bookingId ?? null }));

  const out = {
    todayKey,
    tonight: { total: tonightAll.length, items: tonightAll.slice(0, cap) },
    tasks: { total: overdueRows.length, items: taskItems },
    enquiries: { total: awaiting.length + followUps.length, awaitingTotal: awaiting.length, followUpTotal: followUps.length, items: enquiryItems },
    deposits: { total: depositAll.length, items: depositAll.slice(0, cap) },
    runsheets: { total: noSheetAll.length, items: noSheetAll.slice(0, cap) },
    alerts: { total: alertAll.length, items: alertAll.slice(0, cap) },
    total: 0,
  };
  out.total = out.tonight.total + out.tasks.total + out.enquiries.total + out.deposits.total + out.runsheets.total + out.alerts.total;
  return out;
}

type TonightItem = {
  bookingId: number; name: string; eventType: string | null; startTime: string; spaceName: string | null;
  guestCount: number | null; hasRunSheet: boolean; runsheetId: number | null; deposit: "paid" | "due" | "none";
};
type TaskItem = { id: number; title: string; dueDate: number; daysOverdue: number; leadId: number | null; bookingId: number | null; linkedName: string | null };
type EnquiryItem = {
  leadId: number; name: string; eventType: string | null; reason: "awaiting_reply" | "follow_up";
  waitingHours: number | null; followUpDaysOverdue: number | null;
};
type DepositItem = { bookingId: number; name: string; eventDate: Date; dayKey: string; daysAway: number; amount: number; requested: boolean };
type RunsheetItem = { bookingId: number; name: string; eventDate: Date; dayKey: string; daysAway: number; spaceName: string | null; startTime: string };
type AlertItem = { id: number; kind: string; title: string; link: string | null; leadId: number | null; bookingId: number | null };

/**
 * Today's events and the next 14 days, whichever month the calendar is
 * showing. Bookings come back whole (the event drawer opens from them) with
 * their run sheet and deposit state beside them.
 */
export async function getUpcomingEvents(ownerId: number, now: Date = new Date()) {
  const { tz } = await venueTz(ownerId);
  const win = await loadWindow(ownerId, tz, now, UPCOMING_DAYS);
  if (!win) return { todayKey: zonedYmd(now, tz), events: [] as UpcomingEvent[] };
  const { db, todayKey, inWindow, runsheetOf } = win;
  const live = inWindow.filter(x => x.b.status !== "cancelled");
  const events: UpcomingEvent[] = live.map(({ b, dayKey, diff }) => ({
    _type: "booking" as const, id: b.id, dayKey, daysAway: diff, startTime: startTimeOf(b.eventDate, tz),
    name: fullName(b, ""), hasRunSheet: runsheetOf(b) != null,
    deposit: b.status !== "confirmed" ? null : b.depositRequired === false ? "none" as const : b.depositPaid ? "paid" as const : "due" as const,
    row: b,
  }));
  // A confirmed enquiry with no event row yet still belongs on the day.
  const bookedLeadIds = new Set(inWindow.map(x => x.b.leadId).filter((v): v is number => v != null));
  const from = new Date(zonedMidnight(todayKey, tz).getTime() - DAY_MS);
  const to = new Date(zonedMidnight(addDaysYmd(todayKey, UPCOMING_DAYS + 1), tz).getTime() + DAY_MS);
  const leadRows = await db.select().from(leads).where(and(
    eq(leads.ownerId, ownerId), ne(leads.source, "healthcheck"), inArray(leads.status, ["booked", "confirmed"]),
    isNotNull(leads.eventDate), gte(leads.eventDate, from), lte(leads.eventDate, to),
  ));
  for (const l of leadRows) {
    if (bookedLeadIds.has(l.id) || !l.eventDate) continue;
    const dayKey = eventDayKey(l.eventDate, tz);
    const diff = daysBetweenYmd(todayKey, dayKey);
    if (diff < 0 || diff > UPCOMING_DAYS) continue;
    events.push({
      _type: "lead", id: l.id, dayKey, daysAway: diff, startTime: startTimeOf(l.eventDate, tz),
      name: fullName(l, ""), hasRunSheet: false, deposit: null, row: l,
    });
  }
  events.sort((a, b) => (a.row.eventDate as Date).getTime() - (b.row.eventDate as Date).getTime());
  return { todayKey, events };
}

export type UpcomingEvent = {
  _type: "booking" | "lead"; id: number; dayKey: string; daysAway: number; startTime: string; name: string;
  hasRunSheet: boolean; deposit: "paid" | "due" | "none" | null;
  row: BookingRow | typeof leads.$inferSelect;
};

/** Confirmed events from today on whose deposit is required and unpaid (the Payments board's rule). */
export async function countDepositsDue(ownerId: number, now: Date = new Date()): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const { tz } = await venueTz(ownerId);
  const todayKey = zonedYmd(now, tz);
  const from = new Date(zonedMidnight(todayKey, tz).getTime() - DAY_MS);
  const rows = await db.select({ id: bookings.id, b: bookings.eventDate, status: bookings.status, depositRequired: bookings.depositRequired, depositPaid: bookings.depositPaid })
    .from(bookings).where(and(eq(bookings.ownerId, ownerId), eq(bookings.status, "confirmed"), gte(bookings.eventDate, from)));
  // Same rule as the Payments board: a deposit invoice PAID in Xero is a paid
  // deposit, even before the payment itself has been imported.
  const paidInXero = new Set((await db.select({ bookingId: xeroInvoices.bookingId })
    .from(xeroInvoices).where(and(eq(xeroInvoices.ownerId, ownerId), eq(xeroInvoices.stream, "deposit"), eq(xeroInvoices.status, "PAID"))))
    .map(r => r.bookingId));
  return rows.filter(r => isDepositDue(r) && !paidInXero.has(r.id) && daysBetweenYmd(todayKey, eventDayKey(r.b, tz)) >= 0).length;
}
