/**
 * Runs the venue's automated task rules (Settings → Automated Tasks).
 *
 * Event triggers — called from the routers where the event happens:
 *   on_enquiry_received   leads.submit (public form) and leads.create (manual)
 *   on_status_change      leads.updateStatus / bulkUpdateStatus / proposals.send
 *   on_booking_confirmed  a lead or booking moving into confirmed
 * Time trigger — a background job:
 *   days_before_event     confirmed bookings, created a week ahead of the due date
 *
 * Each (rule, lead-or-booking) fires once: automated_task_runs holds a unique
 * claim row, so a lead bouncing back into the same status (or a booking being
 * re-confirmed) doesn't create a duplicate task. Never throws — a failed rule
 * must not break the status change that triggered it.
 */
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { getDb } from "./db";
import { registerJob } from "./jobs";
import {
  automatedTaskRuns, bookings, leads, tasks, venueSettings,
} from "../drizzle/schema";
import {
  BOOKED_STATUSES, DAYS_BEFORE_LEAD_WINDOW_DAYS, VENUE_TZ,
  dueAfterTrigger, dueBeforeEvent, noonInTzMs, parseTaskRules, rulesForStatus, ymdInTz,
  type TaskRule,
} from "../shared/automatedTasks";

const DAY_MS = 86_400_000;

type Subject = {
  leadId: number | null;
  bookingId: number | null;
  clientName: string;
  eventMs: number | null;
};

async function loadVenue(ownerId: number) {
  const db = await getDb();
  if (!db) return null;
  const [vs] = await db.select({ rules: venueSettings.automatedTaskRules, tz: venueSettings.timezone })
    .from(venueSettings).where(eq(venueSettings.ownerId, ownerId)).limit(1);
  return { db, rules: parseTaskRules(vs?.rules ?? null), tz: vs?.tz || VENUE_TZ };
}

async function resolveSubject(ownerId: number, ref: { leadId?: number | null; bookingId?: number | null }): Promise<Subject | null> {
  const db = await getDb();
  if (!db) return null;
  let lead: any = null;
  let booking: any = null;
  if (ref.bookingId) {
    [booking] = await db.select().from(bookings)
      .where(and(eq(bookings.id, ref.bookingId), eq(bookings.ownerId, ownerId))).limit(1);
  }
  const leadId = ref.leadId ?? booking?.leadId ?? null;
  if (leadId) {
    [lead] = await db.select().from(leads)
      .where(and(eq(leads.id, leadId), eq(leads.ownerId, ownerId))).limit(1);
  }
  if (lead && !booking) {
    [booking] = await db.select().from(bookings)
      .where(and(eq(bookings.leadId, lead.id), eq(bookings.ownerId, ownerId))).limit(1);
  }
  if (!lead && !booking) return null;
  const src = lead ?? booking;
  const clientName = [src.firstName, src.lastName].filter(Boolean).join(" ").trim() || "client";
  const eventDate = booking?.eventDate ?? lead?.eventDate ?? null;
  return {
    leadId: lead?.id ?? booking?.leadId ?? null,
    bookingId: booking?.id ?? null,
    clientName,
    eventMs: eventDate ? new Date(eventDate).getTime() : null,
  };
}

// One task per (rule, subject). A lead-linked booking counts as its lead, so
// confirming via the lead and then via the booking doesn't fire twice.
function subjectKey(s: Subject): string {
  return s.leadId ? `lead:${s.leadId}` : `booking:${s.bookingId}`;
}

async function createRuleTask(ownerId: number, rule: TaskRule, subject: Subject, dueMs: number, key = subjectKey(subject)): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const claimed = await db.insert(automatedTaskRuns)
    .values({ ownerId, ruleKey: rule.key, subjectKey: key })
    .onConflictDoNothing()
    .returning({ id: automatedTaskRuns.id });
  if (claimed.length === 0) return false; // already fired for this lead/booking
  const now = Date.now();
  const builtin = rule.key.startsWith("builtin:");
  const [task] = await db.insert(tasks).values({
    ownerId,
    title: builtin ? `Follow up with ${subject.clientName}` : `${rule.name} — ${subject.clientName}`,
    description: builtin
      ? `Function pack was sent — check in with ${subject.clientName} to confirm they've received it and answer any questions.`
      : `Created automatically by your "${rule.name}" task rule.`,
    dueDate: dueMs,
    linkedLeadId: subject.leadId ?? undefined,
    linkedBookingId: subject.bookingId ?? undefined,
    priority: rule.priority,
    completed: false,
    createdAt: now,
    updatedAt: now,
  }).returning({ id: tasks.id });
  if (task?.id) {
    await db.update(automatedTaskRuns).set({ taskId: task.id }).where(eq(automatedTaskRuns.id, claimed[0].id));
  }
  return true;
}

