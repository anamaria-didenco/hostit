/**
 * Small rules about a task's fields, shared by the Tasks tab, the Tasks box on
 * an enquiry / event, the automated-task rules and the server.
 */

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
