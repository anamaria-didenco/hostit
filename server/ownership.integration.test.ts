/**
 * One venue can't attach rows to another venue's records, and only the
 * platform admin can read the marketing waitlist (prelaunch audit F-01/F-02).
 * Skipped without DATABASE_URL; cleans up after itself.
 */
import { afterAll, describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const HAS_DB = !!process.env.DATABASE_URL;

function ctxFor(id: number, role: "user" | "admin" = "user"): TrpcContext {
  return {
    user: {
      id, openId: `ownership-test-${id}`, email: `owner${id}@ownership.test`, name: `Owner ${id}`,
      loginMethod: "password", role, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    } as NonNullable<TrpcContext["user"]>,
    isTeamMember: false,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

// Owner ids no real or seeded account uses.
const OWNER_A = 990001;
const OWNER_B = 990002;

describe.skipIf(!HAS_DB)("cross-venue writes are refused", () => {
  const a = appRouter.createCaller(ctxFor(OWNER_A));
  const b = appRouter.createCaller(ctxFor(OWNER_B));
  let runsheetId = 0;

  afterAll(async () => {
    if (runsheetId) await a.runsheets.delete({ id: runsheetId }).catch(() => {});
  });

  it("refuses runsheet rows and an F&B list on another venue's runsheet", async () => {
    const created = await a.runsheets.create({ title: "Ownership test", items: [] } as any);
    runsheetId = (created as any).id;
    expect(runsheetId).toBeGreaterThan(0);

    await expect(b.runsheets.addItem({ runsheetId, time: "09:00", title: "Not yours", sortOrder: 0 }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(b.fnb.save({ runsheetId, items: [{ section: "kitchen", dishName: "Not yours", qty: 1, sortOrder: 0 }] }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });

    // The owner still can.
    await expect(a.runsheets.addItem({ runsheetId, time: "09:00", title: "Mine", sortOrder: 0 })).resolves.toHaveProperty("id");
    const sheet = await a.runsheets.get({ id: runsheetId });
    expect(JSON.stringify(sheet)).not.toContain("Not yours");
  });

  it("only the platform admin can list the waitlist", async () => {
    await expect(b.waitlist.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(appRouter.createCaller(ctxFor(OWNER_A, "admin")).waitlist.list()).resolves.toBeInstanceOf(Array);
  });
});
