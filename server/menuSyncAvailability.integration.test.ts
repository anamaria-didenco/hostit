import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq } from "drizzle-orm";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import {
  users, leads, bookings, runsheets, proposals, eventSpaces, venueNotifications, venueSettings,
} from "../drizzle/schema";
import { respondToProposal } from "./proposalResponses";
import { markDashboardSeen } from "./sinceLastSeen";
import { zonedWallTimeToDate } from "@shared/eventDate";

/**
 * Availability-by-space, the "since your last visit" feed, and the
 * menu_to_pull notification raised on accept-with-runsheet — through the real
 * routers and database. Throwaway owner ids; skipped without a DB.
 */
const HAS_DB = !!process.env.DATABASE_URL;
const d = HAS_DB ? describe : describe.skip;
const OWNER = 971000 + Math.floor(Math.random() * 7999);
const OTHER = OWNER + 1;

function ctx(id = OWNER): TrpcContext {
  return {
    user: {
      id, openId: `menu-test-${id}`, email: "owner@example.com", name: "Menu Test",
      loginMethod: "local", role: "admin", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    } as any,
    isTeamMember: false,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

const NZ = "Pacific/Auckland";

d("menu sync + availability (DB)", () => {
  const caller = appRouter.createCaller(ctx());

  beforeAll(async () => {
    const db = (await getDb())!;
    for (const id of [OWNER, OTHER]) {
      await db.insert(users).values({ id, openId: `menu-test-${id}`, role: "admin" } as any);
    }
  });

  afterAll(async () => {
    const db = (await getDb())!;
    for (const owner of [OWNER, OTHER]) {
      await db.delete(venueNotifications).where(eq(venueNotifications.ownerId, owner));
      await db.delete(runsheets).where(eq(runsheets.ownerId, owner));
      await db.delete(proposals).where(eq(proposals.ownerId, owner));
      await db.delete(bookings).where(eq(bookings.ownerId, owner));
      await db.delete(leads).where(eq(leads.ownerId, owner));
      await db.delete(eventSpaces).where(eq(eventSpaces.ownerId, owner));
      await db.delete(venueSettings).where(eq(venueSettings.ownerId, owner));
      await db.delete(users).where(eq(users.id, owner));
    }
  });

  it("marks a booked space busy and a free one free, and hides another owner's events", async () => {
    const db = (await getDb())!;
    const [garden] = await db.insert(eventSpaces).values({ ownerId: OWNER, name: "Garden" }).returning();
    const [loft] = await db.insert(eventSpaces).values({ ownerId: OWNER, name: "Loft" }).returning();
    const at = zonedWallTimeToDate(2099, 4, 10, 18, 0, NZ);
    await db.insert(bookings).values({
      ownerId: OWNER, firstName: "Mine", lastName: "Event", email: "m@example.com",
      eventDate: at, status: "confirmed", spaceName: "Garden",
    } as any);
    // Another venue booked the same room and day — must never leak across.
    await db.insert(eventSpaces).values({ ownerId: OTHER, name: "Garden" });
    await db.insert(bookings).values({
      ownerId: OTHER, firstName: "Theirs", lastName: "Event", email: "t@example.com",
      eventDate: at, status: "confirmed", spaceName: "Garden",
    } as any);

    const res = await caller.availability.forDate({ date: "2099-04-10" });
    expect(res.days).toHaveLength(1);
    const day = res.days[0];
    const gardenRow = day.spaces.find(s => s.spaceId === garden.id)!;
    const loftRow = day.spaces.find(s => s.spaceId === loft.id)!;
    expect(gardenRow.busy).toBe(true);
    expect(loftRow.busy).toBe(false);
    // The Garden clash is this owner's event only.
    expect(gardenRow.events).toHaveLength(1);
    expect(gardenRow.events[0].name).toBe("Mine Event");
    expect(JSON.stringify(res)).not.toContain("Theirs");
  });

  it("sinceLastSeen returns only this owner's changes after lastSeenAt", async () => {
    const db = (await getDb())!;
    const base = Date.UTC(2099, 5, 1); // lastSeenAt mark
    await db.update(users).set({ lastSeenAt: base }).where(eq(users.id, OWNER));
    await db.insert(leads).values([
      { ownerId: OWNER, firstName: "Before", email: "b@example.com", source: "manual", status: "new", createdAt: new Date(base - 3_600_000) },
      { ownerId: OWNER, firstName: "After", email: "a@example.com", source: "manual", status: "new", createdAt: new Date(base + 3_600_000) },
      { ownerId: OTHER, firstName: "Stranger", email: "s@example.com", source: "manual", status: "new", createdAt: new Date(base + 3_600_000) },
    ] as any);

    const res = await caller.dashboard.sinceLastSeen();
    expect(res.sinceMs).toBe(base);
    const enquiries = res.items.filter(i => i.kind === "new_enquiry");
    expect(enquiries).toHaveLength(1);
    expect(enquiries[0].title).toContain("After");
    expect(JSON.stringify(res.items)).not.toContain("Before");
    expect(JSON.stringify(res.items)).not.toContain("Stranger");
  });

  it("markDashboardSeen advances the mark but throttles rapid repeats", async () => {
    const first = await markDashboardSeen(OWNER);
    expect(first.moved).toBe(true);
    const again = await markDashboardSeen(OWNER);
    expect(again.moved).toBe(false);
    expect(again.lastSeenAt).toBe(first.lastSeenAt);
  });

  it("accepting a proposal with a run sheet already present raises menu_to_pull", async () => {
    const db = (await getDb())!;
    const at = zonedWallTimeToDate(2099, 7, 20, 18, 0, NZ);
    const [lead] = await db.insert(leads).values({
      ownerId: OWNER, firstName: "Pull", lastName: "Me", email: "pull@example.com",
      eventDate: at, status: "confirmed", source: "manual", spaceName: "Garden",
    } as any).returning();
    const [booking] = await db.insert(bookings).values({
      ownerId: OWNER, leadId: lead.id, firstName: "Pull", lastName: "Me", email: "pull@example.com",
      eventDate: at, status: "confirmed", spaceName: "Garden",
    } as any).returning();
    await db.insert(runsheets).values({
      ownerId: OWNER, leadId: lead.id, bookingId: booking.id, title: "Pull run sheet", eventDate: at,
    });
    const token = `menu-pull-${OWNER}`;
    await db.insert(proposals).values({
      ownerId: OWNER, leadId: lead.id, publicToken: token, title: "Dinner for 40",
      status: "sent", eventDate: at, spaceName: "Garden",
    } as any);

    const r = await respondToProposal({ token, action: "accepted" });
    expect(r.status).toBe("accepted");

    const notes = await db.select().from(venueNotifications)
      .where(and(eq(venueNotifications.ownerId, OWNER), eq(venueNotifications.kind, "menu_to_pull")));
    expect(notes).toHaveLength(1);
    expect(notes[0].bookingId).toBe(booking.id);
    expect(notes[0].link).toContain(`/runsheet?id=`);
  });
});
