import { describe, it, expect } from "vitest";
import { pickEventInvoices } from "./xero";

const raw = (over: Record<string, any> = {}) => ({
  InvoiceID: "inv-1", Type: "ACCREC", Status: "DRAFT",
  InvoiceNumber: null, Reference: null, Contact: { Name: "Jamie Rivera" },
  Total: 230, AmountPaid: 0, AmountDue: 230, CurrencyCode: "NZD", ...over,
});

describe("pickEventInvoices — standalone invoices", () => {
  it("includes a ledgered standalone invoice (null booking) with bookingId null", () => {
    const ledger = new Map<string, number | null>([["inv-1", null]]);
    const out = pickEventInvoices([raw()], ledger);
    expect(out).toHaveLength(1);
    expect(out[0].bookingId).toBeNull();
    expect(out[0].contactName).toBe("Jamie Rivera");
  });

  it("keeps a booking invoice's bookingId from the ledger", () => {
    const ledger = new Map<string, number | null>([["inv-1", 42]]);
    const out = pickEventInvoices([raw()], ledger);
    expect(out[0].bookingId).toBe(42);
  });

  it("still picks up a VenueFlow-referenced invoice not in the ledger", () => {
    const out = pickEventInvoices([raw({ InvoiceID: "inv-2", Reference: "Food — X (VenueFlow #7)" })], new Map());
    expect(out).toHaveLength(1);
    expect(out[0].bookingId).toBe(7);
  });

  it("excludes an unrelated invoice (not ledgered, no VenueFlow ref)", () => {
    const out = pickEventInvoices([raw({ InvoiceID: "inv-3", Reference: "Supplier rebate" })], new Map());
    expect(out).toHaveLength(0);
  });
});
