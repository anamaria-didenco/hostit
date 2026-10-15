/**
 * Run sheets keep their own copy of the client contact (contactName /
 * contactEmail / contactPhone; null = fall back to the lead or booking).
 * When the client's name, email or phone is corrected on the enquiry or the
 * event, a copy that still holds the OLD value follows the change. A copy
 * that says something else was set on purpose (an on-the-day contact, say)
 * and is left alone.
 */
import { and, eq, inArray, or } from "drizzle-orm";
import { bookings, runsheets } from "../drizzle/schema";
import { changedElsewhere } from "./runsheetVersion";

export type ClientContact = { firstName?: string | null; lastName?: string | null; email?: string | null; phone?: string | null };

const fullName = (c: ClientContact) => [c.firstName, c.lastName].map(s => (s ?? "").trim()).filter(Boolean).join(" ");
const normName = (s: string | null | undefined) => (s ?? "").trim().replace(/\s+/g, " ").toLowerCase();
const normEmail = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
const normPhone = (s: string | null | undefined) => (s ?? "").replace(/[^\d+]/g, "");

/**
 * `before` is the contact as it was; `after` carries only the fields that
 * were edited (undefined = unchanged). Scope: run sheets of the lead, and of
 * the lead's bookings (or of `bookingId` alone when there's no lead).
 */
export async function syncRunsheetContacts(
  db: any,
  ownerId: number,
  scope: { leadId?: number | null; bookingId?: number | null },
  before: ClientContact,
  after: ClientContact,
): Promise<number> {
  const merged: ClientContact = {
    firstName: after.firstName !== undefined ? after.firstName : before.firstName,
    lastName: after.lastName !== undefined ? after.lastName : before.lastName,
    email: after.email !== undefined ? after.email : before.email,
    phone: after.phone !== undefined ? after.phone : before.phone,
  };
  const oldName = fullName(before), newName = fullName(merged);
  const nameChanged = normName(oldName) !== normName(newName) && !!oldName;
  const emailChanged = after.email !== undefined && normEmail(before.email) !== normEmail(merged.email) && !!normEmail(before.email);
  const phoneChanged = after.phone !== undefined && normPhone(before.phone) !== normPhone(merged.phone) && !!normPhone(before.phone);
  if (!nameChanged && !emailChanged && !phoneChanged) return 0;

  const bookingIds = new Set<number>();
  if (scope.bookingId) bookingIds.add(scope.bookingId);
  if (scope.leadId) {
    const rows = await db.select({ id: bookings.id }).from(bookings)
      .where(and(eq(bookings.leadId, scope.leadId), eq(bookings.ownerId, ownerId)));
    for (const r of rows) bookingIds.add(r.id);
  }
  const conds = [];
  if (scope.leadId) conds.push(eq(runsheets.leadId, scope.leadId));
  if (bookingIds.size) conds.push(inArray(runsheets.bookingId, Array.from(bookingIds)));
  if (!conds.length) return 0;
  const sheets = await db.select({
    id: runsheets.id, contactName: runsheets.contactName, contactEmail: runsheets.contactEmail, contactPhone: runsheets.contactPhone,
  }).from(runsheets).where(and(eq(runsheets.ownerId, ownerId), conds.length === 1 ? conds[0] : or(...conds)));

  let changed = 0;
  for (const rs of sheets) {
    const set: Record<string, unknown> = {};
    if (nameChanged && rs.contactName != null && normName(rs.contactName) === normName(oldName)) set.contactName = newName || null;
    if (emailChanged && rs.contactEmail != null && normEmail(rs.contactEmail) === normEmail(before.email)) set.contactEmail = (merged.email ?? "").trim() || null;
    if (phoneChanged && rs.contactPhone != null && normPhone(rs.contactPhone) === normPhone(before.phone)) set.contactPhone = (merged.phone ?? "").trim() || null;
    if (!Object.keys(set).length) continue;
    await db.update(runsheets).set({ ...set, ...changedElsewhere() })
      .where(and(eq(runsheets.id, rs.id), eq(runsheets.ownerId, ownerId)));
    changed++;
  }
  return changed;
}
