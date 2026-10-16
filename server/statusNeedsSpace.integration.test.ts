import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { leads, bookings, venueNotifications, venueSettings, leadActivity } from "../drizzle/schema";

/**
 * Moving an enquiry to booked/confirmed/tentative needs a space. The confirm
 * step can now supply one with the status change instead of failing and
 * sending the user round the houses. Skipped without DATABASE_URL.
 */
const HAS_DB = !!process.env.DATABASE_URL;
const d = HAS_DB ? describe : describe.skip;
const OWNER = 1010000 + Math.floor(Math.random() * 9999);

function ctx(): TrpcContext {
  return {
    user: {
      id: OWNER, openId: `status-space-test-${OWNER}`, email: "owner@example.com", name: "Status Space Test",
      loginMethod: "local", role: "admin", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    } as any,
    isTeamMember: false,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

let nextDay = 1;
async function newLead(over: Partial<typeof leads.$inferInsert> = {}) {
  const db = (await getDb())!;
  // A different date each time, so the clash guard never trips between tests.
  const eventDate = new Date(Date.UTC(2027, 5, nextDay++, 0, 0, 0));
  const [row] = await db.insert(leads).values({
    ownerId: OWNER, firstName: "Test", lastName: "Lead", email: "lead@example.com",
    eventDate, status: "proposal_sent", source: "manual",
    ...over,
  }).returning();
  return row;
}

d("status change that needs a space (DB)", () => {
  const caller = appRouter.createCaller(ctx());

  beforeAll(async () => {
    const db = (await getDb())!;
    await db.insert(venueSettings).values({
      id: OWNER as any,
      ownerId: OWNER, name: "Status Space Venue", slug: `status-space-${OWNER}`,
    });
  });

  afterAll(async () => {
    const db = (await getDb())!;
    const ids = (await db.select({ id: leads.id }).from(leads).where(eq(leads.ownerId, OWNER))).map(r => r.id);
    if (ids.length) await db.delete(leadActivity).where(inArray(leadActivity.leadId, ids));
    await db.delete(bookings).where(eq(bookings.ownerId, OWNER));
    await db.delete(leads).where(eq(leads.ownerId, OWNER));
    await db.delete(venueNotifications).where(eq(venueNotifications.ownerId, OWNER));
    await db.delete(venueSettings).where(eq(venueSettings.ownerId, OWNER));
  });

  it("still refuses to book an enquiry that has no space", async () => {
    const lead = await newLead();
    await expect(caller.leads.updateStatus({ id: lead.id, status: "booked" })).rejects.toThrow(/event space/i);
    const db = (await getDb())!;
    const [after] = await db.select().from(leads).where(eq(leads.id, lead.id));
    expect(after.status).toBe("proposal_sent");
    expect(after.spaceName).toBeNull();
  });

  it("books it when the confirm step supplies the space, and saves the space on both records", async () => {
    const lead = await newLead();
    await caller.leads.updateStatus({ id: lead.id, status: "booked", spaceName: "  Restaurant  " });
    const db = (await getDb())!;
    const [after] = await db.select().from(leads).where(eq(leads.id, lead.id));
    expect(after.status).toBe("booked");
    expect(after.spaceName).toBe("Restaurant");
    const [event] = await db.select().from(bookings).where(eq(bookings.leadId, lead.id));
    expect(event?.spaceName).toBe("Restaurant");
  });

  it("holds a date (tentative) with the supplied space too", async () => {
    const lead = await newLead();
    await caller.leads.updateStatus({ id: lead.id, status: "tentative", spaceName: "Bar" });
    const db = (await getDb())!;
    const [after] = await db.select().from(leads).where(eq(leads.id, lead.id));
    expect(after.status).toBe("tentative");
    expect(after.spaceName).toBe("Bar");
  });

  it("does not overwrite a space the enquiry already has", async () => {
    const lead = await newLead({ spaceName: "Bar" });
    await caller.leads.updateStatus({ id: lead.id, status: "confirmed", spaceName: "Restaurant" });
    const db = (await getDb())!;
    const [after] = await db.select().from(leads).where(eq(leads.id, lead.id));
    expect(after.spaceName).toBe("Bar");
  });

  it("leaves the status and space alone when the change is refused for another reason (no date)", async () => {
    const lead = await newLead({ eventDate: null });
    await expect(caller.leads.updateStatus({ id: lead.id, status: "booked", spaceName: "Bar" })).rejects.toBeTruthy();
    const db = (await getDb())!;
    const [after] = await db.select().from(leads).where(eq(leads.id, lead.id));
    expect(after.status).toBe("proposal_sent");
    expect(after.spaceName).toBeNull();
  });

  it("ignores a supplied space for statuses that do not need one", async () => {
    const lead = await newLead();
    await caller.leads.updateStatus({ id: lead.id, status: "contacted", spaceName: "Bar" });
    const db = (await getDb())!;
    const [after] = await db.select().from(leads).where(eq(leads.id, lead.id));
    expect(after.status).toBe("contacted");
    expect(after.spaceName).toBeNull();
  });
});
