/**
 * One checklist per event: the run sheet's staff checklist (the instance keyed
 * by runsheetId — ticked on the run sheet and from /staff-checklist/:token).
 * /checklist?bookingId=X and template assignment read and write that same row.
 *
 * /checklist used to make its own bookingId-only instances, so ticks in one
 * list never showed in the other (audit F-29). Those old rows are folded into
 * the run sheet's checklist the first time it's opened, then removed.
 */
import { TRPCError } from "@trpc/server";
import { randomBytes } from "crypto";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "./db";
import { bookings, checklistInstances, runsheets, type ChecklistInstance } from "../drizzle/schema";

export type ChecklistItem = ChecklistInstance["items"][number];

/**
 * Adds `incoming` to `base` without losing ticks. An item already on the list
 * (same text) stays where it is and is ticked if either copy was; anything new
 * goes on the end, renamed if its id is taken (template ids are often "1", "2").
 */
export function mergeChecklistItems(base: ChecklistItem[], incoming: ChecklistItem[]): ChecklistItem[] {
  const out = base.map(i => ({ ...i }));
  const key = (t: string) => (t ?? "").trim().toLowerCase();
  for (const item of incoming) {
    const same = out.find(i => key(i.text) === key(item.text));
    if (same) {
      if (item.checked && !same.checked) { same.checked = true; same.checkedAt = item.checkedAt; }
      same.notes ??= item.notes;
      same.category ??= item.category;
      same.imageUrl ??= item.imageUrl;
      continue;
    }
    let id = item.id;
    for (let n = 2; out.some(i => i.id === id); n++) id = `${item.id}-${n}`;
    out.push({ ...item, id });
  }
  return out;
}

/** The event's run sheet: the first one on the booking, else the enquiry's
 *  booking-less one (sheets made from the event drawer only carry leadId). */
export async function findEventRunsheet(ownerId: number, bookingId: number) {
  const db = await getDb();
  if (!db) return null;
  const cols = { id: runsheets.id, title: runsheets.title };
  const [byBooking] = await db.select(cols).from(runsheets)
    .where(and(eq(runsheets.bookingId, bookingId), eq(runsheets.ownerId, ownerId)))
    .orderBy(asc(runsheets.createdAt), asc(runsheets.id)).limit(1);
  if (byBooking) return byBooking;
  const [booking] = await db.select({ leadId: bookings.leadId }).from(bookings)
    .where(and(eq(bookings.id, bookingId), eq(bookings.ownerId, ownerId))).limit(1);
  if (!booking?.leadId) return null;
  const [byLead] = await db.select(cols).from(runsheets)
    .where(and(eq(runsheets.leadId, booking.leadId), eq(runsheets.ownerId, ownerId), isNull(runsheets.bookingId)))
    .orderBy(asc(runsheets.createdAt), asc(runsheets.id)).limit(1);
  return byLead ?? null;
}

/**
 * What /checklist?bookingId=X shows. Read-only (staff logins can't write);
 * `needsSetup` tells the page to call getOrCreateForRunsheet, which creates
 * the instance and carries over any old bookingId-only lists.
 */
export async function readEventChecklist(ownerId: number, bookingId: number) {
  const db = await getDb();
  const empty = { runsheet: null, instance: null, oldListCount: 0, needsSetup: false };
  if (!db) return empty;
  const runsheet = await findEventRunsheet(ownerId, bookingId);
  const old = await db.select({ id: checklistInstances.id }).from(checklistInstances)
    .where(and(eq(checklistInstances.bookingId, bookingId), eq(checklistInstances.ownerId, ownerId), isNull(checklistInstances.runsheetId)));
  if (!runsheet) return { ...empty, oldListCount: old.length };
  const [instance] = await db.select().from(checklistInstances)
    .where(and(eq(checklistInstances.runsheetId, runsheet.id), eq(checklistInstances.ownerId, ownerId)))
    .orderBy(asc(checklistInstances.id)).limit(1);
  return {
    runsheet,
    instance: instance ?? null,
    oldListCount: old.length,
    needsSetup: !instance || old.length > 0 || instance.bookingId == null || !instance.shareToken,
  };
}

/**
 * The run sheet's checklist, created if missing. In one transaction, owner-
 * scoped: stamps the event's bookingId on it, folds in (then deletes) any old
 * bookingId-only instances for that event, and merges `addItems` (a template
 * being applied). Callers must have checked the runsheet and booking ids.
 */
export async function getOrCreateRunsheetChecklist(
  ownerId: number,
  runsheetId: number,
  opts: { bookingId?: number | null; name?: string; defaultItems?: ChecklistItem[]; addItems?: ChecklistItem[] } = {},
): Promise<ChecklistInstance> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
  return db.transaction(async (tx) => {
    // One at a time per run sheet, so two tabs opening it together can't make
    // two checklists or fold the same old list in twice.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('checklist_instances:runsheet'), ${runsheetId}::int)`);
    const [sheet] = await tx.select({ bookingId: runsheets.bookingId }).from(runsheets)
      .where(and(eq(runsheets.id, runsheetId), eq(runsheets.ownerId, ownerId))).limit(1);
    if (!sheet) throw new TRPCError({ code: "NOT_FOUND", message: "Runsheet not found" });
    const bookingId = sheet.bookingId ?? opts.bookingId ?? null;

    const [existing] = await tx.select().from(checklistInstances)
      .where(and(eq(checklistInstances.runsheetId, runsheetId), eq(checklistInstances.ownerId, ownerId)))
      .orderBy(asc(checklistInstances.id)).limit(1);
    const old = bookingId == null ? [] : await tx.select().from(checklistInstances)
      .where(and(eq(checklistInstances.bookingId, bookingId), eq(checklistInstances.ownerId, ownerId), isNull(checklistInstances.runsheetId)))
      .orderBy(asc(checklistInstances.createdAt), asc(checklistInstances.id));

    let items: ChecklistItem[] = existing
      ? ((existing.items as ChecklistItem[]) ?? [])
      : (opts.defaultItems ?? []).map(i => ({ ...i, checked: false, checkedAt: undefined, notes: undefined }));
    for (const o of old) items = mergeChecklistItems(items, (o.items as ChecklistItem[]) ?? []);
    if (opts.addItems?.length) items = mergeChecklistItems(items, opts.addItems);

    let instance: ChecklistInstance;
    if (!existing) {
      [instance] = await tx.insert(checklistInstances).values({
        runsheetId,
        bookingId,
        ownerId,
        name: opts.name ?? "Staff Checklist",
        items,
        shareToken: randomBytes(24).toString("hex"),
      }).returning();
    } else if (old.length || opts.addItems?.length || (existing.bookingId == null && bookingId != null) || !existing.shareToken) {
      [instance] = await tx.update(checklistInstances).set({
        items,
        bookingId: existing.bookingId ?? bookingId,
        shareToken: existing.shareToken ?? randomBytes(24).toString("hex"),
        updatedAt: new Date(),
      }).where(and(eq(checklistInstances.id, existing.id), eq(checklistInstances.ownerId, ownerId))).returning();
    } else {
      instance = existing;
    }

    if (old.length) {
      await tx.delete(checklistInstances).where(and(
        inArray(checklistInstances.id, old.map(o => o.id)),
        eq(checklistInstances.ownerId, ownerId),
      ));
    }
    return instance;
  });
}
