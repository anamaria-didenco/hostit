import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { leads, bookings, proposals, runsheets, venueNotifications, venueSettings, leadActivity } from "../drizzle/schema";
import { eventDayKey, formatEventTime, zonedWallTimeToDate } from "@shared/eventDate";

/**
 * One date per event, through the real routers and database: accepting a
 * proposal keeps the enquiry's start time, and the booking and its runsheet
 * never disagree about the day. Throwaway ownerId; skipped without a DB.
 */
const HAS_DB = !!process.env.DATABASE_URL;
const d = HAS_DB ? describe : describe.skip;
const OWNER = 910000 + Math.floor(Math.random() * 9999);
const NZ = "Pacific/Auckland";

function ctx(): TrpcContext {
  return {
    user: {
      id: OWNER, openId: `dates-test-${OWNER}`, email: "owner@example.com", name: "Dates Test",
      loginMethod: "local", role: "admin", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    } as any,
    isTeamMember: false,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

d("event dates (DB)", () => {
  const caller = appRouter.createCaller(ctx());

  beforeAll(async () => {
    const db = (await getDb())!;
    await db.insert(venueSettings).values({
      id: OWNER as any,
      ownerId: OWNER, name: "Dates Test Venue", slug: `dates-test-${OWNER}`,
    });
  });

  afterAll(async () => {
    const db = (await getDb())!;
    const ids = (await db.select({ id: leads.id }).from(leads).where(eq(leads.ownerId, OWNER))).map(r => r.id);
    if (ids.length) await db.delete(leadActivity).where(inArray(leadActivity.leadId, ids));
    await db.delete(runsheets).where(eq(runsheets.ownerId, OWNER));
    await db.delete(leads).where(eq(leads.ownerId, OWNER));
    await db.delete(bookings).where(eq(bookings.ownerId, OWNER));
    await db.delete(proposals).where(eq(proposals.ownerId, OWNER));
    await db.delete(venueNotifications).where(eq(venueNotifications.ownerId, OWNER));
    await db.delete(venueSettings).where(eq(venueSettings.ownerId, OWNER));
  });

  it("accepting a proposal keeps the enquiry's 7 pm start", async () => {
    const db = (await getDb())!;
    const sevenPm = zonedWallTimeToDate(2027, 11, 6, 19, 0, NZ);
    const [lead] = await db.insert(leads).values({
      ownerId: OWNER, firstName: "Sophie", lastName: "Test", email: "sophie@example.com",
      eventDate: sevenPm, spaceName: "Back Bar", status: "proposal_sent", source: "manual",
    }).returning();
    const token = `dates-test-${OWNER}-${Date.now()}`;
    await db.insert(proposals).values({
      ownerId: OWNER, leadId: lead.id, publicToken: token, title: "Birthday", status: "sent",
      eventDate: new Date("2027-11-06T00:00:00Z"), spaceName: "Back Bar",
    });
    const pub = appRouter.createCaller({ ...ctx(), user: null });
    await pub.proposals.respond({ token, action: "accepted" });
    const [bk] = await db.select().from(bookings).where(eq(bookings.leadId, lead.id));
    expect(eventDayKey(bk.eventDate, NZ)).toBe("2027-11-06");
    expect(formatEventTime(bk.eventDate, NZ)).toBe("7:00 pm");
  });

  it("moving the booking moves its runsheet, and moving the runsheet's day moves the booking at the same time", async () => {
    const db = (await getDb())!;
    const sixThirty = zonedWallTimeToDate(2027, 12, 4, 18, 30, NZ);
    const [bk] = await db.insert(bookings).values({
      ownerId: OWNER, firstName: "Kylie", lastName: "Test", email: "k@example.com",
      eventDate: sixThirty, spaceName: "Restaurant", status: "confirmed",
    }).returning();
    const rs = await caller.runsheets.create({ title: "Engagement", bookingId: bk.id, eventDate: sixThirty.toISOString() });
    const rsId = (rs as any).id ?? (rs as any)?.runsheet?.id;

    // 1. Booking moved a week later (drawer) → runsheet follows.
    const nextWeek = zonedWallTimeToDate(2027, 12, 11, 18, 30, NZ);
    await caller.bookings.update({ id: bk.id, eventDate: nextWeek.toISOString() } as any);
    const [r1] = await db.select().from(runsheets).where(eq(runsheets.id, rsId));
    expect(r1.eventDate?.toISOString()).toBe(nextWeek.toISOString());

    // 2. Runsheet saved without changing the day → booking untouched.
    await caller.runsheets.update({ id: rsId, eventDate: "2027-12-11", guestCount: 40 } as any);
    const [b2] = await db.select().from(bookings).where(eq(bookings.id, bk.id));
    expect(b2.eventDate?.toISOString()).toBe(nextWeek.toISOString());

    // 3. Runsheet moved to the 18th → booking moves to the 18th, still 6:30 pm.
    await caller.runsheets.update({ id: rsId, eventDate: "2027-12-18" } as any);
    const [b3] = await db.select().from(bookings).where(eq(bookings.id, bk.id));
    expect(eventDayKey(b3.eventDate, NZ)).toBe("2027-12-18");
    expect(formatEventTime(b3.eventDate, NZ)).toBe("6:30 pm");
    const [r3] = await db.select().from(runsheets).where(eq(runsheets.id, rsId));
    expect(r3.eventDate?.toISOString()).toBe(b3.eventDate?.toISOString());
  });
});
