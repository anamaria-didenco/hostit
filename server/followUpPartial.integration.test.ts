import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { inArray } from "drizzle-orm";

/**
 * The "Did you want to finish your enquiry?" follow-up (Settings →
 * Follow-ups, off by default) through the real job and database: it uses the
 * Unfinished alert's came-back rule, and counts its hours from when the
 * visitor was last on the form. SMTP is nodemailer's jsonTransport for
 * OWNER. Throwaway ownerIds; invented people; skipped without a DB.
 */
const ids = vi.hoisted(() => ({ OWNER: 1_420_000 + Math.floor(Math.random() * 9000), mail: [] as any[] }));

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
        fromName: "Finish Test Venue", fromEmail: "events@finish-venue.example.test",
        venue: { name: "Finish Test Venue", slug: "finish-test-venue", primaryColor: null },
      };
    },
  };
});

const HAS_DB = !!process.env.DATABASE_URL;
const d = HAS_DB ? describe : describe.skip;
const MIN = 60_000;
const H = 60 * MIN;

d("finish-your-enquiry email for unfinished enquiries (DB)", async () => {
  const { getDb } = await import("./db");
  const { leads, venueSettings, leadSequenceSends, venueNotifications, leadActivity, enquiryEmails } = await import("../drizzle/schema");
  const { runFollowUpSequences, leadFollowUpOutlook } = await import("./followUpSequences");
  const { applySequenceUpdate, readSequenceSettings } = await import("@shared/followUpSequences");
  const { PARTIAL_LEAD_NOTE } = await import("@shared/leadConstants");

  const T0 = Date.now() - 10 * MIN;
  const at = (min: number) => new Date(T0 + min * MIN);
  const L: Record<string, number> = {};
  const tag = Math.random().toString(36).slice(2, 8);
  const email = (name: string) => `${name}.${tag}@example.test`;

  async function cleanup() {
    const db = (await getDb())!;
    const owned = (await db.select({ id: leads.id }).from(leads).where(inArray(leads.ownerId, [ids.OWNER]))).map(r => r.id);
    if (owned.length) await db.delete(leadActivity).where(inArray(leadActivity.leadId, owned));
    await db.delete(leadSequenceSends).where(inArray(leadSequenceSends.ownerId, [ids.OWNER]));
    await db.delete(venueNotifications).where(inArray(venueNotifications.ownerId, [ids.OWNER]));
    await db.delete(enquiryEmails).where(inArray(enquiryEmails.ownerId, [ids.OWNER]));
    await db.delete(leads).where(inArray(leads.ownerId, [ids.OWNER]));
    await db.delete(venueSettings).where(inArray(venueSettings.ownerId, [ids.OWNER]));
  }

  beforeAll(async () => {
    await cleanup();
    const db = (await getDb())!;
    let seq = readSequenceSettings(null);
    seq = applySequenceUpdate(seq, "partial_form", { enabled: true, delay: 1 }, new Date(T0 - 3 * 24 * H));
    await db.insert(venueSettings).values({ id: ids.OWNER as any, ownerId: ids.OWNER, name: "Finish Test Venue", slug: `finish-test-${ids.OWNER}`, followUpSequences: seq });
    const ins = async (key: string, row: Record<string, unknown>) => {
      const [r] = await db.insert(leads).values({
        ownerId: ids.OWNER, firstName: "Ana", lastName: "Finishcheck", status: "new", source: "lead_form", ...row,
      } as any).returning({ id: leads.id });
      L[key] = r.id;
    };
    const partial = (key: string, who: string, min: number, extra: Record<string, unknown> = {}) =>
      ins(key, { email: email(who), internalNotes: PARTIAL_LEAD_NOTE, createdAt: at(min), ...extra });
    // Sent through the form: submit queued its emails.
    const finished = async (key: string, who: string, min: number, extra: Record<string, unknown> = {}) => {
      await ins(key, { email: email(who), internalNotes: null, createdAt: at(min), ...extra });
      await db.insert(enquiryEmails).values({ ownerId: ids.OWNER, leadId: L[key], kind: "venue", status: "sent" });
    };
    // Typed in by staff (Dashboard > Add enquiry keeps the source picked): no emails queued.
    const staffLogged = (key: string, who: string, min: number, source: string) =>
      ins(key, { email: email(who), internalNotes: null, createdAt: at(min), source });

    // Finished as a newer enquiry (step 1's reply was lost; SUBMIT inserted a new one).
    await partial("leftBehind", "ana", 0);
    await finished("finishedLater", "ana", 1);
    // Sent, then step 1 again after a reload.
    await finished("sentFirst", "reset", -5);
    await partial("afterSending", "reset", 0);
    // A finished enquiry long before: this is a new enquiry left unfinished.
    await finished("lastYear", "returning", -26 * 60);
    await partial("newAbandon", "returning", 0);
    // Two unfinished tries: only the newest is followed up.
    await partial("firstTry", "twice", -2);
    await partial("secondTry", "twice", 0);
    // A newer one staff typed in doesn't count.
    await finished("staffTyped", "typed", 1, { source: "manual" });
    await partial("notSilencedByStaff", "typed", 0);
    // Nor does a phone call staff logged that morning, whatever source they picked.
    await staffLogged("staffPhone", "phoned", -3 * 60, "Phone");
    await partial("notSilencedByPhone", "phoned", 0);
    // A newer enquiry that has since been closed still means they finished.
    await finished("closedLater", "closed", 3, { status: "lost" });
    await partial("silencedByClosed", "closed", 0);
    // Still on step 2 for 90 minutes: the hour counts from then.
    await partial("stayed", "stayed", 0, { partialSeenAt: at(90) });
  });

  afterAll(cleanup);

  it("goes to people who left it, not to people who carried on", async () => {
    ids.mail.length = 0;
    const run = await runFollowUpSequences(at(2 * 60), { ownerIds: [ids.OWNER] });
    const nudged = run.sent.filter(s => s.key === "partial_form").map(s => s.leadId).sort();
    expect(nudged).toEqual([L.newAbandon, L.secondTry, L.notSilencedByStaff, L.notSilencedByPhone].sort());
    expect(ids.mail.map(m => m.to?.[0]?.address).sort()).toEqual([email("returning"), email("twice"), email("typed"), email("phoned")].sort());
    // Nothing merged or deleted.
    const db = (await getDb())!;
    const rows = await db.select({ id: leads.id, internalNotes: leads.internalNotes }).from(leads).where(inArray(leads.id, [L.leftBehind, L.afterSending, L.firstTry, L.silencedByClosed]));
    expect(rows.every(r => r.internalNotes === PARTIAL_LEAD_NOTE)).toBe(true);
  });

  it("counts the hours from when they were last on the form", async () => {
    const early = await runFollowUpSequences(at(2 * 60 + 20), { ownerIds: [ids.OWNER] });
    expect(early.sent.map(s => s.leadId)).not.toContain(L.stayed);
    const due = await runFollowUpSequences(at(2 * 60 + 31), { ownerIds: [ids.OWNER] });
    expect(due.sent.filter(s => s.key === "partial_form").map(s => s.leadId)).toEqual([L.stayed]);
    // Never twice.
    const again = await runFollowUpSequences(at(6 * 60), { ownerIds: [ids.OWNER] });
    expect(again.sent).toEqual([]);
  });

  it("the enquiry drawer shows no finish-your-enquiry email for one they carried on from", async () => {
    const left = await leadFollowUpOutlook(ids.OWNER, L.leftBehind, at(30));
    expect(left?.next).toBeNull();
    const db = (await getDb())!;
    // A fresh abandon still shows it coming.
    const [fresh] = await db.insert(leads).values({
      ownerId: ids.OWNER, firstName: "Ana", email: email("fresh"), status: "new", source: "lead_form",
      internalNotes: PARTIAL_LEAD_NOTE, createdAt: at(10),
    } as any).returning({ id: leads.id });
    const outlook = await leadFollowUpOutlook(ids.OWNER, fresh.id, at(30));
    expect(outlook?.next).toMatchObject({ key: "partial_form", dueAt: at(70) });
  });
});
