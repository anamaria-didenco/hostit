import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";

/**
 * VenueFlow must stay well inside Xero's 60 requests/minute limit:
 *  - our own requests are paced (background work 30/min, screens 50/min)
 *  - the sync doesn't re-fetch payments it already holds
 */
const reply = (status: number, body: any) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const INVOICE = { Invoices: [{ InvoiceID: "i1", Status: "DRAFT", LineAmountTypes: "Exclusive", LineItems: [] }] };
const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("Xero request pacing", () => {
  const OWNER = 990080;
  beforeAll(async () => {
    const { getDb } = await import("./db");
    const { xeroConnections } = await import("../drizzle/schema");
    await (await getDb())!.insert(xeroConnections).values({
      ownerId: OWNER, tenantId: "t", tenantName: "T", accessToken: "tok", refreshToken: "ref", expiresAt: new Date(Date.now() + 3600_000),
    }).onConflictDoNothing();
  });
  afterEach(() => vi.unstubAllGlobals());
  afterAll(async () => {
    const { getDb } = await import("./db");
    const { xeroConnections } = await import("../drizzle/schema");
    const { eq } = await import("drizzle-orm");
    await (await getDb())!.delete(xeroConnections).where(eq(xeroConnections.ownerId, OWNER));
  });

  it("screens use at most 50 requests a minute, then say so instead of hammering Xero", async () => {
    const f = vi.fn(async () => reply(200, INVOICE));
    vi.stubGlobal("fetch", f);
    const { getXeroInvoiceLines } = await import("./xero");
    for (let i = 0; i < 50; i++) await getXeroInvoiceLines(OWNER, "i1");
    await expect(getXeroInvoiceLines(OWNER, "i1")).rejects.toThrow(/used its requests for this minute/);
    expect(f).toHaveBeenCalledTimes(50);
  });

  it("background work stops sooner (30 a minute) so a sync can't starve the screens", async () => {
    const OWNER2 = OWNER + 1;
    const { getDb } = await import("./db");
    const { xeroConnections } = await import("../drizzle/schema");
    const db = (await getDb())!;
    await db.insert(xeroConnections).values({ ownerId: OWNER2, tenantId: "t", tenantName: "T", accessToken: "tok", refreshToken: "ref", expiresAt: new Date(Date.now() + 3600_000) }).onConflictDoNothing();
    try {
      const f = vi.fn(async () => reply(200, INVOICE));
      vi.stubGlobal("fetch", f);
      const { getXeroInvoiceLines, xeroPatience } = await import("./xero");
      await xeroPatience.run({ maxWaitMs: 100, attempts: 4 }, async () => {
        for (let i = 0; i < 30; i++) await getXeroInvoiceLines(OWNER2, "i1");
        await expect(getXeroInvoiceLines(OWNER2, "i1")).rejects.toThrow(/used its requests for this minute/);
      });
      expect(f).toHaveBeenCalledTimes(30);
      // ...while an interactive call still has headroom in the same minute.
      await getXeroInvoiceLines(OWNER2, "i1");
      expect(f).toHaveBeenCalledTimes(31);
    } finally {
      const { eq } = await import("drizzle-orm");
      await db.delete(xeroConnections).where(eq(xeroConnections.ownerId, OWNER2));
    }
  });
});

describe.skipIf(!hasDb)("sync skips payments it already holds", () => {
  const OWNER = 990082;
  const calls = { payments: 0 };
  let bookingId = 0;
  beforeAll(async () => {
    vi.resetModules();
    vi.doMock("./xero", async (orig) => {
      const real: any = await orig();
      return {
        ...real,
        getXeroInvoiceStatuses: vi.fn(async (_o: number, ids: string[]) => Object.fromEntries(ids.map(id => [id, { status: "PAID", amountDue: 0, amountPaid: id === "inv-same" ? 575 : 700, invoiceNumber: "X" }]))),
        getXeroInvoicePayments: vi.fn(async () => { calls.payments++; return []; }),
        getXeroInvoiceStatus: vi.fn(async () => null),
      };
    });
    const { getDb } = await import("./db");
    const { bookings, xeroInvoices, payments } = await import("../drizzle/schema");
    const db = (await getDb())!;
    const [b] = await db.insert(bookings).values({ ownerId: OWNER, firstName: "S", email: "s@e.com", eventDate: new Date(), status: "confirmed" } as any).returning({ id: bookings.id });
    bookingId = b.id;
    await db.insert(xeroInvoices).values([
      { ownerId: OWNER, bookingId, stream: "deposit", xeroInvoiceId: "inv-same", invoiceNumber: "A", status: "PAID", total: "575" },
      { ownerId: OWNER, bookingId, stream: "food", xeroInvoiceId: "inv-new", invoiceNumber: "B", status: "PAID", total: "700" },
    ]);
    await db.insert(payments).values({ bookingId, ownerId: OWNER, amount: "575", type: "deposit", method: "bank_transfer", paidAt: new Date(), source: "xero", xeroPaymentId: "pay-1", xeroInvoiceId: "inv-same" } as any);
  });
  afterAll(async () => {
    const { getDb } = await import("./db");
    const { bookings, xeroInvoices, payments } = await import("../drizzle/schema");
    const { eq } = await import("drizzle-orm");
    const db = (await getDb())!;
    await db.delete(payments).where(eq(payments.ownerId, OWNER));
    await db.delete(xeroInvoices).where(eq(xeroInvoices.ownerId, OWNER));
    await db.delete(bookings).where(eq(bookings.ownerId, OWNER));
    vi.doUnmock("./xero");
  });

  it("only asks Xero about the invoice whose paid total differs from the ledger", async () => {
    const { syncXeroInvoicesForOwner } = await import("./xeroSync");
    await syncXeroInvoicesForOwner(OWNER);
    expect(calls.payments).toBe(1); // inv-new (700 paid, nothing held) — not inv-same
  });
});
