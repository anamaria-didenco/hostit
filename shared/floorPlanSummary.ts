/**
 * Words for a floor plan, for people who can't see the canvas: the name of
 * one item ("Table 1, 8 seats") and a text version of the whole plan
 * ("6 tables, 48 seats" plus a list of what's on it).
 */

export type PlanItem = { type: string; label?: string | null; seats?: number | null };

const seatsText = (n: number) => `${n} seat${n === 1 ? "" : "s"}`;

/**
 * "Table 1, 8 seats" — the item's own label, falling back to its kind
 * ("Round Table (8)"), plus its seats when it has any. kindOf names a type.
 */
export function floorPlanItemName(el: PlanItem, kindOf: (type: string) => string): string {
  const kind = kindOf(el.type);
  const label = (el.label ?? "").trim();
  const name = el.type === "text" ? `Text: ${label || "Label"}` : label || kind;
  const seats = el.seats ?? 0;
  return seats > 0 ? `${name}, ${seatsText(seats)}` : name;
}

export type FloorPlanSummary = {
  tables: number;
  seats: number;
  /** "6 tables, 48 seats" */
  headline: string;
  /** One line per kind of item, in the order they first appear. */
  lines: string[];
};

/**
 * Table and seat totals count the same way as the editor's toolbar. Items
 * with their own label get a line each ("T1: Round Table (8), 8 seats");
 * identical unlabelled ones are counted ("12 × Chair, 1 seat each") so a
 * theatre layout isn't 80 lines.
 */
export function summarizeFloorPlan(elements: PlanItem[], kindOf: (type: string) => string): FloorPlanSummary {
  const tables = elements.filter(el => el.type.includes("table")).length;
  const seats = elements.reduce((sum, el) => sum + (el.seats ?? 0), 0);
  const groups = new Map<string, { el: PlanItem; count: number }>();
  for (const el of elements) {
    const label = (el.label ?? "").trim();
    // A label that is just the kind's name ("Round Table (6)") isn't unique.
    const own = label && label !== kindOf(el.type) && el.type !== "text" ? label : "";
    const key = own ? `own:${groups.size}` : `${el.type}|${label}|${el.seats ?? 0}`;
    const g = groups.get(key);
    if (g) g.count++;
    else groups.set(key, { el, count: 1 });
  }
  const lines = Array.from(groups.values()).map(({ el, count }) => {
    const kind = kindOf(el.type);
    const label = (el.label ?? "").trim();
    const s = el.seats ?? 0;
    const times = count > 1 ? `${count} × ` : "";
    if (el.type === "text") return `${times}Text: ${label || "Label"}`;
    const name = label && label !== kind ? `${label}: ${kind}` : kind;
    if (count === 1) return s > 0 ? `${name}, ${seatsText(s)}` : name;
    return `${times}${name}${s > 0 ? `, ${seatsText(s)} each` : ""}`;
  });
  const headline = `${tables} table${tables === 1 ? "" : "s"}, ${seatsText(seats)}`;
  return { tables, seats, headline, lines };
}
