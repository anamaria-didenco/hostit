import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildServer } from "./mcp";
import { getDb } from "./db";
import { users, leads, bookings, runsheets, leadActivity } from "../drizzle/schema";
import { eventDayKey, formatEventTime, zonedWallTimeToDate } from "@shared/eventDate";

/**
 * F-34: the Claude (MCP) tools write through the app's own procedures, so a
 * change made from Claude keeps the lead, booking and runsheet in step just
 * as the same change in the app does. Throwaway owner; skipped without a DB.
 */
const HAS_DB = !!process.env.DATABASE_URL;
const d = HAS_DB ? describe : describe.skip;
const OWNER = 970000 + Math.floor(Math.random() * 9999);
const NZ = "Pacific/Auckland";

async function connect() {
  const server = buildServer({ ownerId: OWNER, req: { protocol: "https", headers: {} } as any, res: {} as any });
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  await server.connect(serverT);
  const client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(clientT);
  return client;
}

async function call(client: Client, name: string, args: Record<string, unknown>) {
  const r: any = await client.callTool({ name, arguments: args });
  if (r.isError) throw new Error(r.content?.[0]?.text ?? "tool error");
  return JSON.parse(r.content[0].text);
}

d("MCP writes keep lead, booking and runsheet in step (DB)", () => {
  let client: Client;

  beforeAll(async () => {
    const db = (await getDb())!;
    await db.insert(users).values({ id: OWNER, openId: `mcp-sync-${OWNER}`, name: "MCP Sync Test", role: "admin" });
    client = await connect();
  });

  afterAll(async () => {
    const db = (await getDb())!;
    const ids = (await db.select({ id: leads.id }).from(leads).where(eq(leads.ownerId, OWNER))).map(r => r.id);
    if (ids.length) await db.delete(leadActivity).where(inArray(leadActivity.leadId, ids));
    await db.delete(runsheets).where(eq(runsheets.ownerId, OWNER));
    await db.delete(bookings).where(eq(bookings.ownerId, OWNER));
    await db.delete(leads).where(eq(leads.ownerId, OWNER));
    await db.delete(users).where(eq(users.id, OWNER));
  });

  async function seedEvent(day: number) {
    const db = (await getDb())!;
    const sevenPm = zonedWallTimeToDate(2028, 3, day, 19, 0, NZ);
    const [lead] = await db.insert(leads).values({
      ownerId: OWNER, firstName: "Ana", lastName: "Test", email: "ana@example.com",
      eventDate: sevenPm, spaceName: "Back Bar", status: "booked", source: "manual",
    }).returning();
    const [bk] = await db.insert(bookings).values({
      ownerId: OWNER, leadId: lead.id, firstName: "Ana", lastName: "Test", email: "ana@example.com",
      eventDate: sevenPm, spaceName: "Back Bar", status: "confirmed",
    }).returning();
    const [rs] = await db.insert(runsheets).values({
      ownerId: OWNER, bookingId: bk.id, leadId: lead.id, title: "Birthday", eventDate: sevenPm, guestCount: 40,
    }).returning();
    return { lead, bk, rs };
  }

  it("moving the runsheet's day from Claude moves the booking and enquiry, keeping 7 pm", async () => {
    const db = (await getDb())!;
    const { lead, bk, rs } = await seedEvent(4);
    const updated = await call(client, "update_runsheet", { id: rs.id, eventDate: "2028-03-11T00:00:00Z", guestCount: 55 });
    expect(updated.id).toBe(rs.id);
    const [b] = await db.select().from(bookings).where(eq(bookings.id, bk.id));
    const [l] = await db.select().from(leads).where(eq(leads.id, lead.id));
    expect(eventDayKey(b.eventDate, NZ)).toBe("2028-03-11");
    expect(formatEventTime(b.eventDate, NZ)).toBe("7:00 pm");
    expect(eventDayKey(l.eventDate, NZ)).toBe("2028-03-11");
    expect(b.guestCount).toBe(55);
    expect(l.guestCount).toBe(55);
  });

  it("cancelling the booking from Claude marks the enquiry lost", async () => {
    const db = (await getDb())!;
    const { lead, bk } = await seedEvent(5);
    expect(await call(client, "update_booking_status", { id: bk.id, status: "cancelled" })).toEqual({ success: true });
    const [l] = await db.select().from(leads).where(eq(leads.id, lead.id));
    expect(l.status).toBe("lost");
    expect(l.lostReason).toBe("event_cancelled");
  });

  it("marking the enquiry lost from Claude cancels its booking, keeping a free-text reason", async () => {
    const db = (await getDb())!;
    const { lead, bk } = await seedEvent(6);
    expect(await call(client, "update_lead_status", { id: lead.id, status: "lost", lostReason: "went elsewhere" })).toEqual({ success: true });
    const [b] = await db.select().from(bookings).where(eq(bookings.id, bk.id));
    const [l] = await db.select().from(leads).where(eq(leads.id, lead.id));
    expect(b.status).toBe("cancelled");
    expect(l.lostReason).toBe("other");
    expect(l.lostReasonNote).toContain("went elsewhere");
  });

  it("moving the enquiry off booked from Claude cancels its booking", async () => {
    const db = (await getDb())!;
    const { lead, bk } = await seedEvent(7);
    await call(client, "update_lead_status", { id: lead.id, status: "negotiating" });
    const [b] = await db.select().from(bookings).where(eq(bookings.id, bk.id));
    expect(b.status).toBe("cancelled");
    expect(await call(client, "update_lead_status", { id: 2_000_000_000, status: "contacted" })).toEqual({ success: false, error: "Lead not found" });
  });

  it("linking a runsheet to a booking from Claude gives it the booking's date", async () => {
    const db = (await getDb())!;
    const { bk } = await seedEvent(8);
    const [loose] = await db.insert(runsheets).values({ ownerId: OWNER, title: "Loose", eventDate: new Date("2028-01-01T00:00:00Z") }).returning();
    const linked = await call(client, "link_runsheet_to_booking", { runsheetId: loose.id, bookingId: bk.id });
    expect(linked.bookingId).toBe(bk.id);
    expect(new Date(linked.eventDate).getTime()).toBe(bk.eventDate.getTime());
  });
});
