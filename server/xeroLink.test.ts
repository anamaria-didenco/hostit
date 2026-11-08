import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { and, eq } from "drizzle-orm";

/**
 * Invoices raised straight in Xero were invisible to VenueFlow: no "(VenueFlow
 * #id)" reference, not in the ledger — so never listed in Payments, never
 * synced, and impossible to link to an event. These cover the pieces that now
 * find them, suggest the event, link them and import their payments.
 */

// Only Xero's network calls are faked; linking and the real payment sync run
// against the database.
const xero = {
  invoices: {} as Record<string, any>,
  payments: {} as Record<string, { paymentId: string; amount: number; date: string; reference: string | null }[]>,
};
vi.mock("./xero", async (orig) => {
  const real: any = await orig();
  return {
    ...real,
    getXeroInvoiceDetail: vi.fn(async (_o: number, id: string) => xero.invoices[id] ?? null),
    getXeroInvoiceStatuses: vi.fn(async (_o: number, ids: string[]) =>
      Object.fromEntries(ids.filter(i => xero.invoices[i]).map(i => [i, {
        status: xero.invoices[i].status, amountDue: xero.invoices[i].amountDue, amountPaid: xero.invoices[i].amountPaid, invoiceNumber: xero.invoices[i].number,
      }]))),
    getXeroInvoicePayments: vi.fn(async (_o: number, id: string) => xero.payments[id] ?? []),
    getXeroInvoiceStatus: vi.fn(async (_o: number, id: string) => xero.invoices[id]?.status ?? null),
  };
});

describe("pickUnlinkedInvoices", () => {
  const inv = (over: any) => ({ InvoiceID: "i1", Type: "ACCREC", Status: "PAID", Reference: "", InvoiceNumber: "INV-1", Total: 575, AmountPaid: 575, AmountDue: 0, Contact: { Name: "Acme" }, DateString: "2026-10-01T00:00:00", ...over });

  it("keeps invoices VenueFlow doesn't track, drops tagged / tracked / bills / voided", async () => {
    const { pickUnlinkedInvoices } = await import("./xero");
    const ledger = new Map<string, number | null>([["tracked", 5]]);
    const got = pickUnlinkedInvoices([
      inv({ InvoiceID: "raw1", Reference: "Bar Franco Event" }),
      inv({ InvoiceID: "raw2", Reference: "" }),
      inv({ InvoiceID: "tagged", Reference: "Food — Sam · 10 Oct 2026 (VenueFlow #54)" }),
      inv({ InvoiceID: "tracked" }),
      inv({ InvoiceID: "bill", Type: "ACCPAY" }),
      inv({ InvoiceID: "gone", Status: "VOIDED" }),
      inv({ InvoiceID: "del", Status: "DELETED" }),
    ], ledger);
    expect(got.map(g => g.invoiceId)).toEqual(["raw1", "raw2"]);
    expect(got[0]).toMatchObject({ number: "INV-1", contactName: "Acme", total: 575, amountPaid: 575, date: "2026-10-01" });
  });
});

describe("suggesting the event and the bill", () => {
  it("matches the Xero contact to the event's client, by person, company or email domain", async () => {
    const { suggestBookingIds } = await import("./xeroLink");
    const events = [
      { id: 1, firstName: "Jordan", lastName: "Avery", company: "Northwind Legal Limited", email: "jordan@northwindlegal.example" },
      { id: 2, firstName: "Riley", lastName: "Chen", company: null, email: "riley@gmail.com" },
      { id: 3, firstName: "Sam", lastName: "Okafor", company: "Brightline Optics", email: "sam@brightline.example" },
      { id: 4, firstName: "Sam", lastName: "Other", company: null, email: "sam@other.com" },
    ];
    expect(suggestBookingIds("Jordan Avery - Northwind Legal Limited - PO Box 100, Hamilton 3200", events)[0]).toBe(1);
    expect(suggestBookingIds("Riley Chen", events)).toEqual([2]);
    expect(suggestBookingIds("Brightline Optics — Sam Okafor", events)[0]).toBe(3);
    // Only a company-ish word or a stopword in common is not a match.
    expect(suggestBookingIds("The Harbour x Studio Event", events)).toEqual([]);
    expect(suggestBookingIds("QZ", events)).toEqual([]);
  });

  it("guesses the bill from the wording", async () => {
    const { suggestStream } = await import("./xeroLink");
    expect(suggestStream("Deposit — Sam · 21 Nov 2026")).toBe("deposit");
    expect(suggestStream("Bar Franco Beverage Tab")).toBe("drinks");
    expect(suggestStream("Bar Franco Welcome Drinks")).toBe("drinks");
    expect(suggestStream("Bar Franco Event")).toBe("food");
    expect(suggestStream("")).toBe("food");
    expect(suggestStream(null)).toBe("food");
  });
});

