/**
 * Make AI-parsed food & drink rows fit the fnb_items columns before they reach
 * the runsheet. The model is asked for "HH:MM" service times and short
 * fields, but doesn't always comply ("6:30pm onwards"), and one value that
 * can't be stored used to fail the whole list's save.
 */

/** "18:30", "6:30pm", "6.30 pm", "6pm" → "18:30"/"18:00"; anything else → "". */
export function toServiceTime(value: unknown): string {
  if (typeof value !== "string") return "";
  const m = value.trim().toLowerCase().match(/^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?\b/);
  if (!m) return "";
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  if (!m[2] && !m[3]) return ""; // a bare number isn't a time
  if (m[3] === "pm" && h < 12) h += 12;
  if (m[3] === "am" && h === 12) h = 0;
  if (h > 23 || min > 59) return "";
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

const LIMITS = { course: 100, dishName: 255, previousDishName: 255, dietary: 255, staffAssigned: 255 } as const;

function clip(value: unknown, max: number): unknown {
  return typeof value === "string" && value.length > max ? value.slice(0, max).trimEnd() : value;
}

export function fitFnbItem<T extends Record<string, any>>(item: T): T {
  const out: Record<string, any> = { ...item };
  for (const [key, max] of Object.entries(LIMITS)) {
    if (key in out) out[key] = clip(out[key], max);
  }
  if ("serviceTime" in out) out.serviceTime = toServiceTime(out.serviceTime);
  return out as T;
}

export function fitFnbItems<T extends Record<string, any>>(items: unknown): T[] {
  return Array.isArray(items) ? items.filter(i => i && typeof i === "object").map(i => fitFnbItem(i as T)) : [];
}
