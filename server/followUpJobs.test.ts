import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, inArray } from "drizzle-orm";

/**
 * Runs the reply-overdue and follow-up jobs against a real database with
 * seeded timestamps, and checks the rows they write. Uses two throwaway
 * owner ids (cleaned up before and after). SMTP is stubbed with nodemailer's
 * jsonTransport for OWNER; OWNER_NO_SMTP has none.
 *
 * Skipped without DATABASE_URL.
 */
const ids = vi.hoisted(() => ({ OWNER: 990071, OWNER_NO_SMTP: 990072, mail: [] as any[] }));

vi.mock("./paymentsEmail", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./paymentsEmail")>();
  const nodemailer = (await import("nodemailer")).default;
  return {
    ...actual,
    buildVenueMailer: async (ownerId: number) => {
      if (ownerId !== ids.OWNER) return null;
      const json = nodemailer.createTransport({ jsonTransport: true });
      return {
        transporter: { sendMail: async (m: any) => { const r = await json.sendMail(m); ids.mail.push(JSON.parse(r.message)); return r; } },
        fromName: "Test Venue", fromEmail: "events@test.venue",
        venue: { name: "Test Venue", slug: "test-venue-c", primaryColor: null },
      };
    },
  };
});

const HAS_DB = !!process.env.DATABASE_URL;
const d = HAS_DB ? describe : describe.skip;

const H = 3_600_000;
const DAY = 24 * H;

