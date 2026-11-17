import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { rowToRefocus } from "@shared/focusReturn";

const TABBABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// A row can carry a desktop and a phone layout with one of them display:none
// (and focus() on a hidden element silently does nothing).
const shown = (el: HTMLElement) => el.getClientRects().length > 0;
function firstTabbable(row: HTMLElement): HTMLElement | null {
  if (row.matches(TABBABLE) && shown(row)) return row;
  return Array.from(row.querySelectorAll<HTMLElement>(TABBABLE)).find(shown) ?? null;
}

/**
 * Keeps a keyboard user's place in a list when the control they were on goes
 * away: a row leaves after Send / Complete / Delete, an inline form closes on
 * Save or Cancel. The browser drops focus on <body> and the next Tab starts
 * from the top of the page; instead focus moves to the row now in the same
 * position (the next one), or `fallback` when the list is empty.
 *
 * `listRef` is the element whose direct children are the rows. Only acts when
 * focus really was lost with the element (not when the user clicked away).
 */
export function useFocusKeeper(listRef: RefObject<HTMLElement | null>, fallback?: RefObject<HTMLElement | null>) {
  const last = useRef<{ el: HTMLElement; index: number } | null>(null);

  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => {
      const list = listRef.current;
      const t = e.target instanceof HTMLElement ? e.target : null;
      if (!list || !t || !list.contains(t) || t === list) { last.current = null; return; }
      let row: HTMLElement | null = t;
      while (row && row.parentElement !== list) row = row.parentElement;
      last.current = row ? { el: t, index: Array.prototype.indexOf.call(list.children, row) } : null;
    };
    // Focus left to nowhere while the element is still there: a click on the
    // page, not a removal. Forget it, so a later refresh doesn't pull focus back.
    // (A button that went disabled while saving is not a click away: keep it,
    // so focus comes back when the form it was in closes.)
    const onFocusOut = (e: FocusEvent) => {
      const t = e.target;
      if (e.relatedTarget || !last.current || last.current.el !== t) return;
      setTimeout(() => {
        const a = document.activeElement;
        const el = t as HTMLElement;
        if (last.current?.el === t && el.isConnected && !el.matches(":disabled") && (!a || a === document.body)) last.current = null;
      }, 0);
    };
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, [listRef]);

  // After every render: was the focused element just removed?
  useLayoutEffect(() => {
    const l = last.current;
    if (!l || l.el.isConnected) return;
    const active = document.activeElement;
    if (active && active !== document.body) { last.current = null; return; }
    last.current = null;
    const list = listRef.current;
    const rows = list ? Array.from(list.children) as HTMLElement[] : [];
    const i = rowToRefocus(l.index, rows.length);
    const row = i >= 0 ? rows[i] : null;
    // The row now in that place, or the fallback when it has nothing to focus
    // (an empty-list message) or focus didn't take.
    for (const el of [row ? firstTabbable(row) : null, fallback?.current]) {
      if (!el) continue;
      el.focus();
      if (document.activeElement === el) return;
    }
  });
}
