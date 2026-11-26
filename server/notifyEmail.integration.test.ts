import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";
import net from "node:net";
import { getDb } from "./db";
import { markNotificationsRead, notifyVenue, retryAlertEmails } from "./notify";
import { partialEnquiryAlert } from "./partialEnquiries";
import { leads, venueNotifications, venueSettings } from "../drizzle/schema";
import { PARTIAL_LEAD_NOTE } from "@shared/leadConstants";
import { EMAIL_RETRY_BACKOFF_MS, EMAIL_SENDING_LEASE_MS, VENUE_EMAIL_RETRY } from "@shared/emailDelivery";

/**
 * Bell alert emails (notifyVenue) through the venue's real mail code and a
 * local SMTP server, with the retry job driven by hand with its own clock.
 * Throwaway ownerIds; invented people; skipped without a DB.
 */
const HAS_DB = !!process.env.DATABASE_URL;
const d = HAS_DB ? describe : describe.skip;
const BASE = 1_210_000 + Math.floor(Math.random() * 9000) * 10;
const VENUE_INBOX = "events@notify-venue.example.test";
const MIN = 60_000;

/**
 * A bare SMTP server on 127.0.0.1. "ok" takes every message; "busy" answers
 * MAIL FROM with Gmail's 421-style "try again later"; "reject" refuses the
 * recipient and quotes the address back, as real servers do.
 */
let mode: "ok" | "busy" | "reject" = "ok";
const delivered: Array<{ to: string; subject: string }> = [];
function startSmtpSink(): Promise<net.Server> {
  const server = net.createServer(sock => {
    let buf = "";
    let inData = false;
    let to = "";
    sock.write("220 sink ESMTP\r\n");
    sock.on("data", chunk => {
      buf += chunk.toString("utf8");
      for (;;) {
        if (inData) {
          const end = buf.indexOf("\r\n.\r\n");
          if (end < 0) return;
          const data = buf.slice(0, end);
          buf = buf.slice(end + 5);
          inData = false;
          delivered.push({ to, subject: /^Subject: (.*)$/m.exec(data)?.[1] ?? "" });
          sock.write("250 queued\r\n");
          continue;
        }
        const nl = buf.indexOf("\r\n");
        if (nl < 0) return;
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 2);
        const cmd = line.slice(0, 4).toUpperCase();
        if (cmd === "EHLO" || cmd === "HELO") sock.write("250 sink\r\n");
        else if (cmd === "MAIL" && mode === "busy") sock.write("451 4.7.0 Try again later, closing connection.\r\n");
        else if (cmd === "RCPT") {
          to = (/<([^>]*)>/.exec(line)?.[1] ?? "").toLowerCase();
          sock.write(mode === "reject" ? `550 5.1.1 <${to}>: Recipient address rejected: User unknown\r\n` : "250 ok\r\n");
        } else if (cmd === "DATA") { inData = true; sock.write("354 go\r\n"); }
        else if (cmd === "QUIT") { sock.end("221 bye\r\n"); return; }
        else sock.write("250 ok\r\n");
      }
    });
    sock.on("error", () => {});
  });
  return new Promise(resolve => server.listen(0, "127.0.0.1", () => resolve(server)));
}
let sink: net.Server | null = null;

const later = (ms: number) => new Date(Date.now() + ms);
const owners: number[] = [];
let next = 0;
/** A fresh venue with email set up (or changed by `extra`). */
async function venue(extra: Record<string, unknown> = {}) {
  const db = (await getDb())!;
  const ownerId = BASE + next++;
  owners.push(ownerId);
  await db.insert(venueSettings).values({
    id: ownerId as any, ownerId, name: `Notify Test ${ownerId}`, slug: `notify-test-${ownerId}`,
    notificationEmail: VENUE_INBOX, smtpHost: "127.0.0.1", smtpPort: (sink!.address() as net.AddressInfo).port,
    smtpUser: VENUE_INBOX, smtpPass: "not-a-real-password", ...extra,
  } as any);
  return ownerId;
}
async function rowsFor(ownerId: number) {
  const db = (await getDb())!;
  return db.select().from(venueNotifications).where(eq(venueNotifications.ownerId, ownerId)).orderBy(venueNotifications.id);
}
const mailsTitled = (title: string) => delivered.filter(m => m.subject === title).length;
const tag = () => Math.random().toString(36).slice(2, 8);

