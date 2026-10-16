/**
 * Deletes take their linked records with them and never take money (audit
 * F-26), and an enquiry's status keeps its event in step (audit F-20):
 * re-confirming brings a cancelled event back, and confirming needs a date.
 * Through the real routers and database; skipped without DATABASE_URL;
 * cleans up after itself.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray, sql } from "drizzle-orm";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import {
  leads, leadActivity, leadMessages, tasks, proposals, quoteItems, proposalDrinks, quoteSettings,
  bookings, payments, floorPlans, checklistInstances, runsheets, runsheetItems, fnbItems,
  staffPortalLinks, weddingChecklists, contracts, clientPortalTokens, venueSettings, venueNotifications,
} from "../drizzle/schema";

const HAS_DB = !!process.env.DATABASE_URL;
const OWNER = 900000 + Math.floor(Math.random() * 9999);
const OTHER = OWNER + 10000;

function ctx(id = OWNER): TrpcContext {
  return {
    user: {
      id, openId: `cascade-test-${id}`, email: `owner${id}@cascade.test`, name: "Cascade Test",
      loginMethod: "local", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    } as NonNullable<TrpcContext["user"]>,
    isTeamMember: false,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

const tag = () => `${OWNER}-${Math.random().toString(36).slice(2, 10)}`;
const now = Date.now();

async function db() { return (await getDb())!; }

async function newLead(over: Partial<typeof leads.$inferInsert> = {}) {
  const [row] = await (await db()).insert(leads).values({
    ownerId: OWNER, firstName: "Cascade", lastName: "Test", email: "cascade@example.com",
    eventDate: new Date("2027-05-15T00:00:00Z"), spaceName: "Bar", status: "booked", source: "manual",
    ...over,
  }).returning();
  return row;
}

async function newBooking(leadId: number | null, over: Partial<typeof bookings.$inferInsert> = {}) {
  const [row] = await (await db()).insert(bookings).values({
    ownerId: OWNER, leadId, firstName: "Cascade", email: "cascade@example.com",
    eventDate: new Date("2027-05-15T00:00:00Z"), spaceName: "Bar", status: "confirmed",
    ...over,
  }).returning();
  return row;
}

/** A runsheet with one of every child row. */
async function newRunsheet(link: { leadId?: number; bookingId?: number; floorPlanId?: number }) {
  const d = await db();
  const [rs] = await d.insert(runsheets).values({ ownerId: OWNER, title: "Cascade sheet", ...link }).returning();
  await d.insert(runsheetItems).values({ runsheetId: rs.id, ownerId: OWNER, time: "18:00", title: "Doors" });
  await d.insert(fnbItems).values({ runsheetId: rs.id, ownerId: OWNER, dishName: "Arancini" });
  await d.insert(checklistInstances).values({ runsheetId: rs.id, ownerId: OWNER, name: "Setup", items: [] });
  await d.insert(staffPortalLinks).values({ runsheetId: rs.id, ownerId: OWNER, token: `sp-${tag()}`, createdAt: now });
  await d.insert(weddingChecklists).values({ runsheetId: rs.id, ownerId: OWNER, shareToken: `wc-${tag()}` });
  return rs;
}

async function countWhere(table: any, col: any, ids: number[]) {
  if (ids.length === 0) return 0;
  const rows = await (await db()).select({ n: sql<number>`count(*)::int` }).from(table).where(inArray(col, ids));
  return rows[0].n;
}

function preconditionOf(e: unknown) {
  expect(e).toBeInstanceOf(TRPCError);
  expect((e as TRPCError).code).toBe("PRECONDITION_FAILED");
  return (e as TRPCError).message;
}

