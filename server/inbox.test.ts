/**
 * The inbox poll end-to-end against the real database, with the IMAP client
 * replaced by an in-memory fake mailbox. Covers matching (thread + sender),
 * the ignore rules, idempotent re-polls, the backfill-without-alerts first
 * sync, error reporting, and that the inbox password never reaches the
 * browser. Skipped when no DATABASE_URL is set.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb } from "./db";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { leadActivity, leadMessages, leads, venueNotifications, venueSettings } from "../drizzle/schema";
import {
  leadMailHeaders, mergeReplyTo, pollVenueInbox, recordLeadMessage, testInboxConnection,
  type CreateInboxClient,
} from "./inbox";
import { FIXTURES } from "./__fixtures__/inboxEmails";

const OWNER = 990_517;
const hasDb = !!process.env.DATABASE_URL;

/** A read-only fake mailbox that behaves like IMAP's UID SEARCH quirks. */
function fakeMailbox(messages: { uid: number; raw: string }[], uidValidity = 777, opts: { failConnect?: any; missingFolder?: boolean } = {}): CreateInboxClient {
  return () => ({
    async connect() { if (opts.failConnect) throw opts.failConnect; },
    async mailboxOpen() {
      if (opts.missingFolder) throw Object.assign(new Error("Mailbox doesn't exist"), { responseText: "NONEXISTENT" });
      const max = Math.max(0, ...messages.map(m => m.uid));
      return { uidValidity: BigInt(uidValidity), uidNext: max + 1, exists: messages.length };
    },
    async search(q: any) {
      const uids = messages.map(m => m.uid).sort((a, b) => a - b);
      if (typeof q.uid === "string") {
        const from = Number(q.uid.split(":")[0]);
        const hits = uids.filter(u => u >= from);
        // "N:*" returns the newest message even when N is past it.
        return hits.length ? hits : uids.slice(-1);
      }
      return uids;
    },
    async *fetch(range: string) {
      const want = new Set(range.split(",").map(Number));
      for (const m of messages) {
        if (want.has(m.uid)) yield { uid: m.uid, source: Buffer.from(m.raw), internalDate: new Date("2026-10-06T20:15:00Z") };
      }
    },
    async logout() {},
  });
}

function ctxFor(over: Partial<TrpcContext> = {}): TrpcContext {
  return {
    user: { id: OWNER, openId: `inbox-test-${OWNER}`, email: null, name: "Inbox Test", loginMethod: null, role: "user", passwordHash: null, workspaceOwnerId: null, isStaff: false, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() } as any,
    isTeamMember: false,
    isStaff: false,
    actorName: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
    ...over,
  };
}

async function cleanup() {
  const db = await getDb();
  if (!db) return;
  await db.delete(leadMessages).where(eq(leadMessages.ownerId, OWNER));
  await db.delete(leadActivity).where(eq(leadActivity.ownerId, OWNER));
  await db.delete(venueNotifications).where(eq(venueNotifications.ownerId, OWNER));
  await db.delete(leads).where(eq(leads.ownerId, OWNER));
  await db.delete(venueSettings).where(eq(venueSettings.ownerId, OWNER));
}

async function venueRow() {
  const db = (await getDb())!;
  const [vs] = await db.select().from(venueSettings).where(eq(venueSettings.ownerId, OWNER));
  return vs;
}

