/**
 * Xero → VenueFlow sync.
 *
 * When an invoice is reconciled in Xero (a bank transaction is matched to it),
 * Xero attaches Payment records to that invoice and moves it to PAID. This
 * module mirrors that back into VenueFlow so the money shows up in the event's
 * payment history — the app's own record — instead of only flipping a chip.
 *
 * Idempotent: every imported row carries Xero's PaymentID, so re-syncing can
 * never double-count. Manual entries are never touched.
 */
import { getDb } from "./db";
import { bookings, payments, xeroInvoices } from "../drizzle/schema";
import { eq, and, inArray } from "drizzle-orm";
import { getXeroInvoiceStatuses, getXeroInvoicePayments, getXeroInvoiceStatus } from "./xero";

export interface XeroSyncResult {
  statusChanges: number;
  paymentsImported: number;
  amountImported: number;
}

/** Sync tracked invoices for an owner — all of them, or one booking's. */
export async function syncXeroInvoicesForOwner(ownerId: number, bookingId?: number): Promise<XeroSyncResult> {
  const empty: XeroSyncResult = { statusChanges: 0, paymentsImported: 0, amountImported: 0 };
  const db = await getDb();
  if (!db) return empty;

  const where = bookingId === undefined
    ? eq(xeroInvoices.ownerId, ownerId)
    : and(eq(xeroInvoices.ownerId, ownerId), eq(xeroInvoices.bookingId, bookingId));
  const rows = await db.select().from(xeroInvoices).where(where);
  const ids = rows.map(r => r.xeroInvoiceId).filter((v): v is string => !!v);
  if (ids.length === 0) return empty;

  // One batched call for statuses. Xero allows 60 requests/minute per tenant,
  // so batch first and only fetch individually where there's money to import.
  const statuses = await getXeroInvoiceStatuses(ownerId, ids);

  let statusChanges = 0, paymentsImported = 0, amountImported = 0;
  // Cap the per-run detail fetches so a large backlog can't blow the rate limit
  // in one go; the next run picks up the remainder.
  let detailBudget = 40;

  for (const r of rows) {
    let s = r.xeroInvoiceId ? statuses[r.xeroInvoiceId] : undefined;
    // Xero OMITS deleted and voided invoices from the batched IDs response, so
    // an invoice voided in Xero simply vanishes from the answer and our row
    // stays DRAFT forever — "check status" looked like it did nothing. A row
    // Xero went quiet on gets asked about individually (GET by ID does return
    // them), unless we already know it's gone.
    if (!s && r.xeroInvoiceId && r.status !== "VOIDED" && r.status !== "DELETED" && detailBudget > 0) {
      detailBudget--;
      const solo = await getXeroInvoiceStatus(ownerId, r.xeroInvoiceId);
      if (solo) s = { status: solo, amountDue: 0, amountPaid: 0, invoiceNumber: r.invoiceNumber ?? null };
    }
    if (!s) continue;

    if (s.status !== r.status || (s.invoiceNumber && s.invoiceNumber !== r.invoiceNumber)) {
      await db.update(xeroInvoices)
        .set({ status: s.status, invoiceNumber: s.invoiceNumber ?? r.invoiceNumber })
        .where(eq(xeroInvoices.id, r.id));
      if (s.status !== r.status) statusChanges++;
    }

    // Fully paid → the stream is settled on the Payments board.
    if (s.status === "PAID") {
      const streamUpdate = r.stream === "food" ? { foodStatus: "paid" } : { drinksStatus: "paid" };
      await db.update(bookings).set(streamUpdate as any)
        .where(and(eq(bookings.id, r.bookingId), eq(bookings.ownerId, ownerId)));
    }

    // Any money received (including part-payments) gets mirrored into the
    // ledger. VOIDED/DELETED invoices carry no live payments.
    const hasMoney = Number(s.amountPaid ?? 0) > 0;
    const settled = s.status === "VOIDED" || s.status === "DELETED";
    if (!hasMoney || settled || !r.xeroInvoiceId || detailBudget <= 0) continue;
    detailBudget--;

    let xeroPayments;
    try {
      xeroPayments = await getXeroInvoicePayments(ownerId, r.xeroInvoiceId);
    } catch (err: any) {
      console.warn(`[XeroSync] payments lookup failed for ${r.invoiceNumber ?? r.xeroInvoiceId}:`, err?.message ?? err);
      continue;
    }
    if (xeroPayments.length === 0) continue;

    // Skip anything already imported — Xero's PaymentID is the dedup key.
    const seen = await db.select({ xeroPaymentId: payments.xeroPaymentId })
      .from(payments)
      .where(and(
        eq(payments.ownerId, ownerId),
        inArray(payments.xeroPaymentId, xeroPayments.map(p => p.paymentId)),
      ));
    const already = new Set(seen.map(x => x.xeroPaymentId));

    for (const p of xeroPayments) {
      if (already.has(p.paymentId) || !(p.amount > 0)) continue;
      await db.insert(payments).values({
        bookingId: r.bookingId,
        ownerId,
        amount: String(p.amount),
        // The drinks invoice carries the balance; food is the pre-event bill.
        type: r.stream === "food" ? "partial" : "final",
        method: "bank_transfer", // reconciled against a bank line in Xero
        paidAt: new Date(`${p.date}T00:00:00`),
        notes: `Reconciled in Xero · ${r.invoiceNumber ?? r.stream}${p.reference ? ` · ${p.reference}` : ""}`,
        source: "xero",
        xeroPaymentId: p.paymentId,
      });
      paymentsImported++;
      amountImported += p.amount;
    }
  }

  if (paymentsImported > 0) {
    console.log(`[XeroSync] owner ${ownerId}: imported ${paymentsImported} payment(s), $${amountImported.toFixed(2)}`);
  }
  return { statusChanges, paymentsImported, amountImported };
}
