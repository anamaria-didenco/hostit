/**
 * Editing an event's checklist (the run sheet's staff checklist) one change
 * at a time on the server. The list is one JSON array that staff also tick
 * from their link, so the run sheet sends only what changed and the server
 * applies it to the list as it is now: a tick made meanwhile isn't wiped.
 */
import { applyOrder } from "./listOrder";

export const EVENT_CHECKLIST_CATEGORIES = ["setup", "bar", "kitchen", "staff", "guest", "admin", "other"] as const;

export function eventChecklistCategoryLabel(c: string): string {
  return c ? c.charAt(0).toUpperCase() + c.slice(1) : "Other";
}

export type ItemPatch = { text?: string; category?: string; notes?: string };

/**
 * `items` with one item's text / category / notes changed. Everything else on
 * that item (its tick, photo) and every other item stays as stored. Null when
 * the item is no longer on the list (deleted meanwhile).
 */
export function editEventChecklistItem<T extends { id: string; text: string; category?: string; notes?: string }>(
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
  out[i] = next;
  return out;
}

/** `items` in the order of `ids`; items added meanwhile go at the end, deleted ones are skipped. */
export function reorderEventChecklist<T extends { id: string }>(items: readonly T[], ids: readonly string[]): T[] {
  const byId = new Map(items.map(it => [it.id, it] as const));
  return applyOrder(items.map(it => it.id), ids).map(id => byId.get(id)!);
}
