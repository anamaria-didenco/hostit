/**
 * Date-clash detection: "is this date and space already taken?"
 *
 * One answer for every place that books or holds a date — proposal accept,
 * marking a lead booked (single and bulk), placing a hold, rescheduling an
 * event, Express Book's availability check and the "Date clash" chips.
 *
 * What counts as taking a date:
 *  - a booking that is confirmed, tentative or finished (cancelled frees it);
 *  - a lead marked booked/confirmed that has no booking row yet;
 *  - a lead on a date hold (status `tentative`) whose hold hasn't lapsed.
 *
 * When an event has both a start and an end time we compare the real times,
 * so a lunch and a dinner in the same room on one day don't clash. Otherwise
 * the event takes the whole NZ calendar day (Pacific/Auckland — the server
 * itself runs in UTC, so days are built deliberately in the venue's zone).
 *
 * Space matching is by name (bookings only store `spaceName`; a lead may also
 * carry `spaceId`). A spaceName can list several spaces ("Bar, Restaurant" for
 * a full-venue hire), so two events clash when their spaces overlap at all.
 * When either side has no space, a same-day item is returned as "possible"
 * rather than a definite clash.
 *
 * The overlap logic (everything above `findClashes`) is pure so it can be
 * unit-tested without a database.
 */
import { TRPCError } from "@trpc/server";

export const VENUE_TZ = "Pacific/Auckland";
const DAY_MS = 86_400_000;

// ─── NZ calendar days ──────────────────────────────────────────────────────

/** Offset of `tz` from UTC at `instant`, in ms (NZST +12h, NZDT +13h). */
export function tzOffsetMs(instant: number, tz: string = VENUE_TZ): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(instant));
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/** "YYYY-MM-DD" of the calendar day `d` falls on in `tz`. */
export function zonedYmd(d: Date, tz: string = VENUE_TZ): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** The instant local midnight starts `ymd` in `tz`. */
export function zonedMidnight(ymd: string, tz: string = VENUE_TZ): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  const wall = Date.UTC(y, m - 1, d);
  // Two passes: the first guess can sit on the wrong side of a DST change.
  let guess = wall - tzOffsetMs(wall, tz);
  guess = wall - tzOffsetMs(guess, tz);
  return new Date(guess);
}

export type Window = { start: Date; end: Date; allDay: boolean };

/** [start, end) of the NZ calendar day named by "YYYY-MM-DD". */
export function dayBoundsFromYmd(ymd: string, tz: string = VENUE_TZ): Window {
  return { start: zonedMidnight(ymd, tz), end: zonedMidnight(addDaysYmd(ymd, 1), tz), allDay: true };
}

/** [start, end) of the NZ calendar day that contains `d`. */
export function dayBounds(d: Date, tz: string = VENUE_TZ): Window {
  return dayBoundsFromYmd(zonedYmd(d, tz), tz);
}

/** The time an event occupies: its real start–end, or the whole NZ day. */
export function eventWindow(start: Date, end?: Date | null, tz: string = VENUE_TZ): Window {
  if (end && end.getTime() > start.getTime()) return { start, end, allDay: false };
  return dayBounds(start, tz);
}

/** Half-open overlap: an event ending at 6pm doesn't clash with one at 6pm. */
export function overlaps(a: { start: Date; end: Date }, b: { start: Date; end: Date }): boolean {
  return a.start.getTime() < b.end.getTime() && b.start.getTime() < a.end.getTime();
}

// ─── Spaces ────────────────────────────────────────────────────────────────

