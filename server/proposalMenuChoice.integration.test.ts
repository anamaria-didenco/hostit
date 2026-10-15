import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, sql } from "drizzle-orm";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { leads, proposals, bookings, venueSettings, menuPackages, leadActivity, venueNotifications, runsheets } from "../drizzle/schema";
import { respondToProposal } from "./proposalResponses";
import { menuBody } from "./proposalMenus";

/**
 * A proposal offering a choice of menus: each priced on its own, the
 * cheapest stored as the "from" price, and accepting books the chosen menu
 * at its own price. Throwaway ownerId; skipped without a DB.
 */
const HAS_DB = !!process.env.DATABASE_URL;
const d = HAS_DB ? describe : describe.skip;
const OWNER = 970000 + Math.floor(Math.random() * 9999);

function ctx(): TrpcContext {
  return {
    user: { id: OWNER, openId: `menu-test-${OWNER}`, email: "o@example.com", name: "Menu Test", loginMethod: "local", role: "admin", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() } as any,
    isTeamMember: false, isStaff: false, actorName: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

d("proposal menu choice (DB)", () => {
  const caller = appRouter.createCaller(ctx());
  let leadId = 0;

  beforeAll(async () => {
    const db = (await getDb())!;
    await db.insert(venueSettings).values({ id: OWNER as any, ownerId: OWNER, name: "Menu Test Venue", slug: `menu-test-${OWNER}` });
    await db.insert(menuPackages).values([
      { ownerId: OWNER, name: "Shared", type: "food", pricePerHead: "80", description: "Three courses", chefNotes: "SHARED · $80 pp\nThree courses\n\nTO START\nFocaccia" },
      { ownerId: OWNER, name: "Tutto", type: "food", pricePerHead: "110", description: "Shared plus canapés" },
    ] as any);
    const [lead] = await db.insert(leads).values({ ownerId: OWNER, firstName: "Choice", email: "c@example.com", status: "new", source: "manual", eventDate: new Date("2099-12-04T06:00:00Z"), spaceName: "Back Bar", guestCount: 40 }).returning();
    leadId = lead.id;
  });

  afterAll(async () => {
    const db = (await getDb())!;
    await db.delete(leadActivity).where(eq(leadActivity.leadId, leadId));
    await db.delete(venueNotifications).where(eq(venueNotifications.ownerId, OWNER));
    await db.delete(runsheets).where(eq(runsheets.ownerId, OWNER));
    await db.delete(bookings).where(eq(bookings.ownerId, OWNER));
    await db.delete(proposals).where(eq(proposals.ownerId, OWNER));
    await db.delete(leads).where(eq(leads.ownerId, OWNER));
    await db.delete(menuPackages).where(eq(menuPackages.ownerId, OWNER));
    await db.delete(venueSettings).where(eq(venueSettings.ownerId, OWNER));
  });

  it("prices each menu on its own and books the one the client picks", async () => {
    const lines = [
      { description: "Venue Hire", qty: 1, unitPrice: 500, total: 500 },
      { description: "🍽 Food Package: Shared", qty: 40, unitPrice: 80, total: 3200 },
      { description: "🍽 Food Package: Tutto", qty: 40, unitPrice: 110, total: 4400 },
    ];
    const p = await caller.proposals.create({ leadId, title: "Choice", lineItems: lines, taxPercent: 15, depositPercent: 25, menuChoice: true, spaceName: "Back Bar", eventDate: "2099-12-04" } as any);
    const db = (await getDb())!;
    let [row] = await db.select().from(proposals).where(eq(proposals.id, p.id));
    // From-price: venue hire + Shared, incl. GST — not both menus added up.
    expect(Number(row.totalNzd)).toBeCloseTo((500 + 3200) * 1.15, 2);
    await caller.proposals.send({ id: p.id });
    [row] = await db.select().from(proposals).where(eq(proposals.id, p.id));

    const view = await caller.proposals.getByToken({ token: row.publicToken });
    expect(view!.menus.map(m => m.name).sort()).toEqual(["Shared", "Tutto"]);
    expect(view!.menus.find(m => m.name === "Shared")!.menu).toBe("TO START\nFocaccia");

    await expect(respondToProposal({ token: row.publicToken, action: "accepted" })).rejects.toThrow(/choose one of the menus/);
    await respondToProposal({ token: row.publicToken, action: "accepted", chosenMenu: "🍽 Food Package: Tutto" });
    [row] = await db.select().from(proposals).where(eq(proposals.id, p.id));
    expect(row.status).toBe("accepted");
    expect(row.menuChoice).toBe(false);
    const kept = JSON.parse(row.lineItems!).map((l: any) => l.description);
    expect(kept).toEqual(["Venue Hire", "🍽 Food Package: Tutto"]);
    const tutto = (500 + 4400) * 1.15;
    expect(Number(row.totalNzd)).toBeCloseTo(tutto, 2);
    const [b] = await db.select().from(bookings).where(eq(bookings.leadId, leadId));
    expect(Number(b.totalNzd)).toBeCloseTo(tutto, 2);
  });

  it("without a choice the menus still add up, as before", async () => {
    const p = await caller.proposals.create({ leadId, title: "Both", lineItems: [
      { description: "🍽 Food Package: Shared", qty: 10, unitPrice: 80, total: 800 },
      { description: "🍽 Food Package: Tutto", qty: 10, unitPrice: 110, total: 1100 },
    ], taxPercent: 15, depositPercent: 25 } as any);
    const [row] = await (await getDb())!.select().from(proposals).where(eq(proposals.id, p.id));
    expect(Number(row.totalNzd)).toBeCloseTo(1900 * 1.15, 2);
  });

  it("drops a menu's opening lines that repeat its name and description", () => {
    expect(menuBody("TUTTO FRANCO · $110 pp\nShared plus canapés. Standing to start\n\nCANAPÉS\nTrio", "Tutto Franco", "Shared plus canapés")).toBe("CANAPÉS\nTrio");
    expect(menuBody("  ", "X", null)).toBeNull();
  });
});
