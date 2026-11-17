/**
 * Small rules about a task's fields, shared by the Tasks tab, the automated-
 * task rules and the server.
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
