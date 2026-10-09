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
import { getXeroInvoiceStatuses, getXeroInvoicePayments, getXeroInvoiceStatus, xeroPatience } from "./xero";

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
  // in one go; the next run picks up the remainder. Status-recovery lookups and
  // payment-import fetches get SEPARATE budgets so a backlog of invoices Xero
  // went quiet on can't starve the actual money import.
  let statusBudget = 40;
  let paymentBudget = 40;

  for (const r of rows) {
    let s = r.xeroInvoiceId ? statuses[r.xeroInvoiceId] : undefined;
    // Xero OMITS deleted and voided invoices from the batched IDs response, so
    // an invoice voided in Xero simply vanishes from the answer and our row
    // stays DRAFT forever — "check status" looked like it did nothing. A row
    // Xero went quiet on gets asked about individually (GET by ID does return
    // them), unless we already know it's gone.
    if (!s && r.xeroInvoiceId && r.status !== "VOIDED" && r.status !== "DELETED" && statusBudget > 0) {
      statusBudget--;
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

    // Approving the draft in Xero means the invoice has gone out, so the
    // Payments board should say "invoiced" without anyone re-marking it here.
    // Only the not-yet-invoiced states advance — a stream already marked paid
    // (or invoiced by hand) is never downgraded by a sync.
    // Deposit invoices are their own stream — the deposit-paid flag is derived
    // from the imported deposit-type payment + syncDepositPaidFlag below
    // (which respects `depositRequired`), not set directly here.
    if (r.stream !== "deposit") {
      if (s.status === "AUTHORISED" || s.status === "SUBMITTED") {
        const col = r.stream === "food" ? bookings.foodStatus : bookings.drinksStatus;
        await db.update(bookings)
          .set((r.stream === "food" ? { foodStatus: "invoiced" } : { drinksStatus: "invoiced" }) as any)
          .where(and(
            eq(bookings.id, r.bookingId),
            eq(bookings.ownerId, ownerId),
            inArray(col, ["to_invoice", "on_night"]),
          ));
      }
      // Fully paid → the stream is settled on the Payments board, but only once
      // EVERY tracked invoice for this booking+stream is paid (or gone). With a
      // split/replacement invoice, one PAID invoice must not mark the whole
      // stream settled while a sibling still owes.
      if (s.status === "PAID") {
        const siblings = await db.select({ status: xeroInvoices.status }).from(xeroInvoices)
          .where(and(
            eq(xeroInvoices.ownerId, ownerId),
            eq(xeroInvoices.bookingId, r.bookingId),
            eq(xeroInvoices.stream, r.stream),
          ));
        const allSettled = siblings.every(x => x.status === "PAID" || x.status === "VOIDED" || x.status === "DELETED");
        if (allSettled) {
          const streamUpdate = r.stream === "food" ? { foodStatus: "paid" } : { drinksStatus: "paid" };
          await db.update(bookings).set(streamUpdate as any)
            .where(and(eq(bookings.id, r.bookingId), eq(bookings.ownerId, ownerId)));
        }
      }
    }

    // An invoice voided/deleted in Xero must unwind any payments we mirrored
    // from it, or the app's ledger permanently overstates money vs Xero.
    const settled = s.status === "VOIDED" || s.status === "DELETED";
    if (settled) {
      if (r.xeroInvoiceId) {
        const removed = await db.delete(payments).where(and(
          eq(payments.ownerId, ownerId),
          eq(payments.source, "xero"),
          eq(payments.xeroInvoiceId, r.xeroInvoiceId),
        )).returning({ id: payments.id });
        if (removed.length > 0) {
          const { syncDepositPaidFlag } = await import("./db");
          // Unwinding a voided DEPOSIT invoice can make the deposit unpaid again;
          // a voided food/drinks invoice must not untick a hand-ticked deposit.
          await syncDepositPaidFlag(r.bookingId, ownerId, { allowDowngrade: r.stream === "deposit" });
        }
      }
      continue;
    }

    // Any money received (including part-payments) gets mirrored into the ledger.
    const hasMoney = Number(s.amountPaid ?? 0) > 0;
    if (!hasMoney || !r.xeroInvoiceId || paymentBudget <= 0) continue;
    paymentBudget--;

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
      if (already.has(p.paymentId) || p.amount === 0) continue;
      // A negative Xero payment is a refund/credit reconciled against the bank —
      // import it as a refund (positive amount, type 'refund') so the app's net
      // doesn't overstate what was actually received versus Xero.
      const isRefund = p.amount < 0;
      const streamType = r.stream === "deposit" ? "deposit" : r.stream === "food" ? "partial" : "final";
      // onConflictDoNothing is the race-safety net: the pre-check above skips
      // already-seen ids, but the hourly scheduler, the webhook and an on-board
      // sync can run concurrently for the same owner and both pass that check.
      // The (ownerId, xeroPaymentId) unique index makes the duplicate insert a
      // no-op instead of double-counting the money.
      const inserted = await db.insert(payments).values({
        bookingId: r.bookingId,
        ownerId,
        amount: String(Math.abs(p.amount)),
        // The drinks invoice carries the balance; food is the pre-event bill.
        type: isRefund ? "refund" : streamType,
        method: "bank_transfer", // reconciled against a bank line in Xero
        // Append Z so Xero's calendar date is stored as that UTC day regardless
        // of the server's timezone (containers run UTC).
        paidAt: new Date(`${p.date}T00:00:00Z`),
        notes: `${isRefund ? "Refund reconciled" : "Reconciled"} in Xero · ${r.invoiceNumber ?? r.stream}${p.reference ? ` · ${p.reference}` : ""}`,
        source: "xero",
        xeroPaymentId: p.paymentId,
        xeroInvoiceId: r.xeroInvoiceId,
      }).onConflictDoNothing().returning({ id: payments.id });
      if (inserted.length > 0) {
        paymentsImported++;
        amountImported += p.amount;
      }
    }
    // Money imported from Xero counts toward the deposit exactly like a
    // hand-recorded payment: once the net covers the deposit amount, the
    // deposit chip flips to paid without anyone ticking it.
    if (xeroPayments.length > 0) {
      const { syncDepositPaidFlag } = await import("./db");
      await syncDepositPaidFlag(r.bookingId, ownerId);
    }
  }

  if (paymentsImported > 0) {
    console.log(`[XeroSync] owner ${ownerId}: imported ${paymentsImported} payment(s), $${amountImported.toFixed(2)}`);
  }
  return { statusChanges, paymentsImported, amountImported };
}