d("speed-to-lead + follow-up jobs against the database", async () => {
  const { getDb } = await import("./db");
  const schema = await import("../drizzle/schema");
  const { runReplyOverdueCheck } = await import("./speedToLead");
  const { runFollowUpSequences } = await import("./followUpSequences");
  const { applySequenceUpdate, readSequenceSettings } = await import("@shared/followUpSequences");
  const { zonedTimeToUtcMs } = await import("@shared/businessHours");
  const { PARTIAL_LEAD_NOTE } = await import("@shared/leadConstants");
  const { leads, venueSettings, leadSequenceSends, venueNotifications, leadActivity, proposals } = schema;
  const OWNERS = [ids.OWNER, ids.OWNER_NO_SMTP];

  // Thu 1 Oct 2026, 2am in Auckland.
  const enquiryAt = new Date(zonedTimeToUtcMs(2026, 10, 1, 2 * 60, "Pacific/Auckland"));
  const switchedOn = new Date("2026-09-20T00:00:00.000Z");
  const later = (ms: number) => new Date(switchedOn.getTime() + ms);
  const L: Record<string, number> = {};

  async function cleanup() {
    const db = (await getDb())!;
    const owned = await db.select({ id: leads.id }).from(leads).where(inArray(leads.ownerId, OWNERS));
    const leadIds = owned.map(r => r.id);
    if (leadIds.length) await db.delete(leadActivity).where(inArray(leadActivity.leadId, leadIds));
    await db.delete(proposals).where(inArray(proposals.ownerId, OWNERS));
    await db.delete(leadSequenceSends).where(inArray(leadSequenceSends.ownerId, OWNERS));
    await db.delete(venueNotifications).where(inArray(venueNotifications.ownerId, OWNERS));
    await db.delete(leads).where(inArray(leads.ownerId, OWNERS));
    await db.delete(venueSettings).where(inArray(venueSettings.ownerId, OWNERS));
  }

  beforeAll(async () => {
    await cleanup();
    const db = (await getDb())!;
    // Seeded dev copies can have rows inserted with explicit ids, leaving the
    // serial behind; catch it up so our inserts don't collide.
    const { sql } = await import("drizzle-orm");
    for (const t of ["venue_settings", "leads", "proposals", "lead_activity", "venue_notifications", "lead_sequence_sends"]) {
      await db.execute(sql.raw(`SELECT setval(pg_get_serial_sequence('"${t}"', 'id'), GREATEST((SELECT COALESCE(MAX(id), 0) FROM "${t}"), 1))`));
    }
    let seq = readSequenceSettings(null);
    for (const k of ["enquiry_no_reply", "proposal_viewed", "partial_form"] as const) seq = applySequenceUpdate(seq, k, { enabled: true }, switchedOn);
    await db.insert(venueSettings).values([
      { ownerId: ids.OWNER, name: "Test Venue", slug: "test-venue-c", notificationEmail: "owner@test.venue", followUpSequences: seq },
      { ownerId: ids.OWNER_NO_SMTP, name: "No SMTP", slug: "no-smtp-c", followUpSequences: seq },
    ]);
    const base = { ownerId: ids.OWNER, firstName: "Jane", lastName: "Test", email: "jane@example.com", source: "lead_form" };
    const ins = async (key: string, row: any) => {
      const [r] = await db.insert(leads).values({ ...base, ...row }).returning({ id: leads.id });
      L[key] = r.id;
    };
    await ins("nudge", { status: "contacted", createdAt: later(H), firstResponseAt: later(2 * H), lastStaffEmailAt: later(2 * H) });
    await ins("historic", { status: "contacted", createdAt: later(-20 * DAY), firstResponseAt: later(-19 * DAY), lastStaffEmailAt: later(-19 * DAY) });
    await ins("replied", { status: "contacted", createdAt: later(H), firstResponseAt: later(2 * H), lastStaffEmailAt: later(2 * H), lastInboundAt: later(DAY) });
    await ins("paused", { status: "contacted", createdAt: later(H), firstResponseAt: later(2 * H), lastStaffEmailAt: later(2 * H), followUpsPaused: true });
    await ins("partial", { status: "new", internalNotes: PARTIAL_LEAD_NOTE, createdAt: later(H) });
    await ins("proposal", { status: "proposal_sent", createdAt: later(H), firstResponseAt: later(2 * H), lastStaffEmailAt: later(2 * H) });
    await ins("waiting", { status: "new", createdAt: enquiryAt });
    await ins("noSmtp", { ownerId: ids.OWNER_NO_SMTP, status: "contacted", createdAt: later(H), firstResponseAt: later(2 * H), lastStaffEmailAt: later(2 * H) });
    await db.insert(proposals).values({
      ownerId: ids.OWNER, leadId: L.proposal, publicToken: `test-c-${Date.now()}`, title: "Birthday dinner",
      status: "viewed", sentAt: later(2 * H), viewedAt: later(3 * H),
    });
  });

  afterAll(cleanup);

  it("reply-overdue: nothing at 3am for a 2am enquiry, one alert at 11am, never twice", async () => {
    const db = (await getDb())!;
    const at3 = new Date(enquiryAt.getTime() + H);
    expect((await runReplyOverdueCheck(at3, { ownerIds: OWNERS })).alerted).toEqual([]);
    const at11 = new Date(enquiryAt.getTime() + 9 * H);
    expect((await runReplyOverdueCheck(at11, { ownerIds: OWNERS })).alerted).toEqual([L.waiting]);
    expect((await runReplyOverdueCheck(new Date(at11.getTime() + H), { ownerIds: OWNERS })).alerted).toEqual([]);
    const rows = await db.select().from(venueNotifications).where(eq(venueNotifications.ownerId, ids.OWNER));
    expect(rows.filter(r => r.kind === "reply_overdue").map(r => r.dedupeKey)).toEqual([`reply_overdue:${L.waiting}`]);
    // The partial lead never gets a reply-overdue alert.
    expect(rows.some(r => r.leadId === L.partial)).toBe(false);
  });

  it("sends each due step once, logs it, skips historic/replied/paused leads, and alerts on stalled proposals", async () => {
    const db = (await getDb())!;
    ids.mail.length = 0;
    const run1 = await runFollowUpSequences(later(4 * DAY), { ownerIds: OWNERS });
    const sentKeys = run1.sent.map(s => `${s.key}:${s.leadId}`).sort();
    expect(sentKeys).toEqual([
      `enquiry_no_reply:${L.nudge}`, `partial_form:${L.partial}`, `proposal_viewed:${L.proposal}`,
    ].sort());
    expect(run1.skippedNoSmtp).toEqual([ids.OWNER_NO_SMTP]);

    const rows = await db.select().from(leadSequenceSends).where(inArray(leadSequenceSends.ownerId, OWNERS));
    expect(rows).toHaveLength(3);
    expect(rows.every(r => r.ownerId === ids.OWNER)).toBe(true);

    // The emails went to the client, with working links and no raw variables.
    const toClient = ids.mail.filter(m => m.to?.[0]?.address === "jane@example.com");
    expect(toClient).toHaveLength(3);
    const proposalMail = toClient.find(m => /proposal/i.test(m.subject));
    expect(proposalMail.text).toMatch(/\/proposal\/test-c-/);
    const partialMail = toClient.find(m => /finish your enquiry/i.test(m.subject));
    expect(partialMail.text).toContain("/enquire/test-venue-c");
    expect(toClient.every(m => !/\{\{/.test(m.text + m.subject))).toBe(true);

    const activity = await db.select().from(leadActivity).where(eq(leadActivity.leadId, L.nudge));
    expect(activity.some(a => a.type === "email" && a.content?.startsWith("Automatic follow-up"))).toBe(true);

    const stalled = await db.select().from(venueNotifications)
      .where(and(eq(venueNotifications.ownerId, ids.OWNER), eq(venueNotifications.kind, "proposal_stalled")));
    expect(stalled).toHaveLength(1);
    expect(stalled[0].body).toContain("automatic nudge");

    // Automatic emails never count as a staff response.
    const [nudged] = await db.select().from(leads).where(eq(leads.id, L.nudge));
    expect(nudged.lastStaffEmailAt?.getTime()).toBe(later(2 * H).getTime());

    // Run again: nothing new.
    const run2 = await runFollowUpSequences(later(4 * DAY + H), { ownerIds: OWNERS });
    expect(run2.sent).toEqual([]);
    expect(await db.select().from(leadSequenceSends).where(inArray(leadSequenceSends.ownerId, OWNERS))).toHaveLength(3);
  });

  it("the venue's alert-email switch stops email copies but keeps the bell", async () => {
    const db = (await getDb())!;
    const { notifyVenue } = await import("./notify");
    ids.mail.length = 0;
    await db.update(venueSettings).set({ alertEmailsEnabled: 0 }).where(eq(venueSettings.ownerId, ids.OWNER));
    const r = await notifyVenue(ids.OWNER, { kind: "reply_overdue", title: "Test", dedupeKey: "test-c-off" });
    expect(r).toEqual({ created: true, emailed: false });
    await db.update(venueSettings).set({ alertEmailsEnabled: 1, alertEmailKinds: { reply_overdue: false } }).where(eq(venueSettings.ownerId, ids.OWNER));
    expect(await notifyVenue(ids.OWNER, { kind: "reply_overdue", title: "Test", dedupeKey: "test-c-kind" })).toEqual({ created: true, emailed: false });
    expect(await notifyVenue(ids.OWNER, { kind: "proposal_stalled", title: "Test", dedupeKey: "test-c-on" })).toEqual({ created: true, emailed: true });
    expect(ids.mail).toHaveLength(1);
  });
});
