/**
 * The event's space (room) reaching its run sheets.
 *
 * Changing the space on the event or enquiry already flows to the booking, but
 * the run sheet keeps its own copy (shown on the BEO and the staff link) and
 * used to be left on the old room. The copy now follows the change — but only
 * a copy that still holds the OLD space (or hasn't got one yet). A copy a user
 * set to something else on purpose is left alone, mirroring the contact sync
 * in server/runsheetContacts.ts.
 */
import { and, eq, inArray } from "drizzle-orm";
import { runsheets } from "../drizzle/schema";
import { changedElsewhere } from "./runsheetVersion";
import { eventRunsheetIds } from "./runsheetGuests";

const norm = (s: string | null | undefined) => (s ?? "").trim().replace(/\s+/g, " ").toLowerCase();

/**
 * After the event's space changed from `from` to `to`: set it on the event's
 * run sheets whose space still matches `from` (or is unset). An open builder
 * is told the sheet changed elsewhere. Returns how many sheets changed.
 */
export async function syncRunsheetSpace(
  db: any,
  ownerId: number,
  ev: { bookingId?: number | null; leadId?: number | null },
  from: string | null | undefined,
  to: string | null | undefined,
): Promise<number> {
  const newSpace = (to ?? "").trim();
  if (!newSpace || norm(from) === norm(to)) return 0;
  const ids = await eventRunsheetIds(db, ownerId, ev);
  if (!ids.length) return 0;
  const sheets = await db
    .select({ id: runsheets.id, spaceName: runsheets.spaceName })
    .from(runsheets)
    .where(and(eq(runsheets.ownerId, ownerId), inArray(runsheets.id, ids)));
  let changed = 0;
  for (const rs of sheets) {
    // A copy set to a different room on purpose stays put; one that still
    // holds the old space (or has none yet) follows the event.
    if (rs.spaceName != null && norm(rs.spaceName) !== norm(from)) continue;
    if (norm(rs.spaceName) === norm(newSpace)) continue;
    await db
      .update(runsheets)
      .set({ spaceName: newSpace, updatedAt: new Date(), ...changedElsewhere() })
      .where(and(eq(runsheets.id, rs.id), eq(runsheets.ownerId, ownerId)));
    changed++;
  }
  return changed;
}
