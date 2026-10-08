import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { TRPCError } from "@trpc/server";
import { eq, inArray, sql } from "drizzle-orm";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { leads, bookings, proposals, venueNotifications, venueSettings, leadActivity } from "../drizzle/schema";
import { runHoldExpiryJob } from "./holds";

/**
 * End-to-end through the real routers and database: holds, the
 * double-booking guard and the expiry job. Runs under a throwaway ownerId and
 * cleans up after itself. Skipped without DATABASE_URL.
 */
const HAS_DB = !!process.env.DATABASE_URL;
const d = HAS_DB ? describe : describe.skip;
const OWNER = 970000 + Math.floor(Math.random() * 9999);

function ctx(): TrpcContext {
  return {
    user: {
      id: OWNER, openId: `holds-test-${OWNER}`, email: "owner@example.com", name: "Holds Test",
      loginMethod: "local", role: "admin", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    } as any,
    isTeamMember: false,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

async function newLead(over: Partial<typeof leads.$inferInsert> = {}) {
  const db = (await getDb())!;
  const [row] = await db.insert(leads).values({
    ownerId: OWNER, firstName: "Test", lastName: "Lead", email: "lead@example.com",
    eventDate: new Date("2027-03-13T00:00:00Z"), spaceName: "Bar", status: "proposal_sent", source: "manual",
    ...over,
  }).returning();
  return row;
}

function conflictOf(e: unknown) {
  expect(e).toBeInstanceOf(TRPCError);
  expect((e as TRPCError).code).toBe("CONFLICT");
  return (e as any).cause.clashes as any[];
}

d("date holds + double-booking guard (DB)", () => {
  const caller = appRouter.createCaller(ctx());

  beforeAll(async () => {
    const db = (await getDb())!;
    // Explicit id: copied dev databases can have this sequence behind the rows.
    await db.insert(venueSettings).values({
      id: sql`(select coalesce(max(id), 0) + 1 from venue_settings)` as any,
      ownerId: OWNER, name: "Holds Test Venue", slug: `holds-test-${OWNER}`,
    });
  });

  afterAll(async () => {
    const db = (await getDb())!;
    const ids = (await db.select({ id: leads.id }).from(leads).where(eq(leads.ownerId, OWNER))).map(r => r.id);
    if (ids.length) await db.delete(leadActivity).where(inArray(leadActivity.leadId, ids));
    await db.delete(leads).where(eq(leads.ownerId, OWNER));
    await db.delete(bookings).where(eq(bookings.ownerId, OWNER));
    await db.delete(proposals).where(eq(proposals.ownerId, OWNER));
    await db.delete(venueNotifications).where(eq(venueNotifications.ownerId, OWNER));
    await db.delete(venueSettings).where(eq(venueSettings.ownerId, OWNER));
  });

  it("places a hold, then blocks a clashing booking until overridden", async () => {
    const holly = await newLead({ firstName: "Holly" });
    const clara = await newLead({ firstName: "Clara", status: "negotiating" });
    const r = await caller.holds.place({ leadId: holly.id, untilDate: "2027-03-05" });
    expect(r.holdUntil.toISOString()).toBe("2027-03-05T10:59:59.000Z");
    expect(r.email).toBeNull();

    const db = (await getDb())!;
    const [h] = await db.select().from(leads).where(eq(leads.id, holly.id));
    expect(h.status).toBe("tentative");
    expect(h.statusBeforeHold).toBe("proposal_sent");

    const err = await caller.leads.updateStatus({ id: clara.id, status: "booked" }).catch(e => e);
    const clashes = conflictOf(err);
    expect(clashes[0].kind).toBe("hold");
    expect(clashes[0].leadId).toBe(holly.id);
    // Nothing changed on the refused attempt.
    const [c0] = await db.select().from(leads).where(eq(leads.id, clara.id));
    expect(c0.status).toBe("negotiating");

    await caller.leads.updateStatus({ id: clara.id, status: "booked", allowClash: true });
    const [c1] = await db.select().from(leads).where(eq(leads.id, clara.id));
    expect(c1.status).toBe("booked");
    const made = await db.select().from(bookings).where(eq(bookings.leadId, clara.id));
    expect(made).toHaveLength(1);
  });

  it("guards booking reschedules but not edits that don't move the date", async () => {
    const db = (await getDb())!;
    const [b1] = await db.insert(bookings).values({
      ownerId: OWNER, firstName: "Anchor", email: "a@example.com", eventDate: new Date("2027-04-10T06:00:00Z"),
      eventEndDate: new Date("2027-04-10T10:00:00Z"), spaceName: "Restaurant", status: "confirmed",
    }).returning();
    const [b2] = await db.insert(bookings).values({
      ownerId: OWNER, firstName: "Mover", email: "m@example.com", eventDate: new Date("2027-04-11T06:00:00Z"),
      spaceName: "Restaurant", status: "confirmed",
    }).returning();
    await caller.bookings.update({ id: b2.id, guestCount: 20 });
    const err = await caller.bookings.update({ id: b2.id, eventDate: "2027-04-10T07:00:00.000Z" }).catch(e => e);
    expect(conflictOf(err)[0].bookingId).toBe(b1.id);
    // Same day, different room: fine.
    await caller.bookings.update({ id: b2.id, eventDate: "2027-04-10T07:00:00.000Z", spaceName: "Bar" });
    // A lunch before the 6pm dinner in the same room is fine too.
    await caller.bookings.update({
      id: b2.id, spaceName: "Restaurant", eventDate: "2027-04-09T23:00:00.000Z", eventEndDate: "2027-04-10T02:00:00.000Z",
    });
  });

  it("bulk-confirm skips clashing leads and reports them", async () => {
    const a = await newLead({ firstName: "Bulk1", eventDate: new Date("2027-05-01T00:00:00Z"), spaceName: "Main Hall" });
    const b = await newLead({ firstName: "Bulk2", eventDate: new Date("2027-05-01T00:00:00Z"), spaceName: "Main Hall" });
    const c = await newLead({ firstName: "Bulk3", eventDate: new Date("2027-05-02T00:00:00Z"), spaceName: "Main Hall" });
    const res = await caller.leads.bulkUpdateStatus({ ids: [a.id, b.id, c.id], status: "booked" });
    expect(res.updated).toBe(2);
    expect(res.skipped).toHaveLength(1);
    expect(res.skipped[0].clashes[0]).toContain("Main Hall is already booked");
  });

  it("public proposal accept is never blocked, but flags the booking and alerts the venue", async () => {
    const db = (await getDb())!;
    const taken = await newLead({ firstName: "Taken", status: "booked", eventDate: new Date("2027-06-05T00:00:00Z"), spaceName: "Terrace" });
    expect(taken.id).toBeGreaterThan(0);
    const client = await newLead({ firstName: "Client", eventDate: new Date("2027-06-05T00:00:00Z"), spaceName: "Terrace" });
    const token = `holds-test-${OWNER}-${Date.now()}`;
    await db.insert(proposals).values({
      ownerId: OWNER, leadId: client.id, publicToken: token, title: "Proposal", status: "sent",
      eventDate: new Date("2027-06-05T00:00:00Z"), spaceName: "Terrace",
    });
    const pub = appRouter.createCaller({ ...ctx(), user: null });
    const r = await pub.proposals.respond({ token, action: "accepted" });
    expect(r.status).toBe("accepted");
    const [bk] = await db.select().from(bookings).where(eq(bookings.leadId, client.id));
    expect(bk.clashFlaggedAt).not.toBeNull();
    const alerts = await db.select().from(venueNotifications).where(eq(venueNotifications.ownerId, OWNER));
    expect(alerts.some(a => a.kind === "double_booking" && a.bookingId === bk.id)).toBe(true);
  });

  it("expiry job: warns a day ahead, releases at expiry, and never repeats", async () => {
    const db = (await getDb())!;
    const now = new Date("2027-01-10T00:00:00Z");
    const soon = await newLead({
      firstName: "Soon", status: "tentative", statusBeforeHold: "proposal_sent",
      holdUntil: new Date(now.getTime() + 6 * 3600_000), eventDate: new Date("2027-07-01T00:00:00Z"),
    });
    const gone = await newLead({
      firstName: "Gone", status: "tentative", statusBeforeHold: "contacted",
      holdUntil: new Date(now.getTime() - 3600_000), eventDate: new Date("2027-07-02T00:00:00Z"),
    });
    const s1 = await runHoldExpiryJob(now, { ownerId: OWNER });
    expect(s1.expiring).toBeGreaterThanOrEqual(1);
    expect(s1.released).toBeGreaterThanOrEqual(1);
    const [g] = await db.select().from(leads).where(eq(leads.id, gone.id));
    expect(g.status).toBe("contacted");
    expect(g.holdUntil).toBeNull();
    const [s] = await db.select().from(leads).where(eq(leads.id, soon.id));
    expect(s.status).toBe("tentative");

    // Second run: nothing new for these two.
    await runHoldExpiryJob(now, { ownerId: OWNER });
    const alerts = await db.select().from(venueNotifications).where(eq(venueNotifications.ownerId, OWNER));
    expect(alerts.filter(a => a.leadId === soon.id && a.kind === "hold_expiring")).toHaveLength(1);
    expect(alerts.filter(a => a.leadId === gone.id && a.kind === "hold_released")).toHaveLength(1);

    // Auto-release off → the venue is only told the hold lapsed.
    await db.update(venueSettings).set({ autoCancelTentative: 0 }).where(eq(venueSettings.ownerId, OWNER));
    const lapsed = await newLead({
      firstName: "Lapsed", status: "tentative", statusBeforeHold: "proposal_sent",
      holdUntil: new Date(now.getTime() - 60_000), eventDate: new Date("2027-07-03T00:00:00Z"),
    });
    await runHoldExpiryJob(now, { ownerId: OWNER });
    await runHoldExpiryJob(now, { ownerId: OWNER });
    const [l] = await db.select().from(leads).where(eq(leads.id, lapsed.id));
    expect(l.status).toBe("tentative");
    const after = await db.select().from(venueNotifications).where(eq(venueNotifications.ownerId, OWNER));
    expect(after.filter(a => a.leadId === lapsed.id && a.kind === "hold_lapsed")).toHaveLength(1);
    await db.update(venueSettings).set({ autoCancelTentative: 1 }).where(eq(venueSettings.ownerId, OWNER));
  });

  it("manual release puts the lead back where it was", async () => {
    const lead = await newLead({ firstName: "Release", status: "negotiating", eventDate: new Date("2027-08-01T00:00:00Z") });
    await caller.holds.place({ leadId: lead.id, untilDate: "2027-07-20" });
    await caller.holds.extend({ leadId: lead.id, untilDate: "2027-07-25" });
    const r = await caller.holds.release({ leadId: lead.id });
    expect(r).toEqual({ released: true, status: "negotiating" });
  });
});
