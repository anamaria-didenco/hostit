import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";
import net from "node:net";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb, touchPartialLead } from "./db";
import { ENV } from "./_core/env";
import { formStartToken } from "./enquiryConversion";
import { alertUnfinishedEnquiries } from "./partialEnquiries";
import { buildVenueMailer } from "./paymentsEmail";
import { runEnquiryEmailRetries, waitForEnquiryEmails } from "./enquiryEmails";
import { enquiryEmails, leads, leadActivity, tasks, venueNotifications, venueSettings } from "../drizzle/schema";
import { PARTIAL_LEAD_NOTE, POSSIBLE_SPAM_NOTE, partialAlertDedupeKey } from "@shared/leadConstants";
import { PARTIAL_PING_CAP_MS } from "@shared/enquiryTiming";
import { SMTP_TIMEOUTS } from "@shared/emailDelivery";

/**
 * leads.startCapture, leads.submit and leads.touchPartial through the real
 * routers and database: step 1 corrected after BACK, the step-2 "still here"
 * ping, a SUBMIT sent twice, the emails sent after the reply and retried,
 * finishing an enquiry the venue was told was unfinished, and the venue's
 * own day and time. Throwaway ownerIds; invented people; local SMTP sinks
 * only; skipped without a DB.
 */
const HAS_DB = !!process.env.DATABASE_URL;
const d = HAS_DB ? describe : describe.skip;
const OWNER = 950000 + Math.floor(Math.random() * 9999);
const MAIL_OWNER = OWNER + 20000;     // email works
const REFUSE_OWNER = OWNER + 30000;   // the mail server refuses the venue's email
const SYDNEY_OWNER = OWNER + 40000;   // a venue on Sydney time
const OWNERS = [OWNER, MAIL_OWNER, REFUSE_OWNER, SYDNEY_OWNER];
const VENUE_INBOX = "events@submit-venue.example.test";

type SinkMsg = { to: string[]; data: string };
/**
 * A bare SMTP server on 127.0.0.1 that records each message. `refuse` can
 * answer the end of DATA with an error instead (by recipient); `silent`
 * accepts the connection and never says a word. Nothing leaves the machine.
 */
function startSink(opts: { refuse?: (to: string[]) => string | null; silent?: boolean } = {}) {
  const messages: SinkMsg[] = [];
  const refused: SinkMsg[] = [];
  const sockets = new Set<net.Socket>();
  const server = net.createServer(sock => {
    sockets.add(sock);
    sock.on("close", () => sockets.delete(sock));
    sock.on("error", () => {});
    if (opts.silent) return;
    let buf = "";
    let inData = false;
    let cur: SinkMsg = { to: [], data: "" };
    sock.write("220 sink ESMTP\r\n");
    sock.on("data", chunk => {
      buf += chunk.toString("utf8");
      for (;;) {
        if (inData) {
          const end = buf.indexOf("\r\n.\r\n");
          if (end < 0) return;
          cur.data = buf.slice(0, end);
          buf = buf.slice(end + 5);
          inData = false;
          const no = opts.refuse?.(cur.to) ?? null;
          if (no) { refused.push(cur); sock.write(no + "\r\n"); } else { messages.push(cur); sock.write("250 queued\r\n"); }
          cur = { to: [], data: "" };
          continue;
        }
        const nl = buf.indexOf("\r\n");
        if (nl < 0) return;
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 2);
        const cmd = line.slice(0, 4).toUpperCase();
        if (cmd === "EHLO" || cmd === "HELO") sock.write("250-sink\r\n250 AUTH PLAIN LOGIN\r\n");
        else if (cmd === "AUTH") sock.write("235 ok\r\n");
        else if (cmd === "RCPT") { cur.to.push((/<([^>]*)>/.exec(line)?.[1] ?? "").toLowerCase()); sock.write("250 ok\r\n"); }
        else if (cmd === "DATA") { inData = true; sock.write("354 go\r\n"); }
        else if (cmd === "QUIT") { sock.end("221 bye\r\n"); return; }
        else sock.write("250 ok\r\n");
      }
    });
  });
  return new Promise<{ port: number; messages: SinkMsg[]; refused: SinkMsg[]; dropAll: () => void; close: () => Promise<void> }>(resolve => server.listen(0, "127.0.0.1", () => resolve({
    port: (server.address() as net.AddressInfo).port,
    messages, refused,
    dropAll: () => { for (const s of sockets) s.destroy(); },
    close: () => new Promise<void>(r => { for (const s of sockets) s.destroy(); server.close(() => r()); }),
  })));
}
/** Quoted-printable bodies, readable. */
const qp = (s: string) => s.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
const isVenueMail = (m: SinkMsg) => m.to.includes(VENUE_INBOX);

