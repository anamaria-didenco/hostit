import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { leads, leadActivity, bookings, runsheets, fnbItems, tasks, venueSettings, venueNotifications } from "../drizzle/schema";
import { zonedWallTimeToDate } from "@shared/eventDate";

/**
 * A run sheet started from an enquiry stays attached to the event, and the
 * event's guest count reaches the run sheet (food only when asked). Through
 * the real routers and database. Throwaway ownerId; skipped without a DB.
 */
const HAS_DB = !!process.env.DATABASE_URL;
const d = HAS_DB ? describe : describe.skip;
const OWNER = 950000 + Math.floor(Math.random() * 9999);

function ctx(): TrpcContext {
  return {
    user: {
      id: OWNER, openId: `rslinks-test-${OWNER}`, email: "owner@example.com", name: "Links Test",
      loginMethod: "local", role: "admin", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    } as any,
    isTeamMember: false,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

d("run sheets stay with their event (DB)", () => {
  const caller = appRouter.createCaller(ctx());
  const db = async () => (await getDb())!;
  let day = 1;
  // A different date per test so no two events clash.
  const nextDate = () => zonedWallTimeToDate(2099, 5, day++, 18, 0, "Pacific/Auckland");

  async function newLead(over: Record<string, unknown> = {}) {
    const [lead] = await (await db()).insert(leads).values({
      ownerId: OWNER, firstName: "Test", lastName: "Event", email: `rs-${OWNER}@example.com`,
      eventDate: nextDate(), guestCount: 45, spaceName: "Main room", status: "booked", source: "manual", ...over,
    } as any).returning();
    return lead;
  }
  async function newBooking(leadId: number, over: Record<string, unknown> = {}) {
    const [lead] = await (await db()).select().from(leads).where(eq(leads.id, leadId));
    const [b] = await (await db()).insert(bookings).values({
      ownerId: OWNER, leadId, firstName: "Test", lastName: "Event", email: `rs-${OWNER}@example.com`,
      eventDate: lead.eventDate, guestCount: lead.guestCount, spaceName: "Main room", status: "confirmed", ...over,
    } as any).returning();
    return b;
  }
  async function sheet(id: number) {
    const [rs] = await (await db()).select().from(runsheets).where(eq(runsheets.id, id));
    return rs;
  }

  beforeAll(async () => {
    await (await db()).insert(venueSettings).values({
      id: sql`(select coalesce(max(id), 0) + 1 from venue_settings)` as any,
      ownerId: OWNER, name: "Links Test Venue", slug: `rslinks-test-${OWNER}`,
    });
  });

  afterAll(async () => {
    const x = await db();
    const sheetIds = (await x.select({ id: runsheets.id }).from(runsheets).where(eq(runsheets.ownerId, OWNER))).map(r => r.id);
    if (sheetIds.length) await x.delete(fnbItems).where(inArray(fnbItems.runsheetId, sheetIds));
    await x.delete(runsheets).where(eq(runsheets.ownerId, OWNER));
    await x.delete(bookings).where(eq(bookings.ownerId, OWNER));
    await x.delete(tasks).where(eq(tasks.ownerId, OWNER));
    await x.delete(leadActivity).where(eq(leadActivity.ownerId, OWNER));
    await x.delete(venueNotifications).where(eq(venueNotifications.ownerId, OWNER));
    await x.delete(leads).where(eq(leads.ownerId, OWNER));
    await x.delete(venueSettings).where(eq(venueSettings.ownerId, OWNER));
  });

  it("a sheet made from an enquiry that has its event is linked to the event", async () => {
    const lead = await newLead();
    const booking = await newBooking(lead.id);
    const { id } = await caller.runsheets.create({ title: "From enquiry", leadId: lead.id, guestCount: 45 });
    expect((await sheet(id)).bookingId).toBe(booking.id);
    // So opening the run sheet from the event finds it, not nothing.
    expect((await caller.runsheets.list({ bookingId: booking.id })).map(r => r.id)).toEqual([id]);
  });

  it("doesn't guess when the enquiry has no event, or more than one", async () => {
    const none = await newLead({ status: "contacted" });
    const a = await caller.runsheets.create({ title: "No event", leadId: none.id });
    expect((await sheet(a.id)).bookingId).toBeNull();

    const two = await newLead();
    await newBooking(two.id);
    await newBooking(two.id, { eventDate: nextDate() });
    const b = await caller.runsheets.create({ title: "Two events", leadId: two.id });
    expect((await sheet(b.id)).bookingId).toBeNull();
  });

  it("the list reads an event's and its enquiry's sheets both ways", async () => {
    const x = await db();
    const lead = await newLead();
    const booking = await newBooking(lead.id);
    // An old enquiry-only sheet (made before linking existed), and one made on the event.
    const [loose] = await x.insert(runsheets).values({ ownerId: OWNER, leadId: lead.id, title: "Enquiry only" }).returning();
    const [onEvent] = await x.insert(runsheets).values({ ownerId: OWNER, bookingId: booking.id, title: "On the event" }).returning();
    expect((await caller.runsheets.list({ bookingId: booking.id })).map(r => r.id)).toEqual([loose.id, onEvent.id]);
    expect((await caller.runsheets.list({ leadId: lead.id })).map(r => r.id)).toEqual([loose.id, onEvent.id]);
    // Another account's view of the same ids is empty.
    const other = appRouter.createCaller({ ...ctx(), user: { ...ctx().user!, id: OWNER + 1 } as any });
    expect(await other.runsheets.list({ bookingId: booking.id })).toEqual([]);
    expect(await other.runsheets.list({ leadId: lead.id })).toEqual([]);
  });

  it("confirming the enquiry links the sheet it already had", async () => {
    const lead = await newLead({ status: "negotiating" });
    const { id } = await caller.runsheets.create({ title: "Before booking", leadId: lead.id });
    expect((await sheet(id)).bookingId).toBeNull();
    await caller.leads.updateStatus({ id: lead.id, status: "booked" });
    const [booking] = await (await db()).select().from(bookings)
      .where(and(eq(bookings.leadId, lead.id), eq(bookings.ownerId, OWNER)));
    expect(booking).toBeTruthy();
    expect((await sheet(id)).bookingId).toBe(booking.id);
  });

  it("a guest change on the event reaches the run sheet and reports the food", async () => {
    const x = await db();
    const lead = await newLead();
    const booking = await newBooking(lead.id);
    const { id } = await caller.runsheets.create({ title: "Guests", bookingId: booking.id, leadId: lead.id, guestCount: 45 });
    await x.insert(fnbItems).values([
      { runsheetId: id, ownerId: OWNER, section: "kitchen", dishName: "Canapés", qty: 45, sortOrder: 0 },
      { runsheetId: id, ownerId: OWNER, section: "kitchen", dishName: "Mains", qty: 45, sortOrder: 1 },
      { runsheetId: id, ownerId: OWNER, section: "kitchen", dishName: "Cake", qty: 1, sortOrder: 2 },
    ]);
    const before = (await sheet(id)).version;

    // Saving the same number (the drawer sends every field) changes nothing.
    const same = await caller.bookings.update({ id: booking.id, guestCount: 45 } as any);
    expect(same.foodRescale).toBeUndefined();
    expect((await sheet(id)).version).toBe(before);

    const res = await caller.bookings.update({ id: booking.id, guestCount: 50 } as any);
    expect(res.foodRescale).toEqual({ from: 45, to: 50, lines: 2 });
    const rs = await sheet(id);
    expect(rs.guestCount).toBe(50);
    expect(rs.version).toBe(before + 1); // an open builder is warned
    // Food is untouched until asked.
    const qtys = (await x.select().from(fnbItems).where(eq(fnbItems.runsheetId, id))).map(f => f.qty).sort((a, b) => a - b);
    expect(qtys).toEqual([1, 45, 45]);

    // From the enquiry too (the event's 50 reached it).
    await x.insert(fnbItems).values({ runsheetId: id, ownerId: OWNER, section: "foh", dishName: "Bread", qty: 50, sortOrder: 3 });
    const viaLead = await caller.leads.update({ id: lead.id, guestCount: 52 });
    expect(viaLead.foodRescale).toEqual({ from: 50, to: 52, lines: 1 });
    expect((await sheet(id)).guestCount).toBe(52);
    const [b] = await x.select().from(bookings).where(eq(bookings.id, booking.id));
    expect(b.guestCount).toBe(52);
  });

  it("rescaleGuests updates only the lines at the old count, and bumps the version", async () => {
    const x = await db();
    const lead = await newLead();
    const booking = await newBooking(lead.id);
    const [rs] = await x.insert(runsheets).values({ ownerId: OWNER, leadId: lead.id, bookingId: booking.id, title: "Food", guestCount: 45 }).returning();
    await x.insert(fnbItems).values([
      { runsheetId: rs.id, ownerId: OWNER, section: "kitchen", dishName: "Canapés", qty: 45, sortOrder: 0 },
      { runsheetId: rs.id, ownerId: OWNER, section: "kitchen", dishName: "Mains", qty: 45, sortOrder: 1 },
      { runsheetId: rs.id, ownerId: OWNER, section: "foh", dishName: "Cake", qty: 1, sortOrder: 2 },
      { runsheetId: rs.id, ownerId: OWNER, section: "kitchen", dishName: "Vegan", qty: 4, sortOrder: 3 },
    ]);
    const res = await caller.bookings.update({ id: booking.id, guestCount: 50 } as any);
    expect(res.foodRescale).toEqual({ from: 45, to: 50, lines: 2 });
    const before = (await sheet(rs.id)).version;

    const { updated } = await caller.fnb.rescaleGuests({ bookingId: booking.id, from: 45, to: 50 });
    expect(updated).toBe(2);
    const items = await x.select().from(fnbItems).where(eq(fnbItems.runsheetId, rs.id));
    expect(Object.fromEntries(items.map(i => [i.dishName, i.qty]))).toEqual({ "Canapés": 50, Mains: 50, Cake: 1, Vegan: 4 });
    const after = await sheet(rs.id);
    expect(after.version).toBe(before + 1);
    expect(after.lastEditorId).toBeNull();

    // Someone else's event is refused.
    const other = appRouter.createCaller({ ...ctx(), user: { ...ctx().user!, id: OWNER + 1 } as any });
    await expect(other.fnb.rescaleGuests({ bookingId: booking.id, from: 50, to: 60 })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
