import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { leads, bookings, runsheets, tasks, venueNotifications, venueSettings, proposals } from "../drizzle/schema";
import { zonedWallTimeToDate } from "@shared/eventDate";
import { zonedYmd } from "./availability";

/**
 * The Overview's "Needs you today" query and the Today / Upcoming panels,
 * through the real router and database. Two throwaway owners prove one venue
 * never sees the other's rows; skipped without a DB.
 */
const HAS_DB = !!process.env.DATABASE_URL;
const d = HAS_DB ? describe : describe.skip;
const OWNER = 960000 + Math.floor(Math.random() * 9000);
const OTHER = OWNER + 9500;
const TZ = "Pacific/Auckland";
const DAY = 86_400_000;
const HOUR = 3_600_000;

function ctxFor(id: number, extra: Partial<TrpcContext> = {}): TrpcContext {
  return {
    user: {
      id, openId: `needs-test-${id}`, email: "owner@example.com", name: "Needs Test",
      loginMethod: "local", role: "admin", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    } as any,
    isTeamMember: false,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
    ...extra,
  };
}

/** 6 pm on the venue day `n` days from today. */
function dayAt(n: number, hour = 18): Date {
  const [y, m, dd] = zonedYmd(new Date(Date.now() + n * DAY), TZ).split("-").map(Number);
  return zonedWallTimeToDate(y, m, dd, hour, 0, TZ);
}

