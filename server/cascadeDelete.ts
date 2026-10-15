/**
 * Deleting an enquiry, event, proposal or runsheet takes everything hanging
 * off it too (prelaunch audit F-26) — the owner's rule is "delete linked
 * records, protect money":
 *
 *  - enquiry → its bookings (as below), proposals (+ quote items, drinks,
 *    quote settings — so the public client links stop working), runsheets,
 *    tasks, activity, emails, follow-up sends, alerts, and the contracts /
 *    budgets / equipment / comms / seating / client-portal rows by leadId.
 *    Holds live on the lead row itself, so they go with it.
 *  - event (booking) → its runsheets, checklists, floor plans it owns, tasks,
 *    alerts, and the contracts / budgets / equipment / comms / seating /
 *    client-portal rows by bookingId.
 *  - runsheet → its timeline and F&B items, checklists, staff links and the
 *    couple's wedding checklist.
 *  - proposal → its quote items, drinks and quote settings.
 *
 * An event with any payments or Xero invoices is never deleted (nor the
 * enquiry it belongs to): the whole delete is refused before anything is
 * removed, and the venue cancels it instead. Every delete runs in one
 * transaction and every statement is scoped by ownerId.
 */
import { TRPCError } from "@trpc/server";
import { and, eq, inArray, or, type SQL } from "drizzle-orm";
import { getDb } from "./db";
import {
  leads, leadActivity, leadMessages, leadSequenceSends, venueNotifications, tasks,
  proposals, quoteItems, proposalDrinks, quoteSettings, proposalPhotos,
  bookings, payments, xeroInvoices, floorPlans, checklistInstances,
  runsheets, runsheetItems, fnbItems, staffPortalLinks, weddingChecklists,
  contracts, eventBudgets, eventEquipment, communications, seatingCharts, clientPortalTokens,
} from "../drizzle/schema";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export const EVENT_HAS_MONEY =
  "This event has payments or Xero invoices, so it can't be deleted. Cancel it instead — it'll keep its money records.";
export const ENQUIRY_HAS_MONEY =
  "This enquiry's event has payments or Xero invoices, so it can't be deleted. Mark it Cancelled instead — it'll keep its money records.";
export const PROPOSAL_ACCEPTED =
  "This proposal was accepted and made the booking, so it can't be deleted. Cancel the event instead if it's not going ahead.";

async function requireDb(): Promise<Db> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  return db;
}

/** Which of these bookings have a payment or a Xero invoice. Checked by
 *  bookingId alone (not ownerId) so a money row can never be missed. */
async function bookingsWithMoney(tx: Tx, bookingIds: number[]): Promise<number[]> {
  if (bookingIds.length === 0) return [];
  const [paid, invoiced] = await Promise.all([
    tx.selectDistinct({ id: payments.bookingId }).from(payments).where(inArray(payments.bookingId, bookingIds)),
    tx.selectDistinct({ id: xeroInvoices.bookingId }).from(xeroInvoices).where(inArray(xeroInvoices.bookingId, bookingIds)),
  ]);
  return Array.from(new Set([...paid, ...invoiced].map(r => r.id)));
}

/** The rows keyed by both leadId and bookingId (contracts, budgets, …). */
const EVENT_LINKED = [contracts, eventBudgets, eventEquipment, communications, seatingCharts, clientPortalTokens] as const;

async function deleteRunsheetRows(tx: Tx, ownerId: number, runsheetIds: number[]) {
  if (runsheetIds.length === 0) return;
  await tx.delete(runsheetItems).where(and(inArray(runsheetItems.runsheetId, runsheetIds), eq(runsheetItems.ownerId, ownerId)));
  await tx.delete(fnbItems).where(and(inArray(fnbItems.runsheetId, runsheetIds), eq(fnbItems.ownerId, ownerId)));
  await tx.delete(checklistInstances).where(and(inArray(checklistInstances.runsheetId, runsheetIds), eq(checklistInstances.ownerId, ownerId)));
  await tx.delete(staffPortalLinks).where(and(inArray(staffPortalLinks.runsheetId, runsheetIds), eq(staffPortalLinks.ownerId, ownerId)));
  await tx.delete(weddingChecklists).where(and(inArray(weddingChecklists.runsheetId, runsheetIds), eq(weddingChecklists.ownerId, ownerId)));
  await tx.delete(runsheets).where(and(inArray(runsheets.id, runsheetIds), eq(runsheets.ownerId, ownerId)));
}