const hasDb = !!process.env.DATABASE_URL;
const d = hasDb ? describe : describe.skip;
const OWNER = 993300 + Math.floor(Math.random() * 500);
const OTHER = OWNER + 700;

d("linking an invoice raised in Xero (DB)", () => {
  const ids: Record<string, number> = {};
  const clears: number[] = [];
  const deps = async () => {
    const { getXeroInvoiceDetail } = await import("./xero");
    const { syncXeroInvoicesForOwner } = await import("./xeroSync");
    return {
      getInvoice: getXeroInvoiceDetail,
      sync: async (o: number, b: number) => { const r = await syncXeroInvoicesForOwner(o, b); return { paymentsImported: r.paymentsImported, amountImported: r.amountImported }; },
      clearCaches: (o: number) => { clears.push(o); },
    };
  };

  beforeAll(async () => {
    const { getDb } = await import("./db");
    const { bookings } = await import("../drizzle/schema");
    const db = (await getDb())!;
    const mk = async (owner: number, key: string, v: Record<string, unknown> = {}) => {
      const [b] = await db.insert(bookings).values({
        ownerId: owner, firstName: key, lastName: "T", email: `${key}@example.com`, status: "confirmed",
        depositNzd: "575.00", depositPaid: false, eventDate: new Date(Date.now() + 5 * 86_400_000), ...v,
      } as any).returning();
      ids[key] = b.id;
    };
    await mk(OWNER, "Deposit");
    await mk(OWNER, "Balance");
    await mk(OTHER, "Theirs");
    xero.invoices = {
      "x-deposit": { invoiceId: "x-deposit", number: "INV-0900", reference: "", contactName: "Deposit T", date: "2026-10-01", status: "PAID", total: 575, amountPaid: 575, amountDue: 0, currency: "NZD", type: "ACCREC" },
      "x-food": { invoiceId: "x-food", number: "INV-0901", reference: "", contactName: "Balance T", date: "2026-10-02", status: "AUTHORISED", total: 2000, amountPaid: 0, amountDue: 2000, currency: "NZD", type: "ACCREC" },
      "x-void": { invoiceId: "x-void", number: "INV-0902", reference: "", contactName: "Balance T", date: "2026-10-02", status: "VOIDED", total: 100, amountPaid: 0, amountDue: 0, currency: "NZD", type: "ACCREC" },
      "x-bill": { invoiceId: "x-bill", number: "BILL-1", reference: "", contactName: "Supplier", date: "2026-10-02", status: "AUTHORISED", total: 100, amountPaid: 0, amountDue: 100, currency: "NZD", type: "ACCPAY" },
    };
    xero.payments = { "x-deposit": [{ paymentId: "pay-1", amount: 575, date: "2026-10-03", reference: "BANK" }] };
  });

  afterAll(async () => {
    const { getDb } = await import("./db");
    const { bookings, payments, xeroInvoices } = await import("../drizzle/schema");
    const db = (await getDb())!;
    for (const o of [OWNER, OTHER]) {
      await db.delete(payments).where(eq(payments.ownerId, o));
      await db.delete(xeroInvoices).where(eq(xeroInvoices.ownerId, o));
      await db.delete(bookings).where(eq(bookings.ownerId, o));
    }
  });

  it("links a paid deposit invoice: payment imported, deposit flips to paid, caches cleared", async () => {
    const { linkExistingInvoice } = await import("./xeroLink");
    const { getDb } = await import("./db");
    const { bookings, payments, xeroInvoices } = await import("../drizzle/schema");
    const db = (await getDb())!;

    const res = await linkExistingInvoice(OWNER, { xeroInvoiceId: "x-deposit", bookingId: ids.Deposit, stream: "deposit", linkedBy: "Ana" }, await deps());
    expect(res).toMatchObject({ invoiceNumber: "INV-0900", status: "PAID", paymentsImported: 1, amountImported: 575 });
    expect(clears).toContain(OWNER);

    const [row] = await db.select().from(xeroInvoices).where(and(eq(xeroInvoices.ownerId, OWNER), eq(xeroInvoices.xeroInvoiceId, "x-deposit")));
    expect(row).toMatchObject({ bookingId: ids.Deposit, stream: "deposit", status: "PAID" });
    expect(row.sentBy).toBe("Linked from Xero · Ana");
    const pays = await db.select().from(payments).where(eq(payments.bookingId, ids.Deposit));
    expect(pays).toHaveLength(1);
    expect(pays[0]).toMatchObject({ type: "deposit", source: "xero", xeroPaymentId: "pay-1" });
    expect(Number(pays[0].amount)).toBe(575);
    const [b] = await db.select().from(bookings).where(eq(bookings.id, ids.Deposit));
    expect(b.depositPaid).toBe(true); // the event's deposit chip now agrees with Xero
  });

  it("links an unpaid food invoice and marks the stream invoiced", async () => {
    const { linkExistingInvoice } = await import("./xeroLink");
    const { getDb } = await import("./db");
    const { bookings } = await import("../drizzle/schema");
    const db = (await getDb())!;
    const res = await linkExistingInvoice(OWNER, { xeroInvoiceId: "x-food", bookingId: ids.Balance, stream: "food" }, await deps());
    expect(res).toMatchObject({ status: "AUTHORISED", paymentsImported: 0 });
    const [b] = await db.select().from(bookings).where(eq(bookings.id, ids.Balance));
    expect((b as any).foodStatus).toBe("invoiced");
  });

  it("refuses double links, other venues' events, voided invoices and bills", async () => {
    const { linkExistingInvoice, LinkError } = await import("./xeroLink");
    const d = await deps();
    await expect(linkExistingInvoice(OWNER, { xeroInvoiceId: "x-deposit", bookingId: ids.Deposit, stream: "deposit" }, d)).rejects.toThrow(/already linked to this event/);
    await expect(linkExistingInvoice(OWNER, { xeroInvoiceId: "x-deposit", bookingId: ids.Balance, stream: "deposit" }, d)).rejects.toThrow(/already linked to another event/);
    await expect(linkExistingInvoice(OWNER, { xeroInvoiceId: "x-void", bookingId: ids.Balance, stream: "food" }, d)).rejects.toThrow(/voided/);
    await expect(linkExistingInvoice(OWNER, { xeroInvoiceId: "x-bill", bookingId: ids.Balance, stream: "food" }, d)).rejects.toThrow(/sales invoices/);
    await expect(linkExistingInvoice(OWNER, { xeroInvoiceId: "nope", bookingId: ids.Balance, stream: "food" }, d)).rejects.toThrow(/doesn't have that invoice/);
    // Someone else's event is "not found", never linkable.
    await expect(linkExistingInvoice(OWNER, { xeroInvoiceId: "x-food", bookingId: ids.Theirs, stream: "food" }, d)).rejects.toThrow(LinkError);
  });

  it("unlinking takes back the payments, un-ticks the deposit, and only works on hand-links", async () => {
    const { unlinkInvoice, LinkError } = await import("./xeroLink");
    const { syncDepositPaidFlag } = await import("./db");
    const { getDb } = await import("./db");
    const { bookings, payments, xeroInvoices } = await import("../drizzle/schema");
    const db = (await getDb())!;
    const [tracked] = await db.select().from(xeroInvoices).where(and(eq(xeroInvoices.ownerId, OWNER), eq(xeroInvoices.xeroInvoiceId, "x-deposit")));

    const out = await unlinkInvoice(OWNER, tracked.id, {
      clearCaches: (o) => { clears.push(o); },
      refreshDeposit: (b, o, down) => syncDepositPaidFlag(b, o, { allowDowngrade: down }) as Promise<void>,
    });
    expect(out.removedPayments).toBe(1);
    expect(await db.select().from(payments).where(eq(payments.bookingId, ids.Deposit))).toHaveLength(0);
    expect(await db.select().from(xeroInvoices).where(eq(xeroInvoices.id, tracked.id))).toHaveLength(0);
    const [b] = await db.select().from(bookings).where(eq(bookings.id, ids.Deposit));
    expect(b.depositPaid).toBe(false);

    // An invoice VenueFlow raised itself can't be un-tracked here.
    const [own] = await db.insert(xeroInvoices).values({ ownerId: OWNER, bookingId: ids.Balance, stream: "drinks", xeroInvoiceId: "own-1", status: "DRAFT", sentBy: "Ana" } as any).returning();
    await expect(unlinkInvoice(OWNER, own.id, { clearCaches: () => {}, refreshDeposit: async () => {} })).rejects.toThrow(LinkError);
    // And another venue can't reach it.
    const [mine] = await db.select().from(xeroInvoices).where(and(eq(xeroInvoices.ownerId, OWNER), eq(xeroInvoices.xeroInvoiceId, "x-food")));
    await expect(unlinkInvoice(OTHER, mine.id, { clearCaches: () => {}, refreshDeposit: async () => {} })).rejects.toThrow(/wasn't found/);
  });
});
