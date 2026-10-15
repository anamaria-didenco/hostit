import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, sql } from "drizzle-orm";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { leads, bookings, runsheets, venueSettings } from "../drizzle/schema";

/**
 * Editing the client's name / email / phone on an enquiry reaches its live
 * booking and the run sheet copies that still held the old values, and
 * leaves a run sheet contact set to someone else alone. Throwaway ownerId;
 * skipped without a DB.
 */
const HAS_DB = !!process.env.DATABASE_URL;
const d = HAS_DB ? describe : describe.skip;
const OWNER = 930000 + Math.floor(Math.random() * 9999);

function ctx(): TrpcContext {
  return {
    user: {
      id: OWNER, openId: `contact-test-${OWNER}`, email: "owner@example.com", name: "Contact Test",
      loginMethod: "local", role: "admin", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    } as any,
    isTeamMember: false,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

d("enquiry contact edits cascade (DB)", () => {
  const caller = appRouter.createCaller(ctx());
  let leadId = 0, bookingId = 0, matchingRs = 0, otherRs = 0, leadRs = 0;

  beforeAll(async () => {
    const db = (await getDb())!;
    await db.insert(venueSettings).values({
      id: OWNER as any,
      ownerId: OWNER, name: "Contact Test Venue", slug: `contact-test-${OWNER}`,
    });
    const at = new Date("2099-05-01T06:00:00Z");
    const [lead] = await db.insert(leads).values({
      ownerId: OWNER, firstName: "Ana", lastName: "Test", email: "ana@example.com", phone: "021 111 222",
      eventDate: at, status: "booked", source: "manual",
    }).returning();
    leadId = lead.id;
    const [b] = await db.insert(bookings).values({
      ownerId: OWNER, leadId, firstName: "Ana", lastName: "Test", email: "ana@example.com", eventDate: at, status: "confirmed",
    } as any).returning();
    bookingId = b.id;
    const [rs1] = await db.insert(runsheets).values({
      ownerId: OWNER, bookingId, leadId, title: "Matching", eventDate: at,
      contactName: "Ana Test", contactEmail: "ANA@example.com", contactPhone: "021111222",
    }).returning();
    matchingRs = rs1.id;
    const [rs2] = await db.insert(runsheets).values({
      ownerId: OWNER, bookingId, title: "On-the-day contact", eventDate: at,
      contactName: "Ben Planner", contactEmail: "ben@example.com", contactPhone: "027 999 000",
    }).returning();
    otherRs = rs2.id;
    const [rs3] = await db.insert(runsheets).values({
      ownerId: OWNER, leadId, title: "No copy", eventDate: at,
    }).returning();
    leadRs = rs3.id;
  });

  afterAll(async () => {
    const db = (await getDb())!;
    await db.delete(runsheets).where(eq(runsheets.ownerId, OWNER));
    await db.delete(bookings).where(eq(bookings.ownerId, OWNER));
    await db.delete(leads).where(eq(leads.ownerId, OWNER));
    await db.delete(venueSettings).where(eq(venueSettings.ownerId, OWNER));
  });

  it("carries name/email/phone to the booking and matching run sheet copies", async () => {
    const db = (await getDb())!;
    const [before] = await db.select().from(runsheets).where(eq(runsheets.id, matchingRs));
    await caller.leads.update({ id: leadId, firstName: "Anna", lastName: "Smith", email: "anna@example.com", phone: "022 333 444" });

    const [lead] = await db.select().from(leads).where(eq(leads.id, leadId));
    expect([lead.firstName, lead.lastName, lead.email, lead.phone]).toEqual(["Anna", "Smith", "anna@example.com", "022 333 444"]);
    const [b] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
    expect([b.firstName, b.lastName, b.email]).toEqual(["Anna", "Smith", "anna@example.com"]);

    const [rs] = await db.select().from(runsheets).where(eq(runsheets.id, matchingRs));
    expect([rs.contactName, rs.contactEmail, rs.contactPhone]).toEqual(["Anna Smith", "anna@example.com", "022 333 444"]);
    // An open builder on the old copy is warned.
    expect(rs.version).toBe(before.version + 1);

    const [other] = await db.select().from(runsheets).where(eq(runsheets.id, otherRs));
    expect([other.contactName, other.contactEmail, other.contactPhone]).toEqual(["Ben Planner", "ben@example.com", "027 999 000"]);
    const [blank] = await db.select().from(runsheets).where(eq(runsheets.id, leadRs));
    expect([blank.contactName, blank.contactEmail, blank.contactPhone]).toEqual([null, null, null]);
  });

  it("a name edit on the booking reaches the enquiry and matching run sheets", async () => {
    const db = (await getDb())!;
    await caller.bookings.update({ id: bookingId, firstName: "Annie" });
    const [lead] = await db.select().from(leads).where(eq(leads.id, leadId));
    expect(lead.firstName).toBe("Annie");
    const [rs] = await db.select().from(runsheets).where(eq(runsheets.id, matchingRs));
    expect(rs.contactName).toBe("Annie Smith");
    const [other] = await db.select().from(runsheets).where(eq(runsheets.id, otherRs));
    expect(other.contactName).toBe("Ben Planner");
  });

  it("refuses a blank first name", async () => {
    await expect(caller.leads.update({ id: leadId, firstName: "  " })).rejects.toThrow(/First name/);
  });
});
