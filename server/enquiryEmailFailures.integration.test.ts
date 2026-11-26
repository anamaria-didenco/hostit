import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import net from "node:net";

/**
 * The enquiry's two emails when something fails around them: saving them
 * after the lead (a database blip), the timeline note after a sent
 * auto-reply, and a queued email whose first try never happened. Through
 * the real routers, database and a local SMTP sink. Throwaway ownerIds;
 * invented people; skipped without a DB.
 */
const flags = vi.hoisted(() => ({ failQueue: 0, failActivity: 0 }));

vi.mock("./enquiryEmails", async (importOriginal) => {
  const m = await importOriginal<typeof import("./enquiryEmails")>();
  return {
    ...m,
    queueEnquiryEmails: async (...a: Parameters<typeof m.queueEnquiryEmails>) => {
      if (flags.failQueue > 0) { flags.failQueue--; throw new Error("Connection terminated unexpectedly"); }
      return m.queueEnquiryEmails(...a);
    },
  };
});
vi.mock("./db", async (importOriginal) => {
  const m = await importOriginal<typeof import("./db")>();
  return {
    ...m,
    addLeadActivity: async (...a: Parameters<typeof m.addLeadActivity>) => {
      if (flags.failActivity > 0) { flags.failActivity--; throw new Error("Connection terminated unexpectedly"); }
      return m.addLeadActivity(...a);
    },
  };
});

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { ENV } from "./_core/env";
import { formStartToken } from "./enquiryConversion";
import { queueEnquiryEmails, runEnquiryEmailRetries, waitForEnquiryEmails } from "./enquiryEmails";
import { enquiryEmails, leads, leadActivity, tasks, venueNotifications, venueSettings } from "../drizzle/schema";
import { PARTIAL_LEAD_NOTE } from "@shared/leadConstants";

const HAS_DB = !!process.env.DATABASE_URL;
const d = HAS_DB ? describe : describe.skip;
const OWNER = 1_520_000 + Math.floor(Math.random() * 9000);
const INBOX = "events@failures-venue.example.test";
const MIN = 60_000;
const tag = () => Math.random().toString(36).slice(2, 8);

/** A bare SMTP server on 127.0.0.1 that keeps every message. Nothing leaves the machine. */
function startSink() {
  const messages: Array<{ to: string[]; data: string }> = [];
  const server = net.createServer(sock => {
    let buf = "";
    let inData = false;
    let cur = { to: [] as string[], data: "" };
    sock.on("error", () => {});
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
          messages.push(cur);
          cur = { to: [], data: "" };
          sock.write("250 queued\r\n");
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
  return new Promise<{ port: number; messages: typeof messages; close: () => Promise<void> }>(resolve => server.listen(0, "127.0.0.1", () => resolve({
    port: (server.address() as net.AddressInfo).port,
    messages,
    close: () => new Promise<void>(r => server.close(() => r())),
  })));
}
const qp = (s: string) => s.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));

const randIp = () => `10.${1 + Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}`;
function publicCaller() {
  const ctx = { user: null, isTeamMember: false, req: { protocol: "https", headers: { "cf-connecting-ip": randIp() } }, res: { clearCookie: () => {} } } as unknown as TrpcContext;
  return appRouter.createCaller(ctx);
}
const opened = (agoMs: number) => formStartToken(OWNER, Date.now() - agoMs, ENV.cookieSecret);
const person = (email: string) => ({ ownerId: OWNER, firstName: "Tama", lastName: "Testwell", email, phone: "021 555 0177" });
const step2 = { eventType: "Birthday Celebration", guestCount: 30, eventFormat: "seated" as const };