describe.skipIf(!hasDb)("inbox poll with a fake IMAP server", () => {
  let leadId = 0;
  let lostLeadId = 0;
  let mailbox: { uid: number; raw: string }[] = [];
  const sentId = () => `<vf-lead-${leadId}-abcDEF123@barfranco.nz>`;

  beforeAll(async () => {
    await cleanup();
    const db = (await getDb())!;
    await db.insert(venueSettings).values({
      ownerId: OWNER, name: "Inbox Test Venue", slug: `inbox-test-${OWNER}`,
      smtpFromEmail: "events@barfranco.nz", smtpUser: "events@barfranco.nz",
      imapEnabled: 1, imapHost: "imap.test", imapPort: 993, imapSecure: 1,
      imapUser: "events@barfranco.nz", imapPass: "app-password-secret", imapFolder: "INBOX",
      imapUidValidity: 777, imapLastUid: 0,
    });
    const [open] = await db.insert(leads).values({
      ownerId: OWNER, firstName: "Sam", lastName: "Smith", email: "Sam.Smith@gmail.com", status: "contacted",
      createdAt: new Date("2026-09-01T00:00:00Z"),
    }).returning({ id: leads.id });
    // A newer but closed enquiry from the same address must not win the sender match.
    const [lost] = await db.insert(leads).values({
      ownerId: OWNER, firstName: "Sam", lastName: "Smith", email: "sam.smith@gmail.com", status: "lost",
      createdAt: new Date("2026-09-20T00:00:00Z"),
    }).returning({ id: leads.id });
    leadId = open.id;
    lostLeadId = lost.id;
    // The email we "sent" that Sam is replying to.
    await recordLeadMessage({
      ownerId: OWNER, leadId, direction: "out", fromEmail: "events@barfranco.nz", toEmail: "sam.smith@gmail.com",
      subject: "Your event enquiry — Birthday", bodyText: "Hi Sam, thanks for your enquiry.", messageId: sentId(),
      receivedAt: new Date("2026-10-05T03:02:00Z"),
    });
    const withLead = (raw: string) => raw.replace(/vf-lead-42-/g, `vf-lead-${leadId}-`);
    mailbox = [
      { uid: 3, raw: withLead(FIXTURES.threadedReply).replace(/^From: .*$/m, "From: Sam at work <sam@smithco.example>") },
      { uid: 4, raw: FIXTURES.senderMatch },
      { uid: 5, raw: withLead(FIXTURES.outOfOffice) },
      { uid: 6, raw: FIXTURES.outOfOfficeBySubject },
      { uid: 7, raw: FIXTURES.bounce },
      { uid: 8, raw: FIXTURES.unmatched },
      { uid: 9, raw: withLead(FIXTURES.ownCopy) },
      { uid: 10, raw: FIXTURES.outlookReply },
      { uid: 11, raw: "this is not an email at all \u0000" },
    ];
  });

  afterAll(cleanup);

  it("files client replies against the enquiry and ignores everything else", async () => {
    const summary = await pollVenueInbox(await venueRow(), fakeMailbox(mailbox));
    expect(summary).toMatchObject({ fetched: 9, stored: 3, backfill: false });

    const db = (await getDb())!;
    const rows = await db.select().from(leadMessages).where(eq(leadMessages.ownerId, OWNER));
    const inbound = rows.filter(r => r.direction === "in");
    expect(inbound.map(r => r.leadId)).toEqual([leadId, leadId, leadId]);
    expect(rows.some(r => r.leadId === lostLeadId)).toBe(false);

    // Threaded by In-Reply-To even though it came from a different address.
    const threaded = inbound.find(r => r.messageId === "<CAF1234reply@mail.gmail.com>")!;
    expect(threaded.fromEmail).toBe("sam@smithco.example");
    expect(threaded.inReplyTo).toBe(sentId());
    expect(threaded.bodyText).toBe("Hi Ana,\n\nSaturday the 14th works for us. Can we bring our own cake?\n\nThanks,\nSam");
    expect(threaded.fullText).toContain("Thanks for your enquiry.");
    expect(threaded.bodyHtml).not.toMatch(/<script|<img|alert/i);

    const outlook = inbound.find(r => r.messageId === "<outlook-1@example.com>")!;
    expect(outlook.attachments).toEqual([expect.objectContaining({ filename: "signed-proposal.pdf" })]);

    const [lead] = await db.select().from(leads).where(eq(leads.id, leadId));
    expect(lead.lastInboundAt).toBeInstanceOf(Date);

    const acts = await db.select().from(leadActivity).where(eq(leadActivity.leadId, leadId));
    expect(acts.filter(a => a.content?.startsWith("Sam Smith replied: "))).toHaveLength(3);

    const alerts = await db.select().from(venueNotifications).where(and(eq(venueNotifications.ownerId, OWNER), eq(venueNotifications.kind, "client_replied")));
    expect(alerts).toHaveLength(3);
    expect(alerts.map(a => a.title)).toContain("Sam Smith replied: Re: Your event enquiry — Birthday");
    expect(alerts.every(a => a.leadId === leadId)).toBe(true);

    const vs = await venueRow();
    expect(vs.imapLastUid).toBe(11);
    expect(vs.imapLastError).toBeNull();
  });

  it("re-polling is idempotent", async () => {
    // Nothing new: the cursor is at the newest UID.
    expect(await pollVenueInbox(await venueRow(), fakeMailbox(mailbox))).toMatchObject({ fetched: 0, stored: 0 });
    // Cursor lost: everything is fetched again but nothing is duplicated.
    const db = (await getDb())!;
    await db.update(venueSettings).set({ imapLastUid: 0 }).where(eq(venueSettings.ownerId, OWNER));
    expect(await pollVenueInbox(await venueRow(), fakeMailbox(mailbox))).toMatchObject({ fetched: 9, stored: 0 });
    const inbound = await db.select().from(leadMessages).where(and(eq(leadMessages.ownerId, OWNER), eq(leadMessages.direction, "in")));
    expect(inbound).toHaveLength(3);
    const alerts = await db.select().from(venueNotifications).where(eq(venueNotifications.ownerId, OWNER));
    expect(alerts).toHaveLength(3);
  });

  it("first sync after (re)connecting backfills without alerting", async () => {
    const db = (await getDb())!;
    await db.update(venueSettings).set({ imapUidValidity: null, imapLastUid: null }).where(eq(venueSettings.ownerId, OWNER));
    const extra = { uid: 20, raw: FIXTURES.senderMatch.replace("<fresh-1@mail.gmail.com>", "<fresh-2@mail.gmail.com>") };
    const summary = await pollVenueInbox(await venueRow(), fakeMailbox([...mailbox, extra], 888));
    expect(summary).toMatchObject({ stored: 1, backfill: true });
    const alerts = await db.select().from(venueNotifications).where(eq(venueNotifications.ownerId, OWNER));
    expect(alerts).toHaveLength(3);
    const vs = await venueRow();
    expect(vs.imapUidValidity).toBe(888);
    expect(vs.imapLastUid).toBe(20);
  });

  it("stores a plain-language error when the login fails", async () => {
    await expect(pollVenueInbox(await venueRow(), fakeMailbox([], 888, { failConnect: Object.assign(new Error("Invalid credentials"), { authenticationFailed: true }) })))
      .rejects.toThrow(/app password/);
    const vs = await venueRow();
    expect(vs.imapLastError).toMatch(/username and password/);
  });

  it("test connection reports honestly", async () => {
    const cfg = { host: "imap.test", port: 993, secure: true, user: "a@b.co", pass: "x", folder: "INBOX" };
    expect(await testInboxConnection(cfg, fakeMailbox(mailbox))).toEqual({ ok: true, messages: 9, folder: "INBOX" });
    const missing = await testInboxConnection({ ...cfg, folder: "Clients" }, fakeMailbox([], 1, { missingFolder: true }));
    expect(missing).toEqual({ ok: false, message: 'Signed in, but there\'s no folder called "Clients".' });
    const refused = await testInboxConnection(cfg, fakeMailbox([], 1, { failConnect: Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }) }));
    expect(refused).toEqual({ ok: false, message: "imap.test refused the connection on port 993. Check the port." });
  });

  it("never sends the inbox password to the browser", async () => {
    const caller = appRouter.createCaller(ctxFor());
    const settings = await caller.inbox.getSettings();
    expect(settings).toMatchObject({ enabled: true, user: "events@barfranco.nz", hasPassword: true });
    expect(JSON.stringify(settings)).not.toContain("app-password-secret");
    expect(JSON.stringify(await caller.venue.getOwn())).not.toContain("app-password-secret");
    expect(JSON.stringify(await caller.venue.get({}))).not.toContain("app-password-secret");
  });

  it("saving with a blank password keeps the saved one; a new account resets the cursor", async () => {
    const caller = appRouter.createCaller(ctxFor());
    await caller.inbox.saveSettings({ enabled: true, host: "imap.test", port: 993, secure: true, user: "events@barfranco.nz", pass: "", folder: "INBOX" });
    let vs = await venueRow();
    expect(vs.imapPass).toBe("app-password-secret");
    expect(vs.imapLastUid).toBe(20);
    // A different mailbox can't silently reuse the old password.
    await expect(caller.inbox.saveSettings({ enabled: true, host: "imap.other", port: 993, secure: true, user: "events@barfranco.nz", folder: "INBOX" }))
      .rejects.toThrow(/password/);
    await caller.inbox.saveSettings({ enabled: true, host: "imap.other", port: 993, secure: true, user: "events@barfranco.nz", pass: "new-pass", folder: "INBOX" });
    vs = await venueRow();
    expect(vs.imapPass).toBe("new-pass");
    expect(vs.imapLastUid).toBeNull();
    expect(vs.imapUidValidity).toBeNull();
  });

  it("serves the conversation without HTML, and who is waiting on whom", async () => {
    const caller = appRouter.createCaller(ctxFor());
    const convo = await caller.inbox.forLead({ leadId });
    expect(convo.map(m => m.direction)).toEqual(["out", "in", "in", "in", "in"]);
    expect(convo.every(m => !("bodyHtml" in m))).toBe(true);
    const status = await caller.inbox.replyStatus();
    expect(status.find(s => s.leadId === leadId)?.direction).toBe("in");
  });

  it("is closed to staff logins and team links", async () => {
    await expect(appRouter.createCaller(ctxFor({ isStaff: true })).inbox.forLead({ leadId })).rejects.toThrow(/staff login/);
    await expect(appRouter.createCaller(ctxFor({ isTeamMember: true })).inbox.getSettings()).rejects.toThrow(/owner/);
  });

  it("deleting the enquiry deletes its emails", async () => {
    const caller = appRouter.createCaller(ctxFor());
    await caller.leads.delete({ id: leadId });
    const db = (await getDb())!;
    expect(await db.select().from(leadMessages).where(eq(leadMessages.leadId, leadId))).toHaveLength(0);
  });
});

