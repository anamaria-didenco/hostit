/**
 * Linking a Xero invoice VenueFlow didn't raise to an event.
 *
 * VenueFlow only follows invoices it pushed itself (or whose Xero reference
 * carries "(VenueFlow #id)"). An invoice raised straight in Xero was invisible:
 * it never showed in Payments, its payments never imported, and the event's
 * deposit / balance never moved. Linking records the invoice against an event
 * and stream, then runs the normal sync so its payments arrive.
 */
import { and, eq, inArray, notInArray, or, isNull } from "drizzle-orm";
import { getDb } from "./db";
import { bookings, payments, xeroInvoices } from "../drizzle/schema";
import type { UnlinkedXeroInvoice } from "./xero";

export type LinkStream = "food" | "drinks" | "deposit";

/** Tag stored in `sentBy` for a hand-linked invoice — only these can be unlinked,
 *  so an invoice VenueFlow raised can never be un-tracked by accident. */
export const LINKED_MARK = "Linked from Xero";

const STOPWORDS = new Set([
  "ltd", "limited", "nz", "new", "zealand", "group", "co", "company", "the", "and", "of", "inc", "llc", "pty", "lp",
  "services", "service", "head", "events", "event", "mr", "mrs", "ms", "dr", "x",
]);

function tokens(s: string | null | undefined): string[] {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter(t => t.length >= 3 && !STOPWORDS.has(t));
}

type BookingLike = {
  id: number; firstName?: string | null; lastName?: string | null; company?: string | null; email?: string | null;
};

/** How well a Xero contact name matches an event's client: the share of the
 *  booking's name / company words that appear in the contact (0 = no match). */
export function matchScore(contactName: string, b: BookingLike): number {
  const contact = new Set(tokens(contactName));
  if (contact.size === 0) return 0;
  const person = tokens(`${b.firstName ?? ""} ${b.lastName ?? ""}`);
  const company = tokens(b.company);
  let score = 0;
  // A full person-name match (first and last) is the strongest signal.
  if (person.length >= 2 && person.every(t => contact.has(t))) score += 3;
  else score += person.filter(t => contact.has(t)).length;
  if (company.length) score += company.filter(t => contact.has(t)).length * 1.5;
  const emailDomain = (b.email ?? "").split("@")[1]?.split(".")[0]?.toLowerCase();
  if (emailDomain && emailDomain.length >= 4 && !["gmail", "hotmail", "outlook", "yahoo", "icloud", "xtra", "live"].includes(emailDomain)
    && contact.has(emailDomain)) score += 1.5;
  return score;
}

/** Up to `limit` event ids whose client best matches the Xero contact, best first. */
export function suggestBookingIds(contactName: string, list: BookingLike[], limit = 3): number[] {
  return list
    .map(b => ({ id: b.id, score: matchScore(contactName, b) }))
    .filter(x => x.score >= 1.5)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(x => x.id);
}

/** A first guess at which bill an invoice is, from its wording. */
export function suggestStream(reference: string | null | undefined): LinkStream {
  const r = (reference ?? "").toLowerCase();
  if (/\bdeposit\b/.test(r)) return "deposit";
  // Not "bar": it's in the venue's own name ("Bar Franco Event").
  if (/\b(tab|beverage|beverages|drinks?)\b/.test(r)) return "drinks";
  return "food";
}

export type LinkDeps = {
  /** The invoice as Xero has it right now. */
  getInvoice: (ownerId: number, invoiceId: string) => Promise<(UnlinkedXeroInvoice & { type: string }) | null>;
  /** Import its payments and bring the event's flags up to date. */
  sync: (ownerId: number, bookingId: number) => Promise<{ paymentsImported: number; amountImported: number }>;
  /** Forget cached Xero reads so the screens update at once. */
  clearCaches: (ownerId: number) => void;
};

export class LinkError extends Error {}

