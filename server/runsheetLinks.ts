/**
 * Keeping a run sheet attached to its event.
 *
 * A run sheet started from an enquiry is saved with the enquiry's id only.
 * Once that enquiry has an event (a booking), everything event-side — the
 * event page, the run sheet builder opened from it, the BEO, guest-count
 * edits — finds sheets by the booking's id. A sheet left with bookingId null
 * was invisible there: opening the run sheet from the event made a second,
 * empty sheet, and edits to one never reached the other.
 *
 * So: when an enquiry gets its event (created or brought back), its
 * enquiry-only sheets are linked to it; a sheet made from an enquiry that
 * already has exactly one event is linked on creation; and the list reads
 * both ways (see runsheets.list).
 */
import { and, eq, isNull, ne } from "drizzle-orm";
import { bookings, runsheets } from "../drizzle/schema";
import { getDb } from "./db";

/** Attach the enquiry's sheets that have no event yet to `bookingId`.
 *  Only the link changes — not the sheet's content — so an open builder
 *  isn't told it was edited elsewhere. Returns how many were linked.
 *  `db` may be a transaction, or null for the default connection. */
export async function linkLeadRunsheets(db: any, ownerId: number, leadId: number | null | undefined, bookingId: number | null | undefined): Promise<number> {
  if (!leadId || !bookingId) return 0;
  const conn = db ?? await getDb();
  if (!conn) return 0;
  const linked = await conn.update(runsheets).set({ bookingId })
    .where(and(eq(runsheets.ownerId, ownerId), eq(runsheets.leadId, leadId), isNull(runsheets.bookingId)))
    .returning({ id: runsheets.id });
  return linked.length;
}

/** The enquiry's event, when it has exactly one that isn't cancelled —
 *  the only case where a sheet can be linked without guessing. */
export async function singleLiveBookingId(db: any, ownerId: number, leadId: number | null | undefined): Promise<number | null> {
  if (!leadId) return null;
  const conn = db ?? await getDb();
  if (!conn) return null;
  const rows = await conn.select({ id: bookings.id }).from(bookings)
    .where(and(eq(bookings.ownerId, ownerId), eq(bookings.leadId, leadId), ne(bookings.status, "cancelled")))
    .limit(2);
  return rows.length === 1 ? rows[0].id : null;
}