async function deleteProposalRows(tx: Tx, ownerId: number, proposalIds: number[]) {
  if (proposalIds.length === 0) return;
  await tx.delete(quoteItems).where(and(inArray(quoteItems.proposalId, proposalIds), eq(quoteItems.ownerId, ownerId)));
  await tx.delete(proposalDrinks).where(and(inArray(proposalDrinks.proposalId, proposalIds), eq(proposalDrinks.ownerId, ownerId)));
  await tx.delete(quoteSettings).where(and(inArray(quoteSettings.proposalId, proposalIds), eq(quoteSettings.ownerId, ownerId)));
  await tx.delete(proposalPhotos).where(and(inArray(proposalPhotos.proposalId, proposalIds), eq(proposalPhotos.ownerId, ownerId)));
  await tx.delete(proposals).where(and(inArray(proposals.id, proposalIds), eq(proposals.ownerId, ownerId)));
}

/** Runsheets of these bookings must already be gone (or listed in
 *  `runsheetIds`) — a floor plan still used by a surviving runsheet is kept
 *  and just unlinked from the event. */
async function deleteBookingRows(tx: Tx, ownerId: number, bookingIds: number[]) {
  if (bookingIds.length === 0) return;
  const plans = await tx.select({ id: floorPlans.id }).from(floorPlans)
    .where(and(inArray(floorPlans.bookingId, bookingIds), eq(floorPlans.ownerId, ownerId)));
  const planIds = plans.map(p => p.id);
  if (planIds.length) {
    const stillUsed = await tx.select({ id: runsheets.floorPlanId }).from(runsheets)
      .where(and(inArray(runsheets.floorPlanId, planIds), eq(runsheets.ownerId, ownerId)));
    const keep = new Set(stillUsed.map(r => r.id).filter((id): id is number => id != null));
    const drop = planIds.filter(id => !keep.has(id));
    if (keep.size) {
      await tx.update(floorPlans).set({ bookingId: null })
        .where(and(inArray(floorPlans.id, Array.from(keep)), eq(floorPlans.ownerId, ownerId)));
    }
    if (drop.length) await tx.delete(floorPlans).where(and(inArray(floorPlans.id, drop), eq(floorPlans.ownerId, ownerId)));
  }
  await tx.delete(checklistInstances).where(and(inArray(checklistInstances.bookingId, bookingIds), eq(checklistInstances.ownerId, ownerId)));
  for (const t of EVENT_LINKED) {
    await tx.delete(t).where(and(inArray(t.bookingId, bookingIds), eq(t.ownerId, ownerId)));
  }
  await tx.delete(tasks).where(and(inArray(tasks.linkedBookingId, bookingIds), eq(tasks.ownerId, ownerId)));
  await tx.delete(venueNotifications).where(and(inArray(venueNotifications.bookingId, bookingIds), eq(venueNotifications.ownerId, ownerId)));
  await tx.delete(bookings).where(and(inArray(bookings.id, bookingIds), eq(bookings.ownerId, ownerId)));
}

/**
 * Delete enquiries and everything linked to them. Refuses the whole batch
 * (PRECONDITION_FAILED, nothing removed) when any of their events has money
 * on it. Returns how many enquiries were deleted.
 */