export async function linkExistingInvoice(
  ownerId: number,
  input: { xeroInvoiceId: string; bookingId: number; stream: LinkStream; linkedBy?: string | null },
  deps: LinkDeps,
) {
  const db = await getDb();
  if (!db) throw new LinkError("Database not available");

  const [booking] = await db.select({ id: bookings.id }).from(bookings)
    .where(and(eq(bookings.id, input.bookingId), eq(bookings.ownerId, ownerId))).limit(1);
  if (!booking) throw new LinkError("That event wasn't found.");

  const [already] = await db.select({ id: xeroInvoices.id, bookingId: xeroInvoices.bookingId }).from(xeroInvoices)
    .where(and(eq(xeroInvoices.ownerId, ownerId), eq(xeroInvoices.xeroInvoiceId, input.xeroInvoiceId))).limit(1);
  if (already) {
    throw new LinkError(already.bookingId === input.bookingId
      ? "That invoice is already linked to this event."
      : "That invoice is already linked to another event. Unlink it there first.");
  }

  const inv = await deps.getInvoice(ownerId, input.xeroInvoiceId);
  if (!inv) throw new LinkError("Xero doesn't have that invoice any more.");
  if (inv.type !== "ACCREC") throw new LinkError("Only sales invoices can be linked to an event.");
  if (inv.status === "VOIDED" || inv.status === "DELETED") throw new LinkError("That invoice has been voided in Xero.");

  const mark = input.linkedBy ? `${LINKED_MARK} · ${input.linkedBy}`.slice(0, 120) : LINKED_MARK;
  // Idempotent under a double-click / two staff: the unique (owner, invoice) index
  // turns the second insert into a no-op.
  const inserted = await db.insert(xeroInvoices).values({
    ownerId,
    bookingId: input.bookingId,
    stream: input.stream,
    xeroInvoiceId: inv.invoiceId,
    invoiceNumber: inv.number,
    status: inv.status,
    total: String(inv.total),
    sentBy: mark,
  }).onConflictDoNothing().returning({ id: xeroInvoices.id });
  if (inserted.length === 0) throw new LinkError("That invoice was just linked by someone else.");

  const result = await deps.sync(ownerId, input.bookingId);
  deps.clearCaches(ownerId);
  return {
    trackedId: inserted[0].id,
    invoiceNumber: inv.number,
    status: inv.status,
    paymentsImported: result.paymentsImported,
    amountImported: result.amountImported,
  };
}

/** Undo a hand-link: stop tracking the invoice and take back the payments it brought in. */
export async function unlinkInvoice(
  ownerId: number,
  trackedId: number,
  deps: { clearCaches: (ownerId: number) => void; refreshDeposit: (bookingId: number, ownerId: number, allowDowngrade: boolean) => Promise<void> },
) {
  const db = await getDb();
  if (!db) throw new LinkError("Database not available");
  const [row] = await db.select().from(xeroInvoices)
    .where(and(eq(xeroInvoices.id, trackedId), eq(xeroInvoices.ownerId, ownerId))).limit(1);
  if (!row) throw new LinkError("That link wasn't found.");
  if (!row.sentBy || !row.sentBy.startsWith(LINKED_MARK)) {
    throw new LinkError("VenueFlow raised this invoice, so it can't be unlinked here.");
  }
  let removedPayments = 0;
  if (row.xeroInvoiceId) {
    const removed = await db.delete(payments).where(and(
      eq(payments.ownerId, ownerId), eq(payments.source, "xero"), eq(payments.xeroInvoiceId, row.xeroInvoiceId),
    )).returning({ id: payments.id });
    removedPayments = removed.length;
  }
  await db.delete(xeroInvoices).where(and(eq(xeroInvoices.id, trackedId), eq(xeroInvoices.ownerId, ownerId)));
  // Taking back a DEPOSIT invoice's payments can make the deposit unpaid again;
  // taking back food/drinks must never untick a hand-ticked deposit.
  if (row.bookingId != null) await deps.refreshDeposit(row.bookingId, ownerId, row.stream === "deposit");
  // Linking ran the sync, which stamped the event's food / drinks stream as
  // "invoiced" or "paid". With the invoice gone that mark is false: an event the
  // link put on "paid" would drop off the to-invoice list for good. If no other
  // live invoice still backs the stream, put it back — food to "to invoice",
  // drinks to unset (the board then infers it from the bar setup). A mark someone
  // ticked by hand BEFORE linking can't be told apart, so it is reset too; it is
  // one tap to set again, where a false "paid" would go unnoticed.
  if (row.bookingId != null && (row.stream === "food" || row.stream === "drinks")) {
    const [stillBacked] = await db.select({ id: xeroInvoices.id }).from(xeroInvoices).where(and(
      eq(xeroInvoices.ownerId, ownerId),
      eq(xeroInvoices.bookingId, row.bookingId),
      eq(xeroInvoices.stream, row.stream),
      or(isNull(xeroInvoices.status), notInArray(xeroInvoices.status, ["VOIDED", "DELETED"])),
    )).limit(1);
    if (!stillBacked) {
      const col = row.stream === "food" ? bookings.foodStatus : bookings.drinksStatus;
      await db.update(bookings)
        .set((row.stream === "food" ? { foodStatus: "to_invoice" } : { drinksStatus: null }) as any)
        .where(and(eq(bookings.id, row.bookingId), eq(bookings.ownerId, ownerId), inArray(col, ["invoiced", "paid"])));
    }
  }
  deps.clearCaches(ownerId);
  return { removedPayments, bookingId: row.bookingId };
}
