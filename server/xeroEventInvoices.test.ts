import { describe, it, expect } from "vitest";
import { pickEventInvoices } from "./xero";

const inv = (o: Record<string, any>) => ({
  Type: "ACCREC", Status: "AUTHORISED", Contact: { Name: "Client" }, Total: 575, AmountPaid: 0, AmountDue: 575,
  DateString: "2026-10-09T00:00:00", DueDateString: "2026-10-16T00:00:00", CurrencyCode: "NZD", SentToContact: true, ...o,
});

describe("event invoices mirrored from Xero", () => {
  const ledger = new Map([["id-ledger", 42]]);
  const raw = [
    inv({ InvoiceID: "id-ref", InvoiceNumber: "INV-0338", Reference: "Deposit — Julie Fitzgerald · 27 Nov 2026 (VenueFlow #111)" }),
    inv({ InvoiceID: "id-ledger", InvoiceNumber: "INV-0339", Reference: "Food — Joy Rudland" }),
    inv({ InvoiceID: "id-campari", InvoiceNumber: "INV-0340", Reference: null, Contact: { Name: "Campari New Zealand Limited" } }),
    inv({ InvoiceID: "id-bill", Type: "ACCPAY", Reference: "(VenueFlow #5)" }),
    inv({ InvoiceID: "id-gone", Status: "DELETED", Reference: "(VenueFlow #6)" }),
  ];
  const out = pickEventInvoices(raw, ledger);

  it("keeps invoices VenueFlow raised or that name a VenueFlow event, and nothing else", () => {
    expect(out.map(i => i.number)).toEqual(["INV-0338", "INV-0339"]);
  });
  it("links each to its event", () => {
    expect(out.find(i => i.number === "INV-0338")!.bookingId).toBe(111);
    expect(out.find(i => i.number === "INV-0339")!.bookingId).toBe(42);
  });
  it("carries Xero's figures and dates as-is", () => {
    expect(out[0]).toMatchObject({ date: "2026-10-09", dueDate: "2026-10-16", amountDue: 575, amountPaid: 0, status: "AUTHORISED", sentToContact: true });
  });
});
