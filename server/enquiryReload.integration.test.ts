import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import net from "node:net";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { ENV } from "./_core/env";
import { formStartToken } from "./enquiryConversion";
import { alertUnfinishedEnquiries } from "./partialEnquiries";
import { waitForEnquiryEmails } from "./enquiryEmails";
import { enquiryEmails, leads, leadActivity, tasks, venueNotifications, venueSettings } from "../drizzle/schema";
import { PARTIAL_LEAD_NOTE, POSSIBLE_SPAM_NOTE } from "@shared/leadConstants";

/**
 * The website form after the venue's page reloads it between step 1 and
 * SUBMIT (picking a date or guest count on barfranco.nz rewrites the iframe
 * src), through the real routers and database. Throwaway ownerIds; invented
 * people; skipped without a DB.
 */
const HAS_DB = !!process.env.DATABASE_URL;
const d = HAS_DB ? describe : describe.skip;
const OWNER = 930000 + Math.floor(Math.random() * 9999);
const OTHER_OWNER = OWNER + 10000;
// A venue with email set up, so the enquiry emails can be counted.
const MAIL_OWNER = OWNER + 20000;
const VENUE_INBOX = "events@reload-venue.example.test";

/**
 * A bare SMTP server on 127.0.0.1 that accepts everything and records each
 * recipient, so the real mail code runs and nothing leaves the machine. (A
 * vi.mock of nodemailer can't be used here: vitest 2 hands the real module
 * to dynamic imports made concurrently, which is what a burst does.)
 */
const sent: Array<{ to: string }> = [];
function startSmtpSink(): Promise<net.Server> {
  const server = net.createServer(sock => {
    let buf = "";
    let inData = false;
    sock.write("220 sink ESMTP\r\n");
    sock.on("data", chunk => {
      buf += chunk.toString("utf8");
      for (;;) {
        if (inData) {
          const end = buf.indexOf("\r\n.\r\n");
          if (end < 0) return;
          buf = buf.slice(end + 5);
          inData = false;
          sock.write("250 queued\r\n");
          continue;
        }
        const nl = buf.indexOf("\r\n");
        if (nl < 0) return;
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 2);
        const cmd = line.slice(0, 4).toUpperCase();
        if (cmd === "EHLO" || cmd === "HELO") sock.write("250 sink\r\n");
        else if (cmd === "RCPT") { sent.push({ to: (/<([^>]*)>/.exec(line)?.[1] ?? "").toLowerCase() }); sock.write("250 ok\r\n"); }
        else if (cmd === "DATA") { inData = true; sock.write("354 go\r\n"); }
        else if (cmd === "QUIT") { sock.end("221 bye\r\n"); return; }
        else sock.write("250 ok\r\n");
      }
    });
    sock.on("error", () => {});
  });
  return new Promise(resolve => server.listen(0, "127.0.0.1", () => resolve(server)));
}
let smtpSink: net.Server | null = null;

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
/** The "form opened at" token a page load gets: a person's 10 s ago, or one issued just now (a reload). */
const openedAgo = (ms: number) => formStartToken(OWNER, Date.now() - ms, ENV.cookieSecret);
const tag = () => Math.random().toString(36).slice(2, 8);
const person = (email: string) => ({ ownerId: OWNER, firstName: "Aroha", lastName: "Testwell", email, phone: "021 555 0142" });
const step2 = { eventType: "Birthday Celebration", guestCount: 40, eventFormat: "seated" as const };
async function leadsFor(email: string, ownerId = OWNER) {
  const db = (await getDb())!;
  return db.select().from(leads).where(and(eq(leads.ownerId, ownerId), sql`lower(${leads.email}) = lower(${email})`)).orderBy(leads.id);
}
/** Rate limiting is off under NODE_ENV=test; these tests turn it on for one fresh IP. */
async function withRateLimit<T>(fn: () => Promise<T>): Promise<T> {
  const was = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";
  try { return await fn(); } finally { process.env.NODE_ENV = was; }
}

