import { trpc } from "@/lib/trpc";

type Utils = ReturnType<typeof trpc.useUtils>;

/**
 * Refresh every surface that shows money or booking figures.
 *
 * Payments, deposits, invoices and billing terms are read on many screens —
 * the Dashboard money tiles, the Payments board, the event drawer, the Event
 * page, Reports, the runsheet, the client/staff portals and the Xero invoice
 * panels. A write that refreshed only some of them left the rest showing stale
 * numbers until the window was refocused ("payments not syncing across the
 * website"). Call this from every payment / deposit / invoice / billing-term
 * write so the whole app agrees immediately, instead of each call-site hand-
 * picking a different (and usually incomplete) subset.
 */
export function invalidateMoney(utils: Utils) {
  // bookings.* covers getById, list and byMonth (the Dashboard month tiles).
  utils.bookings.invalidate();
  utils.payments.invalidate();   // summary, overview, list, received
  utils.dashboard.invalidate();  // revenue / deposits-due tiles, stats
  // xero.* covers eventInvoices (the "Invoices sent" tab, which opts out of
  // focus-refetch) and invoicesForBooking.
  utils.xero.invalidate();
}
