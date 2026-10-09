import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";

/**
 * "Replace" for an approved, unpaid Xero invoice sent at the wrong amount:
 * the corrected draft is created, then the old invoice is voided.
 */
const calls: string[] = [];
const state = { voidFails: false, precheckFails: false };
vi.mock("./xero", async (orig) => {
  const real: any = await orig();
  return {
    ...real,
    assertInvoiceReplaceable: vi.fn(async () => { calls.push("precheck"); if (state.precheckFails) throw new Error("Money has already been paid"); }),
    createXeroDraftInvoice: vi.fn(async (_o: number, opts: any) => {
      calls.push("create");
      return { invoiceId: `new-${calls.length}`, invoiceNumber: "INV-NEW", status: "DRAFT", total: 575, tenantName: "Test" };
    }),
    voidXeroInvoice: vi.fn(async () => { calls.push("void"); if (state.voidFails) throw new Error("Xero 400"); }),
  };
});

const OWNER = 990078;
const hasDb = !!process.env.DATABASE_URL;

describe("assertVoidable", () => {
  it("allows approved + unpaid, refuses paid/part-paid/other states", async () => {
    const { assertVoidable } = await import("./xero");
    expect(() => assertVoidable({ Status: "AUTHORISED", AmountPaid: 0, AmountCredited: 0 })).not.toThrow();
    expect(() => assertVoidable({ Status: "VOIDED" })).not.toThrow();
    expect(() => assertVoidable({ Status: "AUTHORISED", AmountPaid: 100 })).toThrow(/paid or credited/);
    expect(() => assertVoidable({ Status: "AUTHORISED", AmountCredited: 50 })).toThrow(/paid or credited/);
    expect(() => assertVoidable({ Status: "PAID" })).toThrow(/can't be replaced/);
    expect(() => assertVoidable(null)).toThrow();
  });
});

describe.skipIf(!hasDb)("pushInvoice replaceInvoiceId", () => {
  let bookingId = 0, oldRowId = 0, caller: any;
  const getRows = async () => {
    const { getDb } = await import("./db");
    const { xeroInvoices } = await import("../drizzle/schema");
    const { eq } = await import("drizzle-orm");
    return (await getDb())!.select().from(xeroInvoices).where(eq(xeroInvoices.ownerId, OWNER));
  };
  beforeAll(async () => {
    const { getDb } = await import("./db");
    const { bookings } = await import("../drizzle/schema");
    const db = (await getDb())!;
    const [b] = await db.insert(bookings).values({
      ownerId: OWNER, firstName: "Re", lastName: "Place", email: "re@example.com",
      eventDate: new Date("2026-12-12T07:00:00Z"), status: "confirmed", depositNzd: "575",
    } as any).returning({ id: bookings.id });
    bookingId = b.id;
    const { appRouter } = await import("./routers");
    caller = appRouter.createCaller({
      user: { id: OWNER, openId: "rep-test", name: "Owner", email: null, loginMethod: "local", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
      isTeamMember: false, req: { protocol: "https", headers: {} }, res: { clearCookie: () => {} },
    } as any);
  });
  beforeEach(async () => {
    calls.length = 0; state.voidFails = false; state.precheckFails = false;
    const { getDb } = await import("./db");
    const { xeroInvoices } = await import("../drizzle/schema");
    const { eq } = await import("drizzle-orm");
    const db = (await getDb())!;
    await db.delete(xeroInvoices).where(eq(xeroInvoices.ownerId, OWNER));
    const [r] = await db.insert(xeroInvoices).values({
      ownerId: OWNER, bookingId, stream: "deposit", xeroInvoiceId: "old-1", invoiceNumber: "INV-0337", status: "AUTHORISED", total: "500",
    }).returning({ id: xeroInvoices.id });
    oldRowId = r.id;
  });
  afterAll(async () => {
    const { getDb } = await import("./db");
    const { bookings, xeroInvoices } = await import("../drizzle/schema");
    const { eq } = await import("drizzle-orm");
    const db = (await getDb())!;
    await db.delete(xeroInvoices).where(eq(xeroInvoices.ownerId, OWNER));
    await db.delete(bookings).where(eq(bookings.ownerId, OWNER));
  });

  const input = () => ({ bookingId, stream: "deposit" as const, inclusive: false, replaceInvoiceId: oldRowId, lines: [{ description: "Deposit", quantity: 1, unitAmount: 500 }] });

  it("creates the corrected draft, then voids the old invoice and marks it VOIDED", async () => {
    const r = await caller.xero.pushInvoice(input());
    expect(calls).toEqual(["precheck", "create", "void"]);
    expect(r.replaced).toMatchObject({ number: "INV-0337", voided: true });
    const rows = await getRows();
    expect(rows.find(x => x.id === oldRowId)!.status).toBe("VOIDED");
    expect(rows.some(x => x.invoiceNumber === "INV-NEW" && x.status === "DRAFT")).toBe(true);
  });

  it("if the old invoice can't be voided, the new draft still exists and the result says so", async () => {
    state.voidFails = true;
    const r = await caller.xero.pushInvoice(input());
    expect(r.replaced).toMatchObject({ voided: false });
    expect(r.replaced!.error).toMatch(/Xero 400/);
    expect((await getRows()).find(x => x.id === oldRowId)!.status).toBe("AUTHORISED");
  });

  it("refuses up front (creating nothing) when the old invoice has money against it", async () => {
    state.precheckFails = true;
    await expect(caller.xero.pushInvoice(input())).rejects.toThrow(/already been paid/);
    expect(calls).toEqual(["precheck"]);
    expect((await getRows()).length).toBe(1);
  });

  it("won't replace an invoice of a different type or another event", async () => {
    await expect(caller.xero.pushInvoice({ ...input(), stream: "food" })).rejects.toThrow(/same invoice type/);
    await expect(caller.xero.pushInvoice({ ...input(), replaceInvoiceId: oldRowId + 9999 })).rejects.toThrow(/no longer tracked/);
  });
});
