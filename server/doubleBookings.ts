/**
 * Double-bookings the venue chose to keep ("Save anyway" / "Book anyway" on
 * the clash dialog), so they don't vanish once the dialog closes.
 *
 * The flag is `bookings.clashFlaggedAt` — the same column a client's proposal
 * accept sets when it lands on a taken date (availability.flagClashOnAccept).
 * Overriding a clash flags the saved event AND the event(s) it clashes with;
 * the flags clear when the clash goes away (either event moves or is
 * cancelled) or when someone marks the pair resolved.
 *
 * What clashes is decided by availability.findClashes (same date/time and an
 * overlapping space). "Possible" matches — a side with no space — never flag.
 */
import { TRPCError } from "@trpc/server";
import { and, eq, gte, inArray, isNotNull, isNull, ne } from "drizzle-orm";
import { getDb } from "./db";
import { bookings } from "../drizzle/schema";
import { dayBounds, findClashes, fmtNzDay, zonedYmd, type Clash } from "./availability";

type BookingRow = typeof bookings.$inferSelect;

/** Live events in the way of booking `b` (none for a cancelled booking). */
async function clashesOf(ownerId: number, b: BookingRow): Promise<Clash[]> {
  if (b.status === "cancelled") return [];
  const found = await findClashes(ownerId, {
    start: b.eventDate, end: b.eventEndDate, spaceName: b.spaceName,
    excludeBookingId: b.id, excludeLeadId: b.leadId,
  });
  return found.filter(c => c.certainty === "clash");
}

async function loadBooking(ownerId: number, id: number): Promise<BookingRow | null> {
  const db = await getDb();
  if (!db) return null;
  const [b] = await db.select().from(bookings).where(and(eq(bookings.id, id), eq(bookings.ownerId, ownerId))).limit(1);
  return b ?? null;
}

const fullName = (b: { firstName: string | null; lastName: string | null }) =>
  [b.firstName, b.lastName].filter(Boolean).join(" ").trim() || "An event";

/**
 * A save went through over a clash warning: flag the saved booking and every
 * booking it clashes with (an existing flag keeps its time), and raise one
 * double_booking alert for the pair. Returns the clashes found (empty when the
 * save didn't actually land on a taken date).
 */
export async function flagOverriddenClash(ownerId: number, bookingId: number): Promise<Clash[]> {
  const db = await getDb();
  if (!db) return [];
  const b = await loadBooking(ownerId, bookingId);
  if (!b) return [];
  const clashes = await clashesOf(ownerId, b);
  if (clashes.length === 0) return [];
  const others = clashes.filter(c => c.source === "booking" && c.bookingId).map(c => c.bookingId!) as number[];
  const ids = [b.id, ...others];
  await db.update(bookings).set({ clashFlaggedAt: new Date() })
    .where(and(eq(bookings.ownerId, ownerId), inArray(bookings.id, ids), isNull(bookings.clashFlaggedAt)));
  const { notifyVenue, bookingLink } = await import("./notify");
  const who = fullName(b);
  await notifyVenue(ownerId, {
    kind: "double_booking",
    title: `Double booking: ${who} on ${fmtNzDay(b.eventDate)}`,
    body: `${who} was saved on a date and space that's already taken.\n${clashes.map(c => c.summary).join("\n")}\nIt's listed under "Double-bookings to resolve" on the Overview until one moves or it's marked resolved.`,
    bookingId: b.id,
    leadId: b.leadId,
    link: bookingLink(b.id),
    // One alert per pair and day: overriding the same clash again doesn't
    // repeat it, a new clash does.
    dedupeKey: `double_booking:${[...ids].sort((x, y) => x - y).join("-")}:${zonedYmd(b.eventDate)}`.slice(0, 160),
    // Whoever overrode it has just seen the warning; the alert is the record.
    email: false,
  });
  return clashes;
}

/**
 * Clear flags whose clash has gone: the event was cancelled, or neither it nor
 * the other side still shares the date and space. Call after anything that
 * moves or cancels an event. Never throws — a save must not fail over this.
 */
