/**
 * Proposal money is worked out on the server from the lines, and a proposal
 * the client has accepted or declined can't be changed (prelaunch audit F-21).
 * The DB cases skip without DATABASE_URL; they clean up after themselves.
 */
import { afterAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { leadActivity, leads, proposalDrinks, proposals, quoteItems, quoteSettings, venueNotifications } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { proposalTotals } from "../shared/proposalTotals";

const HAS_DB = !!process.env.DATABASE_URL;
// An owner id no real or seeded account uses.
const OWNER = 990021;

const ctx: TrpcContext = {
  user: {
    id: OWNER, openId: `proposal-lock-${OWNER}`, email: `owner${OWNER}@proposal-lock.test`, name: "Lock Owner",
    loginMethod: "password", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
  } as NonNullable<TrpcContext["user"]>,
  isTeamMember: false,
  req: { protocol: "https", headers: {} } as TrpcContext["req"],
  res: { clearCookie: () => {} } as TrpcContext["res"],
};

const lines = [
  { description: "Venue Hire", qty: 1, unitPrice: 500, total: 500 },
  { description: "🍽 Food Package: Shared Franco", qty: 40, unitPrice: 92, total: 1 }, // stale total from the browser
];

describe("proposalTotals", () => {
  it("matches the builder: lines × price, GST on top, deposit on the GST-inclusive total", () => {
    const m = proposalTotals(lines, 15, 25);
    expect(m.lineItems.map(l => l.total)).toEqual([500, 3680]);
    expect(m.lineItems[1].description).toBe(lines[1].description);
    expect(m.subtotal).toBe(4180);
    expect(m.tax).toBeCloseTo(627, 6);
    expect(m.total).toBeCloseTo(4807, 6);
    expect(m.deposit).toBeCloseTo(1201.75, 6);
  });
});

describe.skipIf(!HAS_DB)("proposal totals and locking (DB)", () => {
  const owner = appRouter.createCaller(ctx);
  const made = { leads: [] as number[], proposals: [] as number[] };

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    if (made.proposals.length) {
      await db.delete(proposalDrinks).where(inArray(proposalDrinks.proposalId, made.proposals));
      await db.delete(quoteItems).where(inArray(quoteItems.proposalId, made.proposals));
      await db.delete(quoteSettings).where(inArray(quoteSettings.proposalId, made.proposals));
      await db.delete(proposals).where(inArray(proposals.id, made.proposals));
    }
    if (made.leads.length) {
      await db.delete(venueNotifications).where(inArray(venueNotifications.leadId, made.leads));
      await db.delete(leadActivity).where(inArray(leadActivity.leadId, made.leads));
      await db.delete(leads).where(inArray(leads.id, made.leads));
    }
  });

  async function newProposal() {
    const lead = await owner.leads.submit({ ownerId: OWNER, firstName: "Lock", lastName: "Test", email: `lock-${Date.now()}@example.com`, eventType: "Birthday", guestCount: 40 });
    made.leads.push(lead.id);
    // The browser's totals are wrong on purpose — the server must ignore them.
    const p = await owner.proposals.create({
      leadId: lead.id, title: "Lock test", lineItems: lines,
      subtotalNzd: 1, taxPercent: 15, taxNzd: 1, totalNzd: 1, depositPercent: 25, depositNzd: 1,
    });
    made.proposals.push(p!.id);
    return p!;
  }
  const row = async (id: number) => {
    const db = await getDb();
    return (await db!.select().from(proposals).where(eq(proposals.id, id)))[0];
  };

  it("stores totals worked out from the lines, not the ones sent", async () => {
    const p = await newProposal();
    let r = await row(p.id);
    expect(Number(r.subtotalNzd)).toBe(4180);
    expect(Number(r.taxNzd)).toBe(627);
    expect(Number(r.totalNzd)).toBe(4807);
    expect(Number(r.depositNzd)).toBe(1201.75);
    expect(JSON.parse(r.lineItems!).map((l: any) => l.total)).toEqual([500, 3680]);

    // Editing the lines with bogus totals: recomputed.
    await owner.proposals.update({
      id: p.id, lineItems: [{ description: "Venue Hire", qty: 2, unitPrice: 250, total: 9999 }],
      subtotalNzd: 1, taxPercent: 15, taxNzd: 1, totalNzd: 1, depositPercent: 25, depositNzd: 1,
    });
    r = await row(p.id);
    expect(Number(r.subtotalNzd)).toBe(500);
    expect(Number(r.totalNzd)).toBe(575);
    expect(Number(r.depositNzd)).toBe(143.75);

    // Only the deposit % changes: re-totalled from the saved lines.
    await owner.proposals.update({ id: p.id, depositPercent: 50 });
    r = await row(p.id);
    expect(Number(r.totalNzd)).toBe(575);
    expect(Number(r.depositNzd)).toBe(287.5);

    // An edit that doesn't touch the money leaves it alone.
    await owner.proposals.update({ id: p.id, spaceName: "Upstairs" });
    r = await row(p.id);
    expect(r.spaceName).toBe("Upstairs");
    expect(Number(r.totalNzd)).toBe(575);
  });

  it("refuses changes to an accepted or declined proposal", async () => {
    for (const status of ["accepted", "declined"] as const) {
      const p = await newProposal();
      const db = await getDb();
      await db!.update(proposals).set({ status }).where(eq(proposals.id, p.id));

      await expect(owner.proposals.update({ id: p.id, title: "Changed", lineItems: [{ description: "Cheaper", qty: 1, unitPrice: 1, total: 1 }] }))
        .rejects.toMatchObject({ code: "BAD_REQUEST", message: `This proposal was ${status} by the client, so it can't be changed. Start a new proposal instead.` });
      await expect(owner.proposals.saveDrinks({ proposalId: p.id, barOption: "cash_bar", selectedDrinks: [], customDrinks: [] }))
        .rejects.toMatchObject({ code: "BAD_REQUEST" });
      await expect(owner.quote.save({ proposalId: p.id, autoBarTab: true, items: [] }))
        .rejects.toMatchObject({ code: "BAD_REQUEST" });

      const r = await row(p.id);
      expect(r.title).toBe("Lock test");
      expect(Number(r.totalNzd)).toBe(4807);
      expect(r.status).toBe(status);
    }
  });
});
