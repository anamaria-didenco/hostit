/**
 * An enquiry's follow-up date and its task are one thing seen two ways: setting
 * the date makes ONE open task "Follow up with <name>" (tasks.source =
 * 'follow_up', linked to the lead, due that day, assigned to the lead's owner),
 * so it shows up in Tasks; clearing the date removes it; completing (or
 * deleting) the task clears the date. Both directions live here so the rule is
 * in one place.
 *
 * Lead → task: syncFollowUpTask(), called wherever a follow-up date is written.
 * Task → lead: clearFollowUpDateForTask() / restoreFollowUpDateForTask(),
 * called by tasks.complete / delete / update. These write the lead directly
 * (not via the sync), so the two directions never call each other.
 *
 * Idempotent and serialised per lead (advisory lock), so a repeated save or two
 * racing requests leave exactly one open follow-up task.
 */
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "./db";
import { leads, tasks, teamMembers } from "../drizzle/schema";

export const FOLLOW_UP_SOURCE = "follow_up";

// A lost or cancelled enquiry has nothing left to follow up.
const DEAD_STATUSES = ["lost", "cancelled"];

const openFollowUps = (ownerId: number, leadId: number) =>
  and(eq(tasks.ownerId, ownerId), eq(tasks.linkedLeadId, leadId), eq(tasks.completed, false), eq(tasks.source, FOLLOW_UP_SOURCE));

/**
 * Bring the lead's open follow-up task in line with its follow-up date: create
 * it, move it, or remove it. Returns the open task's id, or null when none.
 */
export async function syncFollowUpTask(
  ownerId: number,
  leadId: number,
  opts: { description?: string; priority?: "low" | "normal" | "high" } = {},
): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`follow-up-task:${ownerId}:${leadId}`}))`);
    const [lead] = await tx.select().from(leads).where(and(eq(leads.id, leadId), eq(leads.ownerId, ownerId))).limit(1);
    const open = await tx.select({ id: tasks.id }).from(tasks).where(openFollowUps(ownerId, leadId)).orderBy(asc(tasks.id));
    const due = lead?.followUpDate ? new Date(lead.followUpDate).getTime() : null;
    const wanted = !!lead && due != null && Number.isFinite(due) && !DEAD_STATUSES.includes(lead.status ?? "");
    if (!wanted) {
      if (open.length) await tx.delete(tasks).where(inArray(tasks.id, open.map(t => t.id)));
      return null;
    }
    const ts = Date.now();
    if (open.length > 0) {
      // The date moves the task; its assignee/notes may have been edited since.
      await tx.update(tasks).set({ dueDate: due, updatedAt: ts }).where(eq(tasks.id, open[0].id));
      if (open.length > 1) await tx.delete(tasks).where(inArray(tasks.id, open.slice(1).map(t => t.id)));
      return open[0].id;
    }
    let assignee: string | null = null;
    if (lead.assignedTo != null) {
      const [member] = await tx.select({ name: teamMembers.name }).from(teamMembers)
        .where(and(eq(teamMembers.id, lead.assignedTo), eq(teamMembers.ownerId, ownerId))).limit(1);
      assignee = member?.name ?? null;
    }
    const name = [lead.firstName, lead.lastName].filter(Boolean).join(" ").trim() || "client";
    const [created] = await tx.insert(tasks).values({
      ownerId,
      title: `Follow up with ${name}`.slice(0, 255),
      description: opts.description,
      dueDate: due,
      linkedLeadId: leadId,
      assignedTo: assignee,
      priority: opts.priority ?? "normal",
      source: FOLLOW_UP_SOURCE,
      completed: false,
      createdAt: ts,
      updatedAt: ts,
    }).returning({ id: tasks.id });
    return created.id;
  });
}

/** Never throws: the follow-up date is saved either way. */
export async function trySyncFollowUpTask(ownerId: number, leadId: number): Promise<void> {
  try {
    await syncFollowUpTask(ownerId, leadId);
  } catch (err: any) {
    console.error(`[followUpTask] sync failed for owner ${ownerId}:`, err?.message ?? err);
  }
}

type TaskRef = { ownerId: number; linkedLeadId: number | null; source: string | null; dueDate: number | null };

/** A follow-up task was completed or deleted: the lead has no pending follow-up. */
export async function clearFollowUpDateForTask(task: TaskRef): Promise<void> {
  if (task.source !== FOLLOW_UP_SOURCE || task.linkedLeadId == null) return;
  const db = await getDb();
  if (!db) return;
  await db.update(leads).set({ followUpDate: null, updatedAt: new Date() })
    .where(and(eq(leads.id, task.linkedLeadId), eq(leads.ownerId, task.ownerId)));
}

/**
 * A completed follow-up task was re-opened (Undo): put its date back on the
 * lead. If the lead has since been given a newer follow-up task, this one is
 * kept as an ordinary task instead of making a second.
 */
export async function restoreFollowUpDateForTask(task: TaskRef & { id: number }): Promise<void> {
  if (task.source !== FOLLOW_UP_SOURCE || task.linkedLeadId == null) return;
  const db = await getDb();
  if (!db) return;
  const leadId = task.linkedLeadId;
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`follow-up-task:${task.ownerId}:${leadId}`}))`);
    const others = await tx.select({ id: tasks.id }).from(tasks).where(openFollowUps(task.ownerId, leadId));
    if (others.some(o => o.id !== task.id)) {
      await tx.update(tasks).set({ source: null }).where(eq(tasks.id, task.id));
      return;
    }
    if (task.dueDate != null) {
      await tx.update(leads).set({ followUpDate: new Date(task.dueDate), updatedAt: new Date() })
        .where(and(eq(leads.id, leadId), eq(leads.ownerId, task.ownerId)));
    }
  });
}

/** The task's due date was edited in Tasks: the lead's follow-up date follows. */
export async function moveFollowUpDateForTask(task: TaskRef): Promise<void> {
  if (task.source !== FOLLOW_UP_SOURCE || task.linkedLeadId == null) return;
  const db = await getDb();
  if (!db) return;
  await db.update(leads)
    .set({ followUpDate: task.dueDate != null ? new Date(task.dueDate) : null, updatedAt: new Date() })
    .where(and(eq(leads.id, task.linkedLeadId), eq(leads.ownerId, task.ownerId)));
}
