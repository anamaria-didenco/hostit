/**
 * The event's guest count reaching its run sheets — and, only when asked,
 * the kitchen's food quantities.
 *
 * Changing guests on the event or enquiry used to stop at the booking, the
 * enquiry and the BEO header: the run sheet (the kitchen's and floor's copy)
 * kept the old number. The run sheet's count now follows the event, the same
 * way a run sheet edit already flows back to the event.
 *
 * Food is different. A line whose quantity equals the old guest count
 * ("45× Canapés") is probably one-per-guest, but not certainly — so it is
 * never changed silently. The edit reports how many such lines there are
 * (`foodRescale`), and the person chooses to update them (fnb.rescaleGuests).
 */
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { bookings, fnbItems, runsheets } from "../drizzle/schema";
import { changedElsewhere } from "./runsheetVersion";
import { getDb } from "./db";

export type FoodRescale = { from: number; to: number; lines: number };

/** The run sheets of one event: those linked to the booking, plus any its
 *  enquiry started that aren't linked to an event yet. From an enquiry, its
 *  live (confirmed/tentative) bookings stand for the event — the same ones
 *  leads.update keeps in step. */
export async function eventRunsheetIds(db: any, ownerId: number, ev: { bookingId?: number | null; leadId?: number | null }): Promise<number[]> {
  const conn = db ?? await getDb();
  if (!conn) return [];
  let bookingIds: number[] = [];
  let leadId = ev.leadId ?? null;
  if (ev.bookingId) {
    const [b] = await conn.select({ leadId: bookings.leadId }).from(bookings)
      .where(and(eq(bookings.id, ev.bookingId), eq(bookings.ownerId, ownerId))).limit(1);
    if (!b) return [];
    bookingIds = [ev.bookingId];
    leadId = b.leadId ?? null;
  } else if (leadId) {
    const live = await conn.select({ id: bookings.id }).from(bookings)
      .where(and(eq(bookings.leadId, leadId), eq(bookings.ownerId, ownerId), inArray(bookings.status, ["confirmed", "tentative"])));
    bookingIds = live.map((b: { id: number }) => b.id);
  }
  const scope = [
    ...(bookingIds.length ? [inArray(runsheets.bookingId, bookingIds)] : []),
    ...(leadId ? [and(eq(runsheets.leadId, leadId), isNull(runsheets.bookingId))] : []),
  ];
  if (!scope.length) return [];
  const rows = await conn.select({ id: runsheets.id }).from(runsheets)
    .where(and(eq(runsheets.ownerId, ownerId), or(...scope)));
  return rows.map((r: { id: number }) => r.id);
}

/** After the event's guest count changed from `from` to `to`: set it on the
 *  event's run sheets (an open builder is told they changed elsewhere), and
 *  report the food lines still at the old count, if any. */
export async function syncRunsheetGuests(
  db: any, ownerId: number, ev: { bookingId?: number | null; leadId?: number | null },
  from: number | null | undefined, to: number | null | undefined,
): Promise<FoodRescale | undefined> {
  if (to == null || from === to) return undefined;
  const conn = db ?? await getDb();
  if (!conn) return undefined;
  const ids = await eventRunsheetIds(conn, ownerId, ev);
  if (!ids.length) return undefined;
  await conn.update(runsheets).set({ guestCount: to, updatedAt: new Date(), ...changedElsewhere() })
    .where(and(eq(runsheets.ownerId, ownerId), inArray(runsheets.id, ids)));
  if (from == null || from <= 0) return undefined;
  const [row] = await conn.select({ n: sql<number>`count(*)::int` }).from(fnbItems)
    .where(and(eq(fnbItems.ownerId, ownerId), inArray(fnbItems.runsheetId, ids), eq(fnbItems.qty, from)));
  const lines = Number(row?.n ?? 0);
  return lines > 0 ? { from, to, lines } : undefined;
}

/** The person chose to update the food: lines at exactly `from` become `to`.
 *  Returns how many lines changed. */
export async function rescaleFoodQuantities(
  db: any, ownerId: number, ev: { bookingId?: number | null; leadId?: number | null }, from: number, to: number,
): Promise<number> {
  const conn = db ?? await getDb();
  if (!conn || from === to) return 0;
  const ids = await eventRunsheetIds(conn, ownerId, ev);
  if (!ids.length) return 0;
  return conn.transaction(async (tx: any) => {
    const changed = await tx.update(fnbItems).set({ qty: to })
      .where(and(eq(fnbItems.ownerId, ownerId), inArray(fnbItems.runsheetId, ids), eq(fnbItems.qty, from)))
      .returning({ runsheetId: fnbItems.runsheetId });
    const sheets = Array.from(new Set<number>(changed.map((c: { runsheetId: number }) => c.runsheetId)));
    if (sheets.length) {
      await tx.update(runsheets).set({ updatedAt: new Date(), ...changedElsewhere() })
        .where(and(eq(runsheets.ownerId, ownerId), inArray(runsheets.id, sheets)));
    }
    return changed.length;
  });
}
