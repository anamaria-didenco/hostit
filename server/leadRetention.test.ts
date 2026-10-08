/**
 * Database-backed checks for win-back sending, merging and markLeadLost. Mail
 * goes through a nodemailer jsonTransport stub, so nothing leaves the machine.
 * Uses its own ownerId so it never touches real venue data.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import nodemailer from "nodemailer";

const mail = vi.hoisted(() => ({ on: true, sent: [] as any[] }));
vi.mock("./paymentsEmail", async (orig) => {
  const real: any = await orig();
  return {
    ...real,
    buildVenueMailer: async () => {
      if (!mail.on) return null;
      const t = nodemailer.createTransport({ jsonTransport: true });
      return {
        transporter: { sendMail: async (m: any) => { const r = await t.sendMail(m); mail.sent.push(JSON.parse(r.message)); return r; } },
        fromName: "Test Venue", fromEmail: "events@test.venue", venue: {},
      };
    },
  };
});

import { getDb, createLead, getLeadById, getLeadActivity, addLeadActivity, markLeadLost } from "./db";
import { sendWinBack, mergeLeads, findContactIdFor, clientFlagsForOwner } from "./leadRetention";
import { leads, leadActivity, contacts } from "../drizzle/schema";
import { eq } from "drizzle-orm";

const OWNER = 990_075;
const hasDb = !!process.env.DATABASE_URL;

async function cleanup() {
  const db = await getDb();
  if (!db) return;
  await db.delete(leadActivity).where(eq(leadActivity.ownerId, OWNER));
  await db.delete(leads).where(eq(leads.ownerId, OWNER));
  await db.delete(contacts).where(eq(contacts.ownerId, OWNER));
}

describe.skipIf(!hasDb)("win-back sending", () => {
  beforeAll(cleanup);
  afterAll(cleanup);

  it("sends a personalised email, logs it, and never repeats within 90 days", async () => {
    mail.on = true; mail.sent = [];
    const lead = (await createLead({ ownerId: OWNER, firstName: "Aroha", email: "aroha@example.nz", status: "lost", lostReason: "price" }))!;
    const noEmail = (await createLead({ ownerId: OWNER, firstName: "Blank", email: "", status: "lost" }))!;

    const first = await sendWinBack(OWNER, [lead.id, noEmail.id], "Hello {{firstName}}", "Kia ora {{firstName}},\nTell us more: {{enquiryFormLink}}");
    expect(first.sent).toBe(1);
    expect(first.skipped).toEqual([expect.objectContaining({ id: noEmail.id, reason: "no_email" })]);
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0].subject).toBe("Hello Aroha");
    expect(mail.sent[0].text).toContain("Kia ora Aroha,");
    expect(mail.sent[0].text).toMatch(/https?:\/\/[^\s]+\/enquire/);

    const after = await getLeadById(lead.id, OWNER);
    expect(after?.lastWinBackAt).toBeTruthy();
    const acts = await getLeadActivity(lead.id);
    expect(acts.some(a => a.type === "email" && a.content?.startsWith("Win-back email sent"))).toBe(true);

    const second = await sendWinBack(OWNER, [lead.id], "Hello again", "Hi {{firstName}}");
    expect(second.sent).toBe(0);
    expect(second.skipped[0].reason).toBe("sent_recently");
    expect(mail.sent).toHaveLength(1);
  });

  it("skips leads the template can't be filled for, and event-cancelled losses", async () => {
    mail.on = true; mail.sent = [];
    const noDate = (await createLead({ ownerId: OWNER, firstName: "Cam", email: "cam@example.nz", status: "lost" }))!;
    const cancelled = (await createLead({ ownerId: OWNER, firstName: "Dee", email: "dee@example.nz", status: "lost", lostReason: "event_cancelled" }))!;
    const r = await sendWinBack(OWNER, [noDate.id, cancelled.id], "About {{eventDate}}", "Hi {{firstName}}");
    expect(r.sent).toBe(0);
    expect(r.skipped.find(s => s.id === noDate.id)).toMatchObject({ reason: "missing_details", detail: "{{eventDate}}" });
    expect(r.skipped.find(s => s.id === cancelled.id)?.reason).toBe("event_cancelled");
    expect(mail.sent).toHaveLength(0);
  });

  it("reports honestly when email isn't set up, and leaves the lead eligible", async () => {
    mail.on = false; mail.sent = [];
    const lead = (await createLead({ ownerId: OWNER, firstName: "Eru", email: "eru@example.nz", status: "new" }))!;
    const r = await sendWinBack(OWNER, [lead.id], "Hi", "Hi {{firstName}}");
    expect(r).toMatchObject({ sent: 0, smtpConfigured: false });
    expect(r.skipped[0].reason).toBe("smtp_not_configured");
    expect((await getLeadById(lead.id, OWNER))?.lastWinBackAt).toBeNull();
  });
});

describe.skipIf(!hasDb)("merging duplicate enquiries", () => {
  beforeAll(cleanup);
  afterAll(cleanup);

  it("moves activity to the kept lead, fills its blanks and deletes the duplicate", async () => {
    const keep = (await createLead({ ownerId: OWNER, firstName: "Fran", email: "fran@example.nz", status: "new" }))!;
    const dupe = (await createLead({ ownerId: OWNER, firstName: "Fran", email: "FRAN@example.nz", phone: "021 555 0199", guestCount: 40, status: "new", message: "Second go" }))!;
    await addLeadActivity({ leadId: dupe.id, ownerId: OWNER, type: "note", content: "Called them" });

    const r = await mergeLeads(OWNER, keep.id, dupe.id);
    expect(r.filled).toEqual(expect.arrayContaining(["phone", "guestCount"]));
    expect(await getLeadById(dupe.id, OWNER)).toBeNull();
    const kept = await getLeadById(keep.id, OWNER);
    expect(kept?.phone).toBe("021 555 0199");
    const acts = await getLeadActivity(keep.id);
    expect(acts.some(a => a.content === "Called them")).toBe(true);
    expect(acts.some(a => a.content?.includes(`Merged in enquiry #${dupe.id}`) && a.content.includes("Second go"))).toBe(true);
  });

  it("refuses to merge two different clients", async () => {
    const a = (await createLead({ ownerId: OWNER, firstName: "G", email: "g@example.nz", status: "new" }))!;
    const b = (await createLead({ ownerId: OWNER, firstName: "H", email: "h@example.nz", status: "new" }))!;
    await expect(mergeLeads(OWNER, a.id, b.id)).rejects.toThrow(/don't share/);
    expect(await getLeadById(b.id, OWNER)).not.toBeNull();
  });
});

describe.skipIf(!hasDb)("markLeadLost", () => {
  beforeAll(cleanup);
  afterAll(cleanup);

  it("stores a known reason, and keeps free text as 'other' with the text as the note", async () => {
    const a = (await createLead({ ownerId: OWNER, firstName: "I", email: "i@example.nz", status: "proposal_sent" }))!;
    expect(await markLeadLost(OWNER, a.id, "price", "Over budget")).toBe(true);
    expect(await getLeadById(a.id, OWNER)).toMatchObject({ status: "lost", lostReason: "price", lostReasonNote: "Over budget" });
    const acts = await getLeadActivity(a.id);
    expect(acts[0].content).toBe("Status changed to lost — Price / budget: Over budget");

    const b = (await createLead({ ownerId: OWNER, firstName: "J", email: "j@example.nz", status: "proposal_sent" }))!;
    await markLeadLost(OWNER, b.id, "Client declined the proposal", null, { logActivity: false });
    expect(await getLeadById(b.id, OWNER)).toMatchObject({ lostReason: "other", lostReasonNote: "Client declined the proposal" });
    expect(await getLeadActivity(b.id)).toHaveLength(0);

    expect(await markLeadLost(OWNER + 1, a.id, "price", null)).toBe(false);
  });
});

describe.skipIf(!hasDb)("recognising returning clients", () => {
  beforeAll(cleanup);
  afterAll(cleanup);

  it("finds an existing contact by email (any case) or by phone in another format", async () => {
    const db = (await getDb())!;
    const [c] = await db.insert(contacts).values({ ownerId: OWNER, firstName: "Kiri", email: "kiri@example.nz", phone: "+64 21 777 8888" }).returning();
    expect(await findContactIdFor(OWNER, "KIRI@Example.nz", null)).toBe(c.id);
    expect(await findContactIdFor(OWNER, "someone-else@example.nz", "021 777 8888")).toBe(c.id);
    expect(await findContactIdFor(OWNER, "nobody@example.nz", "021 000 0000")).toBeNull();
    expect(await findContactIdFor(OWNER + 1, "kiri@example.nz", null)).toBeNull();
  });

  it("flags a new enquiry from a client who has booked before", async () => {
    await createLead({ ownerId: OWNER, firstName: "Kiri", email: "kiri@example.nz", status: "finished", eventDate: new Date("2025-05-01") });
    const fresh = (await createLead({ ownerId: OWNER, firstName: "Kiri", email: "Kiri@example.nz", status: "new" }))!;
    const flags = await clientFlagsForOwner(OWNER);
    expect(flags.get(fresh.id)).toMatchObject({ bookedEvents: 1, pastEvents: 1 });
  });
});
