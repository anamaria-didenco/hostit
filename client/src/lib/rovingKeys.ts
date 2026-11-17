import type { KeyboardEvent } from "react";
import { nextIndexForKey } from "@shared/rovingFocus";

export { rovingTabIndex } from "@shared/rovingFocus";

/**
 * onKeyDown for a role="radiogroup" or role="tablist" element: arrow keys and
 * Home / End move focus to the next option and choose it, the way native radio
 * buttons and tabs work. Choosing is a click on the option, so it runs exactly
 * the code a mouse click runs. Pair with rovingTabIndex so the group is one Tab stop.
 */
export function onArrowChoose(e: KeyboardEvent<HTMLElement>) {
  const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"], [role="tab"]'))
    .filter(el => !(el as HTMLButtonElement).disabled);
  const index = items.indexOf(e.target as HTMLElement);
  if (index < 0) return;
  const next = nextIndexForKey(e.key, index, items.length);
  if (next === null) return;
  e.preventDefault();
  const el = items[next];
  el.focus();
  const chosen = el.getAttribute("aria-checked") === "true" || el.getAttribute("aria-selected") === "true";
  if (!chosen) el.click();
}

/**
 * For a hand-made pop-up (a toolbar's "More actions" or filter panel): Escape
 * closes it and puts focus back on its trigger, the first button in `root`.
 * Marks the key as handled so a drawer or page handler doesn't act on it too.
 */
export function closeMenuOnEscape(e: globalThis.KeyboardEvent, root: HTMLElement | null, close: () => void) {
  if (e.key !== "Escape" || e.defaultPrevented) return;
  e.preventDefault();
  close();
  root?.querySelector<HTMLElement>("button")?.focus();
}