d("enquiry form after a reload (DB)", () => {
  beforeAll(async () => {
    const db = (await getDb())!;
    await db.insert(venueSettings).values({ id: OWNER as any, ownerId: OWNER, name: "Reload Test Venue", slug: `reload-test-${OWNER}` });
    smtpSink = await startSmtpSink();
    await db.insert(venueSettings).values({
      id: MAIL_OWNER as any, ownerId: MAIL_OWNER, name: "Reload Mail Venue", slug: `reload-mail-${MAIL_OWNER}`,
      notificationEmail: VENUE_INBOX, smtpHost: "127.0.0.1", smtpPort: (smtpSink.address() as net.AddressInfo).port,
      smtpUser: "events@reload-venue.example.test", smtpPass: "not-a-real-password",
    });
  });

  afterAll(async () => {
    const db = (await getDb())!;
    const owners = [OWNER, OTHER_OWNER, MAIL_OWNER];
    const ids = (await db.select({ id: leads.id }).from(leads).where(inArray(leads.ownerId, owners))).map(r => r.id);
    if (ids.length) await db.delete(leadActivity).where(inArray(leadActivity.leadId, ids));
    await waitForEnquiryEmails();
    await db.delete(enquiryEmails).where(inArray(enquiryEmails.ownerId, owners));
    await db.delete(tasks).where(inArray(tasks.ownerId, owners));
    await db.delete(venueNotifications).where(inArray(venueNotifications.ownerId, owners));
    await db.delete(leads).where(inArray(leads.ownerId, owners));
    await db.delete(venueSettings).where(inArray(venueSettings.ownerId, owners));
    await new Promise(resolve => smtpSink ? smtpSink.close(resolve) : resolve(undefined));
  });

  it("completes the visitor's own partial lead even when SUBMIT comes a second after a reload", async () => {
    const email = `reload.${tag()}@example.test`;
    const pub = publicCaller();
    const cap = await pub.leads.startCapture({ ...person(email), formToken: openedAgo(10_000) });
    expect(cap.leadId).toBeGreaterThan(0);
    // The page reloaded the form: a brand-new token, SUBMIT within 3 s of it.
    const res: any = await pub.leads.submit({ ...person(email), ...step2, leadId: cap.leadId, leadToken: cap.leadToken, formToken: openedAgo(500) });
    expect(res.id).toBe(cap.leadId);
    const rows = await leadsFor(email);
    expect(rows).toHaveLength(1);
    expect(rows[0].internalNotes).toBeNull();
    expect(rows[0].guestCount).toBe(40);
    expect(rows[0].eventType).toBe("Birthday Celebration");
  });

  it("still drops a too-fast submit that has no valid partial token, with a fake success", async () => {
    const email = `bot.${tag()}@example.test`;
    const pub = publicCaller();
    const res: any = await pub.leads.submit({ ...person(email), ...step2, formToken: openedAgo(500) });
    expect(res).toEqual({ id: 0, leadToken: "" });
    expect(await leadsFor(email)).toHaveLength(0);

    // A real partial, but a forged token for it: dropped, and the partial is untouched.
    const victim = `victim.${tag()}@example.test`;
    const cap = await pub.leads.startCapture({ ...person(victim), formToken: openedAgo(10_000) });
    const forged: any = await pub.leads.submit({ ...person(email), ...step2, leadId: cap.leadId, leadToken: "x".repeat(32), formToken: openedAgo(500) });
    expect(forged).toEqual({ id: 0, leadToken: "" });
    const [row] = await leadsFor(victim);
    expect(row.internalNotes).toBe(PARTIAL_LEAD_NOTE);
    expect(row.guestCount).toBeNull();
  });

  it("completes a filled-in honeypot's own partial, flagged as possible spam, instead of dropping it", async () => {
    const email = `honey.${tag()}@example.test`;
    const pub = publicCaller();
    const cap = await pub.leads.startCapture({ ...person(email), formToken: openedAgo(10_000) });
    const res: any = await pub.leads.submit({ ...person(email), ...step2, leadId: cap.leadId, leadToken: cap.leadToken, hp: "http://spam.example.test", formToken: openedAgo(10_000) });
    expect(res.id).toBe(cap.leadId);
    expect(res.internalNotes).toBeUndefined();
    const rows = await leadsFor(email);
    expect(rows).toHaveLength(1);
    expect(rows[0].internalNotes).toBe(POSSIBLE_SPAM_NOTE);
    expect(rows[0].guestCount).toBe(40);
    // Sent again, the field still filled: the note means it isn't a repeat,
    // so it is checked like any submit and dropped. Still one row.
    const again: any = await pub.leads.submit({ ...person(email), ...step2, leadId: cap.leadId, leadToken: cap.leadToken, hp: "http://spam.example.test", formToken: openedAgo(10_000) });
    expect(again).toEqual({ id: 0, leadToken: "" });
    expect(await leadsFor(email)).toHaveLength(1);
  });

  it("still drops a filled-in honeypot with another email, on a plain submit and at step 1", async () => {
    const email = `honey2.${tag()}@example.test`;
    const pub = publicCaller();
    const cap = await pub.leads.startCapture({ ...person(email), formToken: openedAgo(10_000) });
    const other = `other.${tag()}@example.test`;
    const res: any = await pub.leads.submit({ ...person(other), ...step2, leadId: cap.leadId, leadToken: cap.leadToken, hp: "x", formToken: openedAgo(10_000) });
    expect(res).toEqual({ id: 0, leadToken: "" });
    const [row] = await leadsFor(email);
    expect(row.internalNotes).toBe(PARTIAL_LEAD_NOTE);
    expect(await leadsFor(other)).toHaveLength(0);
    const plain: any = await pub.leads.submit({ ...person(other), ...step2, hp: "x", formToken: openedAgo(10_000) });
    expect(plain).toEqual({ id: 0, leadToken: "" });
    expect(await pub.leads.startCapture({ ...person(other), hp: "x", formToken: openedAgo(10_000) })).toEqual({ leadId: 0, leadToken: "" });
    expect(await leadsFor(other)).toHaveLength(0);
  });

  it("only skips the timing check while the lead is still partial", async () => {
    const email = `twice.${tag()}@example.test`;
    const pub = publicCaller();
    const cap = await pub.leads.startCapture({ ...person(email), formToken: openedAgo(10_000) });
    const first: any = await pub.leads.submit({ ...person(email), ...step2, leadId: cap.leadId, leadToken: cap.leadToken, formToken: openedAgo(10_000) });
    expect(first.id).toBe(cap.leadId);
    expect(first.repeat).toBe(false);
    // Same token and email again, too fast: the enquiry already arrived, so
    // this is the same SUBMIT again (a lost reply). It gets that enquiry
    // back and nothing is written.
    const again: any = await pub.leads.submit({ ...person(email), ...step2, leadId: cap.leadId, leadToken: cap.leadToken, formToken: openedAgo(500) });
    expect(again.id).toBe(cap.leadId);
    expect(again.repeat).toBe(true);
    // Another email with that token, too fast: no longer partial, so the normal check applies.
    const other: any = await pub.leads.submit({ ...person(`twice2.${tag()}@example.test`), ...step2, leadId: cap.leadId, leadToken: cap.leadToken, formToken: openedAgo(500) });
    expect(other).toEqual({ id: 0, leadToken: "" });
    expect(await leadsFor(email)).toHaveLength(1);
  });

  it("doesn't refuse a visitor finishing their own partial because step 1 used the rate limit", async () => {
    await withRateLimit(async () => {
      // Three people on one office connection: 3 startCaptures + 3 submits.
      // Before, the 6th write (the third SUBMIT) was refused.
      const ip = randIp();
      const pub = publicCaller(ip);
      const done: Array<{ email: string; leadId: number; leadToken: string }> = [];
      for (let i = 0; i < 3; i++) {
        const email = `office${i}.${tag()}@example.test`;
        const cap = await pub.leads.startCapture({ ...person(email), formToken: openedAgo(10_000) });
        const res: any = await pub.leads.submit({ ...person(email), ...step2, leadId: cap.leadId, leadToken: cap.leadToken, formToken: openedAgo(10_000) });
        expect(res.id).toBe(cap.leadId);
        done.push({ email, ...cap });
      }
      // Re-sending a finished lead's token with its email writes nothing (the
      // same enquiry comes back), so it isn't counted. Writes that aren't
      // "finish my own partial" still count: the same token with another
      // email, and plain submits. 3 + 2 = 5, then refused.
      const reuse: any = await pub.leads.submit({ ...person(done[0].email), ...step2, leadId: done[0].leadId, leadToken: done[0].leadToken, formToken: openedAgo(10_000) });
      expect(reuse).toMatchObject({ id: done[0].leadId, repeat: true });
      const reuseOther: any = await pub.leads.submit({ ...person(`reuse.${tag()}@example.test`), ...step2, leadId: done[0].leadId, leadToken: done[0].leadToken, formToken: openedAgo(10_000) });
      expect(reuseOther.id).toBeGreaterThan(done[2].leadId);
      const plain: any = await pub.leads.submit({ ...person(`plain.${tag()}@example.test`), ...step2, formToken: openedAgo(10_000) });
      expect(plain.id).toBeGreaterThan(0);
      await expect(pub.leads.submit({ ...person(`plain2.${tag()}@example.test`), ...step2, formToken: openedAgo(10_000) })).rejects.toThrow(/Too many submissions/);
      await expect(pub.leads.startCapture({ ...person(`late.${tag()}@example.test`), formToken: openedAgo(10_000) })).rejects.toThrow(/Too many submissions/);
    });
  });

  // Many submits at once, all carrying one partial's leadId + leadToken, from
  // one connection: a double-tap, a flaky network's retries, or a script
  // replaying the token. Exactly one of them finishes the partial without
  // being counted. With the partial's own email, every other one is the same
  // enquiry sent again: it gets that enquiry back, and nothing is written or
  // emailed. With another email, every other one is counted and checked like
  // any submit, so the emails stay within the usual budget.
  describe("one partial token sent many times at once", () => {
    const N = 30;
    const mailPerson = (email: string, i = 0) => ({ ownerId: MAIL_OWNER, firstName: `Burst${i}`, lastName: "Testwell", email, phone: "021 555 0142" });
    const mailToken = (ms: number) => formStartToken(MAIL_OWNER, Date.now() - ms, ENV.cookieSecret);
    async function burst(opts: { stepOneToken?: string; submitToken?: (i: number) => string | undefined; email: (i: number) => string; stepOneEmail: string; sameName?: boolean }) {
      return withRateLimit(async () => {
        const pub = publicCaller(randIp());
        const cap = await pub.leads.startCapture({ ...mailPerson(opts.stepOneEmail), formToken: opts.stepOneToken });
        expect(cap.leadId).toBeGreaterThan(0);
        sent.length = 0;
        const res = await Promise.allSettled(Array.from({ length: N }, (_, i) => pub.leads.submit({
          ...mailPerson(opts.email(i), opts.sameName ? 0 : i), ...step2, leadId: cap.leadId, leadToken: cap.leadToken, formToken: opts.submitToken?.(i),
        })));
        const ok = res.filter(r => r.status === "fulfilled").map(r => (r as PromiseFulfilledResult<any>).value);
        const refused = res.filter(r => r.status === "rejected" && /Too many submissions/.test(String((r as PromiseRejectedResult).reason?.message)));
        const other = res.filter(r => r.status === "rejected" && !/Too many submissions/.test(String((r as PromiseRejectedResult).reason?.message)));
        expect(other.map(r => String((r as PromiseRejectedResult).reason?.message))).toEqual([]);
        // The emails go after each reply; wait for them before counting.
        await waitForEnquiryEmails();
        const db = (await getDb())!;
        const activity = await db.select({ id: leadActivity.id }).from(leadActivity).where(eq(leadActivity.leadId, cap.leadId));
        const [row] = await db.select().from(leads).where(eq(leads.id, cap.leadId));
        return {
          cap, row, activity: activity.length, refused: refused.length,
          accepted: ok.filter(v => v?.id > 0), fake: ok.filter(v => v?.id === 0).length,
          completed: ok.filter(v => v?.id > 0 && !v.repeat), repeats: ok.filter(v => v?.repeat === true),
          venueMails: sent.filter(m => m.to === VENUE_INBOX).length,
          autoReplies: sent.filter(m => m.to !== VENUE_INBOX),
        };
      });
    }

    it("a reload token (too fast): one completes the partial, the rest get that enquiry back", async () => {
      const email = `burst.${tag()}@example.test`;
      const r = await burst({ stepOneToken: mailToken(10_000), stepOneEmail: email, email: () => email, submitToken: () => mailToken(500) });
      expect(r.completed.map(v => v.id)).toEqual([r.cap.leadId]);
      expect(r.repeats).toHaveLength(N - 1);
      expect(new Set(r.accepted.map(v => v.id))).toEqual(new Set([r.cap.leadId]));
      expect(r.fake + r.refused).toBe(0);
      // One enquiry, so one venue email and one auto-reply (before, the
      // losers were counted and dropped; now they write nothing at all).
      expect(r.venueMails).toBe(1);
      expect(r.autoReplies.map(m => m.to)).toEqual([email]);
      expect(r.activity).toBe(1);
      expect(r.row.internalNotes).toBeNull();
      expect(r.row.guestCount).toBe(40);
      expect(await leadsFor(email, MAIL_OWNER)).toHaveLength(1);
    });

    it("no timing token at all (a script): one free completion, the rest are repeats that write nothing", async () => {
      const email = `script.${tag()}@example.test`;
      const r = await burst({ stepOneEmail: email, email: () => email });
      // On main the losers were counted (4 more rows and emails got
      // through); now they are the same enquiry again: one row, one set of emails.
      expect(r.completed.map(v => v.id)).toEqual([r.cap.leadId]);
      expect(r.repeats).toHaveLength(N - 1);
      expect(r.refused).toBe(0);
      expect(r.venueMails).toBe(1);
      expect(r.autoReplies).toHaveLength(1);
      expect(r.activity).toBe(1);
      expect(await leadsFor(email, MAIL_OWNER)).toHaveLength(1);
    });

    it("a corrected email under the same name, sent many times at once: one finishes the partial with it, the rest get that enquiry back", async () => {
      const t = tag();
      const typo = `aroha.${t}@exmaple.test`;
      const fixed = `aroha.${t}@example.test`;
      const r = await burst({ stepOneToken: mailToken(10_000), stepOneEmail: typo, email: () => fixed, submitToken: () => mailToken(10_000), sameName: true });
      // A corrected email is counted, so 4 of them pass the limit. Before,
      // every one of the 4 that read the row while it was partial saved its
      // own enquiry and sent its own two emails.
      // (One that reads the row after it is finished is a repeat before it
      // is counted, so it can let one more through the limit as a repeat.)
      expect(r.completed.map(v => v.id)).toEqual([r.cap.leadId]);
      expect(new Set(r.accepted.map(v => v.id))).toEqual(new Set([r.cap.leadId]));
      expect(r.repeats.length).toBeGreaterThanOrEqual(3);
      expect(r.repeats.length + r.refused).toBe(N - 1);
      expect(r.fake).toBe(0);
      expect(r.venueMails).toBe(1);
      expect(r.autoReplies.map(m => m.to)).toEqual([fixed]);
      expect(r.row.internalNotes).toBeNull();
      expect(r.row.email).toBe(fixed);
      expect(await leadsFor(fixed, MAIL_OWNER)).toHaveLength(1);
      expect(await leadsFor(typo, MAIL_OWNER)).toHaveLength(0);
    });

    it("a different email on every submit: nothing is free, so at most 4 get through", async () => {
      const t = tag();
      const r = await burst({ stepOneToken: mailToken(10_000), stepOneEmail: `first.${t}@example.test`, email: i => `target${i}.${t}@example.test`, submitToken: () => mailToken(10_000) });
      expect(r.accepted.length).toBe(4);
      expect(r.refused).toBe(N - 4);
      expect(r.venueMails).toBe(4);
      expect(r.autoReplies).toHaveLength(4);
      expect(r.autoReplies.every(m => m.to.startsWith("target"))).toBe(true);
    });

    it("a different email, too fast after a reload: dropped, and the partial is left as it was", async () => {
      const t = tag();
      const r = await burst({ stepOneToken: mailToken(10_000), stepOneEmail: `first.${t}@example.test`, email: i => `target${i}.${t}@example.test`, submitToken: () => mailToken(500) });
      expect(r.accepted).toHaveLength(0);
      expect(r.fake).toBe(4);
      expect(sent).toHaveLength(0);
      expect(r.row.internalNotes).toBe(PARTIAL_LEAD_NOTE);
    });
  });

  it("a finished lead's token gets no free pass from the rate limit", async () => {
    await withRateLimit(async () => {
      const pub = publicCaller(randIp());
      const email = `resend.${tag()}@example.test`;
      const cap = await pub.leads.startCapture({ ...person(email), formToken: openedAgo(10_000) }); // 1
      await pub.leads.submit({ ...person(email), ...step2, leadId: cap.leadId, leadToken: cap.leadToken, formToken: openedAgo(10_000) }); // free
      // With its own email: the same enquiry back, nothing written, not counted.
      for (let i = 0; i < 4; i++) {
        const again: any = await pub.leads.submit({ ...person(email), ...step2, leadId: cap.leadId, leadToken: cap.leadToken, formToken: openedAgo(10_000) });
        expect(again).toMatchObject({ id: cap.leadId, repeat: true });
      }
      expect(await leadsFor(email)).toHaveLength(1);
      // With any other email: a new row each time, counted. 2..5, then refused.
      for (let i = 0; i < 4; i++) {
        const other: any = await pub.leads.submit({ ...person(`resend${i}.${tag()}@example.test`), ...step2, leadId: cap.leadId, leadToken: cap.leadToken, formToken: openedAgo(10_000) });
        expect(other.id).toBeGreaterThan(cap.leadId);
      }
      await expect(pub.leads.submit({ ...person(`resend9.${tag()}@example.test`), ...step2, leadId: cap.leadId, leadToken: cap.leadToken, formToken: openedAgo(10_000) })).rejects.toThrow(/Too many submissions/);
    });
  });
});

