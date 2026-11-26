/**
 * Small rules about a task's fields, shared by the Tasks tab, the Tasks box on
 * an enquiry / event, the automated-task rules and the server.
 */
import { DEFAULT_VENUE_TZ, zonedWallTimeToDate } from "./eventDate";

export const TASK_PRIORITIES = ["low", "normal", "high"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

/**
 * A stored or typed priority as one of low / normal / high. Older tasks and
 * rules can carry other words ("medium", "urgent", "", null): "medium" and
 * anything unknown are "normal", "urgent" is "high".
 */
export function normaliseTaskPriority(p: unknown): TaskPriority {
  const v = String(p ?? "").trim().toLowerCase();
  if (v === "low") return "low";
  if (v === "high" || v === "urgent") return "high";
  return "normal";
}

export type TaskDueState = "overdue" | "today" | "later";

/**
 * How a due date reads: a task is due on a calendar day (the time of day isn't
 * shown), so it is "Due today" all of that day and "Overdue" from the next.
 * Days are the viewer's local days.
 */
export function taskDueState(dueMs: number, nowMs: number = Date.now()): TaskDueState {
  const start = new Date(nowMs); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + 1);
  if (dueMs < start.getTime()) return "overdue";
  if (dueMs < end.getTime()) return "today";
  return "later";
}

/** "Overdue — ", "Due today — " or "Due ", put before the date. */
export function taskDuePrefix(state: TaskDueState): string {
  return state === "overdue" ? "Overdue — " : state === "today" ? "Due today — " : "Due ";
}

/**
 * Where "Overdue" starts on the server (the Tasks tab's Overdue and Upcoming
 * filters, the Overview's overdue count and Needs-you-today list): the start
 * of today in the venue's time zone. A task due earlier today is "Due today"
 * on its row (taskDueState), so it isn't counted as overdue until tomorrow.
 * An unknown zone falls back to the default venue zone.
 */
export function taskOverdueBefore(tz: string | null | undefined, nowMs: number = Date.now()): number {
  let ymd: { y: number; m: number; d: number };
  try {
    ymd = ymdIn(tz || DEFAULT_VENUE_TZ, nowMs);
  } catch {
    tz = DEFAULT_VENUE_TZ;
    ymd = ymdIn(tz, nowMs);
  }
  // zonedWallTimeToDate nudges an exact UTC midnight on by 1 ms (its marker
  // for "has a time"); midnight anywhere is on a whole second, so drop it.
  const start = zonedWallTimeToDate(ymd.y, ymd.m, ymd.d, 0, 0, tz || DEFAULT_VENUE_TZ).getTime();
  return Math.floor(start / 1000) * 1000;
}

function ymdIn(tz: string, nowMs: number) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "numeric", day: "numeric" }).formatToParts(new Date(nowMs));
  const n = (t: string) => Number(parts.find(p => p.type === t)?.value);
  return { y: n("year"), m: n("month"), d: n("day") };
}
