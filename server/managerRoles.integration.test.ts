import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, sql } from "drizzle-orm";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { venueSettings } from "../drizzle/schema";

/**
 * A team-access-link MANAGER session (isTeamMember, teamRole 'manager') must be
 * refused on the owner-only account procedures — account logins, team links,
 * API tokens and integration (Xero / NBI) settings — while still being allowed
 * the day-to-day reads (enquiries, bookings). Throwaway ownerId; skipped
 * without a DB. The manager acts under the venue owner's user, as real
 * team-link sessions do.
 */
const HAS_DB = !!process.env.DATABASE_URL;
const d = HAS_DB ? describe : describe.skip;
const OWNER = 971000 + Math.floor(Math.random() * 9999);

const ownerUser = {
  id: OWNER, openId: `manager-test-${OWNER}`, email: "owner@example.com", name: "Owner",
  loginMethod: "local", role: "admin", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
} as any;

function baseCtx(): TrpcContext {
  return {
    user: ownerUser,
    isTeamMember: false,
    isStaff: false,
    actorName: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

/** A manager runs under the owner's user but through a team-access link. */
function managerCtx(): TrpcContext {
  return { ...baseCtx(), isTeamMember: true, isStaff: false, teamRole: "manager", teamMemberId: 1, actorName: "Manager" };
}

d("manager role enforcement (DB)", () => {
  const owner = appRouter.createCaller(baseCtx());
  const manager = appRouter.createCaller(managerCtx());

  beforeAll(async () => {
    const db = (await getDb())!;
    await db.insert(venueSettings).values({
      id: sql`(select coalesce(max(id), 0) + 1 from venue_settings)` as any,
      ownerId: OWNER, name: "Manager Test Venue", slug: `manager-test-${OWNER}`,
    });
  });

  afterAll(async () => {
    const db = (await getDb())!;
    await db.delete(venueSettings).where(eq(venueSettings.ownerId, OWNER));
  });

  it("refuses the owner-only account procedures for a manager", async () => {
    await expect(manager.accountLogins.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(manager.team.create({ name: "New Hire", role: "staff" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(manager.apiTokens.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
    // NBI webhook secret is an integration credential — owner only.
    await expect(manager.venue.regenerateNbiWebhookSecret()).rejects.toMatchObject({ code: "FORBIDDEN" });
    // Xero integration settings (guarded with its own isTeamMember check).
    await expect(manager.xero.saveMapping({ salesAccountCode: "200" })).rejects.toThrow();
  });

  it("allows a manager the day-to-day enquiry and booking reads", async () => {
    await expect(manager.leads.list({})).resolves.toBeDefined();
    await expect(manager.bookings.list()).resolves.toBeDefined();
  });
});
