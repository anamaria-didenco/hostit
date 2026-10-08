/**
 * DB-backed checks for enquiry reply/chase logging: lastActivityAt /
 * respondedAt bookkeeping, follow-up + auto-reply logging, the signature on
 * email.send, and automated task rules firing once per lead/booking.
 *
 * Uses its own ownerId and cleans up after itself. nodemailer is stubbed, so
 * nothing is actually sent; every message is captured in `sent`.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, inArray } from "drizzle-orm";

const { sent } = vi.hoisted(() => ({ sent: [] as any[] }));
vi.mock("nodemailer", () => ({
  default: {
    createTransport: () => ({
      sendMail: async (msg: any) => { sent.push(msg); return { messageId: `test-${sent.length}` }; },
    }),
  },
}));

import { appRouter } from "./routers";
import { getDb } from "./db";
import { sweepDaysBeforeEvent } from "./automatedTasks";
import { buildReport } from "./enquiryReport";
import { leads, leadActivity, tasks, venueSettings, bookings, automatedTaskRuns } from "../drizzle/schema";
import { leadNeedsReply } from "../shared/needsReply";
import { ymdInTz } from "../shared/automatedTasks";
import type { TrpcContext } from "./_core/context";

const OWNER = 987_654;
const hasDb = !!process.env.DATABASE_URL;

function caller(user = true) {
  const ctx: TrpcContext = {
    user: user ? {
      id: OWNER, openId: "test-activity-owner", email: "owner@activity.test", name: "Owner Person",
      loginMethod: "password", role: "admin", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    } as any : null,
    isTeamMember: false,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
  return appRouter.createCaller(ctx);
}

async function leadRow(id: number) {
  const db = (await getDb())!;
  const [row] = await db.select().from(leads).where(eq(leads.id, id));
  return row;
}
async function activity(id: number) {
  const db = (await getDb())!;
  return db.select().from(leadActivity).where(eq(leadActivity.leadId, id));
}
async function ownerTasks() {
  const db = (await getDb())!;
  return db.select().from(tasks).where(eq(tasks.ownerId, OWNER));
}

async function cleanup() {
  const db = await getDb();
  if (!db) return;
  const ids = (await db.select({ id: leads.id }).from(leads).where(eq(leads.ownerId, OWNER))).map(r => r.id);
  if (ids.length) await db.delete(leadActivity).where(inArray(leadActivity.leadId, ids));
  await db.delete(leads).where(eq(leads.ownerId, OWNER));
  await db.delete(tasks).where(eq(tasks.ownerId, OWNER));
  await db.delete(bookings).where(eq(bookings.ownerId, OWNER));
  await db.delete(automatedTaskRuns).where(eq(automatedTaskRuns.ownerId, OWNER));
  await db.delete(venueSettings).where(eq(venueSettings.ownerId, OWNER));
}

describe.skipIf(!hasDb)("enquiry reply & chase logging", () => {
  beforeAll(async () => {
    await cleanup();
    const db = (await getDb())!;
    await db.insert(venueSettings).values({
      ownerId: OWNER, name: "Activity Test Venue", slug: `activity-test-${OWNER}`,
      // Dummy SMTP — nodemailer is stubbed above.
      smtpHost: "smtp.test", smtpUser: "events@venue.test", smtpPass: "x", smtpFromName: "",
      notificationEmail: "owner@venue.test, manager@venue.test",
      emailSignatures: [{ id: "sig-a", label: "Ana", fromName: "", signature: "Kind regards,\nAna" }],
      automatedTaskRules: JSON.stringify([
        { id: "r-enq", name: "Call them", trigger: "on_enquiry_received", daysOffset: "1", priority: "high" },
        { id: "r-neg", name: "Check in on terms", trigger: "on_status_change", status: "negotiating", daysOffset: "2", priority: "medium" },
        { id: "r-conf", name: "Send deposit invoice", trigger: "on_booking_confirmed", daysOffset: "0", priority: "high" },
        { id: "r-before", name: "Confirm final numbers", trigger: "days_before_event", daysOffset: "3", priority: "medium" },
      ]),
    } as any);
  });
  afterAll(cleanup);

  let manualId = 0;

  it("manual enquiry: no space needed, keeps its source, fires the new-enquiry rule, needs a reply", async () => {
    const created: any = await caller().leads.create({ firstName: "Pat", lastName: "Phone", email: "pat@client.test", source: "Phone" });
    manualId = created.id;
    const row = await leadRow(manualId);
    expect(row.source).toBe("Phone");
    expect(row.spaceName).toBeNull();
    expect(row.lastActivityAt).toBeTruthy();
    expect(row.respondedAt).toBeNull();
    expect(leadNeedsReply(row)).toBe(true);
    const t = (await ownerTasks()).filter(x => x.linkedLeadId === manualId);
    expect(t.map(x => x.title)).toEqual(["Call them — Pat Phone"]);
    expect(t[0].priority).toBe("high");
  });

  it("a note bumps lastActivityAt but isn't a reply", async () => {
    const before = (await leadRow(manualId)).lastActivityAt!.getTime();
    await new Promise(r => setTimeout(r, 15));
    await caller().leads.addNote({ leadId: manualId, content: "Left a voicemail" });
    const row = await leadRow(manualId);
    expect(row.lastActivityAt!.getTime()).toBeGreaterThan(before);
    expect(row.respondedAt).toBeNull();
  });

  it("status change marks it replied and fires the status rule once only", async () => {
    await caller().leads.updateStatus({ id: manualId, status: "negotiating" });
    expect((await leadRow(manualId)).respondedAt).toBeTruthy();
    await caller().leads.updateStatus({ id: manualId, status: "contacted" });
    const res = await caller().leads.updateStatus({ id: manualId, status: "negotiating" });
    expect((res as any).tasksCreated).toBe(0);
    const neg = (await ownerTasks()).filter(x => x.title.startsWith("Check in on terms"));
    expect(neg).toHaveLength(1);
    // Due two NZ days later, at local noon.
    expect(ymdInTz(neg[0].dueDate!)).toBe(ymdInTz(Date.now() + 2 * 86_400_000));
  });

  it("one-tap follow-up is BCC'd to the venue and logged on the timeline", async () => {
    sent.length = 0;
    const res: any = await caller().leads.sendFollowUp({ leadId: manualId });
    expect(res.sent).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0].bcc).toEqual(["owner@venue.test", "manager@venue.test"]);
    expect(sent[0].from).toBe('"Activity Test Venue" <events@venue.test>'); // blank From name → venue name
    const acts = await activity(manualId);
    expect(acts.some(a => a.type === "email" && a.content?.startsWith("Follow-up email sent to pat@client.test"))).toBe(true);
    const row = await leadRow(manualId);
    expect(row.followUpDate!.getTime()).toBeGreaterThan(Date.now() + 6 * 86_400_000);
  });

  it("follow-up reports honestly when email isn't set up", async () => {
    const db = (await getDb())!;
    await db.update(venueSettings).set({ smtpHost: null }).where(eq(venueSettings.ownerId, OWNER));
    const res: any = await caller().leads.sendFollowUp({ leadId: manualId });
    expect(res).toEqual({ sent: false, reason: "smtp_not_configured" });
    await db.update(venueSettings).set({ smtpHost: "smtp.test" }).where(eq(venueSettings.ownerId, OWNER));
  });

  it("public form: auto-reply is reported, logged, and still leaves the lead needing a reply", async () => {
    sent.length = 0;
    const lead: any = await caller(false).leads.submit({ ownerId: OWNER, firstName: "Web", lastName: "Form", email: "web@client.test", eventType: "Birthday" });
    expect(lead.autoReplySent).toBe(true);
    const autoReply = sent.find(m => m.to === "web@client.test");
    expect(autoReply?.text).toContain("within one business day");
    const acts = await activity(lead.id);
    expect(acts.some(a => a.type === "email" && a.content?.startsWith("Automatic reply sent to web@client.test"))).toBe(true);
    const row = await leadRow(lead.id);
    expect(row.respondedAt).toBeNull();
    expect(leadNeedsReply(row)).toBe(true);
    expect((await ownerTasks()).some(t => t.title === "Call them — Web Form")).toBe(true);

    // Auto-reply switched off → reported as not sent, nothing logged.
    const db = (await getDb())!;
    await db.update(venueSettings).set({ enquiryAutoReplyEnabled: 0 }).where(eq(venueSettings.ownerId, OWNER));
    const lead2: any = await caller(false).leads.submit({ ownerId: OWNER, firstName: "Quiet", email: "quiet@client.test" });
    expect(lead2.autoReplySent).toBe(false);
    expect((await activity(lead2.id)).some(a => a.type === "email")).toBe(false);
  });

  it("email.send appends the chosen signature, uses the configured From name, and marks the lead replied", async () => {
    const db = (await getDb())!;
    await db.update(venueSettings).set({ smtpFromName: "Venue Events Team" }).where(eq(venueSettings.ownerId, OWNER));
    const lead: any = await caller().leads.create({ firstName: "Sig", email: "sig@client.test" });
    sent.length = 0;
    await caller().email.send({ to: "sig@client.test", subject: "Hello", body: "Thanks for your enquiry.", leadId: lead.id, signatureId: "sig-a" });
    expect(sent[0].from).toBe('"Venue Events Team" <events@venue.test>');
    expect(sent[0].html).toContain("Kind regards,\nAna");
    const row = await leadRow(lead.id);
    expect(row.status).toBe("contacted");
    expect(row.respondedAt).toBeTruthy();
    expect(leadNeedsReply(row)).toBe(false);
    // No signature chosen → body only.
    sent.length = 0;
    await caller().email.send({ to: "sig@client.test", subject: "Again", body: "Plain", leadId: lead.id });
    expect(sent[0].html).not.toContain("Kind regards");
  });

  it("built-in function-pack follow-up still works, once per lead", async () => {
    const lead: any = await caller().leads.create({ firstName: "Pack", email: "pack@client.test" });
    await caller().leads.updateStatus({ id: lead.id, status: "function_pack_sent" });
    await caller().leads.updateStatus({ id: lead.id, status: "contacted" });
    await caller().leads.updateStatus({ id: lead.id, status: "function_pack_sent" });
    const t = (await ownerTasks()).filter(x => x.linkedLeadId === lead.id && x.title === "Follow up with Pack");
    expect(t).toHaveLength(1);
    expect(ymdInTz(t[0].dueDate!)).toBe(ymdInTz(Date.now() + 5 * 86_400_000));
  });

  it("booking confirmed fires once whether via the lead or the booking", async () => {
    const lead: any = await caller().leads.create({ firstName: "Conf", email: "conf@client.test", spaceName: "Main Room" });
    await caller().leads.updateStatus({ id: lead.id, status: "booked" });
    const db = (await getDb())!;
    const [b] = await db.select().from(bookings).where(and(eq(bookings.ownerId, OWNER), eq(bookings.leadId, lead.id)));
    expect(b).toBeTruthy();
    await caller().bookings.update({ id: b.id, status: "tentative" } as any);
    await caller().bookings.update({ id: b.id, status: "confirmed" } as any);
    const t = (await ownerTasks()).filter(x => x.title === "Send deposit invoice — Conf");
    expect(t).toHaveLength(1);
    expect(t[0].linkedBookingId).toBe(b.id);
  });

  it("days-before-event tasks are created a week ahead, once per booking", async () => {
    const db = (await getDb())!;
    const eventMs = Date.now() + 6 * 86_400_000;
    const [b] = await db.insert(bookings).values({
      ownerId: OWNER, firstName: "Event", lastName: "Soon", email: "event@client.test",
      eventDate: new Date(eventMs), status: "confirmed", spaceName: "Main Room",
    } as any).returning();
    const far = await db.insert(bookings).values({
      ownerId: OWNER, firstName: "Event", lastName: "Later", email: "later@client.test",
      eventDate: new Date(Date.now() + 60 * 86_400_000), status: "confirmed", spaceName: "Main Room",
    } as any).returning();
    expect(await sweepDaysBeforeEvent(OWNER)).toBeGreaterThanOrEqual(1);
    expect(await sweepDaysBeforeEvent(OWNER)).toBe(0);
    const t = (await ownerTasks()).filter(x => x.title.startsWith("Confirm final numbers"));
    const soon = t.filter(x => x.linkedBookingId === b.id);
    expect(soon).toHaveLength(1);
    expect(t.map(x => x.linkedBookingId)).not.toContain(far[0].id); // 60 days out: not yet
    expect(ymdInTz(soon[0].dueDate!)).toBe(ymdInTz(eventMs - 3 * 86_400_000));
    // The earlier "Conf" booking is today — its 3-days-before date has passed,
    // so it's due today rather than in the past.
    const today = t.find(x => x.title === "Confirm final numbers — Conf");
    expect(today && ymdInTz(today.dueDate!)).toBe(ymdInTz(Date.now()));
  });

  it("weekly report: skips health-check pings and lists who to chase, with links", async () => {
    const db = (await getDb())!;
    const old = new Date(Date.now() - 12 * 86_400_000);
    await db.insert(leads).values([
      { ownerId: OWNER, firstName: "Ping", email: "ping@x.test", source: "healthcheck", status: "new" },
      { ownerId: OWNER, firstName: "Quiet", lastName: "Quinn", email: "q@x.test", status: "contacted", createdAt: old, lastActivityAt: old },
    ] as any);
    const [vs] = await db.select().from(venueSettings).where(eq(venueSettings.ownerId, OWNER));
    const report = (await buildReport(OWNER, vs))!;
    const [quiet] = await db.select().from(leads).where(and(eq(leads.ownerId, OWNER), eq(leads.lastName, "Quinn")));
    expect(report.html).not.toContain("Ping");
    expect(report.html).toContain("To chase this week");
    expect(report.html).toContain("Quiet Quinn");
    expect(report.html).toContain(`/dashboard?tab=enquiries&amp;leadId=${quiet.id}`);
    expect(report.text).toMatch(/Quiet Quinn — Gone quiet — nothing for 12 days/);
  });

  it("activity can't be read across venues", async () => {
    const other = appRouter.createCaller({
      user: { id: OWNER + 1, openId: "x", email: "x@x", name: "x", loginMethod: "password", role: "admin", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() } as any,
      isTeamMember: false,
      req: { protocol: "https", headers: {} } as any,
      res: { clearCookie: () => {} } as any,
    });
    expect(await other.leads.getActivity({ leadId: manualId })).toEqual([]);
    await expect(other.leads.addNote({ leadId: manualId, content: "nope" })).rejects.toThrow();
  });
});