/** "Bar, Restaurant" → ["bar", "restaurant"]. */
export function spaceList(name: string | null | undefined): string[] {
  return (name ?? "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
}

export type SpaceRef = { spaceId?: number | null; spaceName?: string | null };

/** Do two events use the same space? "unknown" when either side has none. */
export function spaceRelation(a: SpaceRef, b: SpaceRef): "same" | "different" | "unknown" {
  if (a.spaceId && b.spaceId) return a.spaceId === b.spaceId ? "same" : "different";
  const sa = spaceList(a.spaceName), sb = spaceList(b.spaceName);
  if (sa.length === 0 || sb.length === 0) return "unknown";
  return sa.some(s => sb.includes(s)) ? "same" : "different";
}

// ─── Classification ────────────────────────────────────────────────────────

export type ClashCandidate = {
  source: "booking" | "lead";
  /** booking id or lead id, depending on `source` */
  id: number;
  leadId: number | null;
  bookingId: number | null;
  firstName: string | null;
  lastName: string | null;
  eventType: string | null;
  status: string;
  start: Date;
  end: Date | null;
  spaceId?: number | null;
  spaceName: string | null;
  holdUntil?: Date | null;
};

export type ClashQuery = {
  start: Date;
  end?: Date | null;
  spaceId?: number | null;
  spaceName?: string | null;
  excludeLeadId?: number | null;
  excludeBookingId?: number | null;
};

/** What a clash looks like on the wire (plain JSON — it rides on errors too). */
export type Clash = {
  source: "booking" | "lead";
  id: number;
  leadId: number | null;
  bookingId: number | null;
  /** booked = confirmed event · hold = live date hold · tentative = pencilled in */
  kind: "booked" | "hold" | "tentative";
  /** clash = same space and overlapping time · possible = same day, space unknown */
  certainty: "clash" | "possible";
  name: string;
  eventType: string | null;
  spaceName: string | null;
  start: string;
  end: string | null;
  allDay: boolean;
  holdUntil: string | null;
  /** One plain sentence, e.g. "Sunday 18 Oct: Main Bar is already booked for Jane Smith (Wedding, 6–11pm)." */
  summary: string;
};

const BOOKED_LEAD_STATUSES = ["booked", "confirmed"];

/** booked / hold / tentative, or null when the item doesn't take the date. */
export function candidateKind(c: ClashCandidate, now: Date): Clash["kind"] | null {
  if (c.source === "booking") {
    if (c.status === "cancelled") return null;
    return c.status === "tentative" ? "tentative" : "booked";
  }
  if (BOOKED_LEAD_STATUSES.includes(c.status)) return "booked";
  if (c.status === "tentative") {
    if (!c.holdUntil) return "tentative";
    return c.holdUntil.getTime() > now.getTime() ? "hold" : null; // lapsed hold
  }
  return null;
}

function zonedParts(d: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("en-NZ", {
    timeZone: tz, hourCycle: "h23", weekday: "long", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? "";
  return { weekday: get("weekday"), day: get("day"), month: get("month"), hour: Number(get("hour")), minute: Number(get("minute")) };
}

/** "Sunday 18 Oct" in the venue's zone. */
export function fmtNzDay(d: Date, tz: string = VENUE_TZ): string {
  const p = zonedParts(d, tz);
  return `${p.weekday} ${p.day} ${p.month}`;
}

function clock(hour: number, minute: number) {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return { text: minute ? `${h12}:${String(minute).padStart(2, "0")}` : `${h12}`, suffix: hour < 12 ? "am" : "pm" };
}

/** "6–11pm", "11:30am–2pm"; "" for an all-day window. */
export function fmtTimeRange(w: Window, tz: string = VENUE_TZ): string {
  if (w.allDay) return "";
  const a = zonedParts(w.start, tz), b = zonedParts(w.end, tz);
  const ca = clock(a.hour, a.minute), cb = clock(b.hour, b.minute);
  return ca.suffix === cb.suffix ? `${ca.text}–${cb.text}${cb.suffix}` : `${ca.text}${ca.suffix}–${cb.text}${cb.suffix}`;
}

function displaySpace(name: string | null): string | null {
  const list = (name ?? "").split(",").map(s => s.trim()).filter(Boolean);
  return list.length ? list.join(", ") : null;
}

export function describeClash(c: Omit<Clash, "summary">, tz: string = VENUE_TZ): string {
  const win: Window = { start: new Date(c.start), end: c.end ? new Date(c.end) : new Date(c.start), allDay: c.allDay };
  const time = fmtTimeRange(win, tz);
  const detail = [c.eventType, time].filter(Boolean).join(", ");
  const who = `${c.name}${detail ? ` (${detail})` : ""}`;
  const verb = c.kind === "booked" ? "already booked for" : c.kind === "hold" ? "on hold for" : "pencilled in for";
  const space = displaySpace(c.spaceName);
  if (c.certainty === "possible") {
    return `${fmtNzDay(win.start, tz)}: ${who} is ${c.kind === "booked" ? "booked" : c.kind === "hold" ? "on hold" : "pencilled in"} that day${space ? ` in ${space}` : " (no space set)"}.`;
  }
  return `${fmtNzDay(win.start, tz)}: ${space ?? "That space"} is ${verb} ${who}.`;
}

/**
 * Which candidates clash with the query? Pure: callers fetch candidates, this
 * decides. Excluded ids are the event being saved (and its linked lead /
 * booking) so nothing clashes with itself.
 */
export function classifyClashes(q: ClashQuery, candidates: ClashCandidate[], opts: { now?: Date; tz?: string } = {}): Clash[] {
  const now = opts.now ?? new Date();
  const tz = opts.tz ?? VENUE_TZ;
  const qWin = eventWindow(q.start, q.end, tz);
  const qDay = dayBounds(q.start, tz);
  const out: Clash[] = [];
  for (const c of candidates) {
    if (q.excludeBookingId && c.bookingId === q.excludeBookingId) continue;
    if (q.excludeLeadId && c.leadId === q.excludeLeadId) continue;
    const kind = candidateKind(c, now);
    if (!kind) continue;
    const cWin = eventWindow(c.start, c.end, tz);
    const rel = spaceRelation(q, c);
    let certainty: Clash["certainty"] | null = null;
    if (rel === "same" && overlaps(qWin, cWin)) certainty = "clash";
    else if (rel === "unknown" && overlaps(qDay, cWin)) certainty = "possible";
    if (!certainty) continue;
    const base = {
      source: c.source, id: c.id, leadId: c.leadId, bookingId: c.bookingId,
      kind, certainty,
      name: [c.firstName, c.lastName].filter(Boolean).join(" ").trim() || "another event",
      eventType: c.eventType ?? null,
      spaceName: c.spaceName ?? null,
      start: cWin.start.toISOString(),
      end: cWin.allDay ? null : cWin.end.toISOString(),
      allDay: cWin.allDay,
      holdUntil: c.holdUntil ? c.holdUntil.toISOString() : null,
    };
    out.push({ ...base, summary: describeClash(base, tz) });
  }
  const rank = (c: Clash) => (c.certainty === "clash" ? 0 : 1) * 10 + (c.kind === "booked" ? 0 : c.kind === "hold" ? 1 : 2);
  return out.sort((a, b) => rank(a) - rank(b) || a.start.localeCompare(b.start));
}

// ─── Errors ────────────────────────────────────────────────────────────────

/** Carries the clash list to the client (see errorFormatter in _core/trpc). */
export class ClashError extends Error {
  constructor(public clashes: Clash[]) {
    super("Date clash");
    this.name = "ClashError";
  }
}

/**
 * Throw a CONFLICT listing the clashes, unless there are none or the user has
 * already seen them and chosen to go ahead (`allowClash`). "Possible" items
 * (space unknown) never block on their own; they ride along for context.
 */
export function assertNoClashes(clashes: Clash[], allowClash?: boolean) {
  if (allowClash) return;
  const real = clashes.filter(c => c.certainty === "clash");
  if (real.length === 0) return;
  throw new TRPCError({ code: "CONFLICT", message: real.map(c => c.summary).join(" "), cause: new ClashError(clashes) });
}

// ─── Database ──────────────────────────────────────────────────────────────

type BookingRow = {
  id: number; leadId: number | null; firstName: string; lastName: string | null; eventType: string | null;
  status: string; eventDate: Date; eventEndDate: Date | null; spaceName: string | null;
};
type LeadRow = {
  id: number; firstName: string; lastName: string | null; eventType: string | null; status: string;
  eventDate: Date | null; eventEndDate: Date | null; spaceId: number | null; spaceName: string | null; holdUntil: Date | null;
};

export function bookingCandidate(b: BookingRow): ClashCandidate {
  return {
    source: "booking", id: b.id, leadId: b.leadId ?? null, bookingId: b.id,
    firstName: b.firstName, lastName: b.lastName, eventType: b.eventType, status: b.status,
    start: b.eventDate, end: b.eventEndDate, spaceName: b.spaceName,
  };
}

export function leadCandidate(l: LeadRow): ClashCandidate | null {
  if (!l.eventDate) return null;
  return {
    source: "lead", id: l.id, leadId: l.id, bookingId: null,
    firstName: l.firstName, lastName: l.lastName, eventType: l.eventType, status: l.status,
    start: l.eventDate, end: l.eventEndDate, spaceId: l.spaceId, spaceName: l.spaceName, holdUntil: l.holdUntil,
  };
}

/**
 * Everything that might take a date between `from` and `to`: live bookings,
 * plus booked/held leads that don't already have a booking row (the booking
 * stands in for its lead, so nothing is listed twice).
 */
async function loadCandidates(ownerId: number, from: Date, to: Date): Promise<ClashCandidate[]> {
  const { getDb } = await import("./db");
  const db = await getDb();
  if (!db) return [];
  const { bookings, leads } = await import("../drizzle/schema");
  const { and, eq, ne, gte, lt, inArray, isNotNull } = await import("drizzle-orm");
  const [bookingRows, leadRows] = await Promise.all([
    db.select({
      id: bookings.id, leadId: bookings.leadId, firstName: bookings.firstName, lastName: bookings.lastName,
      eventType: bookings.eventType, status: bookings.status, eventDate: bookings.eventDate,
      eventEndDate: bookings.eventEndDate, spaceName: bookings.spaceName,
    }).from(bookings).where(and(
      eq(bookings.ownerId, ownerId), ne(bookings.status, "cancelled"),
      gte(bookings.eventDate, from), lt(bookings.eventDate, to),
    )),
    db.select({
      id: leads.id, firstName: leads.firstName, lastName: leads.lastName, eventType: leads.eventType,
      status: leads.status, eventDate: leads.eventDate, eventEndDate: leads.eventEndDate,
      spaceId: leads.spaceId, spaceName: leads.spaceName, holdUntil: leads.holdUntil,
    }).from(leads).where(and(
      eq(leads.ownerId, ownerId), ne(leads.source, "healthcheck"), isNotNull(leads.eventDate),
      inArray(leads.status, [...BOOKED_LEAD_STATUSES, "tentative"]),
      gte(leads.eventDate, from), lt(leads.eventDate, to),
    )),
  ]);
  // A lead whose booking row exists (on any date) is represented by that row.
  const leadIds = leadRows.map(l => l.id);
  const covered = new Set<number>();
  if (leadIds.length) {
    const linked = await db.select({ leadId: bookings.leadId }).from(bookings)
      .where(and(eq(bookings.ownerId, ownerId), ne(bookings.status, "cancelled"), inArray(bookings.leadId, leadIds)));
    for (const r of linked) if (r.leadId) covered.add(r.leadId);
  }
  return [
    ...bookingRows.map(b => bookingCandidate(b as BookingRow)),
    ...leadRows.filter(l => !covered.has(l.id)).map(l => leadCandidate(l as LeadRow)).filter((c): c is ClashCandidate => !!c),
  ];
}

/**
 * Bookings and holds that clash with an event at `start`–`end` in a space.
 * Pass the event being saved as excludeLeadId / excludeBookingId.
 */
export async function findClashes(ownerId: number, q: ClashQuery, now: Date = new Date()): Promise<Clash[]> {
  if (!q.start || isNaN(q.start.getTime())) return [];
  const qWin = eventWindow(q.start, q.end);
  const qDay = dayBounds(q.start);
  // Look a day either side: an evening event can run past midnight.
  const from = new Date(Math.min(qWin.start.getTime(), qDay.start.getTime()) - DAY_MS);
  const to = new Date(Math.max(qWin.end.getTime(), qDay.end.getTime()) + DAY_MS);
  const candidates = await loadCandidates(ownerId, from, to);
  return classifyClashes(q, candidates, { now });
}

/**
 * For the enquiries list / lead drawer chips: every upcoming live lead whose
 * date and space clash with a booking or hold. Leads without a space, or only
 * "possible" matches, get no chip.
 */
export async function leadClashMap(ownerId: number, now: Date = new Date()): Promise<Record<number, Clash[]>> {
  const { getDb } = await import("./db");
  const db = await getDb();
  if (!db) return {};
  const { leads, bookings } = await import("../drizzle/schema");
  const { and, eq, ne, gte, notInArray, isNotNull } = await import("drizzle-orm");
  const from = dayBounds(now).start;
  const far = new Date(from.getTime() + 3 * 365 * DAY_MS);
  const [rows, candidates, bookingLinks] = await Promise.all([
    db.select({
      id: leads.id, eventDate: leads.eventDate, eventEndDate: leads.eventEndDate,
      spaceId: leads.spaceId, spaceName: leads.spaceName,
    }).from(leads).where(and(
      eq(leads.ownerId, ownerId), ne(leads.source, "healthcheck"), isNotNull(leads.eventDate),
      gte(leads.eventDate, from), notInArray(leads.status, ["lost", "cancelled", "finished"]),
    )),
    loadCandidates(ownerId, new Date(from.getTime() - DAY_MS), far),
    db.select({ id: bookings.id, leadId: bookings.leadId }).from(bookings)
      .where(and(eq(bookings.ownerId, ownerId), isNotNull(bookings.leadId), ne(bookings.status, "cancelled"))),
  ]);
  const bookingOfLead = new Map<number, number>();
  for (const b of bookingLinks) if (b.leadId) bookingOfLead.set(b.leadId, b.id);
  const out: Record<number, Clash[]> = {};
  for (const l of rows) {
    if (!l.eventDate || spaceList(l.spaceName).length === 0) continue;
    const found = classifyClashes({
      start: l.eventDate, end: l.eventEndDate, spaceId: l.spaceId, spaceName: l.spaceName,
      excludeLeadId: l.id, excludeBookingId: bookingOfLead.get(l.id) ?? null,
    }, candidates, { now }).filter(c => c.certainty === "clash");
    if (found.length) out[l.id] = found;
  }
  return out;
}

/**
 * Public proposal accept: the client accepted a date the venue offered, so we
 * never block them. If that date/space is already taken, flag the new booking
 * and alert the venue straight away so a person can sort it out.
 * Never throws — the client's accept must go through regardless.
 */
export async function flagClashOnAccept(ownerId: number, bookingId: number): Promise<Clash[]> {
  try {
    const { getDb } = await import("./db");
    const db = await getDb();
    if (!db) return [];
    const { bookings } = await import("../drizzle/schema");
    const { and, eq } = await import("drizzle-orm");
    const [b] = await db.select().from(bookings).where(and(eq(bookings.id, bookingId), eq(bookings.ownerId, ownerId))).limit(1);
    if (!b) return [];
    const clashes = (await findClashes(ownerId, {
      start: b.eventDate, end: b.eventEndDate, spaceName: b.spaceName,
      excludeBookingId: b.id, excludeLeadId: b.leadId,
    })).filter(c => c.certainty === "clash");
    if (clashes.length === 0) return [];
    await db.update(bookings).set({ clashFlaggedAt: new Date() }).where(eq(bookings.id, b.id));
    const { notifyVenue, bookingLink } = await import("./notify");
    const who = [b.firstName, b.lastName].filter(Boolean).join(" ") || "A client";
    await notifyVenue(ownerId, {
      kind: "double_booking",
      title: `Double booking: ${who} accepted ${fmtNzDay(b.eventDate)}`,
      body: `${who} accepted their proposal, but the date is already taken.\n${clashes.map(c => c.summary).join("\n")}\nPlease contact them, or move one of the events.`,
      bookingId: b.id,
      leadId: b.leadId,
      link: bookingLink(b.id),
      dedupeKey: `double_booking:${b.id}`,
    });
    return clashes;
  } catch (err) {
    console.error(`[availability] clash check after accept failed for booking ${bookingId} (non-fatal):`, err);
    return [];
  }
}
