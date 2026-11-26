import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "./db";
import { alertUnfinishedEnquiries, isPartialStillUnfinished } from "./partialEnquiries";
import { leads, venueNotifications, venueSettings } from "../drizzle/schema";
import { NON_ENQUIRY_SOURCES, PARTIAL_LEAD_NOTE, POSSIBLE_SPAM_NOTE } from "@shared/leadConstants";
import { isPartialSuperseded, partialAlertDueAt } from "@shared/enquiryTiming";

/**
 * When the "Unfinished enquiry" alert goes, through the real job and
 * database: the came-back rule (a finished enquiry from the same email just
 * before, as well as any newer one) and the 20 minutes counted from the
 * form's last "still here" ping. Rows are seeded far in the future, each test
 * with its own time and venue, so only these rows are due. Throwaway
 * ownerIds; invented people; skipped without a DB.
 */
const HAS_DB = !!process.env.DATABASE_URL;
const d = HAS_DB ? describe : describe.skip;
const BASE = 1_310_000 + Math.floor(Math.random() * 9000) * 10;
const MIN = 60_000;
const H = 60 * MIN;
const tag = () => Math.random().toString(36).slice(2, 8);

const owners: number[] = [];
let next = 0;
async function venue() {
  const db = (await getDb())!;
  const ownerId = BASE + next++;
  owners.push(ownerId);
  await db.insert(venueSettings).values({ id: ownerId as any, ownerId, name: `Alert Test ${ownerId}`, slug: `alert-test-${ownerId}` });
  return ownerId;
}
/** Each test gets its own far-future time, days from the others', so no other test's rows are due when it runs the job. */
let slot = 0;
const clock = () => {
  const t0 = Date.UTC(2034, 0, 1) + slot++ * 10 * 24 * H;
  return (min: number) => new Date(t0 + min * MIN);
};
type Row = { ownerId: number; email: string; source?: string | null; internalNotes?: string | null; status?: string; createdAt: Date; partialSeenAt?: Date | null };
async function ins(r: Row) {
  const db = (await getDb())!;
  const [row] = await db.insert(leads).values({
    firstName: "Mere", lastName: "Testwell", status: "new", source: "lead_form", ...r, updatedAt: r.createdAt,
  } as any).returning();
  return row;
}
async function alertedFor(ownerId: number) {
  const db = (await getDb())!;
  return (await db.select({ leadId: venueNotifications.leadId }).from(venueNotifications)
    .where(and(eq(venueNotifications.ownerId, ownerId), eq(venueNotifications.kind, "partial_enquiry")))).map(r => r.leadId!);
}

