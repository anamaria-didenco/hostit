import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { leads, bookings } from "../drizzle/schema";

/**
 * search.global (the Cmd/Ctrl-K finder and the Enquiries search), through the
 * real router and database. Throwaway owners; skipped without a DB.
 */
const HAS_DB = !!process.env.DATABASE_URL;
const d = HAS_DB ? describe : describe.skip;
const OWNER = 960000 + Math.floor(Math.random() * 4999);
const OTHER = OWNER + 5000;
// A word that cannot appear in anyone's real data.
const TAG = `zq${OWNER}`;

function ctx(over: { id?: number; isStaff?: boolean } = {}): TrpcContext {
  return {
    user: {
      id: over.id ?? OWNER, openId: `gsearch-${over.id ?? OWNER}`, email: "owner@example.com", name: "Search Test",
      loginMethod: "local", role: "admin", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    } as any,
    isTeamMember: false,
    isStaff: over.isStaff ?? false,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  } as TrpcContext;
}

d("search.global (DB)", () => {
  const owner = appRouter.createCaller(ctx());
  const staff = appRouter.createCaller(ctx({ isStaff: true }));
  const other = appRouter.createCaller(ctx({ id: OTHER }));
  const past = new Date("2020-03-06T06:00:00Z");
  const future = new Date("2099-03-06T06:00:00Z");
  let linkedBookingId = 0;
  let importedBookingId = 0;
  let leadId = 0;

  beforeAll(async () => {
    const db = (await getDb())!;
    const [lead] = await db.insert(leads).values({
      ownerId: OWNER, firstName: "Marama", lastName: `${TAG}lead`, email: `marama.${TAG}@example.com`,
      phone: "021 555 0147", company: `Kauri ${TAG} Ltd`, eventDate: past, status: "lost", source: "manual",
    }).returning();
    leadId = lead.id;
    const [b1] = await db.insert(bookings).values({
      ownerId: OWNER, leadId, firstName: "Marama", lastName: `${TAG}lead`, email: `marama.${TAG}@example.com`,
      eventDate: future, status: "confirmed", spaceName: "Terrace",
    } as any).returning();
    linkedBookingId = b1.id;
    // Imported from a booking system: no enquiry behind it.
    const [b2] = await db.insert(bookings).values({
      ownerId: OWNER, leadId: null, firstName: "Hemi", lastName: `${TAG}import`, email: `hemi.${TAG}@example.com`,
      eventDate: past, status: "finished", spaceName: "Loft",
    } as any).returning();
    importedBookingId = b2.id;
    // Another venue with the same words in it.
    await db.insert(leads).values({
      ownerId: OTHER, firstName: "Marama", lastName: `${TAG}lead`, email: `marama.${TAG}@example.com`,
      phone: "021 555 0147", eventDate: past, status: "new", source: "manual",
    });
    await db.insert(bookings).values({
      ownerId: OTHER, firstName: "Hemi", lastName: `${TAG}import`, email: `hemi.${TAG}@example.com`,
      eventDate: past, status: "confirmed",
    } as any);
  });

  afterAll(async () => {
    const db = (await getDb())!;
    for (const id of [OWNER, OTHER]) {
      await db.delete(bookings).where(eq(bookings.ownerId, id));
      await db.delete(leads).where(eq(leads.ownerId, id));
    }
  });

  it("matches an enquiry by name, email, phone and company, whatever its status or date", async () => {
    for (const q of [`marama ${TAG}lead`, `marama.${TAG}@`, "0215550147", "(021) 555", `kauri ${TAG}`]) {
      const r = await owner.search.global({ q });
      expect(r.enquiries.map(e => e.id), q).toContain(leadId);
    }
    const r = await owner.search.global({ q: `${TAG}lead` });
    expect(r.enquiries.find(e => e.id === leadId)).toMatchObject({ status: "lost", phone: "021 555 0147" });
  });

  it("finds events that have no enquiry, and the event behind an enquiry", async () => {
    const r = await owner.search.global({ q: `${TAG}import` });
    expect(r.enquiries).toHaveLength(0);
    expect(r.events).toHaveLength(1);
    expect(r.events[0]).toMatchObject({ id: importedBookingId, leadId: null, status: "finished", spaceName: "Loft", name: `Hemi ${TAG}import` });
    // An event is also found by its client's phone (held on the enquiry).
    const byPhone = await owner.search.global({ q: "555 0147" });
    expect(byPhone.events.map(e => e.id)).toContain(linkedBookingId);
  });

  it("treats % and _ literally and ignores too-short input", async () => {
    expect((await owner.search.global({ q: "%" })).enquiries).toHaveLength(0);
    expect((await owner.search.global({ q: `${TAG}%` })).enquiries).toHaveLength(0);
    expect((await owner.search.global({ q: "m" })).enquiries).toHaveLength(0);
  });

  it("limits each group", async () => {
    const r = await owner.search.global({ q: TAG, limit: 1 });
    expect(r.enquiries.length).toBeLessThanOrEqual(1);
    expect(r.events.length).toBeLessThanOrEqual(1);
  });

  it("never returns another venue's rows, in either direction", async () => {
    const mine = await owner.search.global({ q: TAG });
    const theirs = await other.search.global({ q: TAG });
    expect(mine.enquiries.every(e => e.id === leadId)).toBe(true);
    expect(mine.events.map(e => e.id).sort()).toEqual([linkedBookingId, importedBookingId].sort());
    expect(theirs.enquiries.map(e => e.id)).not.toContain(leadId);
    expect(theirs.events.map(e => e.id)).not.toContain(linkedBookingId);
    expect(theirs.events.map(e => e.id)).not.toContain(importedBookingId);
    expect(theirs.enquiries).toHaveLength(1);
    expect(theirs.events).toHaveLength(1);
  });

  it("gives a staff login events only, with no contact details, and no matching on them", async () => {
    const byName = await staff.search.global({ q: `${TAG}import` });
    expect(byName.enquiries).toHaveLength(0);
    expect(byName.events.map(e => e.id)).toEqual([importedBookingId]);
    expect(byName.events[0].email).toBeNull();
    expect(JSON.stringify(byName)).not.toContain("@example.com");
    // Email, phone and company are not searchable for staff.
    expect((await staff.search.global({ q: `hemi.${TAG}@` })).events).toHaveLength(0);
    expect((await staff.search.global({ q: "0215550147" })).events).toHaveLength(0);
    expect((await staff.search.global({ q: `kauri ${TAG}` })).events).toHaveLength(0);
    // Space name is (it is on the calendar).
    const bySpace = await staff.search.global({ q: "Terrace" });
    expect(bySpace.enquiries).toHaveLength(0);
    expect(bySpace.events.map(e => e.id)).toContain(linkedBookingId);
  });

  it("refuses a signed-out caller", async () => {
    const anon = appRouter.createCaller({ ...ctx(), user: null } as any);
    await expect(anon.search.global({ q: "anything" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