export async function reconcileClashFlags(ownerId: number): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    // Events from yesterday on: a past double-booking is history, and checking
    // every one ever flagged would make each save slower over time.
    const since = new Date(dayBounds(new Date()).start.getTime() - 86_400_000);
    const flagged = await db.select().from(bookings)
      .where(and(eq(bookings.ownerId, ownerId), isNotNull(bookings.clashFlaggedAt), gte(bookings.eventDate, since)));
    const clear: number[] = [];
    for (const b of flagged) {
      if ((await clashesOf(ownerId, b)).length === 0) clear.push(b.id);
    }
    if (clear.length) {
      await db.update(bookings).set({ clashFlaggedAt: null })
        .where(and(eq(bookings.ownerId, ownerId), inArray(bookings.id, clear)));
    }
  } catch (err) {
    console.error("[doubleBookings] reconcile failed (non-fatal):", err);
  }
}

/** "Mark resolved": clear the flag on this booking and the bookings it clashes with. */
export async function resolveClash(ownerId: number, bookingId: number): Promise<{ cleared: number[] }> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const b = await loadBooking(ownerId, bookingId);
  if (!b) throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
  const others = (await clashesOf(ownerId, b))
    .filter(c => c.source === "booking" && c.bookingId).map(c => c.bookingId!) as number[];
  const ids = [b.id, ...others];
  const cleared = await db.update(bookings).set({ clashFlaggedAt: null })
    .where(and(eq(bookings.ownerId, ownerId), inArray(bookings.id, ids), isNotNull(bookings.clashFlaggedAt)))
    .returning({ id: bookings.id });
  return { cleared: cleared.map(r => r.id) };
}

export type DoubleBookingSide = {
  bookingId: number | null;
  leadId: number | null;
  name: string;
  eventType: string | null;
  spaceName: string | null;
  /** booked / hold / tentative (for the other side; the flagged side is a booking) */
  kind: Clash["kind"] | "booked";
};

export type DoubleBookingPair = {
  key: string;
  eventDate: string;
  spaceName: string | null;
  summary: string;
  a: DoubleBookingSide;
  /** null when the flagged event no longer clashes with anything */
  b: DoubleBookingSide | null;
};

/**
 * Upcoming flagged events, one row per clashing pair (a pair of flagged
 * bookings is listed once). A flagged event whose clash has since gone is
 * listed alone so it can still be cleared.
 */
export async function listDoubleBookings(ownerId: number, now: Date = new Date()): Promise<DoubleBookingPair[]> {
  const db = await getDb();
  if (!db) return [];
  const flagged = await db.select().from(bookings)
    .where(and(
      eq(bookings.ownerId, ownerId), isNotNull(bookings.clashFlaggedAt),
      ne(bookings.status, "cancelled"), gte(bookings.eventDate, dayBounds(now).start),
    ))
    .orderBy(bookings.eventDate, bookings.id);
  const seen = new Set<string>();
  const out: DoubleBookingPair[] = [];
  for (const b of flagged) {
    const a: DoubleBookingSide = {
      bookingId: b.id, leadId: b.leadId, name: fullName(b), eventType: b.eventType,
      spaceName: b.spaceName, kind: "booked",
    };
    const clashes = await clashesOf(ownerId, b);
    if (clashes.length === 0) {
      out.push({ key: `b${b.id}`, eventDate: b.eventDate.toISOString(), spaceName: b.spaceName, summary: "No longer clashes with another event.", a, b: null });
      continue;
    }
    for (const c of clashes) {
      const key = c.source === "booking"
        ? `b${Math.min(b.id, c.bookingId!)}-b${Math.max(b.id, c.bookingId!)}`
        : `b${b.id}-l${c.leadId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        key, eventDate: b.eventDate.toISOString(), spaceName: b.spaceName, summary: c.summary, a,
        b: {
          bookingId: c.source === "booking" ? c.bookingId : null, leadId: c.leadId,
          name: c.name, eventType: c.eventType, spaceName: c.spaceName, kind: c.kind,
        },
      });
    }
  }
  return out;
}
