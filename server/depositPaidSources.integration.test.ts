import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { bookings, venueSettings, xeroInvoices } from "../drizzle/schema";
import { zonedWallTimeToDate } from "@shared/eventDate";
import { zonedYmd } from "./availability";
import { derivePaymentStatus } from "@shared/paymentMath";

/**
 * "Is this deposit paid?" used to have different answers on one Overview: the
 * Deposits-due tile honoured a deposit PAID in Xero, but the Needs-you-today
 * list and the deposit pills only read the booking's own flag. They now agree.
 * Skipped without a DB.
 */
const HAS_DB = !!process.env.DATABASE_URL;
const d = HAS_DB ? describe : describe.skip;
const OWNER = 975000 + Math.floor(Math.random() * 9000);
const TZ = "Pacific/Auckland";
const DAY = 86_400_000;

function ctxFor(id: number): TrpcContext {
  return {
    user: { id, openId: `dep-test-${id}`, email: "owner@example.com", name: "Dep Test", loginMethod: "local", role: "admin",
      createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() } as any,
    isTeamMember: false,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}
function dayAt(n: number, hour = 18): Date {
  const [y, m, dd] = zonedYmd(new Date(Date.now() + n * DAY), TZ).split("-").map(Number);
  return zonedWallTimeToDate(y, m, dd, hour, 0, TZ);
}

d("deposit paid — one answer everywhere (DB)", () => {
  const caller = appRouter.createCaller(ctxFor(OWNER));
  const ids: Record<string, number> = {};

  beforeAll(async () => {
    const db = (await getDb())!;
    await db.insert(venueSettings).values({ ownerId: OWNER, name: "Dep Test", slug: `dep-${OWNER}` } as any);
    const mk = async (key: string, v: Record<string, unknown>) => {
      const [b] = await db.insert(bookings).values({
        ownerId: OWNER, firstName: key, lastName: "T", email: `${key}@example.com`, status: "confirmed",
        depositNzd: "300.00", depositPaid: false, eventDate: dayAt(3), ...v,
      } as any).returning();
      ids[key] = b.id;
      return b;
    };
    await mk("Unpaid", {});
    const xeroPaid = await mk("XeroPaid", {});
    await db.insert(xeroInvoices).values({ ownerId: OWNER, bookingId: xeroPaid.id, stream: "deposit", status: "PAID", xeroInvoiceId: `dep-${OWNER}` } as any);
  });

  afterAll(async () => {
    const db = (await getDb())!;
    await db.delete(xeroInvoices).where(eq(xeroInvoices.ownerId, OWNER));
    await db.delete(bookings).where(eq(bookings.ownerId, OWNER));
    await db.delete(venueSettings).where(eq(venueSettings.ownerId, OWNER));
  });

  it("a deposit paid in Xero is not 'due' in the tile, the list or the pills", async () => {
    const needs = await caller.dashboard.needsAttention();
    const dueIds = needs.deposits.items.map(i => i.bookingId);
    expect(dueIds).toContain(ids.Unpaid);
    expect(dueIds).not.toContain(ids.XeroPaid);

    const upcoming = await caller.dashboard.upcoming();
    const pill = (id: number) => upcoming.events.find((e: any) => e.id === id)?.deposit;
    expect(pill(ids.Unpaid)).toBe("due");
    expect(pill(ids.XeroPaid)).toBe("paid");

    const stats = await caller.dashboard.stats();
    expect(stats.depositsDue).toBe(1); // only the unpaid one — same answer as the list
  });
});

describe("payment status agrees with the deposit-paid flag", () => {
  const base = { total: 2000, depositNzd: 500, depositRequired: true };
  it("a hand-ticked deposit with no payment rows reads as deposit paid, not unpaid", () => {
    expect(derivePaymentStatus({ rows: [], ...base })).toBe("unpaid");
    expect(derivePaymentStatus({ rows: [], ...base, depositFlagPaid: true })).toBe("deposit_paid");
  });
  it("a deposit that arrived as a non-deposit payment is not 'partial' once the flag is set", () => {
    const rows = [{ amount: "500.00", type: "partial" }] as any;
    expect(derivePaymentStatus({ rows, ...base })).toBe("partial");
    expect(derivePaymentStatus({ rows, ...base, depositFlagPaid: true })).toBe("deposit_paid");
  });
  it("never deposit_paid for a no-deposit booking, and paid in full still wins", () => {
    expect(derivePaymentStatus({ rows: [], ...base, depositRequired: false, depositFlagPaid: true })).toBe("unpaid");
    const rows = [{ amount: "2000.00", type: "partial" }] as any;
    expect(derivePaymentStatus({ rows, ...base, depositFlagPaid: true })).toBe("paid_in_full");
  });
});