d("Unfinished enquiry alert: came back, and still on step 2 (DB)", () => {
  beforeAll(async () => { await venue(); });
  afterAll(async () => {
    const db = (await getDb())!;
    await db.delete(venueNotifications).where(inArray(venueNotifications.ownerId, owners));
    await db.delete(leads).where(inArray(leads.ownerId, owners));
    await db.delete(venueSettings).where(inArray(venueSettings.ownerId, owners));
  });

  it("is silenced by a finished enquiry from the same email sent up to a day before it", async () => {
    const owner = await venue();
    const at = clock();
    const t = tag();
    const partial = (email: string, min = 0) => ins({ ownerId: owner, email, internalNotes: PARTIAL_LEAD_NOTE, createdAt: at(min) });
    const finished = (email: string, min: number, extra: Partial<Row> = {}) => ins({ ownerId: owner, email, internalNotes: null, createdAt: at(min), ...extra });

    // Sent first, then step 1 again (a reload after sending, or a late step-1 save).
    await finished(`sent.${t}@example.test`, -2);
    const afterSent = await partial(`  SENT.${t}@Example.test `);
    // Two tabs: tab 1's lead (created first) was completed in place.
    await finished(`tabs.${t}@example.test`, -1);
    const tab2 = await partial(`tabs.${t}@example.test`);
    // Exactly a day before still counts; a day and a minute doesn't.
    await finished(`day.${t}@example.test`, -24 * 60);
    const aDayOn = await partial(`day.${t}@example.test`);
    await finished(`old.${t}@example.test`, -24 * 60 - 1);
    const longAfter = await partial(`old.${t}@example.test`);
    // A finished one flagged as possible spam, or with a staff note, is still finished.
    await finished(`spam.${t}@example.test`, -30, { internalNotes: POSSIBLE_SPAM_NOTE });
    const afterSpam = await partial(`spam.${t}@example.test`);
    await finished(`noted.${t}@example.test`, -30, { internalNotes: "Called them back" });
    const afterNoted = await partial(`noted.${t}@example.test`);
    // An older unfinished one never silences: two abandoned attempts give one alert, for the newest.
    const firstTry = await partial(`twice.${t}@example.test`, -30);
    const secondTry = await partial(`twice.${t}@example.test`);

    await alertUnfinishedEnquiries(at(30));
    const alerted = await alertedFor(owner);
    expect(alerted).not.toContain(afterSent.id);
    expect(alerted).not.toContain(tab2.id);
    expect(alerted).not.toContain(aDayOn.id);
    expect(alerted).toContain(longAfter.id);
    expect(alerted).not.toContain(afterSpam.id);
    expect(alerted).not.toContain(afterNoted.id);
    expect(alerted).toContain(secondTry.id);
    expect(alerted).not.toContain(firstTry.id);
    // Nothing merged or deleted; the left-behind partials stay as they were.
    const db = (await getDb())!;
    const [left] = await db.select().from(leads).where(eq(leads.id, tab2.id));
    expect(left.internalNotes).toBe(PARTIAL_LEAD_NOTE);
  });

  it("isn't silenced by an earlier enquiry that never reached the venue as one, or another venue's", async () => {
    const owner = await venue();
    const other = await venue();
    const at = clock();
    const t = tag();
    const ids: number[] = [];
    for (const source of [...NON_ENQUIRY_SOURCES, null]) {
      const email = `src-${source ?? "none"}.${t}@example.test`;
      await ins({ ownerId: owner, email: email.toUpperCase(), source, internalNotes: null, createdAt: at(-5) });
      ids.push((await ins({ ownerId: owner, email, internalNotes: PARTIAL_LEAD_NOTE, createdAt: at(0) })).id);
    }
    await ins({ ownerId: other, email: `elsewhere.${t}@example.test`, internalNotes: null, createdAt: at(-5) });
    ids.push((await ins({ ownerId: owner, email: `elsewhere.${t}@example.test`, internalNotes: PARTIAL_LEAD_NOTE, createdAt: at(0) })).id);
    await alertUnfinishedEnquiries(at(30));
    expect((await alertedFor(owner)).sort()).toEqual([...ids].sort());
  });

  it("matches the shared rule (isPartialSuperseded) on every mix of note, source and timing", async () => {
    const owner = await venue();
    const at = clock();
    const t = tag();
    const notes = [PARTIAL_LEAD_NOTE, null, POSSIBLE_SPAM_NOTE, "Staff note"];
    const sources = ["lead_form", "Instagram", "manual", "express_book", null];
    // Minutes from the partial: before it (in and out of the day), same time either order, after.
    const offsets = [-25 * 60, -24 * 60 - 1, -24 * 60, -23 * 60, -1, 0, 1];
    let n = 0;
    for (const note of notes) for (const source of sources) for (const off of offsets) {
      const email = `mix${n++}.${t}@example.test`;
      const otherFirst = off < 0 || (off === 0 && n % 2 === 0);
      const other = () => ins({ ownerId: owner, email: n % 3 === 0 ? ` ${email.toUpperCase()}` : email, source, internalNotes: note, createdAt: at(off) });
      if (otherFirst) await other();
      await ins({ ownerId: owner, email, internalNotes: PARTIAL_LEAD_NOTE, createdAt: at(0) });
      if (!otherFirst) await other();
    }
    await alertUnfinishedEnquiries(at(30));
    const db = (await getDb())!;
    const rows = await db.select().from(leads).where(eq(leads.ownerId, owner));
    const partials = rows.filter(r => r.internalNotes === PARTIAL_LEAD_NOTE);
    const expected = partials.filter(p => !isPartialSuperseded(p, rows)).map(p => p.id).sort();
    const alerted = (await alertedFor(owner)).sort();
    expect(alerted).toEqual(expected);
    // Both outcomes are covered.
    expect(expected.length).toBeGreaterThan(20);
    expect(partials.length - expected.length).toBeGreaterThan(20);
  });

  it("counts its 20 minutes from the last ping, so someone still on step 2 isn't reported as gone", async () => {
    const owner = await venue();
    const at = clock();
    const t = tag();
    const p = (name: string, seenMin: number | null) => ins({
      ownerId: owner, email: `${name}.${t}@example.test`, internalNotes: PARTIAL_LEAD_NOTE,
      createdAt: at(0), partialSeenAt: seenMin === null ? null : at(seenMin),
    });
    const noPing = await p("noping", null);          // a form from before pings: 20 minutes, as today
    const pinged = await p("pinged", 15);             // still on step 2 at minute 15
    const clockBehind = await p("behind", -5);        // a ping time before step 1 counts as step 1
    const forgotten = await p("forgotten", 6 * 60);   // pings past 2 hours don't count
    const at2h = await p("cap", 120);

    const run = async (min: number) => { await alertUnfinishedEnquiries(at(min)); return alertedFor(owner); };
    let alerted = await run(19.9);
    expect(alerted).toEqual([]);
    alerted = await run(20);
    expect(alerted.sort()).toEqual([noPing.id, clockBehind.id].sort());
    alerted = await run(34.9);
    expect(alerted).not.toContain(pinged.id);
    alerted = await run(35);
    expect(alerted).toContain(pinged.id);
    alerted = await run(139.9);
    expect(alerted).not.toContain(forgotten.id);
    expect(alerted).not.toContain(at2h.id);
    alerted = await run(140);
    expect(alerted).toContain(forgotten.id);
    expect(alerted).toContain(at2h.id);
    // The SQL agrees with the shared helper.
    expect(partialAlertDueAt(noPing.createdAt, noPing.partialSeenAt)).toEqual(at(20));
    expect(partialAlertDueAt(clockBehind.createdAt, clockBehind.partialSeenAt)).toEqual(at(20));
    expect(partialAlertDueAt(pinged.createdAt, pinged.partialSeenAt)).toEqual(at(35));
    expect(partialAlertDueAt(at2h.createdAt, at2h.partialSeenAt)).toEqual(at(140));
    expect(partialAlertDueAt(forgotten.createdAt, forgotten.partialSeenAt)).toEqual(at(140));
  });

  it("keeps the 48-hour window and the once-per-enquiry dedupe", async () => {
    const owner = await venue();
    const at = clock();
    const t = tag();
    const old = await ins({ ownerId: owner, email: `stale.${t}@example.test`, internalNotes: PARTIAL_LEAD_NOTE, createdAt: at(-49 * 60) });
    const fresh = await ins({ ownerId: owner, email: `fresh.${t}@example.test`, internalNotes: PARTIAL_LEAD_NOTE, createdAt: at(0) });
    await Promise.all([alertUnfinishedEnquiries(at(30)), alertUnfinishedEnquiries(at(30)), alertUnfinishedEnquiries(at(31))]);
    const alerted = await alertedFor(owner);
    expect(alerted).toEqual([fresh.id]);
    expect(alerted).not.toContain(old.id);
  });

  it("tells the retry job whether an alert is still worth emailing", async () => {
    const owner = await venue();
    const other = await venue();
    const at = clock();
    const t = tag();
    const p = (email: string, extra: Partial<Row> = {}) => ins({ ownerId: owner, email, internalNotes: PARTIAL_LEAD_NOTE, createdAt: at(0), ...extra });
    const still = await p(`still.${t}@example.test`);
    const done = await p(`done.${t}@example.test`, { internalNotes: null });
    const touched = await p(`touched.${t}@example.test`, { status: "contacted" });
    const cameBack = await p(`back.${t}@example.test`);
    await ins({ ownerId: owner, email: `back.${t}@example.test`, internalNotes: null, createdAt: at(10) });
    expect(await isPartialStillUnfinished(owner, still.id)).toBe(true);
    expect(await isPartialStillUnfinished(owner, done.id)).toBe(false);
    expect(await isPartialStillUnfinished(owner, touched.id)).toBe(false);
    expect(await isPartialStillUnfinished(owner, cameBack.id)).toBe(false);
    expect(await isPartialStillUnfinished(other, still.id)).toBe(false);
  });
});