describe("outbound threading headers", () => {
  const connected = { imapEnabled: 1, imapHost: "imap.gmail.com", imapUser: "events@barfranco.nz", imapPass: "x" };

  it("keeps the existing Reply-To when no inbox is connected", () => {
    const h = leadMailHeaders({ imapEnabled: 0 }, { leadId: 5, fromEmail: "events@barfranco.nz", replyTo: "ana@barfranco.nz" });
    expect(h.replyTo).toBe("ana@barfranco.nz");
    expect(h.messageId).toMatch(/^<vf-lead-5-.+@barfranco\.nz>$/);
    expect(leadMailHeaders(null, { fromEmail: "x@y.nz" }).replyTo).toBeUndefined();
  });

  it("adds the inbox address to Reply-To when connected", () => {
    expect(leadMailHeaders(connected, { leadId: 5, fromEmail: "events@barfranco.nz", replyTo: "ana@barfranco.nz" }).replyTo)
      .toEqual(["events@barfranco.nz", "ana@barfranco.nz"]);
    expect(mergeReplyTo("Events@barfranco.nz", "events@BARFRANCO.nz", "")).toBe("Events@barfranco.nz");
  });

  it("produces real Message-ID / In-Reply-To / References / Reply-To headers", async () => {
    const nodemailer = await import("nodemailer");
    const transport = nodemailer.default.createTransport({ streamTransport: true, buffer: true, newline: "unix" });
    const headers = leadMailHeaders(connected, {
      leadId: 5, fromEmail: "events@barfranco.nz", replyTo: "ana@barfranco.nz",
      inReplyTo: "<CAF1234reply@mail.gmail.com>", references: ["<vf-lead-5-first@barfranco.nz>"],
    });
    const info: any = await transport.sendMail({ from: "events@barfranco.nz", to: "sam@example.com", subject: "Re: hi", text: "Yes", ...headers });
    const raw = info.message.toString();
    expect(raw).toContain(`Message-ID: ${headers.messageId}`);
    expect(raw).toContain("In-Reply-To: <CAF1234reply@mail.gmail.com>");
    expect(raw).toContain("References: <vf-lead-5-first@barfranco.nz> <CAF1234reply@mail.gmail.com>");
    expect(raw).toContain("Reply-To: events@barfranco.nz, ana@barfranco.nz");
  });
});
