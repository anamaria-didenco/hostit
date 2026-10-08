/**
 * Automated task rules (Settings → Automated Tasks): pure helpers shared by the
 * settings UI and the server runner (server/automatedTasks.ts).
 *
 * Saved shape (venueSettings.automatedTaskRules, a JSON string):
 *   [{ id?, name, trigger, daysOffset, priority, status? }]
 * Rules saved before ids existed have none — they get a stable key derived
 * from their contents, so "fire once per lead/booking" still holds for them.
 */
import { zonedDayBoundUtc } from "./tz";

export const TASK_RULE_TRIGGERS = [
  { key: "on_enquiry_received", label: "When a new enquiry arrives" },
  { key: "on_status_change", label: "When an enquiry moves to a status" },
  { key: "on_booking_confirmed", label: "When a booking is confirmed" },
  { key: "days_before_event", label: "Before the event" },
] as const;

export type TaskRuleTrigger = (typeof TASK_RULE_TRIGGERS)[number]["key"];

export type SavedTaskRule = {
  id?: string;
  name?: string;
  trigger?: string;
  daysOffset?: string | number;
  priority?: string;
  status?: string;
};

export type TaskRule = {
  key: string;
  name: string;
  trigger: TaskRuleTrigger;
  /** on_status_change only: the lead status that fires it. */
  status: string | null;
  /** Days after the trigger, or (days_before_event) days before the event. */
  days: number;
  priority: "low" | "normal" | "high";
};

// Statuses that are "booking confirmed" rather than a pipeline step — rules on
// them belong to the on_booking_confirmed trigger.
export const BOOKED_STATUSES = ["booked", "confirmed", "finished"];

// Built-in: the follow-up task the app has always created when a lead moves to
// "function_pack_sent". Applies only while the venue has no rule of its own for
// that status, so adding one replaces it rather than doubling up.
export const FUNCTION_PACK_STATUS = "function_pack_sent";
export const BUILTIN_FUNCTION_PACK_RULE: TaskRule = {
  key: "builtin:function_pack_follow_up",
  name: "Follow up on the function pack",
  trigger: "on_status_change",
  status: FUNCTION_PACK_STATUS,
  days: 5,
  priority: "high",
};

// days_before_event tasks are created this far ahead of their due date, so the
// task list isn't filled with prep for events months away.
export const DAYS_BEFORE_LEAD_WINDOW_DAYS = 7;

function hashKey(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

export function newTaskRuleId(): string {
  return `rule-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function normPriority(p: unknown): TaskRule["priority"] {
  const v = String(p ?? "").toLowerCase();
  if (v === "low") return "low";
  if (v === "high") return "high";
  return "normal"; // "medium" in the settings UI = the tasks table's "normal"
}

/** Parse + normalise saved rules. Unknown triggers are dropped. */
export function parseTaskRules(raw: string | null | undefined | SavedTaskRule[]): TaskRule[] {
  let list: SavedTaskRule[] = [];
  if (Array.isArray(raw)) list = raw;
  else if (raw) {
    try { const v = JSON.parse(raw); if (Array.isArray(v)) list = v; } catch { /* ignore */ }
  }
  const out: TaskRule[] = [];
  for (const r of list) {
    if (!r || typeof r !== "object") continue;
    const name = String(r.name ?? "").trim();
    if (!name) continue;
    let trigger = String(r.trigger ?? "");
    let status: string | null = r.status ? String(r.status) : null;
    // Legacy trigger key: it only ever meant "moved to Function Pack Sent".
    if (trigger === "on_function_pack_sent") { trigger = "on_status_change"; status = FUNCTION_PACK_STATUS; }
    if (!TASK_RULE_TRIGGERS.some(t => t.key === trigger)) continue;
    if (trigger === "on_status_change" && !status) continue;
    if (trigger !== "on_status_change") status = null;
    const n = parseInt(String(r.daysOffset ?? "0"), 10);
    const days = Number.isFinite(n) ? Math.min(Math.max(n, 0), 365) : 0;
    const key = r.id ? String(r.id) : `legacy:${hashKey(`${name}|${r.trigger}|${status ?? ""}|${r.daysOffset ?? ""}`)}`;
    out.push({ key, name, trigger: trigger as TaskRuleTrigger, status, days, priority: normPriority(r.priority) });
  }
  return out;
}

/** Rules to run when a lead moves into `status` (incl. the built-in one). */
export function rulesForStatus(rules: TaskRule[], status: string): TaskRule[] {
  const own = rules.filter(r => r.trigger === "on_status_change" && r.status === status);
  if (status === FUNCTION_PACK_STATUS && own.length === 0) return [BUILTIN_FUNCTION_PACK_RULE];
  return own;
}

/** Plain-language description of when a rule fires, for the settings table. */
export function describeTaskRule(rule: TaskRule, statusLabel: (key: string) => string = k => k.replace(/_/g, " ")): string {
  const after = rule.days === 0 ? "due the same day" : `due ${rule.days} day${rule.days === 1 ? "" : "s"} later`;
  switch (rule.trigger) {
    case "on_enquiry_received": return `New enquiry · ${after}`;
    case "on_status_change": return `Moved to ${statusLabel(rule.status ?? "")} · ${after}`;
    case "on_booking_confirmed": return `Booking confirmed · ${after}`;
    case "days_before_event": return rule.days === 0 ? "On the event day" : `${rule.days} day${rule.days === 1 ? "" : "s"} before the event`;
  }
}

// ── NZ calendar-day maths (the server runs in UTC) ──────────────────────────
export const VENUE_TZ = "Pacific/Auckland";

/** The YYYY-MM-DD calendar date of an instant in `tz`. */
export function ymdInTz(ms: number, tz: string = VENUE_TZ): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
}

export function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/** Noon on that calendar day in `tz` — how date-only due dates are stored. */
export function noonInTzMs(ymd: string, tz: string = VENUE_TZ): number {
  return zonedDayBoundUtc(ymd, tz, "start").getTime() + 12 * 3_600_000;
}

/** Due date for a task `days` after a trigger that happened at `nowMs`. */
export function dueAfterTrigger(nowMs: number, days: number, tz: string = VENUE_TZ): number {
  return noonInTzMs(addDaysYmd(ymdInTz(nowMs, tz), days), tz);
}

/** Due date for a task `days` before an event on `eventMs`'s calendar day. */
export function dueBeforeEvent(eventMs: number, days: number, tz: string = VENUE_TZ): number {
  return noonInTzMs(addDaysYmd(ymdInTz(eventMs, tz), -days), tz);
}