d("bell alert emails are retried until the mail server takes them (DB)", () => {
  beforeAll(async () => { sink = await startSmtpSink(); });
  afterAll(async () => {
    const db = (await getDb())!;
    await db.delete(venueNotifications).where(inArray(venueNotifications.ownerId, owners));
    await db.delete(leads).where(inArray(leads.ownerId, owners));
    await db.delete(venueSettings).where(inArray(venueSettings.ownerId, owners));
    await new Promise(resolve => sink ? sink.close(resolve) : resolve(undefined));
  });

  it("sends at once when it can, and records it", async () => {
    mode = "ok";
    const owner = await venue();
    const title = `Sam is waiting for a reply ${tag()}`;
    expect(await notifyVenue(owner, { kind: "reply_overdue", title, dedupeKey: `t:${title}` })).toEqual({ created: true, emailed: true });
    const [row] = await rowsFor(owner);
    expect(row).toMatchObject({ emailStatus: "sent", emailAttempts: 1, emailNextAt: null, emailLastError: null });
    expect(row.emailedAt).toBeInstanceOf(Date);
    expect(mailsTitled(title)).toBe(1);
    // The same alert again (a job re-run) is a dedupe hit: no row, no email.
    expect(await notifyVenue(owner, { kind: "reply_overdue", title, dedupeKey: `t:${title}` })).toEqual({ created: false, emailed: false });
    await retryAlertEmails(later(3 * 60 * MIN), { ownerIds: [owner] });
    expect(mailsTitled(title)).toBe(1);
  });

  it("a mail server that says 'try again later' gets it again once it's back, once, however many runs overlap", async () => {
    const owner = await venue();
    const title = `Unfinished enquiry: Mere Testwell ${tag()}`;
    mode = "busy";
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await notifyVenue(owner, { kind: "partial_enquiry", title, dedupeKey: `t:${title}` });
    errors.mockRestore();
    expect(r).toEqual({ created: true, emailed: false });
    let [row] = await rowsFor(owner);
    expect(row).toMatchObject({ emailStatus: "pending", emailAttempts: 1 });
    expect(row.emailLastError).toMatch(/^451 .*Try again later/);
    expect(row.emailNextAt!.getTime() - row.createdAt.getTime()).toBeGreaterThanOrEqual(EMAIL_RETRY_BACKOFF_MS[0] - 5_000);
    expect(row.emailNextAt!.getTime() - row.createdAt.getTime()).toBeLessThan(EMAIL_RETRY_BACKOFF_MS[0] + 30_000);
    // Not due yet: nothing happens.
    await retryAlertEmails(later(20_000), { ownerIds: [owner] });
    expect((await rowsFor(owner))[0]).toMatchObject({ emailStatus: "pending", emailAttempts: 1 });
    // Mail is back; five runs at once (two instances during a deploy, say).
    mode = "ok";
    await Promise.all(Array.from({ length: 5 }, () => retryAlertEmails(later(2 * MIN), { ownerIds: [owner] })));
    [row] = await rowsFor(owner);
    expect(row).toMatchObject({ emailStatus: "sent", emailAttempts: 2 });
    expect(mailsTitled(title)).toBe(1);
    await retryAlertEmails(later(30 * MIN), { ownerIds: [owner] });
    expect(mailsTitled(title)).toBe(1);
  });

  it("tries with growing gaps and gives up after the policy's last try", async () => {
    const owner = await venue();
    const title = `Hold about to lapse ${tag()}`;
    mode = "busy";
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await notifyVenue(owner, { kind: "hold_expiring", title, dedupeKey: `t:${title}` });
      const gaps: number[] = [];
      for (let i = 0; i < 20; i++) {
        const [row] = await rowsFor(owner);
        if (row.emailStatus !== "pending") break;
        const at = row.emailNextAt!;
        await retryAlertEmails(at, { ownerIds: [owner] });
        const [after] = await rowsFor(owner);
        if (after.emailStatus === "pending") gaps.push(Math.round((after.emailNextAt!.getTime() - at.getTime()) / MIN));
      }
      const [row] = await rowsFor(owner);
      expect(row.emailStatus).toBe("failed");
      expect(row.emailAttempts).toBe(VENUE_EMAIL_RETRY.maxAttempts);
      expect(gaps).toEqual([2, 5, 10, 20, 30, 30]);
      expect(mailsTitled(title)).toBe(0);
      // A failed one stays failed.
      mode = "ok";
      await retryAlertEmails(later(3 * 60 * MIN), { ownerIds: [owner] });
      expect(mailsTitled(title)).toBe(0);
    } finally { errors.mockRestore(); mode = "ok"; }
  });

  it("keeps the mail server's reply and code, with addresses taken out", async () => {
    const owner = await venue();
    const title = `Proposal declined ${tag()}`;
    mode = "reject";
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await notifyVenue(owner, { kind: "proposal_declined", title, dedupeKey: `t:${title}` });
      const [row] = await rowsFor(owner);
      expect(row.emailStatus).toBe("pending");
      expect(row.emailLastError).toMatch(/^550 /);
      expect(row.emailLastError).toContain("<address>");
      expect(row.emailLastError).not.toContain("@");
      const logged = errors.mock.calls.map(c => c.join(" ")).filter(l => l.includes("[notify]"));
      expect(logged).toHaveLength(1);
      expect(logged[0]).toContain("try 1");
      expect(logged[0]).not.toContain("@");
    } finally { errors.mockRestore(); mode = "ok"; }
  });

  it("never emails a bell-only alert, or one from before retries existed", async () => {
    const owner = await venue();
    const db = (await getDb())!;
    const title = `New enquiry from Kim ${tag()}`;
    expect(await notifyVenue(owner, { kind: "new_enquiry", title, email: false })).toEqual({ created: true, emailed: false });
    const legacyTitle = `Old alert ${tag()}`;
    await db.insert(venueNotifications).values({ ownerId: owner, kind: "reply_overdue", title: legacyTitle, emailNextAt: later(-60 * MIN) });
    const rows = await rowsFor(owner);
    expect(rows.map(r => r.emailStatus)).toEqual([null, null]);
    await retryAlertEmails(later(60 * MIN), { ownerIds: [owner] });
    expect(mailsTitled(title) + mailsTitled(legacyTitle)).toBe(0);
    expect((await rowsFor(owner)).map(r => [r.emailStatus, r.emailAttempts])).toEqual([[null, 0], [null, 0]]);
  });

  it("alerts switched off, a muted kind, no address or no SMTP: skipped, and never sent later", async () => {
    mode = "ok";
    const off = await venue({ alertEmailsEnabled: 0 });
    const muted = await venue({ alertEmailKinds: { reply_overdue: false } });
    const noAddress = await venue({ notificationEmail: "" });
    const noSmtp = await venue({ smtpHost: null });
    const title = `Skipped ${tag()}`;
    for (const owner of [off, muted, noAddress, noSmtp]) {
      expect(await notifyVenue(owner, { kind: "reply_overdue", title, dedupeKey: `t:${title}` })).toEqual({ created: true, emailed: false });
      expect((await rowsFor(owner))[0]).toMatchObject({ emailStatus: "skipped", emailAttempts: 1 });
    }
    await retryAlertEmails(later(60 * MIN), { ownerIds: [off, muted, noAddress, noSmtp] });
    expect(mailsTitled(title)).toBe(0);
  });

  it("isn't sent once staff have seen it in the app", async () => {
    const owner = await venue();
    const title = `Client replied ${tag()}`;
    mode = "busy";
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    await notifyVenue(owner, { kind: "client_replied", title, dedupeKey: `t:${title}` });
    errors.mockRestore();
    mode = "ok";
    const [row] = await rowsFor(owner);
    await markNotificationsRead(owner, row.id);
    await retryAlertEmails(later(2 * MIN), { ownerIds: [owner] });
    expect((await rowsFor(owner))[0].emailStatus).toBe("skipped");
    expect(mailsTitled(title)).toBe(0);
  });

  it("an Unfinished alert held back isn't sent once they finish or come back; one still unfinished is", async () => {
    const owner = await venue();
    const db = (await getDb())!;
    const t = tag();
    const base = { ownerId: owner, firstName: "Mere", lastName: "Testwell", status: "new", source: "lead_form", internalNotes: PARTIAL_LEAD_NOTE } as const;
    const ins = async (v: any) => (await db.insert(leads).values(v).returning())[0];
    const finished = await ins({ ...base, email: `fin.${t}@example.test` });
    const cameBack = await ins({ ...base, email: `back.${t}@example.test` });
    const touched = await ins({ ...base, email: `staff.${t}@example.test` });
    const gone = await ins({ ...base, email: `gone.${t}@example.test` });
    mode = "busy";
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const l of [finished, cameBack, touched, gone]) await notifyVenue(owner, partialEnquiryAlert({ ...l, lastName: `${l.lastName} ${l.id}` }));
    errors.mockRestore();
    mode = "ok";
    await db.update(leads).set({ internalNotes: null }).where(eq(leads.id, finished.id));
    await ins({ ...base, email: `BACK.${t}@example.test`, internalNotes: null, createdAt: later(MIN) });
    await db.update(leads).set({ status: "contacted" }).where(eq(leads.id, touched.id));
    await retryAlertEmails(later(2 * MIN), { ownerIds: [owner] });
    const byLead = new Map((await rowsFor(owner)).map(r => [r.leadId, r.emailStatus]));
    expect(byLead.get(finished.id)).toBe("skipped");
    expect(byLead.get(cameBack.id)).toBe("skipped");
    expect(byLead.get(touched.id)).toBe("skipped");
    expect(byLead.get(gone.id)).toBe("sent");
    const titles = [finished, cameBack, touched, gone].map(l => `Unfinished enquiry: Mere Testwell ${l.id}`);
    expect(delivered.filter(m => titles.includes(m.subject)).map(m => m.subject)).toEqual([titles[3]]);
  });

  it("a 'waiting for a reply' alert held back isn't sent once staff have replied", async () => {
    const owner = await venue();
    const db = (await getDb())!;
    const [lead] = await db.insert(leads).values({ ownerId: owner, firstName: "Kim", email: `kim.${tag()}@example.test`, status: "new", source: "lead_form" }).returning();
    const title = `Kim is waiting for a reply ${tag()}`;
    mode = "busy";
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    await notifyVenue(owner, { kind: "reply_overdue", title, leadId: lead.id, dedupeKey: `reply_overdue:${lead.id}` });
    errors.mockRestore();
    mode = "ok";
    await db.update(leads).set({ firstResponseAt: new Date() }).where(eq(leads.id, lead.id));
    await retryAlertEmails(later(2 * MIN), { ownerIds: [owner] });
    expect((await rowsFor(owner))[0].emailStatus).toBe("skipped");
    expect(mailsTitled(title)).toBe(0);
  });

  it("a run that died mid-send is tried again when its claim runs out, not before", async () => {
    mode = "ok";
    const owner = await venue();
    const db = (await getDb())!;
    const title = `Deposit paid ${tag()}`;
    // What a run leaves behind if the process stops between claiming and sending.
    await db.insert(venueNotifications).values({
      ownerId: owner, kind: "deposit_paid", title, emailStatus: "sending", emailAttempts: 1,
      emailNextAt: later(EMAIL_SENDING_LEASE_MS),
    });
    await retryAlertEmails(later(EMAIL_SENDING_LEASE_MS / 2), { ownerIds: [owner] });
    expect(mailsTitled(title)).toBe(0);
    await retryAlertEmails(later(EMAIL_SENDING_LEASE_MS + MIN), { ownerIds: [owner] });
    expect(mailsTitled(title)).toBe(1);
    expect((await rowsFor(owner))[0]).toMatchObject({ emailStatus: "sent", emailAttempts: 2 });
  });

  it("gives up on a try that would start more than two hours after the alert", async () => {
    mode = "ok";
    const owner = await venue();
    const db = (await getDb())!;
    const title = `Stale ${tag()}`;
    await db.insert(venueNotifications).values({
      ownerId: owner, kind: "reply_overdue", title, emailStatus: "pending", emailAttempts: 3, emailNextAt: later(-MIN),
    });
    await db.update(venueNotifications).set({ createdAt: sql`now() - interval '3 hours'` })
      .where(and(eq(venueNotifications.ownerId, owner), eq(venueNotifications.title, title)));
    await retryAlertEmails(new Date(), { ownerIds: [owner] });
    expect((await rowsFor(owner))[0]).toMatchObject({ emailStatus: "failed" });
    expect(mailsTitled(title)).toBe(0);
  });
});