/**
 * Background sync, hourly, for every venue with a Xero connection.
 *
 * Approving a draft in Xero tells VenueFlow nothing on its own — before this,
 * the change only landed when someone opened the Payments board (which syncs on
 * open). Now it lands within the hour regardless. One batched status call per
 * venue per run, far inside Xero's 60 req/min tenant limit. Real-time would
 * need Xero webhooks, which require per-app portal setup; the hourly pass is
 * the reliable floor under it.
 */
export function startXeroSyncScheduler(): void {
  // The hourly pass can afford to wait out Xero's rate limit (nobody is
  // watching); interactive calls fail fast instead — see xeroPatience.
  const runAll = () => xeroPatience.run({ maxWaitMs: 65_000, attempts: 4 }, runAllPatiently);
  const runAllPatiently = async () => {
    try {
      const db = await getDb();
      if (!db) return;
      const { xeroConnections } = await import("../drizzle/schema");
      const { isNotNull } = await import("drizzle-orm");
      const conns = await db.select({ ownerId: xeroConnections.ownerId })
        .from(xeroConnections).where(isNotNull(xeroConnections.tenantId));
      for (const c of conns) {
        try {
          await syncXeroInvoicesForOwner(c.ownerId);
        } catch (err: any) {
          // One venue's dead connection must not stop the others syncing.
          console.warn(`[XeroSync scheduler] owner ${c.ownerId}:`, err?.message ?? err);
        }
      }
    } catch (err: any) {
      console.error("[XeroSync scheduler] error:", err?.message ?? err);
    }
  };
  // First pass shortly after boot (migrations settle first), then hourly.
  setTimeout(() => { void runAll(); }, 60 * 1000);
  setInterval(() => { void runAll(); }, 60 * 60 * 1000);
  console.log("[XeroSync] hourly scheduler started");
}
