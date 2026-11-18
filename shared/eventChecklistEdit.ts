/**
 * Editing an event's checklist (the run sheet's staff checklist) one change
 * at a time on the server. The list is one JSON array that staff also tick
 * from their link, so the run sheet sends only what changed and the server
 * applies it to the list as it is now: a tick made meanwhile isn't wiped.
 */
import { applyOrder } from "./listOrder";

export const EVENT_CHECKLIST_CATEGORIES = ["setup", "bar", "kitchen", "staff", "guest", "admin", "other"] as const;

/**
 * The most words one checklist item (or its note) can hold, on every path
 * that writes items: the add box, editing, AI PASTE ("task — note"),
 * templates and PULL BAR DRINKS. Generous on purpose: the run sheet used to
 * save the whole list with no limit, and the AI PASTE box takes up to
 * 10,000 characters, so anything that saved before still saves.
 */
export const CHECKLIST_ITEM_MAX_CHARS = 10_000;

/** What to tell the owner when an item is over the limit, or null when it fits. */
export function checklistItemTooLong(text: string): string | null {
  const n = text.trim().length;
  if (n <= CHECKLIST_ITEM_MAX_CHARS) return null;
  return `That item is ${n.toLocaleString("en-NZ")} characters long. One item can hold up to ${CHECKLIST_ITEM_MAX_CHARS.toLocaleString("en-NZ")}: split it into shorter items.`;
}

export function eventChecklistCategoryLabel(c: string): string {
  return c ? c.charAt(0).toUpperCase() + c.slice(1) : "Other";
}

/** imageUrl "" takes the item's reference photo off. */
export type ItemPatch = { text?: string; category?: string; notes?: string; imageUrl?: string };

/**
 * `items` with one item's text / category / notes / photo changed. Everything
 * else on that item (its tick) and every other item stays as stored. Null
 * when the item is no longer on the list (deleted meanwhile).
 */
export function editEventChecklistItem<T extends { id: string; text: string; category?: string; notes?: string; imageUrl?: string }>(
  items: readonly T[],
  itemId: string,
  patch: ItemPatch,
): T[] | null {
  const i = items.findIndex(it => it.id === itemId);
  if (i < 0) return null;
  const out = [...items];
  const next = { ...out[i] };
  if (patch.text !== undefined) {
    const text = patch.text.trim();
    if (text) next.text = text;
  }
  if (patch.category !== undefined) next.category = patch.category || "other";
  if (patch.notes !== undefined) {
    const notes = patch.notes.trim();
    if (notes) next.notes = notes; else delete next.notes;
  }
  if (patch.imageUrl !== undefined) {
    if (patch.imageUrl) next.imageUrl = patch.imageUrl; else delete next.imageUrl;
  }
  out[i] = next;
  return out;
}

const sameWords = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * `items` with `additions` on the end, after everything already stored (a
 * staff tick made meanwhile stays). An id that is already taken gets a
 * suffix. With `skipSameText`, an addition whose words are already on the
 * list is left out (PULL BAR DRINKS pressed twice). `added` is what went on.
 */
export function addEventChecklistItems<T extends { id: string; text: string }>(
  items: readonly T[],
  additions: readonly T[],
  opts: { skipSameText?: boolean } = {},
): { items: T[]; added: T[] } {
  const out = [...items];
  const added: T[] = [];
  for (const item of additions) {
    if (opts.skipSameText && out.some(it => sameWords(it.text, item.text))) continue;
    let id = item.id;
    for (let n = 2; out.some(it => it.id === id); n++) id = `${item.id}-${n}`;
    const next = { ...item, id };
    out.push(next);
    added.push(next);
  }
  return { items: out, added };
}

/** `items` without that item; unchanged if it was already removed. */
export function removeEventChecklistItem<T extends { id: string }>(items: readonly T[], itemId: string): T[] {
  return items.filter(it => it.id !== itemId);
}

/** `items` in the order of `ids`; items added meanwhile go at the end, deleted ones are skipped. */
export function reorderEventChecklist<T extends { id: string }>(items: readonly T[], ids: readonly string[]): T[] {
  const byId = new Map(items.map(it => [it.id, it] as const));
  return applyOrder(items.map(it => it.id), ids).map(id => byId.get(id)!);
}