d("unfinished-enquiry alerts when the person came back (DB)", () => {
  // Far in the future, so only these rows fall in the alert window.
  const T0 = new Date("2031-03-01T00:00:00Z").getTime();
  const at = (min: number) => new Date(T0 + min * 60_000);
  const base = { ownerId: OWNER, firstName: "Mere", lastName: "Testwell", status: "new", source: "lead_form" } as const;
  const partial = (email: string, min: number) => ({ ...base, email, internalNotes: PARTIAL_LEAD_NOTE, createdAt: at(min), updatedAt: at(min) });
  const complete = (email: string, min: number, ownerId = OWNER) => ({ ...base, ownerId, email, internalNotes: null, guestCount: 30, createdAt: at(min), updatedAt: at(min) });

  it("skips a partial when a newer lead for the same venue and email exists, and alerts the rest", async () => {
    const db = (await getDb())!;
    const t = tag();
    const ins = async (v: any) => (await db.insert(leads).values(v).returning({ id: leads.id }))[0].id;
    // Sent through the form: its "New enquiry" bell row, as every submit writes (forms before queued emails too).
    const sent = async (v: any) => {
      const id = await ins(v);
      await db.insert(venueNotifications).values({ ownerId: v.ownerId, kind: "new_enquiry", title: "New enquiry", leadId: id, dedupeKey: `new_enquiry:${id}` });
      return id;
    };
    const finishedLater = await ins(partial(`Kim.${t}@Example.test`, 0));
    await sent(complete(`  kim.${t}@example.test`, 5));                // came back and finished (other case, spaces)
    const restartedFirst = await ins(partial(`ora.${t}@example.test`, 0));
    const restartedSecond = await ins(partial(`ORA.${t}@example.test`, 3)); // started again
    const neverBack = await ins(partial(`lee.${t}@example.test`, 0));
    const olderOnly = await ins(partial(`max.${t}@example.test`, 2));
    await sent(complete(`max.${t}@example.test`, -25 * 60));            // an enquiry from more than a day before doesn't count
    const otherVenue = await ins(partial(`ngaio.${t}@example.test`, 0));
    await sent(complete(`ngaio.${t}@example.test`, 6, OTHER_OWNER));    // same email, another venue
    // Staff logged a call from this person after they left the form: not the form, so it doesn't count.
    const staffAfter = await ins(partial(`rua.${t}@example.test`, 0));
    await ins({ ...complete(`rua.${t}@example.test`, 8), source: "Phone" });
    const before = (await db.select({ n: sql<number>`count(*)::int` }).from(leads).where(or(eq(leads.ownerId, OWNER), eq(leads.ownerId, OTHER_OWNER))))[0].n;

    await alertUnfinishedEnquiries(at(30));

    const alerted = (await db.select({ leadId: venueNotifications.leadId }).from(venueNotifications)
      .where(and(eq(venueNotifications.ownerId, OWNER), eq(venueNotifications.kind, "partial_enquiry")))).map(r => r.leadId);
    expect(alerted).toEqual(expect.arrayContaining([restartedSecond, neverBack, olderOnly, otherVenue, staffAfter]));
    expect(alerted).not.toContain(finishedLater);
    expect(alerted).not.toContain(restartedFirst);
    // Nothing merged or deleted; the left-behind partials stay as they were.
    const after = (await db.select({ n: sql<number>`count(*)::int` }).from(leads).where(or(eq(leads.ownerId, OWNER), eq(leads.ownerId, OTHER_OWNER))))[0].n;
    expect(after).toBe(before);
    const [left] = await db.select().from(leads).where(eq(leads.id, finishedLater));
    expect(left.internalNotes).toBe(PARTIAL_LEAD_NOTE);
  });

  it("isn't silenced by a newer lead that never reaches the venue as an enquiry", async () => {
    const db = (await getDb())!;
    const t = tag();
    const ins = async (v: any) => (await db.insert(leads).values(v).returning({ id: leads.id }))[0].id;
    const ids: number[] = [];
    for (const source of ["express_book", "healthcheck", "manual", "csv_import", "xero", null]) {
      const email = `src-${source ?? "none"}.${t}@example.test`;
      ids.push(await ins(partial(email, 10)));
      await ins({ ...complete(email.toUpperCase(), 12), source });
    }
    await alertUnfinishedEnquiries(at(40));
    const alerted = (await db.select({ leadId: venueNotifications.leadId }).from(venueNotifications)
      .where(and(eq(venueNotifications.ownerId, OWNER), eq(venueNotifications.kind, "partial_enquiry"), inArray(venueNotifications.leadId, ids)))).map(r => r.leadId);
    expect(alerted.sort()).toEqual([...ids].sort());
  });

  it("still alerts when someone sends the visitor's email through Express Book or as a health check", async () => {
    const db = (await getDb())!;
    const t = tag();
    const victims = [`victim-xb.${t}@example.test`, `victim-hc.${t}@example.test`];
    const caps = [];
    for (const email of victims) caps.push(await publicCaller().leads.startCapture({ ...person(email), formToken: openedAgo(10_000) }));
    // Someone else, from another connection, with the same email addresses.
    await publicCaller().expressBook.submit({ ownerId: OWNER, firstName: "Not", lastName: "Them", email: victims[0].toUpperCase(), eventType: "Other", eventDate: "2031-05-05", guestCount: 2 });
    const hc: any = await publicCaller().leads.submit({ ownerId: OWNER, firstName: "Not", email: victims[1], source: "healthcheck", formToken: openedAgo(10_000) });
    expect(hc.id).toBeGreaterThan(0);
    await alertUnfinishedEnquiries(new Date(Date.now() + 25 * 60_000));
    const alerted = (await db.select({ leadId: venueNotifications.leadId }).from(venueNotifications)
      .where(and(eq(venueNotifications.ownerId, OWNER), eq(venueNotifications.kind, "partial_enquiry"), inArray(venueNotifications.leadId, caps.map(c => c.leadId))))).map(r => r.leadId);
    expect(alerted.sort()).toEqual(caps.map(c => c.leadId).sort());
  });
});
