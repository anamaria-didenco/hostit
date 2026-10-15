/**
 * Automated tasks aren't duplicated for the same enquiry (prelaunch audit
 * F-13): racing walkthrough confirms make one task, a merge keeps one copy of
 * each rule's / the walkthrough task, and deleting an enquiry takes its open
 * tasks with it. Skipped without DATABASE_URL; uses its own ownerId.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb, createLead } from "./db";
import { confirmWalkthrough, upsertWalkthroughTask } from "./enquiryForm";
import { mergeLeads } from "./leadRetention";
import { automatedTaskRuns, leadActivity, leads, tasks } from "../drizzle/schema";

const OWNER = 990_113;
const HAS_DB = !!process.env.DATABASE_URL;

async function cleanup() {
  const db = await getDb();
  if (!db) return;
  await db.delete(tasks).where(eq(tasks.ownerId, OWNER));
  await db.delete(automatedTaskRuns).where(eq(automatedTaskRuns.ownerId, OWNER));
  await db.delete(leadActivity).where(eq(leadActivity.ownerId, OWNER));
  await db.delete(leads).where(eq(leads.ownerId, OWNER));
}

async function openTasksFor(leadId: number) {
  const db = (await getDb())!;
  return db.select().from(tasks)
    .where(and(eq(tasks.ownerId, OWNER), eq(tasks.linkedLeadId, leadId), eq(tasks.completed, false)));
}

async function addTask(leadId: number, title: string) {
  const db = (await getDb())!;
  const now = Date.now();
  const [t] = await db.insert(tasks).values({
    ownerId: OWNER, title, linkedLeadId: leadId, completed: false, createdAt: now, updatedAt: now,
  }).returning({ id: tasks.id });
  return t.id;
}

describe.skipIf(!HAS_DB)("automated tasks aren't duplicated", () => {
  beforeAll(cleanup);
  afterAll(cleanup);

  it("racing walkthrough requests/confirms leave one open task, and old duplicates collapse", async () => {
    const lead = (await createLead({ ownerId: OWNER, firstName: "Wally", email: "wally@dedupe.test" }))!;
    const at = new Date("2030-03-02T21:30:00Z");
    // Open a few pool connections first so the calls below really overlap.
    const db = (await getDb())!;
    await Promise.all([1, 2, 3, 4].map(() => db.execute(sql`SELECT pg_sleep(0.05)`)));
    // A request submitted three times at once.
    await Promise.all([1, 2, 3].map(() =>
      upsertWalkthroughTask(OWNER, lead.id, { title: "Arrange a walkthrough with Wally", description: "Requested", dueDate: at.getTime() })));
    let open = await openTasksFor(lead.id);
    expect(open).toHaveLength(1);
    // Confirming updates that same task.
    await confirmWalkthrough(OWNER, lead.id, at, { emailClient: false });
    open = await openTasksFor(lead.id);
    expect(open.map(t => t.title)).toEqual(["Walkthrough with Wally"]);

    // A copy left over from before the fix is folded into the one task.
    await addTask(lead.id, "Arrange a walkthrough with Wally");
    await confirmWalkthrough(OWNER, lead.id, at, { emailClient: false });
    open = await openTasksFor(lead.id);
    expect(open).toHaveLength(1);
    expect(open[0].dueDate).toBe(at.getTime());
  });

  it("merging two enquiries keeps one copy of each automated task", async () => {
    const db = (await getDb())!;
    const keep = (await createLead({ ownerId: OWNER, firstName: "Mere", email: "mere@dedupe.test" }))!;
    const dupe = (await createLead({ ownerId: OWNER, firstName: "Mere", email: "mere@dedupe.test" }))!;
    const at = new Date("2030-03-03T21:30:00Z");
    await confirmWalkthrough(OWNER, keep.id, at, { emailClient: false });
    await confirmWalkthrough(OWNER, dupe.id, at, { emailClient: false });
    // The same rule fired for both; a second rule only for the duplicate.
    const shared = await addTask(keep.id, "Call back — Mere");
    const sharedDupe = await addTask(dupe.id, "Call back — Mere");
    const onlyDupe = await addTask(dupe.id, "Send menu — Mere");
    await db.insert(automatedTaskRuns).values([
      { ownerId: OWNER, ruleKey: "rule-a", subjectKey: `lead:${keep.id}`, taskId: shared },
      { ownerId: OWNER, ruleKey: "rule-a", subjectKey: `lead:${dupe.id}`, taskId: sharedDupe },
      { ownerId: OWNER, ruleKey: "rule-b", subjectKey: `lead:${dupe.id}`, taskId: onlyDupe },
    ]);

    await mergeLeads(OWNER, keep.id, dupe.id);

    const titles = (await openTasksFor(keep.id)).map(t => t.title).sort();
    expect(titles).toEqual(["Call back — Mere", "Send menu — Mere", "Walkthrough with Mere"]);
    const runs = await db.select().from(automatedTaskRuns).where(eq(automatedTaskRuns.ownerId, OWNER));
    expect(runs.map(r => `${r.ruleKey}:${r.subjectKey}`).sort()).toEqual([`rule-a:lead:${keep.id}`, `rule-b:lead:${keep.id}`]);
  });

  it("deleting an enquiry removes its open tasks", async () => {
    const lead = (await createLead({ ownerId: OWNER, firstName: "Tama", email: "tama@dedupe.test" }))!;
    await confirmWalkthrough(OWNER, lead.id, new Date("2030-03-04T21:30:00Z"), { emailClient: false });
    expect(await openTasksFor(lead.id)).toHaveLength(1);
    const caller = appRouter.createCaller({
      user: {
        id: OWNER, openId: `dedupe-test-${OWNER}`, email: "owner@dedupe.test", name: "Owner",
        loginMethod: "password", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
      } as NonNullable<TrpcContext["user"]>,
      isTeamMember: false,
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: { clearCookie: () => {} } as TrpcContext["res"],
    });
    await caller.leads.delete({ id: lead.id });
    expect(await openTasksFor(lead.id)).toHaveLength(0);
  });
});
