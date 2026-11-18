/**
 * Moving items up and down a list (daily checklists, an event's checklist),
 * kept free of the DOM and the database so the rules can be tested alone.
 */

/** `ids` with `id` moved one place up (-1) or down (+1). Unchanged at either end or when absent. */
export function moveInList<T>(ids: readonly T[], id: T, delta: -1 | 1): T[] {
  const out = [...ids];
  const i = out.indexOf(id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= out.length) return out;
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

/**
 * The order to save when someone asks for `requested` while the list is now
 * `current` (someone may have added or deleted an item meanwhile): the
 * requested ids that still exist, in that order, then anything new in its
 * current place at the end. Repeats and unknown ids are ignored.
 */
export function applyOrder<T>(current: readonly T[], requested: readonly T[]): T[] {
  const exists = new Set(current);
  const seen = new Set<T>();
  const out: T[] = [];
  for (const id of requested) {
    if (!exists.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  for (const id of current) if (!seen.has(id)) out.push(id);
  return out;
}

/** What a screen reader hears after an item is moved. */
export function moveAnnouncement(text: string, position: number, total: number): string {
  return `Moved ${text.trim() || "item"} to position ${position} of ${total}`;
}
