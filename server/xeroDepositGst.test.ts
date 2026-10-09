import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

/**
 * A deposit entered as "$500 excl. GST" is previewed as $575 in the Xero
 * window — it must reach Xero as exclusive (so Xero bills $575), not be
 * silently forced to inclusive (which billed $500).
 */
const sent: any[] = [];
vi.mock("./xero", async (orig) => {
  const real: any = await orig();
  return {
    ...real,
    createXeroDraftInvoice: vi.fn(async (_owner: number, opts: any) => {
      sent.push(opts);
      const sum = opts.lines.reduce((s: number, l: any) => s + l.quantity * l.unitAmount, 0);
      const total = opts.inclusive ? sum : Math.round(sum * 1.15 * 100) / 100;
      return { invoiceId: `test-${sent.length}`, invoiceNumber: `T-${sent.length}`, status: "DRAFT", total, tenantName: "Test" };
    }),
  };
});

const OWNER = 990077;
const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("Xero deposit invoice GST", () => {
  let bookingId = 0;
  let caller: any;
  beforeAll(async () => {
    const { getDb } = await import("./db");
    const { bookings } = await import("../drizzle/schema");
    const db = (await getDb())!;
    const [b] = await db.insert(bookings).values({
      ownerId: OWNER, firstName: "Dee", lastName: "Posit", email: "dee@example.com",
      eventDate: new Date("2026-12-12T07:00:00Z"), status: "confirmed", depositNzd: "575",
    } as any).returning({ id: bookings.id });
    bookingId = b.id;
    const { appRouter } = await import("./routers");
    caller = appRouter.createCaller({
      user: { id: OWNER, openId: "dep-test", name: "Owner", email: null, loginMethod: "local", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
      isTeamMember: false,
      req: { protocol: "https", headers: {} },
      res: { clearCookie: () => {} },
    } as any);
  });
  afterAll(async () => {
    const { getDb } = await import("./db");
    const { bookings, xeroInvoices } = await import("../drizzle/schema");
    const { eq } = await import("drizzle-orm");
    const db = (await getDb())!;
    await db.delete(xeroInvoices).where(eq(xeroInvoices.ownerId, OWNER));
    await db.delete(bookings).where(eq(bookings.ownerId, OWNER));
  });

  it("sends $500 excl. GST as exclusive, so Xero bills $575", async () => {
    const r = await caller.xero.pushInvoice({
      bookingId, stream: "deposit", inclusive: false,
      lines: [{ description: "Deposit", quantity: 1, unitAmount: 500 }],
    });
    expect(sent.at(-1).inclusive).toBe(false);
    expect(r.total).toBe(575);
  });

  it("sends $575 incl. GST as inclusive (still $575)", async () => {
    const r = await caller.xero.pushInvoice({
      bookingId, stream: "deposit", inclusive: true, allowDuplicate: true,
      lines: [{ description: "Deposit", quantity: 1, unitAmount: 575 }],
    });
    expect(sent.at(-1).inclusive).toBe(true);
    expect(r.total).toBe(575);
  });
});
