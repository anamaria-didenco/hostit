import {
  CALENDAR_SHORTCUTS_KEY,
  shortcutsEnabledFromStored,
  shouldRunSingleKeyShortcut,
} from "@shared/keyShortcuts";

/**
 * Is a dialog, drawer, menu or pop-up open over the page? Covers the Radix
 * dialogs, the home-made role="dialog" pop-ups (Print week, Add a title), the
 * event/enquiry drawer and Radix popovers, menus and selects. Tooltips don't
 * count.
 */
export function overlayOpen(doc: Document = document): boolean {
  const open = doc.querySelectorAll<HTMLElement>(
    '[role="dialog"], [role="alertdialog"], [aria-modal="true"], [data-radix-popper-content-wrapper]',
  );
  for (const el of Array.from(open)) {
    if (el.querySelector('[role="tooltip"]')) continue;
    if (el.getClientRects().length > 0) return true;
  }
  return false;
}

/** Should this key press run a single-key shortcut? See shared/keyShortcuts. */
export function singleKeyShortcutAllowed(e: KeyboardEvent, enabled = true): boolean {
  const t = e.target instanceof HTMLElement ? e.target : null;
  return shouldRunSingleKeyShortcut({
    target: t && { tagName: t.tagName, role: t.getAttribute("role"), editable: t.isContentEditable },
    modifier: e.ctrlKey || e.metaKey || e.altKey,
    defaultPrevented: e.defaultPrevented,
    overlayOpen: overlayOpen(t?.ownerDocument ?? document),
    enabled,
  });
}

/** The calendar shortcuts on/off choice, kept per browser. */
export function readCalendarShortcutsOn(): boolean {
  try { return shortcutsEnabledFromStored(localStorage.getItem(CALENDAR_SHORTCUTS_KEY)); } catch { return true; }
}

export function writeCalendarShortcutsOn(on: boolean): void {
  try {
    if (on) localStorage.removeItem(CALENDAR_SHORTCUTS_KEY);
    else localStorage.setItem(CALENDAR_SHORTCUTS_KEY, "off");
  } catch { /* private mode: the choice lasts for this visit only */ }
}
