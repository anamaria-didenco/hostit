import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";

/**
 * Xero calls made while someone is waiting must fail fast with a plain
 * message (a 429 with a long Retry-After used to be waited out for minutes,
 * leaving the Xero window on "Loading…"). Background jobs stay patient.
 */
const OWNER = 990079;
const hasDb = !!process.env.DATABASE_URL;
const INVOICE = { Invoices: [{ InvoiceID: "i1", Status: "DRAFT", LineAmountTypes: "Exclusive", LineItems: [{ Description: "Deposit", Quantity: 1, UnitAmount: 500 }] }] };
const reply = (status: number, body: any, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

describe.skipIf(!hasDb)("Xero API patience", () => {
  beforeAll(async () => {
    const { getDb } = await import("./db");
    const { xeroConnections } = await import("../drizzle/schema");
    const db = (await getDb())!;
    await db.insert(xeroConnections).values({
      ownerId: OWNER, tenantId: "tenant-1", tenantName: "T", accessToken: "tok", refreshToken: "ref",
      expiresAt: new Date(Date.now() + 3600_000),
    }).onConflictDoNothing();
  });
  afterEach(() => { vi.unstubAllGlobals(); });
  afterAll(async () => {
    const { getDb } = await import("./db");
    const { xeroConnections } = await import("../drizzle/schema");
    const { eq } = await import("drizzle-orm");
    await (await getDb())!.delete(xeroConnections).where(eq(xeroConnections.ownerId, OWNER));
  });

  it("gives up straight away on a long rate-limit wait, with a message a person can act on", async () => {
    const f = vi.fn(async () => reply(429, {}, { "Retry-After": "3600" }));
    vi.stubGlobal("fetch", f);
    const { getXeroInvoiceLines } = await import("./xero");
    const t0 = Date.now();
    await expect(getXeroInvoiceLines(OWNER, "i1")).rejects.toThrow(/Xero is busy.*60 minutes/);
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("still retries a short rate-limit wait", async () => {
    let n = 0;
    vi.stubGlobal("fetch", vi.fn(async () => (++n === 1 ? reply(429, {}, { "Retry-After": "1" }) : reply(200, INVOICE))));
    const { getXeroInvoiceLines } = await import("./xero");
    const r = await getXeroInvoiceLines(OWNER, "i1");
    expect(n).toBe(2);
    expect(r.lines[0].unitAmount).toBe(500);
  });

  it("every request carries a timeout signal", async () => {
    const f = vi.fn(async (_u: any, init: any) => { expect(init.signal).toBeInstanceOf(AbortSignal); return reply(200, INVOICE); });
    vi.stubGlobal("fetch", f);
    const { getXeroInvoiceLines } = await import("./xero");
    await getXeroInvoiceLines(OWNER, "i1");
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("a stalled request becomes a readable error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { const e: any = new Error("aborted"); e.name = "TimeoutError"; throw e; }));
    const { getXeroInvoiceLines } = await import("./xero");
    await expect(getXeroInvoiceLines(OWNER, "i1")).rejects.toThrow(/didn't answer in time/);
  });

  it("background jobs (xeroPatience) wait out a rate limit that interactive calls refuse", async () => {
    let n = 0;
    vi.stubGlobal("fetch", vi.fn(async () => (++n === 1 ? reply(429, {}, { "Retry-After": "2" }) : reply(200, INVOICE))));
    const { getXeroInvoiceLines, xeroPatience } = await import("./xero");
    // 2s is under the interactive 8s ceiling, so both retry; the difference shows at 20s:
    const r = await xeroPatience.run({ maxWaitMs: 65_000, attempts: 4 }, () => getXeroInvoiceLines(OWNER, "i1"));
    expect(r.lines.length).toBe(1);
    expect(n).toBe(2);
  });
});