d("needs-attention query (DB)", () => {
  const caller = appRouter.createCaller(ctxFor(OWNER));
  const other = appRouter.createCaller(ctxFor(OTHER));
  const ids: Record<string, number> = {};
  // Bookings and enquiries number from 1 separately, so track them apart.
  const owned: Record<string, { b: Set<number>; l: Set<number> }> = { A: { b: new Set(), l: new Set() }, B: { b: new Set(), l: new Set() } };

  const seed = async (owner: number, tag: string) => {
    const db = (await getDb())!;
    const mkBooking = async (key: string, v: Record<string, unknown>) => {
      const [b] = await db.insert(bookings).values({
        ownerId: owner, firstName: key, lastName: tag, email: `${key}@example.com`, status: "confirmed", ...v,
      } as any).returning();
      ids[`${tag}:${key}`] = b.id;
      owned[tag].b.add(b.id);
      return b;
    };
    const mkLead = async (key: string, v: Record<string, unknown>) => {
      const [l] = await db.insert(leads).values({
        ownerId: owner, firstName: key, lastName: tag, email: `${key}@example.com`, status: "new", source: "form", ...v,
      } as any).returning();
      ids[`${tag}:${key}`] = l.id;
      owned[tag].l.add(l.id);
      return l;
    };
    // Events: today ×2, +3 ×2, +10, +30, no-deposit, tentative, cancelled.
    const tonightNoSheet = await mkBooking("TonightBare", { eventDate: dayAt(0), spaceName: "Main Room", guestCount: 40, depositNzd: "500.00", depositPaid: false });
    const tonightReady = await mkBooking("TonightReady", { eventDate: dayAt(0, 12), depositNzd: "500.00", depositPaid: true });
    await db.insert(runsheets).values({ ownerId: owner, bookingId: tonightReady.id, title: "RS", eventDate: tonightReady.eventDate });
    await mkBooking("Soon", { eventDate: dayAt(3), depositNzd: "300.00", depositPaid: false });
    const soonReady = await mkBooking("SoonReady", { eventDate: dayAt(3, 12), depositNzd: "300.00", depositPaid: true });
    await db.insert(runsheets).values({ ownerId: owner, bookingId: soonReady.id, title: "RS", eventDate: soonReady.eventDate });
    await mkBooking("Mid", { eventDate: dayAt(10), depositNzd: "200.00", depositPaid: false });
    await mkBooking("Far", { eventDate: dayAt(30), depositNzd: "200.00", depositPaid: false });
    await mkBooking("NoDeposit", { eventDate: dayAt(5), depositRequired: false, depositPaid: false });
    await mkBooking("Maybe", { eventDate: dayAt(4), status: "tentative", depositPaid: false });
    await mkBooking("Gone", { eventDate: dayAt(2), status: "cancelled", depositPaid: false });
    await mkBooking("Past", { eventDate: dayAt(-3), depositPaid: false });

    // Tasks: 7 overdue (cap test), plus ones that must not appear.
    for (let i = 1; i <= 7; i++) {
      await db.insert(tasks).values({ ownerId: owner, title: `Overdue ${i}`, dueDate: Date.now() - i * DAY, completed: false, createdAt: Date.now(), updatedAt: Date.now() });
    }
    await db.insert(tasks).values({ ownerId: owner, title: "Done", dueDate: Date.now() - 2 * DAY, completed: true, createdAt: Date.now(), updatedAt: Date.now() });
    await db.insert(tasks).values({ ownerId: owner, title: "Later", dueDate: Date.now() + 2 * DAY, completed: false, createdAt: Date.now(), updatedAt: Date.now() });
    await db.insert(tasks).values({ ownerId: owner, title: "Undated", completed: false, createdAt: Date.now(), updatedAt: Date.now() });

    // Enquiries.
    await mkLead("Waiting", { createdAt: new Date(Date.now() - 32 * HOUR) });
    await mkLead("Fresh", { createdAt: new Date(Date.now() - 10 * 60_000) });
    await mkLead("Typed", { createdAt: new Date(Date.now() - 32 * HOUR), source: "manual" });
    await mkLead("Answered", { createdAt: new Date(Date.now() - 32 * HOUR), firstResponseAt: new Date() });
    await mkLead("ChaseMe", { status: "contacted", followUpDate: new Date(Date.now() - 2 * DAY) });
    await mkLead("ChaseLater", { status: "contacted", followUpDate: new Date(Date.now() + 3 * DAY) });
    await mkLead("LostChase", { status: "lost", followUpDate: new Date(Date.now() - 2 * DAY) });
    const holding = await mkLead("Holding", { status: "tentative", holdUntil: new Date(Date.now() + DAY), eventDate: dayAt(6) });
    const notHolding = await mkLead("Released", { status: "contacted" });

    // Alerts: only the still-true, unread, money/decision kinds count.
    const clash = await mkBooking("Clash", { eventDate: dayAt(8), depositPaid: true, clashFlaggedAt: new Date() });
    const resolved = await mkBooking("Resolved", { eventDate: dayAt(9), depositPaid: true });
    const note = (kind: string, v: Record<string, unknown>) =>
      db.insert(venueNotifications).values({ ownerId: owner, kind, title: `${kind} ${tag}`, ...v } as any);
    await note("double_booking", { bookingId: clash.id, link: `/event/${clash.id}` });
    await note("double_booking", { bookingId: resolved.id, link: `/event/${resolved.id}` });
    await note("hold_expiring", { leadId: holding.id });
    await note("hold_expiring", { leadId: notHolding.id });
    await note("double_booking", { bookingId: clash.id, readAt: new Date() });
    await note("reply_overdue", { leadId: ids[`${tag}:Waiting`] });
    const [prop] = await db.insert(proposals).values({
      ownerId: owner, leadId: holding.id, publicToken: `needs-${owner}-${tag}`, title: "Doubled",
      lineItems: JSON.stringify([
        { description: "🍽 Food Package: Shared", qty: 1, unitPrice: 50, total: 50 },
        { description: "🍽 Food Package: Shared", qty: 1, unitPrice: 50, total: 50 },
      ]),
    } as any).returning();
    await note("proposal_doubled", { link: `/proposals/new?proposalId=${prop.id}` });
  };

  beforeAll(async () => {
    const db = (await getDb())!;
    for (const [owner, tag] of [[OWNER, "A"], [OTHER, "B"]] as const) {
      await db.insert(venueSettings).values({ ownerId: owner, name: `Needs ${tag}`, slug: `needs-${owner}`, replyOverdueEnabled: 1, replyOverdueHours: 2 } as any);
      await seed(owner, tag);
    }
  });

  afterAll(async () => {
    const db = (await getDb())!;
    for (const owner of [OWNER, OTHER]) {
      await db.delete(venueNotifications).where(eq(venueNotifications.ownerId, owner));
      await db.delete(tasks).where(eq(tasks.ownerId, owner));
      await db.delete(runsheets).where(eq(runsheets.ownerId, owner));
      await db.delete(proposals).where(eq(proposals.ownerId, owner));
      await db.delete(bookings).where(eq(bookings.ownerId, owner));
      await db.delete(leads).where(eq(leads.ownerId, owner));
      await db.delete(venueSettings).where(eq(venueSettings.ownerId, owner));
    }
  });

  it("(a) lists today's events with space, guests, run sheet and deposit state", async () => {
    const r = await caller.dashboard.needsAttention();
    expect(r.tonight.total).toBe(2);
    const bare = r.tonight.items.find(i => i.bookingId === ids["A:TonightBare"])!;
    expect(bare).toMatchObject({ spaceName: "Main Room", guestCount: 40, hasRunSheet: false, deposit: "due", startTime: "18:00" });
    const ready = r.tonight.items.find(i => i.bookingId === ids["A:TonightReady"])!;
    expect(ready).toMatchObject({ hasRunSheet: true, deposit: "paid" });
    // Tomorrow's and cancelled events are not "today".
    expect(r.tonight.items.map(i => i.bookingId)).not.toContain(ids["A:Soon"]);
  });

  it("(b) names overdue tasks, most overdue first, and caps the group", async () => {
    const r = await caller.dashboard.needsAttention();
    expect(r.tasks.total).toBe(7);
    expect(r.tasks.items).toHaveLength(5);
    expect(r.tasks.items[0].title).toBe("Overdue 7");
    const titles = r.tasks.items.map(t => t.title);
    for (const hidden of ["Done", "Later", "Undated"]) expect(titles).not.toContain(hidden);
  });

  it("(c) lists enquiries waiting past the reply hours and follow-ups that are due", async () => {
    const r = await caller.dashboard.needsAttention();
    const byName = (n: string) => r.enquiries.items.find(i => i.leadId === ids[`A:${n}`]);
    const waiting = byName("Waiting")!;
    expect(waiting.reason).toBe("awaiting_reply");
    expect(Math.round(waiting.waitingHours!)).toBeGreaterThanOrEqual(31);
    expect(byName("ChaseMe")!.reason).toBe("follow_up");
    // Not yet overdue / not an inbound enquiry / already answered / future or closed follow-up.
    for (const n of ["Fresh", "Typed", "Answered", "ChaseLater", "LostChase"]) expect(byName(n), n).toBeUndefined();
    expect(r.enquiries.awaitingTotal).toBe(1);
    expect(r.enquiries.followUpTotal).toBe(1);
  });

  it("(c) respects a venue that turned reply-overdue alerts off", async () => {
    const db = (await getDb())!;
    await db.update(venueSettings).set({ replyOverdueEnabled: 0 }).where(eq(venueSettings.ownerId, OWNER));
    try {
      const r = await caller.dashboard.needsAttention();
      expect(r.enquiries.awaitingTotal).toBe(0);
      expect(r.enquiries.followUpTotal).toBe(1);
    } finally {
      await db.update(venueSettings).set({ replyOverdueEnabled: 1 }).where(eq(venueSettings.ownerId, OWNER));
    }
  });

  it("(d) deposits due: confirmed, next 21 days, required and unpaid only", async () => {
    const r = await caller.dashboard.needsAttention();
    const got = r.deposits.items.map(i => i.bookingId).sort();
    expect(got).toEqual([ids["A:TonightBare"], ids["A:Soon"], ids["A:Mid"]].sort());
    expect(r.deposits.items.find(i => i.bookingId === ids["A:Soon"])).toMatchObject({ amount: 300, daysAway: 3 });
    // Paid, beyond 21 days, "no deposit", tentative, cancelled and past events stay out.
    for (const k of ["TonightReady", "SoonReady", "Far", "NoDeposit", "Maybe", "Gone", "Past"]) expect(got).not.toContain(ids[`A:${k}`]);
  });

  it("(e) events in the next 7 days with no run sheet (after today)", async () => {
    const r = await caller.dashboard.needsAttention();
    const got = r.runsheets.items.map(i => i.bookingId);
    expect(got).toContain(ids["A:Soon"]);
    // Has a sheet / today (shown in (a)) / beyond 7 days / tentative / cancelled.
    for (const k of ["SoonReady", "TonightBare", "Mid", "Maybe", "Gone"]) expect(got).not.toContain(ids[`A:${k}`]);
  });

  it("(f) only unread money/decision alerts that are still true", async () => {
    const r = await caller.dashboard.needsAttention();
    const kinds = r.alerts.items.map(a => a.kind).sort();
    expect(kinds).toEqual(["double_booking", "hold_expiring", "proposal_doubled"]);
    expect(r.alerts.items.find(a => a.kind === "double_booking")!.bookingId).toBe(ids["A:Clash"]);
    expect(r.alerts.items.find(a => a.kind === "hold_expiring")!.leadId).toBe(ids["A:Holding"]);
  });

  it("completing a task takes it off the list", async () => {
    const before = await caller.dashboard.needsAttention();
    await caller.tasks.complete({ id: before.tasks.items[0].id, completed: true });
    const after = await caller.dashboard.needsAttention();
    expect(after.tasks.total).toBe(6);
  });

  it("never shows another venue's rows, in either direction", async () => {
    const a = await caller.dashboard.needsAttention();
    const b = await other.dashboard.needsAttention();
    const seen = (r: typeof a) => ({
      b: [...r.tonight.items.map(i => i.bookingId), ...r.deposits.items.map(i => i.bookingId), ...r.runsheets.items.map(i => i.bookingId),
        ...r.alerts.items.map(i => i.bookingId)].filter((v): v is number => v != null),
      l: [...r.enquiries.items.map(i => i.leadId), ...r.alerts.items.map(i => i.leadId)].filter((v): v is number => v != null),
    });
    const sa = seen(a), sb = seen(b);
    expect(sa.b.length + sa.l.length).toBeGreaterThan(0);
    expect(sb.b.length + sb.l.length).toBeGreaterThan(0);
    for (const id of sa.b) expect(owned.B.b.has(id)).toBe(false);
    for (const id of sa.l) expect(owned.B.l.has(id)).toBe(false);
    for (const id of sb.b) expect(owned.A.b.has(id)).toBe(false);
    for (const id of sb.l) expect(owned.A.l.has(id)).toBe(false);
    expect(b.tasks.items.every(t => t.title.startsWith("Overdue"))).toBe(true);
    expect(b.tasks.total).toBe(7);
    expect(b.tonight.total).toBe(2);
  });

  it("upcoming: today plus 14 days regardless of month, with chips data", async () => {
    const r = await caller.dashboard.upcoming();
    const byKey = (k: string) => r.events.find(e => e._type === "booking" && e.id === ids[`A:${k}`]);
    expect(byKey("TonightBare")).toMatchObject({ daysAway: 0, hasRunSheet: false, deposit: "due" });
    expect(byKey("SoonReady")).toMatchObject({ hasRunSheet: true, deposit: "paid" });
    expect(byKey("Mid")).toBeDefined();           // day 10: inside 14 days
    expect(byKey("Far")).toBeUndefined();         // day 30: outside
    expect(byKey("Past")).toBeUndefined();
    expect(byKey("Gone")).toBeUndefined();        // cancelled
    expect(r.events.every(e => (e.row as any).ownerId === OWNER)).toBe(true);
  });

  it("is refused for staff logins", async () => {
    const staff = appRouter.createCaller(ctxFor(OWNER, { isStaff: true } as Partial<TrpcContext>));
    await expect(staff.dashboard.needsAttention()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(staff.dashboard.upcoming()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("dashboard.stats counts the same deposits the card lists (within all upcoming)", async () => {
    const stats = await caller.dashboard.stats();
    // TonightBare, Soon, Mid and Far: confirmed, today or later, required, unpaid.
    expect(stats.depositsDue).toBe(4);
  });
});
