import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, sql } from "drizzle-orm";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { leads, bookings, runsheets, fnbItems, venueSettings } from "../drizzle/schema";
import { startTimeOf, zonedWallTimeToDate } from "@shared/eventDate";

/**
 * Edit-conflict protection and the start-time check, through the real
 * routers and database. Throwaway ownerId; skipped without a DB.
 */
const HAS_DB = !!process.env.DATABASE_URL;
const d = HAS_DB ? describe : describe.skip;
const OWNER = 990000 + Math.floor(Math.random() * 9999);

function ctx(): TrpcContext {
  return {
    user: {
      id: OWNER, openId: `conflict-test-${OWNER}`, email: "owner@example.com", name: "Conflict Test",
      loginMethod: "local", role: "admin", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    } as any,
    isTeamMember: false,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

d("run sheet edit conflicts (DB)", () => {
  const caller = appRouter.createCaller(ctx());
  let rsId = 0;
  let bookingId = 0;
  let leadId = 0;

  beforeAll(async () => {
    const db = (await getDb())!;
    await db.insert(venueSettings).values({
      id: OWNER as any,
      ownerId: OWNER, name: "Conflict Test Venue", slug: `conflict-test-${OWNER}`,
    });
    const at = zonedWallTimeToDate(2099, 3, 6, 18, 30, "Pacific/Auckland");
    const [lead] = await db.insert(leads).values({
      ownerId: OWNER, firstName: "Ana", lastName: "Test", email: "ana@example.com", eventDate: at, status: "booked", source: "manual",
    }).returning();
    leadId = lead.id;
    const [b] = await db.insert(bookings).values({
      ownerId: OWNER, leadId, firstName: "Ana", lastName: "Test", email: "ana@example.com", eventDate: at, status: "confirmed",
    } as any).returning();
    bookingId = b.id;
    const [rs] = await db.insert(runsheets).values({
      ownerId: OWNER, bookingId, leadId, title: "Conflict test", eventDate: at, eventStartTime: "18:30",
    }).returning();
    rsId = rs.id;
  });

  afterAll(async () => {
    const db = (await getDb())!;
    await db.delete(fnbItems).where(eq(fnbItems.ownerId, OWNER));
    await db.delete(runsheets).where(eq(runsheets.ownerId, OWNER));
    await db.delete(bookings).where(eq(bookings.ownerId, OWNER));
    await db.delete(leads).where(eq(leads.ownerId, OWNER));
    await db.delete(venueSettings).where(eq(venueSettings.ownerId, OWNER));
  });

  it("refuses a save based on an older version from another editor", async () => {
    const a = await caller.runsheets.update({ id: rsId, notes: "A1", expectedVersion: 0, editorId: "tab-a" });
    expect(a.version).toBe(1);
    // B loaded version 0 too, and saves after A.
    await expect(caller.runsheets.update({ id: rsId, notes: "B1", expectedVersion: 0, editorId: "tab-b" }))
      .rejects.toMatchObject({ code: "CONFLICT" });
    const [row] = await (await getDb())!.select().from(runsheets).where(eq(runsheets.id, rsId));
    expect(row.notes).toBe("A1");
  });

  it("never refuses one editor's own overlapping autosaves", async () => {
    // Both sent with the version tab A had before either landed.
    const r1 = await caller.runsheets.update({ id: rsId, notes: "A2", expectedVersion: 1, editorId: "tab-a" });
    const r2 = await caller.runsheets.update({ id: rsId, kitchenNotes: "K", expectedVersion: 1, editorId: "tab-a" });
    expect(r2.version).toBe(r1.version + 1);
  });

  it("guards the food list the same way, and reports the version", async () => {
    const check = await caller.runsheets.versionCheck({ id: rsId, editorId: "tab-a" });
    expect(check).toMatchObject({ mine: true });
    const item = { section: "kitchen" as const, dishName: "Arancini", qty: 1, sortOrder: 0 };
    await expect(caller.fnb.save({ runsheetId: rsId, items: [item], expectedVersion: 0, editorId: "tab-b" }))
      .rejects.toMatchObject({ code: "CONFLICT" });
    const saved = await caller.fnb.save({ runsheetId: rsId, items: [item], expectedVersion: check!.version, editorId: "tab-b" });
    expect(saved.version).toBe(check!.version + 1);
    expect(await caller.runsheets.versionCheck({ id: rsId, editorId: "tab-a" })).toMatchObject({ mine: false, version: saved.version });
  });

  it("moving the event's time from the event page counts as a change elsewhere", async () => {
    const before = (await caller.runsheets.versionCheck({ id: rsId, editorId: "tab-b" }))!.version;
    await caller.bookings.update({ id: bookingId, eventDate: zonedWallTimeToDate(2099, 3, 6, 19, 0, "Pacific/Auckland").toISOString() } as any);
    const after = (await caller.runsheets.versionCheck({ id: rsId, editorId: "tab-b" }))!;
    expect(after.version).toBe(before + 1);
    expect(after.mine).toBe(false);
  });

  it("finds a start time that disagrees with the event, and settles it either way", async () => {
    const db = (await getDb())!;
    // Event at 7 pm (from the test above); put the runsheet out of step.
    await db.update(runsheets).set({ eventStartTime: "17:45" }).where(eq(runsheets.id, rsId));
    let list = await caller.runsheets.startTimeMismatches();
    expect(list.find(m => m.runsheetId === rsId)).toMatchObject({ runsheetTime: "17:45", bookingTime: "19:00" });

    // Keep the runsheet's: the event and enquiry move to 5:45 pm.
    await caller.runsheets.alignStartTime({ runsheetId: rsId, keep: "runsheet" });
    const [b] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
    const [l] = await db.select().from(leads).where(eq(leads.id, leadId));
    expect(startTimeOf(b.eventDate)).toBe("17:45");
    expect(startTimeOf(l.eventDate)).toBe("17:45");
    list = await caller.runsheets.startTimeMismatches();
    expect(list.find(m => m.runsheetId === rsId)).toBeUndefined();

    // Keep the event's: the runsheet takes it.
    await db.update(runsheets).set({ eventStartTime: "20:00" }).where(eq(runsheets.id, rsId));
    await caller.runsheets.alignStartTime({ runsheetId: rsId, keep: "event" });
    const [rs] = await db.select().from(runsheets).where(eq(runsheets.id, rsId));
    expect(rs.eventStartTime).toBe("17:45");
  });
});
