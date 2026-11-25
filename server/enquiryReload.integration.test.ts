import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { ENV } from "./_core/env";
import { formStartToken } from "./enquiryConversion";
import { leads, leadActivity, tasks, venueNotifications, venueSettings } from "../drizzle/schema";
import { PARTIAL_LEAD_NOTE } from "@shared/leadConstants";

/**
 * The website form after the venue's page reloads it between step 1 and
 * SUBMIT (picking a date or guest count on barfranco.nz rewrites the iframe
 * src), through the real routers and database. Throwaway ownerIds; invented
 * people; skipped without a DB.
 */
const HAS_DB = !!process.env.DATABASE_URL;
const d = HAS_DB ? describe : describe.skip;
const OWNER = 930000 + Math.floor(Math.random() * 9999);

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
async function leadsFor(email: string) {
  const db = (await getDb())!;
  return db.select().from(leads).where(and(eq(leads.ownerId, OWNER), sql`lower(${leads.email}) = lower(${email})`)).orderBy(leads.id);
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
  });

  afterAll(async () => {
    const db = (await getDb())!;
    const owners = [OWNER];
    const ids = (await db.select({ id: leads.id }).from(leads).where(inArray(leads.ownerId, owners))).map(r => r.id);
    if (ids.length) await db.delete(leadActivity).where(inArray(leadActivity.leadId, ids));
    await db.delete(tasks).where(inArray(tasks.ownerId, owners));
    await db.delete(venueNotifications).where(inArray(venueNotifications.ownerId, owners));
    await db.delete(leads).where(inArray(leads.ownerId, owners));
    await db.delete(venueSettings).where(eq(venueSettings.ownerId, OWNER));
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

  it("still drops a filled-in honeypot, even with a valid partial token", async () => {
    const email = `honey.${tag()}@example.test`;
    const pub = publicCaller();
    const cap = await pub.leads.startCapture({ ...person(email), formToken: openedAgo(10_000) });
    const res: any = await pub.leads.submit({ ...person(email), ...step2, leadId: cap.leadId, leadToken: cap.leadToken, hp: "http://spam.example.test", formToken: openedAgo(10_000) });
    expect(res).toEqual({ id: 0, leadToken: "" });
    const rows = await leadsFor(email);
    expect(rows).toHaveLength(1);
    expect(rows[0].internalNotes).toBe(PARTIAL_LEAD_NOTE);
  });

  it("only skips the timing check while the lead is still partial", async () => {
    const email = `twice.${tag()}@example.test`;
    const pub = publicCaller();
    const cap = await pub.leads.startCapture({ ...person(email), formToken: openedAgo(10_000) });
    const first: any = await pub.leads.submit({ ...person(email), ...step2, leadId: cap.leadId, leadToken: cap.leadToken, formToken: openedAgo(10_000) });
    expect(first.id).toBe(cap.leadId);
    // Same token again, too fast: the lead is no longer partial, so the normal check applies.
    const again: any = await pub.leads.submit({ ...person(email), ...step2, leadId: cap.leadId, leadToken: cap.leadToken, formToken: openedAgo(500) });
    expect(again).toEqual({ id: 0, leadToken: "" });
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
      // Writes that aren't "finish my own partial" still count: re-sending a
      // finished lead's token, and plain submits. 3 + 2 = 5, then refused.
      const reuse: any = await pub.leads.submit({ ...person(done[0].email), ...step2, leadId: done[0].leadId, leadToken: done[0].leadToken, formToken: openedAgo(10_000) });
      expect(reuse.id).toBeGreaterThan(0);
      const plain: any = await pub.leads.submit({ ...person(`plain.${tag()}@example.test`), ...step2, formToken: openedAgo(10_000) });
      expect(plain.id).toBeGreaterThan(0);
      await expect(pub.leads.submit({ ...person(`plain2.${tag()}@example.test`), ...step2, formToken: openedAgo(10_000) })).rejects.toThrow(/Too many submissions/);
      await expect(pub.leads.startCapture({ ...person(`late.${tag()}@example.test`), formToken: openedAgo(10_000) })).rejects.toThrow(/Too many submissions/);
    });
  });

  it("a finished lead's token gets no free pass from the rate limit", async () => {
    await withRateLimit(async () => {
      const pub = publicCaller(randIp());
      const email = `resend.${tag()}@example.test`;
      const cap = await pub.leads.startCapture({ ...person(email), formToken: openedAgo(10_000) }); // 1
      await pub.leads.submit({ ...person(email), ...step2, leadId: cap.leadId, leadToken: cap.leadToken, formToken: openedAgo(10_000) }); // free
      for (let i = 0; i < 4; i++) {
        await pub.leads.submit({ ...person(email), ...step2, leadId: cap.leadId, leadToken: cap.leadToken, formToken: openedAgo(10_000) }); // 2..5
      }
      await expect(pub.leads.submit({ ...person(email), ...step2, leadId: cap.leadId, leadToken: cap.leadToken, formToken: openedAgo(10_000) })).rejects.toThrow(/Too many submissions/);
    });
  });
});

