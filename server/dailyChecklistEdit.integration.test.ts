/**
 * Daily checklists: renaming a list (name, category, date, description) and
 * putting its items in a new order, through the real routers and database.
 * Skipped without DATABASE_URL; cleans up after itself.
 */
import { afterAll, describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { dailyChecklistItems, dailyChecklists } from "../drizzle/schema";

const HAS_DB = !!process.env.DATABASE_URL;

function ctxFor(id: number): TrpcContext {
  return {
    user: {
      id, openId: `daily-edit-${id}`, email: `owner${id}@daily.example.test`, name: `Owner ${id}`,
      loginMethod: "password", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    } as NonNullable<TrpcContext["user"]>,
    isTeamMember: false,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

const OWNER_A = 990391;
const OWNER_B = 990392;

describe.skipIf(!HAS_DB)("daily checklists: edit the list, reorder items (DB)", () => {
  const a = appRouter.createCaller(ctxFor(OWNER_A));
  const b = appRouter.createCaller(ctxFor(OWNER_B));
  const pub = appRouter.createCaller({ ...ctxFor(OWNER_A), user: null });

  afterAll(async () => {
    const db = (await getDb())!;
    await db.delete(dailyChecklistItems).where(inArray(dailyChecklistItems.ownerId, [OWNER_A, OWNER_B]));
    await db.delete(dailyChecklists).where(inArray(dailyChecklists.ownerId, [OWNER_A, OWNER_B]));
  });

  it("changes the name, category, date and description, and clears the date", async () => {
    const cl = await a.dailyChecklists.create({ name: "Close down", category: "general", assignedDate: "2026-11-20", description: "Old" });
    await a.dailyChecklists.update({ id: cl.id, name: "  Bar close down  ", category: "closing", assignedDate: null, description: "" });
    const got = await a.dailyChecklists.get({ id: cl.id });
    expect(got).toMatchObject({ name: "Bar close down", category: "closing", assignedDate: null, description: "" });
    await expect(a.dailyChecklists.update({ id: cl.id, name: "   " })).rejects.toThrow();
    // Another venue can't rename it.
    await b.dailyChecklists.update({ id: cl.id, name: "Not yours" });
    expect((await a.dailyChecklists.get({ id: cl.id }))?.name).toBe("Bar close down");
  });

  it("saves a new item order, keeping an item the staff link added meanwhile", async () => {
    const cl = await a.dailyChecklists.create({ name: "Opening" });
    const one = await a.dailyChecklists.addItem({ checklistId: cl.id, text: "One", sortOrder: 0 });
    const two = await a.dailyChecklists.addItem({ checklistId: cl.id, text: "Two", sortOrder: 1 });
    const three = await a.dailyChecklists.addItem({ checklistId: cl.id, text: "Three", sortOrder: 2 });
    // The page last saw One, Two, Three; staff add Four on the live link.
    await pub.dailyChecklists.addItemByToken({ token: cl.token, text: "Four" });
    await a.dailyChecklists.reorderItems({ checklistId: cl.id, ids: [three.id, one.id, two.id] });
    const got = await a.dailyChecklists.get({ id: cl.id });
    expect(got?.items.map(i => i.text)).toEqual(["Three", "One", "Two", "Four"]);
    const live = await pub.dailyChecklists.getByToken({ token: cl.token });
    expect(live?.items.map(i => i.text)).toEqual(["Three", "One", "Two", "Four"]);

    // Another venue can't reorder it.
    await expect(b.dailyChecklists.reorderItems({ checklistId: cl.id, ids: [two.id, one.id] })).rejects.toThrow();
    expect((await a.dailyChecklists.get({ id: cl.id }))?.items.map(i => i.text)).toEqual(["Three", "One", "Two", "Four"]);
  });
});
