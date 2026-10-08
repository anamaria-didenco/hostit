/**
 * Client emails sent from VenueFlow carry a threadable Message-ID, a Reply-To
 * that includes the connected inbox, and are logged on the enquiry's
 * conversation — checked through email.send and leads.sendFollowUp with
 * nodemailer swapped for an in-memory transport. Skipped without a database.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

const sent: string[] = [];
vi.mock("nodemailer", async (importOriginal) => {
  const actual: any = await importOriginal();
  const real = actual.default ?? actual;
  const createTransport = () => {
    const t = real.createTransport({ streamTransport: true, buffer: true, newline: "unix" });
    return {
      sendMail: async (msg: any) => { const info = await t.sendMail(msg); sent.push(info.message.toString()); return info; },
      verify: async () => true,
    };
  };
  return { ...actual, default: { ...real, createTransport }, createTransport };
});

import { getDb } from "./db";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { leadActivity, leadMessages, leads, venueSettings } from "../drizzle/schema";

const OWNER = 990_518;
const hasDb = !!process.env.DATABASE_URL;

function ctx(): TrpcContext {
  return {
    user: { id: OWNER, openId: `inbox-out-${OWNER}`, email: null, name: "Out Test", loginMethod: null, role: "admin", passwordHash: null, workspaceOwnerId: null, isStaff: false, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() } as any,
    isTeamMember: false, isStaff: false, actorName: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

async function cleanup() {
  const db = await getDb();
  if (!db) return;
  await db.delete(leadMessages).where(eq(leadMessages.ownerId, OWNER));
  await db.delete(leadActivity).where(eq(leadActivity.ownerId, OWNER));
  await db.delete(leads).where(eq(leads.ownerId, OWNER));
  await db.delete(venueSettings).where(eq(venueSettings.ownerId, OWNER));
}

describe.skipIf(!hasDb)("outbound client email threading", () => {
  let leadId = 0;
  beforeAll(async () => {
    await cleanup();
    const db = (await getDb())!;
    await db.insert(venueSettings).values({
      ownerId: OWNER, name: "Out Test Venue", slug: `inbox-out-${OWNER}`,
      smtpHost: "smtp.test", smtpUser: "events@barfranco.nz", smtpPass: "x", smtpFromEmail: "events@barfranco.nz",
      notificationEmail: "ana@barfranco.nz",
    });
    const [l] = await db.insert(leads).values({ ownerId: OWNER, firstName: "Sam", lastName: "Smith", email: "sam@example.com", status: "contacted" })
      .returning({ id: leads.id });
    leadId = l.id;
  });
  afterAll(cleanup);

  it("email.send without an inbox: existing Reply-To, new Message-ID, logged as out", async () => {
    sent.length = 0;
    await appRouter.createCaller(ctx()).email.send({ to: "sam@example.com", toName: "Sam Smith", subject: "Hello", body: "Hi Sam", leadId });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatch(new RegExp(`Message-ID: <vf-lead-${leadId}-[A-Za-z0-9_-]+@barfranco\\.nz>`));
    expect(sent[0]).toContain("Reply-To: ana@barfranco.nz");
    const db = (await getDb())!;
    const rows = await db.select().from(leadMessages).where(eq(leadMessages.leadId, leadId));
    expect(rows).toEqual([expect.objectContaining({ direction: "out", subject: "Hello", bodyText: "Hi Sam", toEmail: "sam@example.com" })]);
  });

  it("email.send as a reply, with the inbox connected: threading headers + inbox in Reply-To", async () => {
    const db = (await getDb())!;
    await db.update(venueSettings).set({ imapEnabled: 1, imapHost: "imap.test", imapUser: "inbox@barfranco.nz", imapPass: "y" })
      .where(eq(venueSettings.ownerId, OWNER));
    sent.length = 0;
    await appRouter.createCaller(ctx()).email.send({
      to: "sam@example.com", subject: "Re: Hello", body: "Yes we can", leadId,
      inReplyTo: "<CAF-sam-1@mail.gmail.com>", references: ["<vf-lead-1-a@barfranco.nz>", "<CAF-sam-1@mail.gmail.com>"],
    });
    expect(sent[0]).toContain("In-Reply-To: <CAF-sam-1@mail.gmail.com>");
    expect(sent[0]).toContain("References: <vf-lead-1-a@barfranco.nz> <CAF-sam-1@mail.gmail.com>");
    expect(sent[0]).toContain("Reply-To: inbox@barfranco.nz, ana@barfranco.nz");
    const rows = await db.select().from(leadMessages).where(eq(leadMessages.leadId, leadId));
    expect(rows.find(r => r.subject === "Re: Hello")?.inReplyTo).toBe("<CAF-sam-1@mail.gmail.com>");
  });

  it("rejects header values that aren't message ids", async () => {
    await expect(appRouter.createCaller(ctx()).email.send({ to: "sam@example.com", subject: "x", body: "y", leadId, inReplyTo: "<a@b>\r\nBcc: evil@x.com" }))
      .rejects.toThrow();
  });

  it("staff briefings (a list of recipients) aren't logged on the client conversation", async () => {
    const db = (await getDb())!;
    const before = (await db.select().from(leadMessages).where(eq(leadMessages.leadId, leadId))).length;
    sent.length = 0;
    await appRouter.createCaller(ctx()).email.send({ to: ["chef@barfranco.nz"], subject: "Briefing", body: "Run sheet", leadId });
    expect(sent[0]).not.toContain("inbox@barfranco.nz");
    expect((await db.select().from(leadMessages).where(eq(leadMessages.leadId, leadId))).length).toBe(before);
  });

  it("leads.sendFollowUp threads and logs too", async () => {
    sent.length = 0;
    const r = await appRouter.createCaller(ctx()).leads.sendFollowUp({ leadId });
    expect(r.sent).toBe(true);
    expect(sent[0]).toMatch(new RegExp(`Message-ID: <vf-lead-${leadId}-`));
    expect(sent[0]).toContain("Reply-To: inbox@barfranco.nz, events@barfranco.nz");
    const db = (await getDb())!;
    const rows = await db.select().from(leadMessages).where(eq(leadMessages.leadId, leadId));
    expect(rows.some(r => r.subject?.startsWith("Following up on your enquiry"))).toBe(true);
  });
});
