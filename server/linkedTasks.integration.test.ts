import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { mergeLeads } from "./leadRetention";
import { automatedTaskRuns, bookings, leadActivity, leads, tasks, teamMembers, venueSettings } from "../drizzle/schema";

/**
 * Tasks you can link, assign and filter, and follow-up dates that are tasks —
 * through the real routers and database. Throwaway ownerId; skipped without a DB.
 */
const HAS_DB = !!process.env.DATABASE_URL;
const d = HAS_DB ? describe : describe.skip;
const OWNER = 940000 + Math.floor(Math.random() * 9999);
const DAY = 86_400_000;

function ctx(actorName?: string): TrpcContext {
  return {
    user: {
      id: OWNER, openId: `linked-tasks-${OWNER}`, email: "owner@example.com", name: "Olive Owner",
      loginMethod: "local", role: "admin", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    } as any,
    isTeamMember: false,
    isStaff: false,
    actorName: actorName ?? null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

d("linked, assigned and follow-up tasks (DB)", () => {
  const caller = appRouter.createCaller(ctx());
  let leadId = 0;
  let bookingId = 0;
  let memberId = 0;
  const noon = (daysAhead: number) => {
    const t = new Date(Date.now() + daysAhead * DAY);
    t.setUTCHours(12, 0, 0, 0);
    return t;
  };

  const followUpTasks = async (lead = leadId, onlyOpen = true) => {
    const db = (await getDb())!;
    return db.select().from(tasks).where(and(
      eq(tasks.ownerId, OWNER), eq(tasks.linkedLeadId, lead), eq(tasks.source, "follow_up"),
      onlyOpen ? eq(tasks.completed, false) : undefined,
    ));
  };
  const leadDate = async (id = leadId) => {
    const db = (await getDb())!;
    const [l] = await db.select({ f: leads.followUpDate }).from(leads).where(eq(leads.id, id));
    return l?.f ? new Date(l.f).getTime() : null;
  };

  beforeAll(async () => {
    const db = (await getDb())!;
    await db.insert(venueSettings).values({
      id: OWNER as any,
      ownerId: OWNER, name: "Linked Tasks Venue", slug: `linked-tasks-${OWNER}`,
    });
    const [m] = await db.insert(teamMembers).values({
      ownerId: OWNER, name: "Mia Manager", role: "manager", accessToken: `tok-${OWNER}`, isActive: true, createdAt: Date.now(),
    }).returning();
    memberId = m.id;
  });

  beforeEach(async () => {
    const db = (await getDb())!;
    await db.delete(tasks).where(eq(tasks.ownerId, OWNER));
    await db.delete(automatedTaskRuns).where(eq(automatedTaskRuns.ownerId, OWNER));
    await db.delete(bookings).where(eq(bookings.ownerId, OWNER));
    await db.delete(leadActivity).where(eq(leadActivity.ownerId, OWNER));
    await db.delete(leads).where(eq(leads.ownerId, OWNER));
    const [lead] = await db.insert(leads).values({
      ownerId: OWNER, firstName: "Tess", lastName: "Tasker", email: "tess@example.com", status: "contacted", source: "manual",
      assignedTo: memberId,
    }).returning();
    leadId = lead.id;
    const [b] = await db.insert(bookings).values({
      ownerId: OWNER, firstName: "Ben", lastName: "Booker", email: "ben@example.com", eventDate: noon(60), status: "confirmed",
    } as any).returning();
    bookingId = b.id;
  });

  afterAll(async () => {
    const db = (await getDb())!;
    await db.delete(tasks).where(eq(tasks.ownerId, OWNER));
    await db.delete(automatedTaskRuns).where(eq(automatedTaskRuns.ownerId, OWNER));
    await db.delete(bookings).where(eq(bookings.ownerId, OWNER));
    await db.delete(leadActivity).where(eq(leadActivity.ownerId, OWNER));
    await db.delete(leads).where(eq(leads.ownerId, OWNER));
    await db.delete(teamMembers).where(eq(teamMembers.ownerId, OWNER));
    await db.delete(venueSettings).where(eq(venueSettings.ownerId, OWNER));
  });

  describe("link and assign", () => {
    it("creates a task linked to an enquiry and an event, assigned to someone", async () => {
      await caller.tasks.create({ title: "Call Tess", linkedLeadId: leadId, assignedTo: "Mia Manager", dueDate: Date.now() + DAY });
      await caller.tasks.create({ title: "Book band", linkedBookingId: bookingId, assignedTo: "  Olive Owner " });
      const all = await caller.tasks.list({ filter: "all" });
      const call = all.find(t => t.title === "Call Tess")!;
      expect(call).toMatchObject({ linkedLeadId: leadId, assignedTo: "Mia Manager", leadName: "Tess Tasker", bookingName: null });
      const band = all.find(t => t.title === "Book band")!;
      expect(band).toMatchObject({ linkedBookingId: bookingId, assignedTo: "Olive Owner", bookingName: "Ben Booker" });
    });

    it("refuses to link to somebody else's enquiry", async () => {
      await expect(caller.tasks.create({ title: "Nope", linkedLeadId: 2_000_000_000 })).rejects.toThrow();
    });

    it("edits the link and assignee, and clears them", async () => {
      await caller.tasks.create({ title: "Loose task" });
      const [t] = await caller.tasks.list({ filter: "all" });
      await caller.tasks.update({ id: t.id, linkedLeadId: leadId, assignedTo: "Mia Manager" });
      let [after] = await caller.tasks.list({ filter: "all" });
      expect(after).toMatchObject({ linkedLeadId: leadId, assignedTo: "Mia Manager", leadName: "Tess Tasker" });
      await caller.tasks.update({ id: t.id, linkedLeadId: null, assignedTo: null });
      [after] = await caller.tasks.list({ filter: "all" });
      expect(after.linkedLeadId).toBeNull();
      expect(after.assignedTo).toBeNull();
    });

    it("lists only the tasks about one enquiry / event", async () => {
      await caller.tasks.create({ title: "About lead", linkedLeadId: leadId });
      await caller.tasks.create({ title: "About booking", linkedBookingId: bookingId });
      await caller.tasks.create({ title: "About nothing" });
      expect((await caller.tasks.list({ leadId })).map(t => t.title)).toEqual(["About lead"]);
      expect((await caller.tasks.list({ bookingId })).map(t => t.title)).toEqual(["About booking"]);
      expect((await caller.tasks.list({ leadId, bookingId })).map(t => t.title).sort()).toEqual(["About booking", "About lead"]);
    });

    it("searches enquiries and events by client name or email for the picker", async () => {
      const byName = await caller.tasks.searchLinks({ q: "tasker" });
      expect(byName).toEqual([expect.objectContaining({ kind: "lead", id: leadId, name: "Tess Tasker" })]);
      const byEmail = await caller.tasks.searchLinks({ q: "ben@example" });
      expect(byEmail).toEqual([expect.objectContaining({ kind: "booking", id: bookingId, name: "Ben Booker" })]);
      expect(await caller.tasks.searchLinks({ q: "zzz-no-such-client" })).toEqual([]);
      // A % in the search is text, not a wildcard.
      expect(await caller.tasks.searchLinks({ q: "%" })).toEqual([]);
    });

    it("offers the owner, team members and logins as assignees", async () => {
      const a = await caller.tasks.assignees();
      expect(a.names).toEqual(expect.arrayContaining(["Olive Owner", "Mia Manager"]));
      expect(a.me).toBe("Olive Owner");
    });
  });

  describe("the 'mine' filter", () => {
    it("returns only my open tasks, unlike 'all'", async () => {
      await caller.tasks.create({ title: "Mine 1", assignedTo: "Olive Owner" });
      await caller.tasks.create({ title: "Mine 2", assignedTo: "olive owner" }); // case-insensitive
      await caller.tasks.create({ title: "Mia's", assignedTo: "Mia Manager" });
      await caller.tasks.create({ title: "Nobody's" });
      await caller.tasks.create({ title: "Mine but done", assignedTo: "Olive Owner" });
      const done = (await caller.tasks.list({ filter: "all" })).find(t => t.title === "Mine but done")!;
      await caller.tasks.complete({ id: done.id, completed: true });

      const mine = (await caller.tasks.list({ filter: "mine" })).map(t => t.title).sort();
      expect(mine).toEqual(["Mine 1", "Mine 2"]);
      const all = (await caller.tasks.list({ filter: "all" })).map(t => t.title).sort();
      expect(all).toEqual(["Mia's", "Mine 1", "Mine 2", "Nobody's"]);
    });

    it("follows the person signed in (a team link acts under the owner)", async () => {
      await caller.tasks.create({ title: "For Mia", assignedTo: "Mia Manager" });
      await caller.tasks.create({ title: "For Olive", assignedTo: "Olive Owner" });
      const asMia = appRouter.createCaller({ ...ctx("Mia Manager"), isTeamMember: true });
      expect((await asMia.tasks.list({ filter: "mine" })).map(t => t.title)).toEqual(["For Mia"]);
      expect((await caller.tasks.list({ filter: "mine" })).map(t => t.title)).toEqual(["For Olive"]);
    });
  });

  describe("follow-up dates are tasks", () => {
    it("setting the date creates one open follow-up task for the lead's owner", async () => {
      const when = noon(3);
      await caller.leads.setFollowUpDate({ id: leadId, followUpDate: when.toISOString() });
      const open = await followUpTasks();
      expect(open).toHaveLength(1);
      expect(open[0]).toMatchObject({
        title: "Follow up with Tess Tasker", dueDate: when.getTime(), linkedLeadId: leadId,
        assignedTo: "Mia Manager", completed: false, source: "follow_up",
      });
    });

    it("an unowned lead's follow-up task is unassigned", async () => {
      await (await getDb())!.update(leads).set({ assignedTo: null }).where(eq(leads.id, leadId));
      await caller.leads.setFollowUpDate({ id: leadId, followUpDate: noon(2).toISOString() });
      expect((await followUpTasks())[0].assignedTo).toBeNull();
    });

    it("repeat saves and date changes keep exactly one task, moved to the new date", async () => {
      const first = noon(3);
      await caller.leads.setFollowUpDate({ id: leadId, followUpDate: first.toISOString() });
      await caller.leads.setFollowUpDate({ id: leadId, followUpDate: first.toISOString() });
      await caller.leads.update({ id: leadId, followUpDate: first.toISOString() });
      expect(await followUpTasks()).toHaveLength(1);
      const next = noon(9);
      await caller.leads.update({ id: leadId, followUpDate: next.toISOString() });
      await Promise.all([1, 2, 3].map(() => caller.leads.setFollowUpDate({ id: leadId, followUpDate: next.toISOString() })));
      const open = await followUpTasks();
      expect(open).toHaveLength(1);
      expect(open[0].dueDate).toBe(next.getTime());
      // The assignee someone chose on the task survives a date change.
      await caller.tasks.update({ id: open[0].id, assignedTo: "Olive Owner" });
      await caller.leads.setFollowUpDate({ id: leadId, followUpDate: noon(12).toISOString() });
      expect((await followUpTasks())[0].assignedTo).toBe("Olive Owner");
    });

    it("clearing the date removes the task", async () => {
      await caller.leads.setFollowUpDate({ id: leadId, followUpDate: noon(3).toISOString() });
      expect(await followUpTasks()).toHaveLength(1);
      await caller.leads.setFollowUpDate({ id: leadId, followUpDate: null });
      expect(await followUpTasks()).toHaveLength(0);
      expect(await leadDate()).toBeNull();
    });

    it("never touches hand-made tasks about the same enquiry", async () => {
      await caller.tasks.create({ title: "Follow up with Tess Tasker", linkedLeadId: leadId });
      await caller.leads.setFollowUpDate({ id: leadId, followUpDate: noon(3).toISOString() });
      await caller.leads.setFollowUpDate({ id: leadId, followUpDate: null });
      expect((await caller.tasks.list({ leadId })).map(t => t.title)).toEqual(["Follow up with Tess Tasker"]);
    });

    it("completing the task clears the enquiry's date; Undo puts it back", async () => {
      const when = noon(4);
      await caller.leads.setFollowUpDate({ id: leadId, followUpDate: when.toISOString() });
      const [task] = await followUpTasks();
      await caller.tasks.complete({ id: task.id, completed: true });
      expect(await leadDate()).toBeNull();
      expect(await followUpTasks()).toHaveLength(0);

      await caller.tasks.complete({ id: task.id, completed: false });
      expect(await leadDate()).toBe(when.getTime());
      expect(await followUpTasks()).toHaveLength(1);
    });

    it("after completing, a new follow-up date makes a fresh task (the done one stays done)", async () => {
      await caller.leads.setFollowUpDate({ id: leadId, followUpDate: noon(2).toISOString() });
      const [task] = await followUpTasks();
      await caller.tasks.complete({ id: task.id, completed: true });
      await caller.leads.setFollowUpDate({ id: leadId, followUpDate: noon(8).toISOString() });
      const open = await followUpTasks();
      expect(open).toHaveLength(1);
      expect(open[0].id).not.toBe(task.id);
      // Undoing the old one now keeps it as an ordinary task: still one follow-up.
      await caller.tasks.complete({ id: task.id, completed: false });
      expect(await followUpTasks()).toHaveLength(1);
      const [old] = await (await getDb())!.select().from(tasks).where(eq(tasks.id, task.id));
      expect(old.source).toBeNull();
      expect(old.completed).toBe(false);
    });

    it("deleting the task clears the date; moving its due date moves the enquiry's", async () => {
      await caller.leads.setFollowUpDate({ id: leadId, followUpDate: noon(3).toISOString() });
      let [task] = await followUpTasks();
      const moved = noon(6).getTime();
      await caller.tasks.update({ id: task.id, dueDate: moved });
      expect(await leadDate()).toBe(moved);
      // Clearing the due date on a follow-up task is ignored: it keeps its date.
      await caller.tasks.update({ id: task.id, dueDate: null });
      [task] = await followUpTasks();
      expect(task.dueDate).toBe(moved);
      expect(await leadDate()).toBe(moved);

      await caller.tasks.delete({ id: task.id });
      expect(await leadDate()).toBeNull();
      expect(await followUpTasks()).toHaveLength(0);
    });

    it("a lost enquiry loses its follow-up task", async () => {
      await caller.leads.setFollowUpDate({ id: leadId, followUpDate: noon(3).toISOString() });
      await caller.leads.updateStatus({ id: leadId, status: "lost" });
      expect(await followUpTasks()).toHaveLength(0);
    });

    it("merging a duplicate leaves the kept enquiry with one follow-up task", async () => {
      const db = (await getDb())!;
      const [dupe] = await db.insert(leads).values({
        ownerId: OWNER, firstName: "Tess", lastName: "Tasker", email: "tess@example.com", status: "new", source: "manual",
      }).returning();
      await caller.leads.setFollowUpDate({ id: leadId, followUpDate: noon(3).toISOString() });
      await caller.leads.setFollowUpDate({ id: dupe.id, followUpDate: noon(5).toISOString() });
      await mergeLeads(OWNER, leadId, dupe.id);
      const open = await followUpTasks();
      expect(open).toHaveLength(1);
      expect(open[0].linkedLeadId).toBe(leadId);
    });
  });

  describe("automated task rules don't double up the follow-up", () => {
    it("the built-in function-pack follow-up becomes the lead's one follow-up task", async () => {
      await caller.leads.updateStatus({ id: leadId, status: "function_pack_sent" });
      const open = await followUpTasks();
      expect(open).toHaveLength(1);
      expect(open[0]).toMatchObject({ title: "Follow up with Tess Tasker", priority: "high" });
      expect(open[0].description).toContain("Function pack was sent");
      expect(await leadDate()).toBe(open[0].dueDate);
      expect((await caller.tasks.list({ leadId })).filter(t => t.title.startsWith("Follow up with"))).toHaveLength(1);
      // Bouncing back into the status adds nothing.
      await caller.leads.updateStatus({ id: leadId, status: "contacted" });
      await caller.leads.updateStatus({ id: leadId, status: "function_pack_sent" });
      expect((await caller.tasks.list({ leadId })).filter(t => t.title.startsWith("Follow up with"))).toHaveLength(1);
    });

    it("a lead that already has a follow-up task keeps it; the rule adds no second one", async () => {
      const when = noon(20);
      await caller.leads.setFollowUpDate({ id: leadId, followUpDate: when.toISOString() });
      const [before] = await followUpTasks();
      await caller.leads.updateStatus({ id: leadId, status: "function_pack_sent" });
      const open = await followUpTasks();
      expect(open.map(t => t.id)).toEqual([before.id]);
      expect(open[0].dueDate).toBe(when.getTime());
      expect((await caller.tasks.list({ leadId })).filter(t => t.title.startsWith("Follow up with"))).toHaveLength(1);
    });
  });

  describe("migration 0093 backfill", () => {
    const sqlText = readFileSync(new URL("../drizzle/0093_task_source_follow_up.sql", import.meta.url), "utf8");
    const backfill = sqlText.split("--> statement-breakpoint").map(s => s.trim()).find(s => s.includes("INSERT INTO"))!;

    it("gives each future follow-up one open task, skips lost/past/already-covered leads, and is repeatable", async () => {
      const db = (await getDb())!;
      const mk = async (firstName: string, extra: Record<string, unknown>) =>
        (await db.insert(leads).values({ ownerId: OWNER, firstName, email: `${firstName}@example.com`, source: "manual", ...extra } as any).returning())[0];
      const future = await mk("Future", { followUpDate: noon(5), status: "contacted", assignedTo: memberId });
      const unowned = await mk("Unowned", { followUpDate: noon(6), status: "new" });
      const past = await mk("Past", { followUpDate: noon(-3), status: "contacted" });
      const lost = await mk("Lost", { followUpDate: noon(5), status: "lost" });
      const cancelled = await mk("Cancelled", { followUpDate: noon(5), status: "cancelled" });
      const none = await mk("None", { status: "contacted" });
      const covered = await mk("Covered", { followUpDate: noon(5), status: "contacted" });
      await caller.leads.setFollowUpDate({ id: covered.id, followUpDate: noon(5).toISOString() });
      await db.delete(tasks).where(and(eq(tasks.ownerId, OWNER), eq(tasks.linkedLeadId, covered.id)));
      await db.insert(tasks).values({ ownerId: OWNER, title: "Follow up with Covered", linkedLeadId: covered.id, completed: false, createdAt: Date.now(), updatedAt: Date.now() });
      // The Tess lead (set up in beforeEach) has no follow-up date.

      await db.execute(sql.raw(backfill));
      await db.execute(sql.raw(backfill));

      const countFor = async (id: number) => (await followUpTasks(id)).length;
      expect(await countFor(future.id)).toBe(1);
      expect(await countFor(unowned.id)).toBe(1);
      for (const l of [past, lost, cancelled, none, covered, { id: leadId }]) expect(await countFor(l.id)).toBe(0);

      const [f] = await followUpTasks(future.id);
      expect(f).toMatchObject({ title: "Follow up with Future", assignedTo: "Mia Manager", completed: false, priority: "normal", ownerId: OWNER });
      expect(f.dueDate).toBe(new Date(future.followUpDate!).getTime());
      expect(Math.abs(f.createdAt - Date.now())).toBeLessThan(60_000);
      expect(f.updatedAt).toBe(f.createdAt);
      expect((await followUpTasks(unowned.id))[0].assignedTo).toBeNull();
    });
  });
});
