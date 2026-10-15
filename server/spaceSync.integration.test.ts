import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, sql } from "drizzle-orm";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { leads, bookings, runsheets, fnbItems, proposals, venueSettings } from "../drizzle/schema";
import { zonedWallTimeToDate } from "@shared/eventDate";

/**
 * Event/enquiry space changes reaching the run sheet, through the real
 * routers and database. Throwaway ownerId; skipped without a DB.
 */
const HAS_DB = !!process.env.DATABASE_URL;
const d = HAS_DB ? describe : describe.skip;
const OWNER = 971000 + Math.floor(Math.random() * 8999);

function ctx(): TrpcContext {
  return {
    user: {
      id: OWNER, openId: `space-test-${OWNER}`, email: "owner@example.com", name: "Space Test",
      loginMethod: "local", role: "admin", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    } as any,
    isTeamMember: false,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

// Each event gets its own day so the clash check never fires between tests.
let dayCounter = 10;
const at = (day: number) => zonedWallTimeToDate(2099, 5, day, 18, 0, "Pacific/Auckland");

/** A fresh lead + confirmed booking + two run sheets (one on the old space,
 *  one set to a different room on purpose). */
async function makeEvent(oldSpace: string, otherSpace: string) {
  const db = (await getDb())!;
  const when = at(dayCounter++);
  const [lead] = await db.insert(leads).values({
    ownerId: OWNER, firstName: "Ana", lastName: "Test", email: "ana@example.com",
    eventDate: when, spaceName: oldSpace, status: "booked", source: "manual",
  }).returning();
  const [b] = await db.insert(bookings).values({
    ownerId: OWNER, leadId: lead.id, firstName: "Ana", lastName: "Test", email: "ana@example.com",
    eventDate: when, spaceName: oldSpace, status: "confirmed",
  } as any).returning();
  const [rsFollows] = await db.insert(runsheets).values({
    ownerId: OWNER, bookingId: b.id, leadId: lead.id, title: "Follows", eventDate: when, spaceName: oldSpace,
  }).returning();
  const [rsPinned] = await db.insert(runsheets).values({
    ownerId: OWNER, bookingId: b.id, leadId: lead.id, title: "Pinned", eventDate: when, spaceName: otherSpace,
  }).returning();
  return { leadId: lead.id, bookingId: b.id, rsFollows: rsFollows.id, rsPinned: rsPinned.id };
}

d("event space sync (DB)", () => {
  const caller = appRouter.createCaller(ctx());

  beforeAll(async () => {
    const db = (await getDb())!;
    await db.insert(venueSettings).values({
      id: sql`(select coalesce(max(id), 0) + 1 from venue_settings)` as any,
      ownerId: OWNER, name: "Space Test Venue", slug: `space-test-${OWNER}`,
    });
  });

  afterAll(async () => {
    const db = (await getDb())!;
    await db.delete(fnbItems).where(eq(fnbItems.ownerId, OWNER));
    await db.delete(proposals).where(eq(proposals.ownerId, OWNER));
    await db.delete(runsheets).where(eq(runsheets.ownerId, OWNER));
    await db.delete(bookings).where(eq(bookings.ownerId, OWNER));
    await db.delete(leads).where(eq(leads.ownerId, OWNER));
    await db.delete(venueSettings).where(eq(venueSettings.ownerId, OWNER));
  });

  it("an event space change reaches the enquiry and the matching run sheet", async () => {
    const db = (await getDb())!;
    const ev = await makeEvent("Garden Room", "Private Dining");
    const res = await caller.bookings.update({ id: ev.bookingId, spaceName: "Terrace" } as any);

    const [lead] = await db.select().from(leads).where(eq(leads.id, ev.leadId));
    const [booking] = await db.select().from(bookings).where(eq(bookings.id, ev.bookingId));
    const [follows] = await db.select().from(runsheets).where(eq(runsheets.id, ev.rsFollows));
    expect(lead.spaceName).toBe("Terrace");
    expect(booking.spaceName).toBe("Terrace");
    expect(follows.spaceName).toBe("Terrace");
    // cascaded labels are returned so the UI can say what else changed.
    expect(res.cascaded).toEqual(expect.arrayContaining(["enquiry", "run sheet"]));
  });

  it("leaves a run sheet space a user set differently alone", async () => {
    const db = (await getDb())!;
    const ev = await makeEvent("Garden Room", "Private Dining");
    await caller.bookings.update({ id: ev.bookingId, spaceName: "Terrace" } as any);
    const [pinned] = await db.select().from(runsheets).where(eq(runsheets.id, ev.rsPinned));
    expect(pinned.spaceName).toBe("Private Dining");
  });

  it("an enquiry space change reaches the booking and the matching run sheet", async () => {
    const db = (await getDb())!;
    const ev = await makeEvent("Garden Room", "Private Dining");
    const res = await caller.leads.update({ id: ev.leadId, spaceName: "Rooftop" } as any);

    const [booking] = await db.select().from(bookings).where(eq(bookings.id, ev.bookingId));
    const [follows] = await db.select().from(runsheets).where(eq(runsheets.id, ev.rsFollows));
    const [pinned] = await db.select().from(runsheets).where(eq(runsheets.id, ev.rsPinned));
    expect(booking.spaceName).toBe("Rooftop");
    expect(follows.spaceName).toBe("Rooftop");
    expect(pinned.spaceName).toBe("Private Dining");
    expect(res.cascaded).toEqual(expect.arrayContaining(["run sheet"]));
  });
});
