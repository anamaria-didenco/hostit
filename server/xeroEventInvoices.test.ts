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

import { pickEventPayments, xeroJsonDate } from "./xero";

describe("event payments mirrored from Xero", () => {
  const events = new Map<string, number | null>([["inv-event", 111]]);
  const accounts = new Map([["acc-1", { name: "ANZ Business", code: "090" }]]);
  const pay = (o: Record<string, any>) => ({
    PaymentID: "p", Date: "/Date(1791504000000+0000)/", Amount: 575, Status: "AUTHORISED", IsReconciled: true,
    Account: { AccountID: "acc-1" }, Invoice: { InvoiceID: "inv-event", InvoiceNumber: "INV-0338", Type: "ACCREC", Contact: { Name: "Julie" } }, ...o,
  });
  const out = pickEventPayments([
    pay({ PaymentID: "p1" }),
    pay({ PaymentID: "p2", Invoice: { InvoiceID: "inv-campari", InvoiceNumber: "INV-0340", Type: "ACCREC", Contact: { Name: "Campari" } } }),
    pay({ PaymentID: "p3", Status: "DELETED" }),
  ], events, accounts);

  it("keeps only live payments on event invoices", () => {
    expect(out.map(p => p.paymentId)).toEqual(["p1"]);
  });
  it("carries the bank account, event and date", () => {
    expect(out[0]).toMatchObject({ accountName: "ANZ Business", bookingId: 111, invoiceNumber: "INV-0338", reconciled: true, date: "2026-10-09" });
  });
  it("reads Xero's JSON dates", () => {
    expect(xeroJsonDate("/Date(1791504000000+0000)/")).toBe("2026-10-09");
    expect(xeroJsonDate("2026-10-09T00:00:00")).toBe("2026-10-09");
    expect(xeroJsonDate(null)).toBeNull();
  });
});
