/**
 * Shared money math for payments.
 *
 * Amounts are stored as 2dp decimal strings and summed as JS numbers in several
 * places (the per-booking summary, the payments board, the deposit-paid flag,
 * the dashboard "pending payments" count). Those sites used to disagree — some
 * compared with an exact `>=`, others with a `- 0.01` epsilon — so the same
 * booking could read "paid in full" on the board but "partial" in the summary
 * after a float sum like 0.1 + 0.2. Centralising the maths here (and a single
 * half-cent epsilon) keeps every surface consistent.
 */

export const MONEY_EPSILON = 0.005;

export type PaymentLike = { amount: number | string | null; type: string | null };

/** Round to whole cents, avoiding 0.1+0.2 style float drift. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Net money received for a booking: non-refund payments minus refunds. */
export function netPaid(rows: PaymentLike[]): number {
  return round2(rows.reduce((s, p) => s + (p.type === "refund" ? -1 : 1) * Number(p.amount || 0), 0));
}

/**
 * Money attributable to the deposit — only `deposit`-type payments count.
 * Previously the deposit flag summed EVERY payment type, so a large food or
 * drinks payment (e.g. a $2,000 balance reconciled from Xero) trivially
 * exceeded the deposit amount and falsely flipped "deposit paid" even when no
 * deposit was ever collected.
 */
export function depositPaidAmount(rows: PaymentLike[]): number {
  return round2(rows.filter(p => p.type === "deposit").reduce((s, p) => s + Number(p.amount || 0), 0));
}

/** True when `paid` covers a positive `target` (within half a cent). */
export function covers(paid: number, target: number): boolean {
  return target > 0 && paid >= target - MONEY_EPSILON;
}

export type PaymentStatus = "unpaid" | "partial" | "deposit_paid" | "paid_in_full";

/**
 * Derive the payment status for a booking consistently across surfaces.
 * - `paid_in_full` only when the booking has a real total and it is covered —
 *   never for a booking with no price set (0 − paid = 0 outstanding would
 *   otherwise read as "paid in full").
 * - `deposit_paid` only when a deposit is actually required, configured (> 0)
 *   and the deposit-type payments cover it — not for a deposit-less booking.
 */
export function derivePaymentStatus(args: {
  rows: PaymentLike[];
  total: number;
  depositNzd: number;
  depositRequired: boolean;
}): PaymentStatus {
  const net = netPaid(args.rows);
  if (net <= MONEY_EPSILON) return "unpaid";
  if (args.total > 0 && covers(net, args.total)) return "paid_in_full";
  if (args.depositRequired && covers(depositPaidAmount(args.rows), args.depositNzd)) return "deposit_paid";
  return "partial";
}
