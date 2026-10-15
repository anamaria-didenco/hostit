import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import {
  leads, bookings, payments, proposals, clientPortalTokens, venueNotifications, venueSettings,
  leadActivity, tasks, automatedTaskRuns,
} from "../drizzle/schema";
import { zonedWallTimeToDate } from "@shared/eventDate";

/**
 * Deposits recorded without a deposit amount, the client portal's total and
 * payments permission, and double-bookings kept over the clash warning —
 * through the real routers and database. Throwaway ownerId; skipped without
 * a DB.
 */
const HAS_DB = !!process.env.DATABASE_URL;
const d = HAS_DB ? describe : describe.skip;
const OWNER = 960000 + Math.floor(Math.random() * 9999);

function ctx(): TrpcContext {
  return {
    user: {
      id: OWNER, openId: `money-test-${OWNER}`, email: "owner@example.com", name: "Money Test",
      loginMethod: "local", role: "admin", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    } as any,
    isTeamMember: false,
    req: { protocol: "https", headers: {}, socket: {} } as unknown as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

const at = (day: number, hour = 18) => zonedWallTimeToDate(2099, 4, day, hour, 0, "Pacific/Auckland");

async function booking(values: Partial<typeof bookings.$inferInsert>) {
  const db = (await getDb())!;
  const [b] = await db.insert(bookings).values({
    ownerId: OWNER, firstName: "Test", lastName: "Client", email: "client@example.com",
    eventDate: at(1), status: "confirmed", spaceName: "Main Bar", ...values,
  } as any).returning();
  return b;
}

async function row(id: number) {
  const [b] = await (await getDb())!.select().from(bookings).where(eq(bookings.id, id));
  return b;
}

d("money and double-bookings (DB)", () => {
  const caller = appRouter.createCaller(ctx());

  beforeAll(async () => {
    const db = (await getDb())!;
    await db.insert(venueSettings).values({
      id: sql`(select coalesce(max(id), 0) + 1 from venue_settings)` as any,
      ownerId: OWNER, name: "Money Test Venue", slug: `money-test-${OWNER}`,
    });
  });

  afterAll(async () => {
    const db = (await getDb())!;
    await db.delete(payments).where(eq(payments.ownerId, OWNER));
    await db.delete(clientPortalTokens).where(eq(clientPortalTokens.ownerId, OWNER));
    await db.delete(proposals).where(eq(proposals.ownerId, OWNER));
    await db.delete(venueNotifications).where(eq(venueNotifications.ownerId, OWNER));
    await db.delete(automatedTaskRuns).where(eq(automatedTaskRuns.ownerId, OWNER));
    await db.delete(tasks).where(eq(tasks.ownerId, OWNER));
    await db.delete(leadActivity).where(eq(leadActivity.ownerId, OWNER));
    await db.delete(bookings).where(eq(bookings.ownerId, OWNER));
    await db.delete(leads).where(eq(leads.ownerId, OWNER));
    await db.delete(venueSettings).where(eq(venueSettings.ownerId, OWNER));
  });

  // ── Bug A: deposit recorded with no deposit amount set ────────────────────
  it("a deposit payment on a booking with no deposit amount sets the amount and ticks it paid", async () => {
    const b = await booking({ eventDate: at(20) });
    expect(b.depositNzd).toBeNull();
    await caller.payments.add({ bookingId: b.id, amount: 100, type: "deposit", paidAt: new Date().toISOString() });
    const after = await row(b.id);
    expect(Number(after.depositNzd)).toBe(100);
    expect(after.depositPaid).toBe(true);
  });

  it("leaves a deposit amount the venue set, and bookings marked 'no deposit', alone", async () => {
    const set = await booking({ eventDate: at(21), depositNzd: "500.00" } as any);
    await caller.payments.add({ bookingId: set.id, amount: 100, type: "deposit", paidAt: new Date().toISOString() });
    const s = await row(set.id);
    expect(Number(s.depositNzd)).toBe(500);
    expect(s.depositPaid).toBe(false);

    const none = await booking({ eventDate: at(22), depositRequired: false } as any);
    await caller.payments.add({ bookingId: none.id, amount: 100, type: "deposit", paidAt: new Date().toISOString() });
    const n = await row(none.id);
    expect(n.depositNzd).toBeNull();
    expect(n.depositPaid).toBe(false);

    // A non-deposit payment never sets the deposit amount.
    const other = await booking({ eventDate: at(23) });
    await caller.payments.add({ bookingId: other.id, amount: 100, type: "partial", paidAt: new Date().toISOString() });
    expect((await row(other.id)).depositNzd).toBeNull();
  });

  // ── Bug C: portal total + payments permission ─────────────────────────────
  it("portal falls back to the accepted proposal's total, and says nothing is set when there is none", async () => {
    const db = (await getDb())!;
    const [lead] = await db.insert(leads).values({
      ownerId: OWNER, firstName: "Portal", lastName: "Client", email: "portal@example.com",
      eventDate: at(24), status: "booked", source: "manual",
    }).returning();
    await db.insert(proposals).values({
      ownerId: OWNER, leadId: lead.id, publicToken: `money-test-${OWNER}-accepted`, title: "Wedding",
      status: "accepted", totalNzd: "8280.00",
    } as any);
    const b = await booking({ eventDate: at(24), leadId: lead.id });
    await caller.payments.add({ bookingId: b.id, amount: 1000, type: "deposit", paidAt: new Date().toISOString() });

    const { token } = await caller.portal.create({ bookingId: b.id, clientName: "Portal Client" });
    const view = await caller.portal.getByToken({ token });
    expect(view.paymentSummary?.total).toBe(8280);
    expect(view.paymentSummary?.totalSource).toBe("proposal");
    expect(view.paymentSummary?.outstanding).toBe(7280);
    expect(view.payments).toHaveLength(1);

    // Neither a booking total nor an accepted proposal → 0 ("To be confirmed").
    const bare = await booking({ eventDate: at(25) });
    const { token: t2 } = await caller.portal.create({ bookingId: bare.id });
    const v2 = await caller.portal.getByToken({ token: t2 });
    expect(v2.paymentSummary?.total).toBe(0);
    expect(v2.paymentSummary?.totalSource).toBeNull();

    // A booking total wins over the proposal.
    await db.update(bookings).set({ totalNzd: "9000.00" }).where(eq(bookings.id, b.id));
    const v3 = await caller.portal.getByToken({ token });
    expect(v3.paymentSummary?.total).toBe(9000);
    expect(v3.paymentSummary?.totalSource).toBe("booking");
  });

  it("portal returns no payment rows or summary when the venue turned payments off", async () => {
    const b = await booking({ eventDate: at(26), totalNzd: "2000.00" } as any);
    await caller.payments.add({ bookingId: b.id, amount: 300, type: "partial", paidAt: new Date().toISOString() });
    const { token } = await caller.portal.create({
      bookingId: b.id,
      permissions: { viewProposal: true, viewRunsheet: false, viewBudget: false, approveProposal: true, signContract: false },
    });
    const view = await caller.portal.getByToken({ token });
    expect(view.paymentSummary).toBeNull();
    expect(view.payments).toEqual([]);
    expect(view.paymentInstructions).toBeNull();
    // New links show payments by default, like every link always has.
    const { token: dflt } = await caller.portal.create({ bookingId: b.id });
    const v2 = await caller.portal.getByToken({ token: dflt });
    expect(v2.paymentSummary?.totalPaid).toBe(300);
    expect(v2.payments).toHaveLength(1);
  });

  // ── Bug D: double-bookings kept over the clash warning ────────────────────
  it("saving over a clash flags both events, lists the pair, and Mark resolved clears both", async () => {
    const a = await booking({ firstName: "Alpha", eventDate: at(10) });
    const b = await booking({ firstName: "Bravo", eventDate: at(11) });
    // Without the override the move is refused.
    await expect(caller.bookings.update({ id: b.id, eventDate: at(10, 19).toISOString() }))
      .rejects.toMatchObject({ code: "CONFLICT" });
    expect((await row(b.id)).clashFlaggedAt).toBeNull();

    await caller.bookings.update({ id: b.id, eventDate: at(10, 19).toISOString(), allowClash: true });
    expect((await row(a.id)).clashFlaggedAt).not.toBeNull();
    expect((await row(b.id)).clashFlaggedAt).not.toBeNull();

    const list = await caller.bookings.clashes();
    const pair = list.find(p => [p.a.bookingId, p.b?.bookingId].includes(a.id));
    expect(pair).toBeTruthy();
    expect(new Set([pair!.a.bookingId, pair!.b!.bookingId])).toEqual(new Set([a.id, b.id]));
    expect(list.filter(p => [p.a.bookingId, p.b?.bookingId].includes(a.id))).toHaveLength(1);
    expect(pair!.spaceName).toBe("Main Bar");

    const db = (await getDb())!;
    const alerts = await db.select().from(venueNotifications)
      .where(and(eq(venueNotifications.ownerId, OWNER), eq(venueNotifications.kind, "double_booking")));
    expect(alerts.length).toBeGreaterThanOrEqual(1);

    await caller.bookings.resolveClash({ id: b.id });
    expect((await row(a.id)).clashFlaggedAt).toBeNull();
    expect((await row(b.id)).clashFlaggedAt).toBeNull();
    expect((await caller.bookings.clashes()).some(p => p.a.bookingId === a.id || p.a.bookingId === b.id)).toBe(false);
  });

  it("moving one event off the clash clears both flags", async () => {
    const a = await booking({ firstName: "Charlie", eventDate: at(12) });
    const b = await booking({ firstName: "Delta", eventDate: at(13) });
    await caller.bookings.update({ id: b.id, eventDate: at(12, 20).toISOString(), allowClash: true });
    expect((await row(a.id)).clashFlaggedAt).not.toBeNull();
    await caller.bookings.update({ id: b.id, eventDate: at(14).toISOString() });
    expect((await row(a.id)).clashFlaggedAt).toBeNull();
    expect((await row(b.id)).clashFlaggedAt).toBeNull();
  });

  it("cancelling either event clears the flags", async () => {
    const a = await booking({ firstName: "Echo", eventDate: at(15) });
    const b = await booking({ firstName: "Foxtrot", eventDate: at(16) });
    await caller.bookings.update({ id: b.id, spaceName: "Main Bar", eventDate: at(15, 12).toISOString(), allowClash: true });
    expect((await row(b.id)).clashFlaggedAt).not.toBeNull();
    await caller.bookings.update({ id: a.id, status: "cancelled" });
    expect((await row(a.id)).clashFlaggedAt).toBeNull();
    expect((await row(b.id)).clashFlaggedAt).toBeNull();
  });

  it("'Book anyway' on an enquiry flags the new event and the one it clashes with", async () => {
    const db = (await getDb())!;
    const a = await booking({ firstName: "Golf", eventDate: at(17) });
    const [lead] = await db.insert(leads).values({
      ownerId: OWNER, firstName: "Hotel", lastName: "Client", email: "hotel@example.com",
      eventDate: at(17, 13), status: "contacted", source: "manual", spaceName: "Main Bar",
    }).returning();
    await expect(caller.leads.updateStatus({ id: lead.id, status: "booked" })).rejects.toMatchObject({ code: "CONFLICT" });
    await caller.leads.updateStatus({ id: lead.id, status: "booked", allowClash: true });
    const [created] = await db.select().from(bookings).where(and(eq(bookings.leadId, lead.id), eq(bookings.ownerId, OWNER)));
    expect(created.clashFlaggedAt).not.toBeNull();
    expect((await row(a.id)).clashFlaggedAt).not.toBeNull();
    // Losing the enquiry cancels its event and ends the double-booking.
    await caller.leads.updateStatus({ id: lead.id, status: "lost" });
    expect((await row(a.id)).clashFlaggedAt).toBeNull();
  });

  it("staff logins can't mark a clash resolved", async () => {
    const staff = appRouter.createCaller({ ...ctx(), isStaff: true } as TrpcContext);
    const a = await booking({ firstName: "India", eventDate: at(18) });
    await expect(staff.bookings.resolveClash({ id: a.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