export async function deleteLeadsCascade(ownerId: number, leadIds: number[]): Promise<number> {
  if (leadIds.length === 0) return 0;
  const db = await requireDb();
  return db.transaction(async (tx) => {
    const owned = await tx.select({ id: leads.id }).from(leads)
      .where(and(inArray(leads.id, leadIds), eq(leads.ownerId, ownerId)));
    const ids = owned.map(r => r.id);
    if (ids.length === 0) return 0;

    const eventRows = await tx.select({ id: bookings.id }).from(bookings)
      .where(and(inArray(bookings.leadId, ids), eq(bookings.ownerId, ownerId)));
    const bookingIds = eventRows.map(r => r.id);
    const withMoney = await bookingsWithMoney(tx, bookingIds);
    if (withMoney.length) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: ids.length === 1 ? ENQUIRY_HAS_MONEY
          : "Some of these enquiries have events with payments or Xero invoices, so nothing was deleted. Mark those Cancelled instead — they'll keep their money records.",
      });
    }

    const proposalRows = await tx.select({ id: proposals.id }).from(proposals)
      .where(and(inArray(proposals.leadId, ids), eq(proposals.ownerId, ownerId)));
    const proposalIds = proposalRows.map(r => r.id);

    // A runsheet belongs to the enquiry if it was started from it, its event
    // or one of its proposals.
    const sheetOf: SQL[] = [inArray(runsheets.leadId, ids)];
    if (bookingIds.length) sheetOf.push(inArray(runsheets.bookingId, bookingIds));
    if (proposalIds.length) sheetOf.push(inArray(runsheets.proposalId, proposalIds));
    const sheetRows = await tx.select({ id: runsheets.id }).from(runsheets)
      .where(and(or(...sheetOf), eq(runsheets.ownerId, ownerId)));
    await deleteRunsheetRows(tx, ownerId, sheetRows.map(r => r.id));
    await deleteBookingRows(tx, ownerId, bookingIds);
    await deleteProposalRows(tx, ownerId, proposalIds);

    for (const t of EVENT_LINKED) {
      await tx.delete(t).where(and(inArray(t.leadId, ids), eq(t.ownerId, ownerId)));
    }
    await tx.delete(tasks).where(and(inArray(tasks.linkedLeadId, ids), eq(tasks.ownerId, ownerId)));
    await tx.delete(leadActivity).where(and(inArray(leadActivity.leadId, ids), eq(leadActivity.ownerId, ownerId)));
    await tx.delete(leadMessages).where(and(inArray(leadMessages.leadId, ids), eq(leadMessages.ownerId, ownerId)));
    await tx.delete(leadSequenceSends).where(and(inArray(leadSequenceSends.leadId, ids), eq(leadSequenceSends.ownerId, ownerId)));
    await tx.delete(venueNotifications).where(and(inArray(venueNotifications.leadId, ids), eq(venueNotifications.ownerId, ownerId)));
    await tx.delete(leads).where(and(inArray(leads.id, ids), eq(leads.ownerId, ownerId)));
    return ids.length;
  });
}

/** Delete one event (booking) and its linked records; refused when it has money. */
export async function deleteBookingCascade(ownerId: number, bookingId: number): Promise<boolean> {
  const db = await requireDb();
  return db.transaction(async (tx) => {
    const [own] = await tx.select({ id: bookings.id }).from(bookings)
      .where(and(eq(bookings.id, bookingId), eq(bookings.ownerId, ownerId))).limit(1);
    if (!own) return false;
    if ((await bookingsWithMoney(tx, [bookingId])).length) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: EVENT_HAS_MONEY });
    }
    const sheetRows = await tx.select({ id: runsheets.id }).from(runsheets)
      .where(and(eq(runsheets.bookingId, bookingId), eq(runsheets.ownerId, ownerId)));
    await deleteRunsheetRows(tx, ownerId, sheetRows.map(r => r.id));
    await deleteBookingRows(tx, ownerId, [bookingId]);
    return true;
  });
}

/** Delete one runsheet and its children. */
export async function deleteRunsheetCascade(ownerId: number, runsheetId: number): Promise<boolean> {
  const db = await requireDb();
  return db.transaction(async (tx) => {
    // Confirm ownership BEFORE touching child rows.
    const [own] = await tx.select({ id: runsheets.id }).from(runsheets)
      .where(and(eq(runsheets.id, runsheetId), eq(runsheets.ownerId, ownerId))).limit(1);
    if (!own) return false;
    await deleteRunsheetRows(tx, ownerId, [runsheetId]);
    return true;
  });
}

/** Delete one proposal and its quote rows. An accepted proposal is refused:
 *  it made the booking. Runsheets/bookings made from it just lose the link. */
export async function deleteProposalCascade(ownerId: number, proposalId: number): Promise<boolean> {
  const db = await requireDb();
  return db.transaction(async (tx) => {
    const [own] = await tx.select({ id: proposals.id, status: proposals.status }).from(proposals)
      .where(and(eq(proposals.id, proposalId), eq(proposals.ownerId, ownerId))).limit(1);
    if (!own) return false;
    if (own.status === "accepted") throw new TRPCError({ code: "PRECONDITION_FAILED", message: PROPOSAL_ACCEPTED });
    await tx.update(runsheets).set({ proposalId: null })
      .where(and(eq(runsheets.proposalId, proposalId), eq(runsheets.ownerId, ownerId)));
    await tx.update(bookings).set({ proposalId: null })
      .where(and(eq(bookings.proposalId, proposalId), eq(bookings.ownerId, ownerId)));
    await deleteProposalRows(tx, ownerId, [proposalId]);
    return true;
  });
}