export type TaskTrigger =
  | { trigger: "on_enquiry_received"; leadId: number }
  | { trigger: "on_status_change"; leadId: number; status: string }
  | { trigger: "on_booking_confirmed"; leadId?: number | null; bookingId?: number | null };

/** Fire the rules for one event. Returns how many tasks were created. */
export async function fireTaskRules(ownerId: number, ev: TaskTrigger): Promise<number> {
  try {
    const venue = await loadVenue(ownerId);
    if (!venue) return 0;
    let matching: TaskRule[];
    if (ev.trigger === "on_status_change") {
      // Moving into a booked status is the booking-confirmed trigger.
      if (BOOKED_STATUSES.includes(ev.status)) return 0;
      matching = rulesForStatus(venue.rules, ev.status);
    } else {
      matching = venue.rules.filter(r => r.trigger === ev.trigger);
    }
    if (matching.length === 0) return 0;
    const subject = await resolveSubject(ownerId, {
      leadId: "leadId" in ev ? ev.leadId : null,
      bookingId: "bookingId" in ev ? ev.bookingId : null,
    });
    if (!subject) return 0;
    let created = 0;
    for (const rule of matching) {
      if (await createRuleTask(ownerId, rule, subject, dueAfterTrigger(Date.now(), rule.days, venue.tz))) created++;
    }
    if (created) console.log(`[automatedTasks] owner ${ownerId} ${ev.trigger}: created ${created} task(s)`);
    return created;
  } catch (err: any) {
    console.error(`[automatedTasks] ${ev.trigger} failed for owner ${ownerId}:`, err?.message ?? err);
    return 0;
  }
}

/**
 * Lead status change → status rules, or the booking-confirmed rules when it
 * moves into a booked status from a non-booked one.
 */
export async function onLeadStatusChanged(ownerId: number, leadId: number, prior: string | null | undefined, next: string): Promise<number> {
  if (prior === next) return 0;
  if (BOOKED_STATUSES.includes(next)) {
    if (BOOKED_STATUSES.includes(prior ?? "")) return 0;
    return fireTaskRules(ownerId, { trigger: "on_booking_confirmed", leadId });
  }
  return fireTaskRules(ownerId, { trigger: "on_status_change", leadId, status: next });
}

/**
 * days_before_event: for each confirmed upcoming booking, create the task once
 * its due date is within DAYS_BEFORE_LEAD_WINDOW_DAYS. A rule added after its
 * due date has passed (event still ahead) gets a task due today.
 */
export async function sweepDaysBeforeEvent(onlyOwnerId?: number): Promise<number> {
  let created = 0;
  try {
    const db = await getDb();
    if (!db) return 0;
    const venues = await db.select({ ownerId: venueSettings.ownerId, rules: venueSettings.automatedTaskRules, tz: venueSettings.timezone })
      .from(venueSettings)
      .where(onlyOwnerId != null ? eq(venueSettings.ownerId, onlyOwnerId) : undefined);
    const now = Date.now();
    for (const v of venues) {
      const rules = parseTaskRules(v.rules).filter(r => r.trigger === "days_before_event");
      if (rules.length === 0) continue;
      const tz = v.tz || VENUE_TZ;
      const maxDays = Math.max(...rules.map(r => r.days));
      const todayNoon = noonInTzMs(ymdInTz(now, tz), tz);
      const upcoming = await db.select().from(bookings).where(and(
        eq(bookings.ownerId, v.ownerId),
        inArray(bookings.status, ["confirmed"]),
        gte(bookings.eventDate, new Date(now - DAY_MS)),
        lte(bookings.eventDate, new Date(now + (maxDays + DAYS_BEFORE_LEAD_WINDOW_DAYS + 1) * DAY_MS)),
      ));
      for (const b of upcoming) {
        const eventMs = new Date(b.eventDate).getTime();
        // Skip events whose NZ calendar day has already passed.
        if (ymdInTz(eventMs, tz) < ymdInTz(now, tz)) continue;
        for (const rule of rules) {
          const due = dueBeforeEvent(eventMs, rule.days, tz);
          if (due - now > DAYS_BEFORE_LEAD_WINDOW_DAYS * DAY_MS) continue;
          const subject: Subject = {
            leadId: b.leadId ?? null,
            bookingId: b.id,
            clientName: [b.firstName, b.lastName].filter(Boolean).join(" ").trim() || "client",
            eventMs,
          };
          // Keyed per booking (not lead) — it's about this event's date.
          if (await createRuleTask(v.ownerId, rule, subject, Math.max(due, todayNoon), `booking:${b.id}`)) created++;
        }
      }
    }
    if (created) console.log(`[automatedTasks] days_before_event: created ${created} task(s)`);
  } catch (err: any) {
    console.error("[automatedTasks] days_before_event sweep failed:", err?.message ?? err);
  }
  return created;
}

export function registerAutomatedTaskJobs() {
  registerJob("automated-tasks:days-before-event", 60 * 60 * 1000, async () => { await sweepDaysBeforeEvent(); });
}
