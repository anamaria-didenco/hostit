/**
 * Recorded payments toward an event's own bill (see paidTowardEventBill).
 * Payments of the event's drinks invoices are left out — drinks are billed
 * on their own bill.
 */
import { and, eq } from "drizzle-orm";
import { getDb } from "./db";
import { payments, xeroInvoices } from "../drizzle/schema";
import { paidTowardEventBill } from "@shared/paymentMath";

export async function paidTowardBookingBill(bookingId: number, ownerId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const [rows, invoices] = await Promise.all([
    db.select({ amount: payments.amount, type: payments.type, xeroInvoiceId: payments.xeroInvoiceId }).from(payments)
      .where(and(eq(payments.bookingId, bookingId), eq(payments.ownerId, ownerId))),
    db.select({ xeroInvoiceId: xeroInvoices.xeroInvoiceId, stream: xeroInvoices.stream }).from(xeroInvoices)
      .where(and(eq(xeroInvoices.bookingId, bookingId), eq(xeroInvoices.ownerId, ownerId))),
  ]);
  const drinks = new Set(invoices.filter(i => i.stream === "drinks" && i.xeroInvoiceId).map(i => i.xeroInvoiceId as string));
  return paidTowardEventBill(rows, drinks);
}
