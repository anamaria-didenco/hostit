/**
 * Where keyboard focus should go when a pop-up closes or the control you were
 * on disappears. Without a deliberate move the browser drops focus on <body>
 * and the next Tab starts again from the top of the page.
 *
 * Kept free of the DOM so the rules can be tested on their own; the callers
 * describe the situation and act on the answer.
 */

/** Where focus is at the moment a dialog finishes closing. */
export type FocusPlace = "body" | "inside-dialog" | "elsewhere";

/**
 * Should a closing dialog put focus back on the element that had it when the
 * dialog opened?
 *
 * - Not when nothing was focused, or that element has since gone from the page.
 * - Not when something else has already taken focus on purpose (another dialog,
 *   a panel that opened, a field the page focused): only when focus was lost to
 *   <body> or is still on the dialog that is going away.
 */
export function shouldReturnFocus(opener: { connected: boolean } | null, focus: FocusPlace): boolean {
  if (!opener || !opener.connected) return false;
  return focus !== "elsewhere";
}

/**
 * A list row the user was on has gone (sent, completed, deleted, moved to
 * another list). Which row should take focus instead: the one now at the same
 * position (the next one), or the last row when it was the end of the list.
 * -1 means the list is empty.
 */
export function rowToRefocus(lostIndex: number, rowCount: number): number {
  if (rowCount <= 0) return -1;
  if (!Number.isFinite(lostIndex) || lostIndex < 0) return 0;
  return Math.min(Math.floor(lostIndex), rowCount - 1);
}

/** What a screen reader hears after ticking a checklist item. */
export function tickAnnouncement(itemText: string, checked: boolean): string {
  const text = itemText.trim();
  return `${checked ? "Checked" : "Unchecked"}: ${text || "item"}`;
}

/** What a screen reader hears when a step-by-step form moves to another step. */
export function stepAnnouncement(step: number, labels: readonly string[]): string {
  const total = labels.length;
  if (total === 0) return "";
  const n = Math.min(Math.max(1, Math.round(step) || 1), total);
  return `Step ${n} of ${total}: ${labels[n - 1]}`;
}
