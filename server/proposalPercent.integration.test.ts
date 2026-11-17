/**
 * A proposal's GST and deposit are percentages: 250% GST used to be accepted and
 * priced the proposal at several times its real total. The builder now stops it
 * at the field, and the server refuses it too. The same for a cleared title on
 * a proposal that is already saved.
 */
import { afterAll, describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";
import { appRouter } from "./routers";
import { userFacingMessage } from "./_core/trpc";
import { getDb } from "./db";
import { leadActivity, leads, proposals, venueNotifications } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";

const owner = appRouter.createCaller({
  user: {
    id: 1, openId: "test-owner-001", email: "owner@venue.co.nz", name: "Owner", loginMethod: "manus",
    role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
  } as any,
  isTeamMember: false,
  req: { protocol: "https", headers: {}, ip: "203.0.113.9" } as TrpcContext["req"],
  res: { clearCookie: () => {} } as TrpcContext["res"],
});

const made = { leads: [] as number[], proposals: [] as number[] };

describe("proposal GST and deposit stay within 0-100% (DB)", async () => {
  const db = await getDb();
  const run = db ? it : it.skip;

  afterAll(async () => {
    if (!db) return;
    if (made.proposals.length) await db.delete(proposals).where(inArray(proposals.id, made.proposals));
    if (made.leads.length) {
      await db.delete(venueNotifications).where(inArray(venueNotifications.leadId, made.leads));
      await db.delete(leadActivity).where(inArray(leadActivity.leadId, made.leads));
      await db.delete(leads).where(inArray(leads.id, made.leads));
    }
  });

  run("refuses 250% GST or a negative deposit, and keeps a normal one", async () => {
    const lead = await owner.leads.submit({ ownerId: 1, firstName: "Percent", lastName: "Check", email: `percent-${Date.now()}@example.com`, eventType: "Birthday", eventDate: "2027-03-12", guestCount: 20 });
    made.leads.push(lead.id);

    await expect(owner.proposals.create({ leadId: lead.id, title: "GST typo", taxPercent: 250 })).rejects.toMatchObject({ code: "BAD_REQUEST" });

    const p = await owner.proposals.create({ leadId: lead.id, title: "Normal", taxPercent: 15, depositPercent: 25 });
    made.proposals.push(p!.id);
    await expect(owner.proposals.update({ id: p!.id, taxPercent: 250 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(owner.proposals.update({ id: p!.id, depositPercent: -5 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(owner.proposals.update({ id: p!.id, taxPercent: 0, depositPercent: 100 })).resolves.toBeTruthy();
  });

  run("refuses to clear a saved proposal's title", async () => {
    const lead = await owner.leads.submit({ ownerId: 1, firstName: "Title", lastName: "Check", email: `title-${Date.now()}@example.com`, eventType: "Birthday", eventDate: "2027-03-13", guestCount: 20 });
    made.leads.push(lead.id);
    const p = await owner.proposals.create({ leadId: lead.id, title: "Birthday Proposal" });
    made.proposals.push(p!.id);

    const err = await owner.proposals.update({ id: p!.id, title: "" }).catch(e => e);
    expect(err).toMatchObject({ code: "BAD_REQUEST" });
    expect(userFacingMessage(err)).toBe("Title is required.");
    await expect(owner.proposals.update({ id: p!.id, title: "   " })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    // Create has the same rule (it took a title of only spaces).
    await expect(owner.proposals.create({ leadId: lead.id, title: "   " })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await owner.proposals.update({ id: p!.id, title: "Birthday Dinner" });
    const [row] = await db!.select({ title: proposals.title }).from(proposals).where(inArray(proposals.id, [p!.id]));
    expect(row.title).toBe("Birthday Dinner");
  });
});