describe.skipIf(!HAS_DB)("cascading deletes + status integrity (DB)", () => {
  const caller = appRouter.createCaller(ctx());

  beforeAll(async () => {
    await (await db()).insert(venueSettings).values({
      id: OWNER as any,
      ownerId: OWNER, name: "Cascade Test Venue", slug: `cascade-test-${OWNER}`,
    });
  });

  afterAll(async () => {
    const d = await db();
    for (const owner of [OWNER, OTHER]) {
      const sheetIds = (await d.select({ id: runsheets.id }).from(runsheets).where(eq(runsheets.ownerId, owner))).map(r => r.id);
      if (sheetIds.length) {
        await d.delete(runsheetItems).where(inArray(runsheetItems.runsheetId, sheetIds));
        await d.delete(fnbItems).where(inArray(fnbItems.runsheetId, sheetIds));
        await d.delete(staffPortalLinks).where(inArray(staffPortalLinks.runsheetId, sheetIds));
        await d.delete(weddingChecklists).where(inArray(weddingChecklists.runsheetId, sheetIds));
      }
      await d.delete(checklistInstances).where(eq(checklistInstances.ownerId, owner));
      await d.delete(runsheets).where(eq(runsheets.ownerId, owner));
      await d.delete(payments).where(eq(payments.ownerId, owner));
      await d.delete(floorPlans).where(eq(floorPlans.ownerId, owner));
      await d.delete(bookings).where(eq(bookings.ownerId, owner));
      await d.delete(quoteItems).where(eq(quoteItems.ownerId, owner));
      await d.delete(proposalDrinks).where(eq(proposalDrinks.ownerId, owner));
      await d.delete(quoteSettings).where(eq(quoteSettings.ownerId, owner));
      await d.delete(proposals).where(eq(proposals.ownerId, owner));
      await d.delete(tasks).where(eq(tasks.ownerId, owner));
      await d.delete(contracts).where(eq(contracts.ownerId, owner));
      await d.delete(clientPortalTokens).where(eq(clientPortalTokens.ownerId, owner));
      await d.delete(leadActivity).where(eq(leadActivity.ownerId, owner));
      await d.delete(leadMessages).where(eq(leadMessages.ownerId, owner));
      await d.delete(venueNotifications).where(eq(venueNotifications.ownerId, owner));
      await d.delete(leads).where(eq(leads.ownerId, owner));
    }
    await d.delete(venueSettings).where(eq(venueSettings.ownerId, OWNER));
  });

  it("deleting an enquiry removes its proposals, events, runsheets and their rows", async () => {
    const d = await db();
    const lead = await newLead();
    const [prop] = await d.insert(proposals).values({ ownerId: OWNER, leadId: lead.id, title: "Cascade proposal", publicToken: `pt-${tag()}`, status: "sent" }).returning();
    await d.insert(quoteItems).values({ proposalId: prop.id, ownerId: OWNER, name: "Canapés" });
    await d.insert(proposalDrinks).values({ proposalId: prop.id, ownerId: OWNER, selectedDrinks: [], customDrinks: [] });
    await d.insert(quoteSettings).values({ proposalId: prop.id, ownerId: OWNER });
    const booking = await newBooking(lead.id);
    const [plan] = await d.insert(floorPlans).values({ ownerId: OWNER, bookingId: booking.id }).returning();
    const sheetA = await newRunsheet({ leadId: lead.id });
    const sheetB = await newRunsheet({ bookingId: booking.id, floorPlanId: plan.id });
    await d.insert(checklistInstances).values({ bookingId: booking.id, ownerId: OWNER, name: "Event checklist", items: [] });
    await d.insert(tasks).values({ ownerId: OWNER, title: "Call client", linkedLeadId: lead.id, createdAt: now, updatedAt: now });
    await d.insert(tasks).values({ ownerId: OWNER, title: "Send BEO", linkedBookingId: booking.id, createdAt: now, updatedAt: now });
    await d.insert(contracts).values({ ownerId: OWNER, leadId: lead.id, title: "T&Cs", body: "…", createdAt: now, updatedAt: now });
    await d.insert(clientPortalTokens).values({ ownerId: OWNER, bookingId: booking.id, token: `cp-${tag()}`, createdAt: now });
    await d.insert(leadActivity).values({ ownerId: OWNER, leadId: lead.id, type: "note", content: "hi" });
    await d.insert(leadMessages).values({ ownerId: OWNER, leadId: lead.id, direction: "in", messageId: `<${tag()}@test>` });
    // Another venue's row that happens to carry the same lead id is untouched.
    const [foreign] = await d.insert(tasks).values({ ownerId: OTHER, title: "Not yours", linkedLeadId: lead.id, createdAt: now, updatedAt: now }).returning();

    await caller.leads.delete({ id: lead.id });

    const sheets = [sheetA.id, sheetB.id];
    expect(await countWhere(leads, leads.id, [lead.id])).toBe(0);
    expect(await countWhere(proposals, proposals.id, [prop.id])).toBe(0);
    expect(await countWhere(quoteItems, quoteItems.proposalId, [prop.id])).toBe(0);
    expect(await countWhere(proposalDrinks, proposalDrinks.proposalId, [prop.id])).toBe(0);
    expect(await countWhere(quoteSettings, quoteSettings.proposalId, [prop.id])).toBe(0);
    expect(await countWhere(bookings, bookings.id, [booking.id])).toBe(0);
    expect(await countWhere(floorPlans, floorPlans.id, [plan.id])).toBe(0);
    expect(await countWhere(runsheets, runsheets.id, sheets)).toBe(0);
    expect(await countWhere(runsheetItems, runsheetItems.runsheetId, sheets)).toBe(0);
    expect(await countWhere(fnbItems, fnbItems.runsheetId, sheets)).toBe(0);
    expect(await countWhere(staffPortalLinks, staffPortalLinks.runsheetId, sheets)).toBe(0);
    expect(await countWhere(weddingChecklists, weddingChecklists.runsheetId, sheets)).toBe(0);
    expect(await countWhere(checklistInstances, checklistInstances.runsheetId, sheets)).toBe(0);
    expect(await countWhere(checklistInstances, checklistInstances.bookingId, [booking.id])).toBe(0);
    expect(await countWhere(contracts, contracts.leadId, [lead.id])).toBe(0);
    expect(await countWhere(clientPortalTokens, clientPortalTokens.bookingId, [booking.id])).toBe(0);
    expect(await countWhere(leadActivity, leadActivity.leadId, [lead.id])).toBe(0);
    expect(await countWhere(leadMessages, leadMessages.leadId, [lead.id])).toBe(0);
    const left = await d.select({ id: tasks.id }).from(tasks).where(inArray(tasks.ownerId, [OWNER, OTHER]));
    expect(left.map(t => t.id)).toEqual([foreign.id]);
    // The client's proposal link no longer resolves.
    await expect(appRouter.createCaller({ ...ctx(), user: null } as any).proposals.getByToken({ token: prop.publicToken }))
      .resolves.toBeNull();
  });

  it("refuses to delete an event (or its enquiry) that has a payment, removing nothing", async () => {
    const d = await db();
    const lead = await newLead();
    const booking = await newBooking(lead.id);
    const sheet = await newRunsheet({ bookingId: booking.id });
    await d.insert(payments).values({ bookingId: booking.id, ownerId: OWNER, amount: "500.00", paidAt: new Date() });

    const msg = preconditionOf(await caller.bookings.delete({ id: booking.id }).catch(e => e));
    expect(msg).toMatch(/payments or Xero invoices.*Cancel it instead/);
    preconditionOf(await caller.leads.delete({ id: lead.id }).catch(e => e));
    preconditionOf(await caller.leads.bulkDelete({ ids: [lead.id] }).catch(e => e));

    expect(await countWhere(leads, leads.id, [lead.id])).toBe(1);
    expect(await countWhere(bookings, bookings.id, [booking.id])).toBe(1);
    expect(await countWhere(runsheets, runsheets.id, [sheet.id])).toBe(1);
    expect(await countWhere(runsheetItems, runsheetItems.runsheetId, [sheet.id])).toBe(1);
    expect(await countWhere(payments, payments.bookingId, [booking.id])).toBe(1);
  });

  it("deletes an event with no money along with its runsheets; a runsheet delete takes its children", async () => {
    const lead = await newLead();
    const booking = await newBooking(lead.id);
    const sheet = await newRunsheet({ bookingId: booking.id });
    await caller.bookings.delete({ id: booking.id });
    expect(await countWhere(bookings, bookings.id, [booking.id])).toBe(0);
    expect(await countWhere(runsheets, runsheets.id, [sheet.id])).toBe(0);
    expect(await countWhere(fnbItems, fnbItems.runsheetId, [sheet.id])).toBe(0);
    expect(await countWhere(leads, leads.id, [lead.id])).toBe(1);

    const loose = await newRunsheet({ leadId: lead.id });
    await caller.runsheets.delete({ id: loose.id });
    for (const [t, c] of [[runsheetItems, runsheetItems.runsheetId], [fnbItems, fnbItems.runsheetId], [checklistInstances, checklistInstances.runsheetId], [staffPortalLinks, staffPortalLinks.runsheetId], [weddingChecklists, weddingChecklists.runsheetId]] as const) {
      expect(await countWhere(t, c, [loose.id])).toBe(0);
    }
  });

  it("refuses to delete an accepted proposal but deletes a draft with its quote rows", async () => {
    const d = await db();
    const lead = await newLead({ status: "proposal_sent" });
    const [accepted] = await d.insert(proposals).values({ ownerId: OWNER, leadId: lead.id, title: "Yes", publicToken: `pt-${tag()}`, status: "accepted" }).returning();
    const [draft] = await d.insert(proposals).values({ ownerId: OWNER, leadId: lead.id, title: "Draft", publicToken: `pt-${tag()}`, status: "draft" }).returning();
    await d.insert(quoteItems).values({ proposalId: draft.id, ownerId: OWNER, name: "Pizza" });

    expect(preconditionOf(await caller.proposals.delete({ id: accepted.id }).catch(e => e))).toMatch(/accepted/);
    await caller.proposals.delete({ id: draft.id });
    expect(await countWhere(proposals, proposals.id, [accepted.id])).toBe(1);
    expect(await countWhere(proposals, proposals.id, [draft.id])).toBe(0);
    expect(await countWhere(quoteItems, quoteItems.proposalId, [draft.id])).toBe(0);
  });

  it("confirming a lost enquiry again restores its cancelled event (after the clash check)", async () => {
    const d = await db();
    const lead = await newLead({ eventDate: new Date("2027-06-19T00:00:00Z") });
    const booking = await newBooking(lead.id, { eventDate: new Date("2027-06-19T00:00:00Z") });

    await caller.leads.updateStatus({ id: lead.id, status: "lost" });
    const [cancelled] = await d.select().from(bookings).where(eq(bookings.id, booking.id));
    expect(cancelled.status).toBe("cancelled");

    // Someone else takes the date in the meantime: re-confirming is a clash.
    const rival = await newBooking(null, { firstName: "Rival", eventDate: new Date("2027-06-19T00:00:00Z") });
    const clash = await caller.leads.updateStatus({ id: lead.id, status: "booked" }).catch(e => e);
    expect((clash as TRPCError).code).toBe("CONFLICT");
    expect((await d.select().from(bookings).where(eq(bookings.id, booking.id)))[0].status).toBe("cancelled");
    await d.delete(bookings).where(eq(bookings.id, rival.id));

    await caller.leads.updateStatus({ id: lead.id, status: "booked" });
    const mine = await d.select().from(bookings).where(and(eq(bookings.leadId, lead.id), eq(bookings.ownerId, OWNER)));
    expect(mine).toHaveLength(1);
    expect(mine[0].id).toBe(booking.id);
    expect(mine[0].status).toBe("confirmed");

    // ensureForLead brings it back too when the enquiry is booked but its event isn't.
    await d.update(bookings).set({ status: "cancelled" }).where(eq(bookings.id, booking.id));
    const opened = await caller.bookings.ensureForLead({ leadId: lead.id });
    expect(opened?.id).toBe(booking.id);
    expect((await d.select().from(bookings).where(eq(bookings.id, booking.id)))[0].status).toBe("confirmed");
  });

  it("won't confirm an enquiry that has no event date", async () => {
    const d = await db();
    const lead = await newLead({ status: "negotiating", eventDate: null });
    const msg = preconditionOf(await caller.leads.updateStatus({ id: lead.id, status: "booked" }).catch(e => e));
    expect(msg).toBe("Add the event date before confirming this enquiry.");
    preconditionOf(await caller.leads.updateStatus({ id: lead.id, status: "confirmed" }).catch(e => e));
    preconditionOf(await caller.leads.bulkUpdateStatus({ ids: [lead.id], status: "booked" }).catch(e => e));
    expect((await d.select().from(leads).where(eq(leads.id, lead.id)))[0].status).toBe("negotiating");

    // A lead already marked booked without a date (legacy) can't be opened as an event either.
    await d.update(leads).set({ status: "booked" }).where(eq(leads.id, lead.id));
    preconditionOf(await caller.bookings.ensureForLead({ leadId: lead.id }).catch(e => e));
    expect(await countWhere(bookings, bookings.leadId, [lead.id])).toBe(0);
  });
});