const randIp = () => `10.${1 + Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}`;
function publicCaller(ip = randIp()) {
  const ctx: TrpcContext = {
    user: null,
    isTeamMember: false,
    req: { protocol: "https", headers: { "cf-connecting-ip": ip } } as unknown as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
  return appRouter.createCaller(ctx);
}
const opened = (ownerId: number, agoMs: number) => formStartToken(ownerId, Date.now() - agoMs, ENV.cookieSecret);
const tag = () => Math.random().toString(36).slice(2, 8);
const person = (ownerId: number, email: string) => ({ ownerId, firstName: "Aroha", lastName: "Testwell", email, phone: "021 555 0142" });
const step2 = { eventType: "Birthday Celebration", guestCount: 40, eventFormat: "seated" as const };
async function withRateLimit<T>(fn: () => Promise<T>): Promise<T> {
  const was = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";
  try { return await fn(); } finally { process.env.NODE_ENV = was; }
}
async function leadsFor(email: string, ownerId = OWNER) {
  const db = (await getDb())!;
  return db.select().from(leads).where(and(eq(leads.ownerId, ownerId), sql`lower(${leads.email}) = lower(${email})`)).orderBy(leads.id);
}
async function leadRow(id: number) {
  const db = (await getDb())!;
  const [row] = await db.select().from(leads).where(eq(leads.id, id));
  return row;
}
async function emailRows(leadId: number) {
  const db = (await getDb())!;
  return db.select().from(enquiryEmails).where(eq(enquiryEmails.leadId, leadId)).orderBy(enquiryEmails.kind);
}
const emailRow = async (leadId: number, kind: "venue" | "auto_reply") => (await emailRows(leadId)).find(r => r.kind === kind)!;

d("leads.* on the public enquiry form (DB)", () => {
  let mailSink: Awaited<ReturnType<typeof startSink>>;
  let refuseSink: Awaited<ReturnType<typeof startSink>>;
  // Per test, what refuseSink says to the venue's email and to the visitor's.
  let refuseVenue: string | null = null;
  let refuseVisitor: string | null = null;
  const mailSettings = (port: number) => ({ notificationEmail: VENUE_INBOX, smtpHost: "127.0.0.1", smtpPort: port, smtpUser: VENUE_INBOX, smtpPass: "not-a-real-password" });

  beforeAll(async () => {
    const db = (await getDb())!;
    mailSink = await startSink();
    refuseSink = await startSink({ refuse: to => (to.includes(VENUE_INBOX) ? refuseVenue : refuseVisitor) });
    await db.insert(venueSettings).values([
      { id: OWNER as any, ownerId: OWNER, name: "Submit Test Venue", slug: `submit-test-${OWNER}` },
      { id: MAIL_OWNER as any, ownerId: MAIL_OWNER, name: "Submit Mail Venue", slug: `submit-mail-${MAIL_OWNER}`, ...mailSettings(mailSink.port) },
      { id: REFUSE_OWNER as any, ownerId: REFUSE_OWNER, name: "Submit Refuse Venue", slug: `submit-refuse-${REFUSE_OWNER}`, ...mailSettings(refuseSink.port) },
      { id: SYDNEY_OWNER as any, ownerId: SYDNEY_OWNER, name: "Submit Sydney Venue", slug: `submit-sydney-${SYDNEY_OWNER}`, timezone: "Australia/Sydney" },
    ] as any);
  });

  afterAll(async () => {
    await waitForEnquiryEmails();
    const db = (await getDb())!;
    const ids = (await db.select({ id: leads.id }).from(leads).where(inArray(leads.ownerId, OWNERS))).map(r => r.id);
    if (ids.length) await db.delete(leadActivity).where(inArray(leadActivity.leadId, ids));
    await db.delete(enquiryEmails).where(inArray(enquiryEmails.ownerId, OWNERS));
    await db.delete(tasks).where(inArray(tasks.ownerId, OWNERS));
    await db.delete(venueNotifications).where(inArray(venueNotifications.ownerId, OWNERS));
    await db.delete(leads).where(inArray(leads.ownerId, OWNERS));
    await db.delete(venueSettings).where(inArray(venueSettings.ownerId, OWNERS));
    await mailSink.close();
    await refuseSink.close();
  });

  // ─── S3: step 1 corrected after BACK ──────────────────────────────────────
  describe("step 1 corrected after BACK", () => {
    it("puts the corrected email on the lead this page saved, so nothing is left behind to alert", async () => {
      const t = tag();
      const typo = `aroha.${t}@gmial.example.test`;
      const fixed = `aroha.${t}@gmail.example.test`;
      const pub = publicCaller();
      const a = await pub.leads.startCapture({ ...person(OWNER, typo), gclid: "click-1", formToken: opened(OWNER, 30_000) });
      const before = await leadRow(a.leadId);
      const b = await pub.leads.startCapture({ ...person(OWNER, fixed), leadId: a.leadId, leadToken: a.leadToken, formToken: opened(OWNER, 60_000) });
      expect(b.leadId).toBe(a.leadId);
      expect(b.leadToken).toBe(a.leadToken);
      expect(await leadsFor(typo)).toHaveLength(0);
      const [row] = await leadsFor(fixed);
      expect(row.id).toBe(a.leadId);
      expect(row.internalNotes).toBe(PARTIAL_LEAD_NOTE);
      expect(row.createdAt.getTime()).toBe(before.createdAt.getTime());
      expect(row.gclid).toBe("click-1");
      // SUBMIT completes that one lead, and the alert job has nothing to say.
      const done: any = await pub.leads.submit({ ...person(OWNER, fixed), ...step2, leadId: b.leadId, leadToken: b.leadToken, formToken: opened(OWNER, 120_000) });
      expect(done.id).toBe(a.leadId);
      await alertUnfinishedEnquiries(new Date(Date.now() + 21 * 60_000));
      const db = (await getDb())!;
      const alerts = await db.select().from(venueNotifications).where(and(eq(venueNotifications.ownerId, OWNER), eq(venueNotifications.leadId, a.leadId), eq(venueNotifications.kind, "partial_enquiry")));
      expect(alerts).toHaveLength(0);
    });

    it("keeps what was replaced on the lead's timeline, without making it look touched", async () => {
      const t = tag();
      const pub = publicCaller();
      const a = await pub.leads.startCapture({ ...person(OWNER, `kiri.${t}@gmial.example.test`), formToken: opened(OWNER, 30_000) });
      const was = await leadRow(a.leadId);
      await pub.leads.startCapture({ ...person(OWNER, `kiri.${t}@gmail.example.test`), phone: "021 555 0199", leadId: a.leadId, leadToken: a.leadToken, formToken: opened(OWNER, 60_000) });
      const db = (await getDb())!;
      const notes = await db.select().from(leadActivity).where(eq(leadActivity.leadId, a.leadId));
      expect(notes.map(n => n.content)).toEqual([`Step 1 of the website form was changed before it was sent. Before the change: email kiri.${t}@gmial.example.test, phone 021 555 0142.`]);
      const row = await leadRow(a.leadId);
      expect([row.internalNotes, row.status, row.lastActivityAt?.getTime()]).toEqual([PARTIAL_LEAD_NOTE, "new", was.lastActivityAt?.getTime()]);
    });

    it("never puts another person's name and email on someone's step-1 lead (a shared device)", async () => {
      const t = tag();
      const first = `aria.${t}@example.test`;
      const next = `bodhi.${t}@example.test`;
      const pub = publicCaller();
      const a = await pub.leads.startCapture({ ...person(MAIL_OWNER, first), formToken: opened(MAIL_OWNER, 30_000) });
      // Aria's step 1 sat long enough for the venue to be told.
      await alertUnfinishedEnquiries(new Date(Date.now() + 25 * 60_000));
      const db = (await getDb())!;
      const alertRow = async () => (await db.select().from(venueNotifications).where(and(eq(venueNotifications.ownerId, MAIL_OWNER), eq(venueNotifications.dedupeKey, partialAlertDedupeKey(a.leadId)))))[0];
      expect(await alertRow()).toBeTruthy();
      // The next person on the same tab: BACK, their own name, email and phone, NEXT.
      const bodhi = { ownerId: MAIL_OWNER, firstName: "Bodhi", lastName: "Second", email: next, phone: "027 555 0111" };
      const b = await pub.leads.startCapture({ ...bodhi, leadId: a.leadId, leadToken: a.leadToken, formToken: opened(MAIL_OWNER, 60_000) });
      expect(b.leadId).not.toBe(a.leadId);
      // Or SUBMIT straight away with the first person's lead still held.
      const before = mailSink.messages.length;
      const done: any = await pub.leads.submit({ ...bodhi, email: `bodhi2.${t}@example.test`, ...step2, leadId: a.leadId, leadToken: a.leadToken, formToken: opened(MAIL_OWNER, 60_000) });
      expect(done.id).not.toBe(a.leadId);
      // Aria's lead is as she left it, still unfinished, and her alert is still unread.
      const aria = await leadRow(a.leadId);
      expect([aria.firstName, aria.email, aria.internalNotes]).toEqual(["Aroha", first, PARTIAL_LEAD_NOTE]);
      expect((await alertRow()).readAt).toBeNull();
      await waitForEnquiryEmails();
      const mail = mailSink.messages.slice(before).filter(isVenueMail).map(m => qp(m.data)).find(m => m.includes(`bodhi2.${t}`))!;
      expect(mail).toBeTruthy();
      expect(mail).not.toContain("told you was unfinished");
    });

    it("clears a phone or company the visitor removed", async () => {
      const email = `clear.${tag()}@example.test`;
      const pub = publicCaller();
      const a = await pub.leads.startCapture({ ...person(OWNER, email), company: "Testwell Ltd", formToken: opened(OWNER, 30_000) });
      await pub.leads.startCapture({ ownerId: OWNER, firstName: "Aroha", email, leadId: a.leadId, leadToken: a.leadToken, formToken: opened(OWNER, 30_000) });
      const row = await leadRow(a.leadId);
      expect([row.phone, row.company, row.lastName]).toEqual([null, null, null]);
    });

    it("never changes a finished lead or one staff have worked on: those get a new lead", async () => {
      const pub = publicCaller();
      const e1 = `fin.${tag()}@example.test`;
      const a = await pub.leads.startCapture({ ...person(OWNER, e1), formToken: opened(OWNER, 30_000) });
      await pub.leads.submit({ ...person(OWNER, e1), ...step2, leadId: a.leadId, leadToken: a.leadToken, formToken: opened(OWNER, 30_000) });
      const again = await pub.leads.startCapture({ ...person(OWNER, `fin2.${tag()}@example.test`), leadId: a.leadId, leadToken: a.leadToken, formToken: opened(OWNER, 30_000) });
      expect(again.leadId).not.toBe(a.leadId);
      expect((await leadRow(a.leadId)).email).toBe(e1);

      const e2 = `staff.${tag()}@example.test`;
      const b = await pub.leads.startCapture({ ...person(OWNER, e2), formToken: opened(OWNER, 30_000) });
      const db = (await getDb())!;
      await db.update(leads).set({ internalNotes: "Rang them, call back Tuesday" }).where(eq(leads.id, b.leadId));
      const moved = await pub.leads.startCapture({ ...person(OWNER, `staff2.${tag()}@example.test`), leadId: b.leadId, leadToken: b.leadToken, formToken: opened(OWNER, 30_000) });
      expect(moved.leadId).not.toBe(b.leadId);
      const kept = await leadRow(b.leadId);
      expect([kept.email, kept.internalNotes]).toEqual([e2, "Rang them, call back Tuesday"]);
    });

    it("a wrong token, or another lead's, gets a new lead and leaves the old one alone", async () => {
      const pub = publicCaller();
      const e1 = `victim.${tag()}@example.test`;
      const a = await pub.leads.startCapture({ ...person(OWNER, e1), formToken: opened(OWNER, 30_000) });
      const other = await pub.leads.startCapture({ ...person(OWNER, `other.${tag()}@example.test`), formToken: opened(OWNER, 30_000) });
      const forged = await pub.leads.startCapture({ ...person(OWNER, `x.${tag()}@example.test`), leadId: a.leadId, leadToken: "x".repeat(32), formToken: opened(OWNER, 30_000) });
      const borrowed = await pub.leads.startCapture({ ...person(OWNER, `y.${tag()}@example.test`), leadId: a.leadId, leadToken: other.leadToken, formToken: opened(OWNER, 30_000) });
      expect(forged.leadId).not.toBe(a.leadId);
      expect(borrowed.leadId).not.toBe(a.leadId);
      expect((await leadRow(a.leadId)).email).toBe(e1);
    });

    it("is counted and bot-checked like any step-1 save", async () => {
      await withRateLimit(async () => {
        const pub = publicCaller(randIp());
        const email = `count.${tag()}@example.test`;
        const a = await pub.leads.startCapture({ ...person(OWNER, email), formToken: opened(OWNER, 30_000) }); // 1
        // Bots: nothing changes, the old row included.
        expect(await pub.leads.startCapture({ ...person(OWNER, `hp.${tag()}@example.test`), hp: "x", leadId: a.leadId, leadToken: a.leadToken, formToken: opened(OWNER, 30_000) })).toEqual({ leadId: 0, leadToken: "" }); // 2
        expect(await pub.leads.startCapture({ ...person(OWNER, `fast.${tag()}@example.test`), leadId: a.leadId, leadToken: a.leadToken, formToken: opened(OWNER, 500) })).toEqual({ leadId: 0, leadToken: "" }); // 3
        expect((await leadRow(a.leadId)).email).toBe(email);
        for (let i = 0; i < 2; i++) {
          const c = await pub.leads.startCapture({ ...person(OWNER, `count${i}.${tag()}@example.test`), leadId: a.leadId, leadToken: a.leadToken, formToken: opened(OWNER, 30_000) }); // 4, 5
          expect(c.leadId).toBe(a.leadId);
        }
        await expect(pub.leads.startCapture({ ...person(OWNER, `count9.${tag()}@example.test`), leadId: a.leadId, leadToken: a.leadToken, formToken: opened(OWNER, 30_000) })).rejects.toThrow(/Too many submissions/);
      });
    });

    it("SUBMIT with a corrected email (step 1 still saving) completes the held lead, counted and timing-checked", async () => {
      await withRateLimit(async () => {
        const pub = publicCaller(randIp());
        const t = tag();
        const first = `first.${t}@example.test`;
        const a = await pub.leads.startCapture({ ...person(OWNER, first), formToken: opened(OWNER, 30_000) }); // 1
        // Too fast with another email: no free pass for a different email.
        const fast: any = await pub.leads.submit({ ...person(OWNER, `fast.${t}@example.test`), ...step2, leadId: a.leadId, leadToken: a.leadToken, formToken: opened(OWNER, 500) }); // 2
        expect(fast).toEqual({ id: 0, leadToken: "" });
        expect((await leadRow(a.leadId)).internalNotes).toBe(PARTIAL_LEAD_NOTE);
        const fixed = `fixed.${t}@example.test`;
        const done: any = await pub.leads.submit({ ...person(OWNER, fixed), ...step2, leadId: a.leadId, leadToken: a.leadToken, formToken: opened(OWNER, 30_000) }); // 3
        expect(done.id).toBe(a.leadId);
        const row = await leadRow(a.leadId);
        expect([row.email, row.internalNotes, row.guestCount]).toEqual([fixed, null, 40]);
        // Counted: two more writes, then refused.
        await pub.leads.submit({ ...person(OWNER, `p1.${t}@example.test`), ...step2, formToken: opened(OWNER, 30_000) }); // 4
        await pub.leads.submit({ ...person(OWNER, `p2.${t}@example.test`), ...step2, formToken: opened(OWNER, 30_000) }); // 5
        await expect(pub.leads.submit({ ...person(OWNER, `p3.${t}@example.test`), ...step2, formToken: opened(OWNER, 30_000) })).rejects.toThrow(/Too many submissions/);
      });
    });
  });

  // ─── S2a: the step-2 "still here" ping ────────────────────────────────────
  describe("leads.touchPartial", () => {
    it("stamps partialSeenAt on the token's own partial and touches nothing else", async () => {
      const pub = publicCaller();
      const a = await pub.leads.startCapture({ ...person(OWNER, `ping.${tag()}@example.test`), formToken: opened(OWNER, 30_000) });
      const before = await leadRow(a.leadId);
      expect(await pub.leads.touchPartial({ ownerId: OWNER, leadId: a.leadId, leadToken: a.leadToken })).toEqual({ alive: true });
      const after = await leadRow(a.leadId);
      expect(after.partialSeenAt).toBeInstanceOf(Date);
      expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
      expect(after.lastActivityAt?.getTime() ?? null).toBe(before.lastActivityAt?.getTime() ?? null);
      expect(after.internalNotes).toBe(PARTIAL_LEAD_NOTE);
      // Right away again: too soon to keep, but still worth pinging.
      expect(await pub.leads.touchPartial({ ownerId: OWNER, leadId: a.leadId, leadToken: a.leadToken })).toEqual({ alive: true });
      expect((await leadRow(a.leadId)).partialSeenAt!.getTime()).toBe(after.partialSeenAt!.getTime());
    });

    it("keeps one ping per 4 minutes, and none 2 hours after step 1", async () => {
      const a = await publicCaller().leads.startCapture({ ...person(OWNER, `cadence.${tag()}@example.test`), formToken: opened(OWNER, 30_000) });
      const t0 = (await leadRow(a.leadId)).createdAt.getTime();
      const seen = async () => (await leadRow(a.leadId)).partialSeenAt?.getTime() ?? null;
      expect(await touchPartialLead(a.leadId, OWNER, new Date(t0 + 60_000))).toEqual({ alive: true, kept: true });
      expect(await touchPartialLead(a.leadId, OWNER, new Date(t0 + 4 * 60_000))).toEqual({ alive: true, kept: false });
      expect(await seen()).toBe(t0 + 60_000);
      expect(await touchPartialLead(a.leadId, OWNER, new Date(t0 + 5 * 60_000))).toEqual({ alive: true, kept: true });
      expect(await seen()).toBe(t0 + 5 * 60_000);
      expect(await touchPartialLead(a.leadId, OWNER, new Date(t0 + PARTIAL_PING_CAP_MS - 1000))).toEqual({ alive: true, kept: true });
      expect(await touchPartialLead(a.leadId, OWNER, new Date(t0 + PARTIAL_PING_CAP_MS + 5 * 60_000))).toEqual({ alive: false, kept: false });
      expect(await seen()).toBe(t0 + PARTIAL_PING_CAP_MS - 1000);
    });

    it("answers alive:false, writing nothing, for a wrong token, a finished lead or one staff have", async () => {
      const pub = publicCaller();
      const email = `dead.${tag()}@example.test`;
      const a = await pub.leads.startCapture({ ...person(OWNER, email), formToken: opened(OWNER, 30_000) });
      expect(await pub.leads.touchPartial({ ownerId: OWNER, leadId: a.leadId, leadToken: "x".repeat(32) })).toEqual({ alive: false });
      expect(await pub.leads.touchPartial({ ownerId: OWNER + 1, leadId: a.leadId, leadToken: a.leadToken })).toEqual({ alive: false });
      expect((await leadRow(a.leadId)).partialSeenAt).toBeNull();

      const b = await pub.leads.startCapture({ ...person(OWNER, `staffping.${tag()}@example.test`), formToken: opened(OWNER, 30_000) });
      const db = (await getDb())!;
      await db.update(leads).set({ status: "contacted" }).where(eq(leads.id, b.leadId));
      expect(await pub.leads.touchPartial({ ownerId: OWNER, leadId: b.leadId, leadToken: b.leadToken })).toEqual({ alive: false });
      expect((await leadRow(b.leadId)).partialSeenAt).toBeNull();

      await pub.leads.submit({ ...person(OWNER, email), ...step2, leadId: a.leadId, leadToken: a.leadToken, formToken: opened(OWNER, 30_000) });
      expect(await pub.leads.touchPartial({ ownerId: OWNER, leadId: a.leadId, leadToken: a.leadToken })).toEqual({ alive: false });
      expect((await leadRow(a.leadId)).partialSeenAt).toBeNull();
    });

    it("has its own limit (60 per 10 minutes) and doesn't use the 5-write one", async () => {
      await withRateLimit(async () => {
        const pub = publicCaller(randIp());
        const a = await pub.leads.startCapture({ ...person(OWNER, `limit.${tag()}@example.test`), formToken: opened(OWNER, 30_000) }); // write 1
        for (let i = 0; i < 60; i++) await pub.leads.touchPartial({ ownerId: OWNER, leadId: a.leadId, leadToken: a.leadToken });
        await expect(pub.leads.touchPartial({ ownerId: OWNER, leadId: a.leadId, leadToken: a.leadToken })).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS", message: expect.stringMatching(/Too many requests/) });
        for (let i = 0; i < 4; i++) await pub.leads.startCapture({ ...person(OWNER, `limit${i}.${tag()}@example.test`), formToken: opened(OWNER, 30_000) }); // writes 2..5
      });
    });
  });

  // ─── S4: the same SUBMIT sent again ───────────────────────────────────────
  describe("a SUBMIT sent again", () => {
    it("gets back the enquiry already received; nothing is written or emailed again", async () => {
      const email = `again.${tag()}@example.test`;
      const pub = publicCaller();
      const a = await pub.leads.startCapture({ ...person(MAIL_OWNER, email), formToken: opened(MAIL_OWNER, 30_000) });
      const first: any = await pub.leads.submit({ ...person(MAIL_OWNER, email), ...step2, leadId: a.leadId, leadToken: a.leadToken, formToken: opened(MAIL_OWNER, 30_000) });
      expect(first).toMatchObject({ id: a.leadId, repeat: false, autoReply: "sending", autoReplySent: false });
      // Only what the form needs: never the rest of the row (staff notes, who it's assigned to...).
      expect(Object.keys(first).sort()).toEqual(["autoReply", "autoReplySent", "id", "leadToken", "repeat"]);
      await waitForEnquiryEmails();
      const db = (await getDb())!;
      const count = async () => ({
        mails: mailSink.messages.length,
        rows: (await leadsFor(email, MAIL_OWNER)).length,
        updatedAt: (await leadRow(a.leadId)).updatedAt.getTime(),
        emails: (await emailRows(a.leadId)).length,
        bell: (await db.select().from(venueNotifications).where(eq(venueNotifications.ownerId, MAIL_OWNER))).length,
        tasks: (await db.select().from(tasks).where(eq(tasks.ownerId, MAIL_OWNER))).length,
      });
      const before = await count();
      // The reply was lost; the phone sends it again, a second later and a minute later.
      for (const ago of [500, 60_000]) {
        const again: any = await pub.leads.submit({ ...person(MAIL_OWNER, `  ${email.toUpperCase()} `), ...step2, guestCount: 41, leadId: a.leadId, leadToken: a.leadToken, formToken: opened(MAIL_OWNER, ago) });
        expect(again).toEqual({ id: a.leadId, leadToken: first.leadToken, repeat: true, autoReply: "sent", autoReplySent: true });
      }
      await waitForEnquiryEmails();
      expect(await count()).toEqual(before);
      // The second SUBMIT's answers aren't merged in.
      expect((await leadRow(a.leadId)).guestCount).toBe(40);
    });

    it("isn't counted against the 5-write limit, but has a limit of its own", async () => {
      await withRateLimit(async () => {
        const pub = publicCaller(randIp());
        const email = `repeatlimit.${tag()}@example.test`;
        const a = await pub.leads.startCapture({ ...person(OWNER, email), formToken: opened(OWNER, 30_000) }); // write 1
        await pub.leads.submit({ ...person(OWNER, email), ...step2, leadId: a.leadId, leadToken: a.leadToken, formToken: opened(OWNER, 30_000) }); // free
        for (let i = 0; i < 30; i++) {
          const r: any = await pub.leads.submit({ ...person(OWNER, email), ...step2, leadId: a.leadId, leadToken: a.leadToken, formToken: opened(OWNER, 30_000) });
          expect(r.repeat).toBe(true);
        }
        await expect(pub.leads.submit({ ...person(OWNER, email), ...step2, leadId: a.leadId, leadToken: a.leadToken, formToken: opened(OWNER, 30_000) })).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS", message: expect.stringMatching(/Too many submissions/) });
        for (let i = 0; i < 4; i++) await pub.leads.startCapture({ ...person(OWNER, `rl${i}.${tag()}@example.test`), formToken: opened(OWNER, 30_000) }); // writes 2..5
        expect(await leadsFor(email)).toHaveLength(1);
      });
    });

    it("isn't a repeat once staff have the enquiry, after 30 minutes, or with another email", async () => {
      const pub = publicCaller();
      const db = (await getDb())!;
      const sendTwice = async (change: (id: number) => Promise<void>, email = `rep.${tag()}@example.test`, secondEmail = email) => {
        const a = await pub.leads.startCapture({ ...person(OWNER, email), formToken: opened(OWNER, 30_000) });
        await pub.leads.submit({ ...person(OWNER, email), ...step2, leadId: a.leadId, leadToken: a.leadToken, formToken: opened(OWNER, 30_000) });
        await change(a.leadId);
        const r: any = await pub.leads.submit({ ...person(OWNER, secondEmail), ...step2, leadId: a.leadId, leadToken: a.leadToken, formToken: opened(OWNER, 30_000) });
        return { first: a.leadId, second: r };
      };
      const staff = await sendTwice(async id => { await db.update(leads).set({ status: "contacted" }).where(eq(leads.id, id)); });
      expect(staff.second.id).toBeGreaterThan(staff.first);
      expect((await leadRow(staff.first)).status).toBe("contacted");
      const noted = await sendTwice(async id => { await db.update(leads).set({ internalNotes: "VIP" }).where(eq(leads.id, id)); });
      expect(noted.second.id).toBeGreaterThan(noted.first);
      const late = await sendTwice(async id => { await db.update(leads).set({ updatedAt: new Date(Date.now() - 31 * 60_000) }).where(eq(leads.id, id)); });
      expect(late.second.id).toBeGreaterThan(late.first);
      const other = await sendTwice(async () => {}, `rep1.${tag()}@example.test`, `rep2.${tag()}@example.test`);
      expect(other.second.id).toBeGreaterThan(other.first);
      expect(other.second.repeat).toBe(false);
    });
  });

  // ─── S6: the emails go after the reply, and are retried ───────────────────
  describe("the enquiry's emails", () => {
    it("every venue mailer gives up on a silent mail server in seconds, not minutes", async () => {
      const mailer = await buildVenueMailer(MAIL_OWNER);
      expect(mailer!.transporter.options).toMatchObject(SMTP_TIMEOUTS);
    });

    it("SUBMIT answers at once when the mail server doesn't, and the emails wait for a retry", async () => {
      const silent = await startSink({ silent: true });
      const owner = OWNER + 50000;
      const db = (await getDb())!;
      OWNERS.push(owner);
      await db.insert(venueSettings).values({ id: owner as any, ownerId: owner, name: "Silent Venue", slug: `submit-silent-${owner}`, ...mailSettings(silent.port) } as any);
      const email = `silent.${tag()}@example.test`;
      const pub = publicCaller();
      const a = await pub.leads.startCapture({ ...person(owner, email), formToken: opened(owner, 30_000) });
      const t = Date.now();
      const res: any = await pub.leads.submit({ ...person(owner, email), ...step2, leadId: a.leadId, leadToken: a.leadToken, formToken: opened(owner, 30_000) });
      const took = Date.now() - t;
      expect(res.id).toBe(a.leadId);
      expect(took).toBeLessThan(2000);
      expect((await leadRow(a.leadId)).internalNotes).toBeNull();
      // Queued, not sent: the background send may already have picked them up.
      for (const r of await emailRows(a.leadId)) expect(["pending", "sending"], r.kind).toContain(r.status);
      expect((await emailRows(a.leadId)).map(r => r.kind)).toEqual(["auto_reply", "venue"]);
      // The connection drops: both fail, each on its own, and are queued again.
      await new Promise(r => setTimeout(r, 200));
      silent.dropAll();
      await waitForEnquiryEmails();
      await silent.close();
      for (const r of await emailRows(a.leadId)) {
        expect(r.status, r.kind).toBe("pending");
        expect(r.attempts, r.kind).toBe(1);
        expect(r.lastError, r.kind).toBeTruthy();
        expect(r.nextAttemptAt.getTime(), r.kind).toBeGreaterThan(Date.now());
      }
      console.log(`[S6 silent smtp] SUBMIT answered after ${took} ms; queued: ${(await emailRows(a.leadId)).map(r => `${r.kind}=${r.status} (${r.lastError})`).join("; ")}`);
    });

    it("tries a refused venue email again until it goes, with the same content, and the auto-reply doesn't wait for it", async () => {
      refuseVenue = "451 4.3.0 Try again later";
      refuseVisitor = null;
      const errors = vi.spyOn(console, "error");
      try {
        const email = `retry.${tag()}@example.test`;
        const pub = publicCaller();
        const a = await pub.leads.startCapture({ ...person(REFUSE_OWNER, email), formToken: opened(REFUSE_OWNER, 30_000) });
        await pub.leads.submit({ ...person(REFUSE_OWNER, email), ...step2, message: "Something for 40 in March", leadId: a.leadId, leadToken: a.leadToken, formToken: opened(REFUSE_OWNER, 30_000) });
        await waitForEnquiryEmails();
        const venue = await emailRow(a.leadId, "venue");
        expect([venue.status, venue.attempts]).toEqual(["pending", 1]);
        expect(venue.lastError).toMatch(/^451 .*Try again later/);
        expect((await emailRow(a.leadId, "auto_reply")).status).toBe("sent");
        expect(refuseSink.messages.some(m => m.to.includes(email))).toBe(true);
        const logged = errors.mock.calls.map(c => String(c[0])).filter(l => l.startsWith("[EnquiryEmail]"));
        expect(logged.some(l => l.includes(`venue for lead ${a.leadId} failed (try 1): 451`))).toBe(true);
        expect(logged.join("\n")).not.toContain(email);

        // Not due yet: nothing happens.
        expect(await runEnquiryEmailRetries(new Date(), { ownerIds: OWNERS })).toBe(0);
        refuseVenue = null;
        const due = new Date(venue.nextAttemptAt.getTime() + 1000);
        expect(await runEnquiryEmailRetries(due, { ownerIds: OWNERS })).toBeGreaterThanOrEqual(1);
        const sentRow = await emailRow(a.leadId, "venue");
        expect([sentRow.status, sentRow.attempts]).toEqual(["sent", 2]);
        const mails = refuseSink.messages.filter(isVenueMail).map(m => qp(m.data)).filter(m => m.includes(email));
        expect(mails).toHaveLength(1);
        expect(mails[0]).toContain("New Event Enquiry: Aroha Testwell");
        expect(mails[0]).toContain("Something for 40 in March");
        // Sent: never again.
        expect(await runEnquiryEmailRetries(new Date(due.getTime() + 3_600_000), { ownerIds: OWNERS })).toBe(0);
        expect(refuseSink.messages.filter(isVenueMail).filter(m => qp(m.data).includes(email))).toHaveLength(1);
      } finally {
        errors.mockRestore();
        refuseVenue = null;
      }
    });

    it("gives up on the venue email after 8 tries and says so in the bell, without the address", async () => {
      refuseVenue = `550 5.7.1 <${VENUE_INBOX}> message refused`;
      try {
        const email = `giveup.${tag()}@example.test`;
        const pub = publicCaller();
        const res: any = await pub.leads.submit({ ...person(REFUSE_OWNER, email), ...step2, formToken: opened(REFUSE_OWNER, 30_000) });
        await waitForEnquiryEmails();
        let row = await emailRow(res.id, "venue");
        for (let i = 0; i < 20 && row.status === "pending"; i++) {
          await runEnquiryEmailRetries(new Date(row.nextAttemptAt.getTime() + 1000), { ownerIds: OWNERS });
          row = await emailRow(res.id, "venue");
        }
        expect([row.status, row.attempts]).toEqual(["failed", 8]);
        expect(row.lastError).toBe("550 EMESSAGE (DATA): 550 5.7.1 <<address>> message refused");
        const db = (await getDb())!;
        const bell = await db.select().from(venueNotifications).where(and(eq(venueNotifications.ownerId, REFUSE_OWNER), eq(venueNotifications.leadId, res.id), eq(venueNotifications.kind, "venue_email_failed")));
        expect(bell).toHaveLength(1);
        expect(bell[0].title).toBe("We couldn't email you about Aroha Testwell's enquiry");
        expect(bell[0].dedupeKey).toBe(`venue-email-failed:${res.id}`);
        expect(bell[0].body).not.toContain("@");
        // Given up: no more tries.
        expect(await runEnquiryEmailRetries(new Date(Date.now() + 5 * 3_600_000), { ownerIds: OWNERS })).toBe(0);
        expect((await emailRow(res.id, "venue")).attempts).toBe(8);
      } finally {
        refuseVenue = null;
      }
    });

    it("an auto-reply that can't go is tried 3 times; then the form stops promising one", async () => {
      refuseVisitor = "550 5.1.1 mailbox unavailable";
      try {
        const pub = publicCaller();
        const email = `noreply.${tag()}@example.test`;
        const res: any = await pub.leads.submit({ ...person(REFUSE_OWNER, email), ...step2, formToken: opened(REFUSE_OWNER, 30_000) });
        expect(res.autoReply).toBe("sending");
        await waitForEnquiryEmails();
        expect((await emailRow(res.id, "venue")).status).toBe("sent");
        let row = await emailRow(res.id, "auto_reply");
        for (let i = 0; i < 10 && row.status === "pending"; i++) {
          await runEnquiryEmailRetries(new Date(row.nextAttemptAt.getTime() + 1000), { ownerIds: OWNERS });
          row = await emailRow(res.id, "auto_reply");
        }
        expect([row.status, row.attempts]).toEqual(["failed", 3]);
        // The venue's mail is broken for visitors: the next one isn't told to look in their inbox.
        const next: any = await pub.leads.submit({ ...person(REFUSE_OWNER, `next.${tag()}@example.test`), ...step2, formToken: opened(REFUSE_OWNER, 30_000) });
        expect(next.autoReply).toBe("none");
        expect(next.autoReplySent).toBe(false);
      } finally {
        refuseVisitor = null;
        await waitForEnquiryEmails();
        // Let the next tests' venue start clean.
        const db = (await getDb())!;
        await db.delete(enquiryEmails).where(eq(enquiryEmails.ownerId, REFUSE_OWNER));
      }
    });

    it("promises nothing when the venue has no email set up or the auto-reply is off", async () => {
      const r1: any = await publicCaller().leads.submit({ ...person(OWNER, `nosmtp.${tag()}@example.test`), ...step2, formToken: opened(OWNER, 30_000) });
      expect(r1.autoReply).toBe("none");
      expect((await emailRows(r1.id)).map(r => r.status)).toEqual(["skipped", "skipped"]);
    });
  });

  // ─── S7 and S15: lines in the venue's email ───────────────────────────────
  describe("the venue's email", () => {
    it("finishing an enquiry the venue was told was unfinished marks that alert read and says so", async () => {
      const email = `latefinish.${tag()}@example.test`;
      const pub = publicCaller();
      const a = await pub.leads.startCapture({ ...person(MAIL_OWNER, email), formToken: opened(MAIL_OWNER, 30_000) });
      await alertUnfinishedEnquiries(new Date(Date.now() + 25 * 60_000));
      const db = (await getDb())!;
      const alertRow = async () => (await db.select().from(venueNotifications).where(and(eq(venueNotifications.ownerId, MAIL_OWNER), eq(venueNotifications.dedupeKey, partialAlertDedupeKey(a.leadId)))))[0];
      expect((await alertRow()).readAt).toBeNull();
      const before = mailSink.messages.length;
      await pub.leads.submit({ ...person(MAIL_OWNER, email), ...step2, leadId: a.leadId, leadToken: a.leadToken, formToken: opened(MAIL_OWNER, 30 * 60_000) });
      expect((await alertRow()).readAt).toBeInstanceOf(Date);
      const [fresh] = await db.select().from(venueNotifications).where(and(eq(venueNotifications.ownerId, MAIL_OWNER), eq(venueNotifications.dedupeKey, `new_enquiry:${a.leadId}`)));
      expect(fresh.readAt).toBeNull();
      await waitForEnquiryEmails();
      const mail = mailSink.messages.slice(before).filter(isVenueMail).map(m => qp(m.data)).find(m => m.includes(email))!;
      expect(mail).toMatch(/They finished the enquiry we told you was unfinished at \d{1,2}:\d{2}\s?[ap]m\./);
    });

    it("a filled-in honeypot on their own partial is kept and flagged in the email", async () => {
      const email = `flagged.${tag()}@example.test`;
      const pub = publicCaller();
      const a = await pub.leads.startCapture({ ...person(MAIL_OWNER, email), formToken: opened(MAIL_OWNER, 30_000) });
      const before = mailSink.messages.length;
      const res: any = await pub.leads.submit({ ...person(MAIL_OWNER, email), ...step2, hp: "https://example.test", leadId: a.leadId, leadToken: a.leadToken, formToken: opened(MAIL_OWNER, 30_000) });
      expect(res.id).toBe(a.leadId);
      expect((await leadRow(a.leadId)).internalNotes).toBe(POSSIBLE_SPAM_NOTE);
      await waitForEnquiryEmails();
      const mail = mailSink.messages.slice(before).filter(isVenueMail).map(m => qp(m.data)).find(m => m.includes(email))!;
      expect(mail).toContain("The form's hidden anti-spam field was filled in, so this may not be real.");
      expect(mail).not.toContain("told you was unfinished");
    });

    it("lists what else is on the venue's own day, whatever the server's clock says", async () => {
      const db = (await getDb())!;
      const t = tag();
      await db.insert(leads).values([
        { ownerId: MAIL_OWNER, firstName: "Lunchsameday", email: `l.${t}@example.test`, eventDate: new Date("2027-03-11T23:30:00Z"), status: "contacted", source: "manual" }, // 12:30 pm Fri 12 Mar NZ
        { ownerId: MAIL_OWNER, firstName: "Latesameday", email: `e.${t}@example.test`, eventDate: new Date("2027-03-12T10:30:00Z"), status: "contacted", source: "manual" }, // 11:30 pm Fri 12 Mar NZ
        { ownerId: MAIL_OWNER, firstName: "Brunchnextday", email: `b.${t}@example.test`, eventDate: new Date("2027-03-12T21:00:00Z"), status: "contacted", source: "manual" }, // 10:00 am Sat 13 Mar NZ
        { ownerId: MAIL_OWNER, firstName: "Undatedsameday", email: `u.${t}@example.test`, eventDate: new Date("2027-03-12T00:00:00Z"), status: "contacted", source: "manual" }, // date only, 12 Mar
      ] as any);
      const email = `clash.${t}@example.test`;
      const before = mailSink.messages.length;
      await publicCaller().leads.submit({ ...person(MAIL_OWNER, email), guestCount: 30, eventDate: "2027-03-12", formToken: opened(MAIL_OWNER, 60_000) });
      await waitForEnquiryEmails();
      const mail = mailSink.messages.slice(before).filter(isVenueMail).map(m => qp(m.data)).find(m => m.includes(email))!;
      const listed = ["Lunchsameday", "Latesameday", "Brunchnextday", "Undatedsameday"].filter(n => mail.includes(n));
      console.log(`[S9 clash box] process TZ ${Intl.DateTimeFormat().resolvedOptions().timeZone}; enquiry for Fri 12 Mar 2027 lists: ${listed.join(", ")}`);
      expect(listed).toEqual(["Lunchsameday", "Latesameday", "Undatedsameday"]);
      expect(mail).toMatch(/Friday,? 12 March 2027/);
    });
  });

  // ─── S10: the venue's wall clock ──────────────────────────────────────────
  describe("event date and time", () => {
    const submitWith = async (ownerId: number, when: { eventDate?: string; eventTime?: string }) => {
      const res: any = await publicCaller().leads.submit({ ...person(ownerId, `when.${tag()}@example.test`), ...when, formToken: opened(ownerId, 30_000) });
      return (await leadRow(res.id)).eventDate?.toISOString() ?? null;
    };

    it("places a picked time in the venue's time zone, not the visitor's", async () => {
      // 6 pm Fri 12 Mar 2027: NZDT (+13) and AEDT (+11).
      expect(await submitWith(OWNER, { eventDate: "2027-03-12", eventTime: "18:00" })).toBe("2027-03-12T05:00:00.000Z");
      expect(await submitWith(SYDNEY_OWNER, { eventDate: "2027-03-12", eventTime: "18:00" })).toBe("2027-03-12T07:00:00.000Z");
      // Noon in NZ winter is midnight UTC: kept 1 ms on so it isn't read as "no time".
      expect(await submitWith(OWNER, { eventDate: "2027-07-01", eventTime: "12:00" })).toBe("2027-07-01T00:00:00.001Z");
    });

    it("keeps a date alone, and an older form's timestamp, as they were stored before", async () => {
      expect(await submitWith(OWNER, { eventDate: "2027-03-12" })).toBe("2027-03-12T00:00:00.000Z");
      expect(await submitWith(OWNER, { eventDate: "2027-03-12", eventTime: "" })).toBe("2027-03-12T00:00:00.000Z");
      expect(await submitWith(OWNER, { eventDate: "2027-03-12T07:00:00.000Z", eventTime: "18:00" })).toBe("2027-03-12T07:00:00.000Z");
      expect(await submitWith(OWNER, { eventTime: "18:00" })).toBeNull();
    });

    it("refuses a day that doesn't exist instead of moving it", async () => {
      await expect(submitWith(OWNER, { eventDate: "2027-02-30" })).rejects.toThrow(/valid date/);
      await expect(submitWith(OWNER, { eventDate: "2027-03-12", eventTime: "7pm" })).rejects.toThrow(/pick a time/);
    });
  });
});
