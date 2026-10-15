import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, sql } from "drizzle-orm";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { staffMayCall } from "./_core/trpc";
import { getDb } from "./db";
import { leads, proposals, venueSettings, teamMembers, leadActivity, bookings, runsheets } from "../drizzle/schema";

/**
 * Launch fixes from the operating-system audit, through the real routers and
 * database: venue details save, proposal send on a booked enquiry, and what
 * staff and team-link sessions can reach. Throwaway ownerId; skipped without
 * a DB.
 */
const HAS_DB = !!process.env.DATABASE_URL;
const d = HAS_DB ? describe : describe.skip;
const OWNER = 980000 + Math.floor(Math.random() * 9999);

function ctx(extra: Partial<TrpcContext> = {}): TrpcContext {
  return {
    user: {
      id: OWNER, openId: `now-test-${OWNER}`, email: "owner@example.com", name: "Now Test",
      loginMethod: "local", role: "admin", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    } as any,
    isTeamMember: false,
    isStaff: false,
    actorName: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
    ...extra,
  };
}

d("audit launch fixes (DB)", () => {
  const owner = appRouter.createCaller(ctx());
  const teamLink = appRouter.createCaller(ctx({ isTeamMember: true, teamMemberId: 1, teamRole: "manager", actorName: "Sam" }));
  const staff = appRouter.createCaller(ctx({ isStaff: true, loginId: 1 }));

  beforeAll(async () => {
    const db = (await getDb())!;
    await db.insert(venueSettings).values({
      id: sql`(select coalesce(max(id), 0) + 1 from venue_settings)` as any,
      ownerId: OWNER, name: "Now Test Venue", slug: `now-test-${OWNER}`, smtpPass: "secret-test-value",
    } as any);
  });

  afterAll(async () => {
    const db = (await getDb())!;
    const ids = (await db.select({ id: leads.id }).from(leads).where(eq(leads.ownerId, OWNER))).map(r => r.id);
    for (const id of ids) await db.delete(leadActivity).where(eq(leadActivity.leadId, id));
    await db.delete(proposals).where(eq(proposals.ownerId, OWNER));
    await db.delete(runsheets).where(eq(runsheets.ownerId, OWNER));
    await db.delete(bookings).where(eq(bookings.ownerId, OWNER));
    await db.delete(leads).where(eq(leads.ownerId, OWNER));
    await db.delete(teamMembers).where(eq(teamMembers.ownerId, OWNER));
    await db.delete(venueSettings).where(eq(venueSettings.ownerId, OWNER));
  });

  it("saves venue details sent with walkthrough days as a list", async () => {
    await owner.venue.update({ name: "Now Test Venue", walkthroughDays: [4, 2, 2] } as any);
    const [vs] = await (await getDb())!.select().from(venueSettings).where(eq(venueSettings.ownerId, OWNER));
    expect((vs as any).walkthroughDays).toBe("2,4");
    await owner.venue.update({ walkthroughDays: "3,5" } as any);
    const [vs2] = await (await getDb())!.select().from(venueSettings).where(eq(venueSettings.ownerId, OWNER));
    expect((vs2 as any).walkthroughDays).toBe("3,5");
  });

  it("sending a proposal keeps a booked enquiry booked, and moves a new one on", async () => {
    const db = (await getDb())!;
    const [booked] = await db.insert(leads).values({ ownerId: OWNER, firstName: "Booked", email: "b@example.com", status: "booked", source: "manual" }).returning();
    const [fresh] = await db.insert(leads).values({ ownerId: OWNER, firstName: "Fresh", email: "f@example.com", status: "new", source: "manual" }).returning();
    for (const lead of [booked, fresh]) {
      const p = await owner.proposals.create({ leadId: lead.id, title: "Menu" } as any);
      await owner.proposals.send({ id: p.id } as any);
    }
    const [b] = await db.select().from(leads).where(eq(leads.id, booked.id));
    const [f] = await db.select().from(leads).where(eq(leads.id, fresh.id));
    expect(b.status).toBe("booked");
    expect(f.status).toBe("proposal_sent");
  });

  it("only the owner sees team access links and manages logins", async () => {
    await owner.team.create({ name: "Sam", role: "manager" });
    expect((await owner.team.list())[0].accessToken).not.toBe("");
    expect((await teamLink.team.list())[0].accessToken).toBe("");
    await expect(teamLink.team.create({ name: "Mallory", role: "admin" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(teamLink.accountLogins.create({ email: "m@example.com", name: "M", password: "password123" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(teamLink.apiTokens.create({ name: "x" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(teamLink.waitlist.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("keeps team links, API tokens, client portals and secrets away from staff", async () => {
    for (const p of ["team.list", "apiTokens.list", "portal.list", "accountLogins.list"]) expect(staffMayCall(p, "query")).toBe(false);
    expect(staffMayCall("bookings.byMonth", "query")).toBe(true);
    const own = await owner.venue.getOwn();
    expect((own as any)?.smtpPass).toBe("secret-test-value");
    const asStaff = await staff.venue.getOwn();
    expect((asStaff as any)?.smtpPass ?? null).toBeNull();
  });

  it("a run sheet save only passes on the guests, type and space it changed", async () => {
    const db = (await getDb())!;
    const at = new Date("2099-04-10T06:30:00Z");
    const [b] = await db.insert(bookings).values({ ownerId: OWNER, firstName: "Stale", email: "s@example.com", eventDate: at, guestCount: 50, spaceName: "Back Bar", status: "confirmed" } as any).returning();
    // The sheet still holds an old count and no space.
    const [rs] = await db.insert(runsheets).values({ ownerId: OWNER, bookingId: b.id, title: "Stale sheet", eventDate: at, guestCount: 45 } as any).returning();
    await owner.runsheets.update({ id: rs.id, notes: "Just a note", guestCount: 45, spaceName: null, eventType: null } as any);
    let [after] = await db.select().from(bookings).where(eq(bookings.id, b.id));
    expect(after.guestCount).toBe(50);
    expect(after.spaceName).toBe("Back Bar");
    await owner.runsheets.update({ id: rs.id, guestCount: 60 } as any);
    [after] = await db.select().from(bookings).where(eq(bookings.id, b.id));
    expect(after.guestCount).toBe(60);
  });
});