d("the enquiry's emails when something around them fails (DB)", () => {
  let sink: Awaited<ReturnType<typeof startSink>>;
  const toVenue = (name: string) => sink.messages.filter(m => m.to.includes(INBOX) && qp(m.data).includes(name));
  const toVisitor = (email: string) => sink.messages.filter(m => m.to.includes(email.toLowerCase()));
  const emailRows = async (leadId: number) => {
    const db = (await getDb())!;
    return db.select().from(enquiryEmails).where(eq(enquiryEmails.leadId, leadId)).orderBy(enquiryEmails.kind);
  };

  beforeAll(async () => {
    sink = await startSink();
    const db = (await getDb())!;
    await db.insert(venueSettings).values({
      id: OWNER as any, ownerId: OWNER, name: "Failures Venue", slug: `failures-${OWNER}`,
      notificationEmail: INBOX, smtpHost: "127.0.0.1", smtpPort: sink.port, smtpUser: INBOX, smtpPass: "not-a-real-password",
    } as any);
  });
  afterAll(async () => {
    await waitForEnquiryEmails();
    const db = (await getDb())!;
    const ids = (await db.select({ id: leads.id }).from(leads).where(eq(leads.ownerId, OWNER))).map(r => r.id);
    if (ids.length) await db.delete(leadActivity).where(inArray(leadActivity.leadId, ids));
    await db.delete(tasks).where(eq(tasks.ownerId, OWNER));
    await db.delete(enquiryEmails).where(eq(enquiryEmails.ownerId, OWNER));
    await db.delete(venueNotifications).where(eq(venueNotifications.ownerId, OWNER));
    await db.delete(leads).where(eq(leads.ownerId, OWNER));
    await db.delete(venueSettings).where(eq(venueSettings.ownerId, OWNER));
    await sink.close();
  });

  it("a failure saving the emails undoes the save, so the visitor's retry still reaches the venue once", async () => {
    const email = `queue.${tag()}@example.test`;
    const pub = publicCaller();
    const cap = await pub.leads.startCapture({ ...person(email), formToken: opened(30_000) });
    const input = { ...person(email), ...step2, leadId: cap.leadId, leadToken: cap.leadToken, formToken: opened(60_000) };
    flags.failQueue = 1;
    await expect(pub.leads.submit(input)).rejects.toThrow();
    const db = (await getDb())!;
    // Nothing half-saved: still step 1's partial, and no emails queued.
    const [row] = await db.select().from(leads).where(eq(leads.id, cap.leadId));
    expect(row.internalNotes).toBe(PARTIAL_LEAD_NOTE);
    expect(await emailRows(cap.leadId)).toHaveLength(0);
    // The form shows the error; they tap SUBMIT again.
    const again: any = await pub.leads.submit(input);
    expect(again).toMatchObject({ id: cap.leadId, repeat: false });
    await waitForEnquiryEmails();
    for (const m of [2, 5, 15]) await runEnquiryEmailRetries(new Date(Date.now() + m * MIN), { ownerIds: [OWNER] });
    expect((await emailRows(cap.leadId)).map(r => r.status)).toEqual(["sent", "sent"]);
    expect(toVenue("Tama")).toHaveLength(1);
    expect(toVisitor(email)).toHaveLength(1);
    const bell = await db.select().from(venueNotifications).where(and(eq(venueNotifications.ownerId, OWNER), eq(venueNotifications.leadId, cap.leadId)));
    expect(bell.map(b => b.kind)).toEqual(["new_enquiry"]);
  });

  it("an auto-reply the mail server took isn't sent again when its timeline note fails", async () => {
    const email = `note.${tag()}@example.test`;
    const pub = publicCaller();
    const cap = await pub.leads.startCapture({ ...person(email), formToken: opened(30_000) });
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      flags.failActivity = 1;
      const done: any = await pub.leads.submit({ ...person(email), ...step2, leadId: cap.leadId, leadToken: cap.leadToken, formToken: opened(60_000) });
      await waitForEnquiryEmails();
      for (const m of [2, 5, 15, 40]) await runEnquiryEmailRetries(new Date(Date.now() + m * MIN), { ownerIds: [OWNER] });
      const auto = (await emailRows(done.id)).find(r => r.kind === "auto_reply")!;
      expect([auto.status, auto.attempts]).toEqual(["sent", 1]);
      expect(toVisitor(email)).toHaveLength(1);
      expect(errors.mock.calls.map(c => String(c[0])).some(l => l.includes("timeline note failed"))).toBe(true);
    } finally {
      errors.mockRestore();
    }
  });

  it("a queued email that never got its first try: no auto-reply days later, and the venue's says it is late", async () => {
    const email = `late.${tag()}@example.test`;
    const db = (await getDb())!;
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * MIN);
    const [lead] = await db.insert(leads).values({ ownerId: OWNER, firstName: "Rangi", lastName: "Testwell", email, status: "new", source: "lead_form", createdAt: threeDaysAgo, updatedAt: threeDaysAgo } as any).returning();
    const [vs] = await db.select().from(venueSettings).where(eq(venueSettings.ownerId, OWNER));
    await queueEnquiryEmails(lead, vs, threeDaysAgo);
    await runEnquiryEmailRetries(new Date(), { ownerIds: [OWNER] });
    const rows = await emailRows(lead.id);
    expect(rows.map(r => [r.kind, r.status])).toEqual([["auto_reply", "skipped"], ["venue", "sent"]]);
    expect(toVisitor(email)).toHaveLength(0);
    const venueMail = toVenue("Rangi").map(m => qp(m.data));
    expect(venueMail).toHaveLength(1);
    expect(venueMail[0]).toMatch(/This enquiry came in on \w+ \d{1,2} \w+ at \d{1,2}:\d{2}\s?[ap]m\. This email was held up on our side, so it is late\./);
  });

  it("a first try within the retry window isn't called late", async () => {
    const email = `ontime.${tag()}@example.test`;
    const db = (await getDb())!;
    const tenMinAgo = new Date(Date.now() - 10 * MIN);
    const [lead] = await db.insert(leads).values({ ownerId: OWNER, firstName: "Hine", lastName: "Testwell", email, status: "new", source: "lead_form", createdAt: tenMinAgo, updatedAt: tenMinAgo } as any).returning();
    const [vs] = await db.select().from(venueSettings).where(eq(venueSettings.ownerId, OWNER));
    await queueEnquiryEmails(lead, vs, tenMinAgo);
    await runEnquiryEmailRetries(new Date(), { ownerIds: [OWNER] });
    expect((await emailRows(lead.id)).map(r => r.status)).toEqual(["sent", "sent"]);
    expect(qp(toVenue("Hine")[0].data)).not.toContain("held up");
  });
});
