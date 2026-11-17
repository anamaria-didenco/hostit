import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { rowToRefocus } from "@shared/focusReturn";

const TABBABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

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
    const onFocusOut = (e: FocusEvent) => {
      const t = e.target;
      if (e.relatedTarget || !last.current || last.current.el !== t) return;
      setTimeout(() => {
        const a = document.activeElement;
        if (last.current?.el === t && (t as HTMLElement).isConnected && (!a || a === document.body)) last.current = null;
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
    const target = row ? (row.matches(TABBABLE) ? row : row.querySelector<HTMLElement>(TABBABLE)) : null;
    (target ?? fallback?.current)?.focus();
  });
}
