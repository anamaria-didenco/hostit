/**
 * Single-key shortcuts (the calendar's T / M / W / D / L and arrow keys) must
 * only fire when the key press is meant for the page itself (WCAG 2.1.4).
 * Not when focus is on a form field, a button or link, or a widget that
 * handles its own keys, where letters are the user talking to that control
 * (speech input "types" what it hears). Not while a dialog, drawer or pop-up
 * is open over the page, where they used to change the calendar behind it.
 * And not at all once the user has turned them off.
 *
 * Pure so it can be tested on the server; the DOM side is
 * client/src/lib/shortcutGuard.ts.
 */

/** Elements whose key presses are their own. */
const CONTROL_TAGS = new Set([
  "INPUT", "TEXTAREA", "SELECT", "OPTION", "BUTTON", "A", "SUMMARY",
  "IFRAME", "AUDIO", "VIDEO",
]);

/** ARIA roles of controls and composite widgets that handle keys themselves. */
const CONTROL_ROLES = new Set([
  "button", "link", "checkbox", "radio", "switch", "tab", "menuitem",
  "menuitemcheckbox", "menuitemradio", "option", "combobox", "textbox",
  "searchbox", "slider", "spinbutton", "scrollbar", "listbox", "grid",
  "gridcell", "treegrid", "tree", "treeitem", "menu", "menubar", "tablist",
  "radiogroup", "toolbar", "application",
]);

export type KeyTarget = {
  tagName?: string | null;
  role?: string | null;
  /** contenteditable */
  editable?: boolean;
};

/** True when the focused element handles its own key presses. */
export function isOwnKeysTarget(t: KeyTarget | null | undefined): boolean {
  if (!t) return false;
  if (t.editable) return true;
  if (t.tagName && CONTROL_TAGS.has(t.tagName.toUpperCase())) return true;
  const role = (t.role ?? "").trim().toLowerCase().split(/\s+/)[0];
  return !!role && CONTROL_ROLES.has(role);
}

export type ShortcutContext = {
  /** The element the key press came from (the focused element, or body). */
  target: KeyTarget | null;
  /** Ctrl, Cmd or Alt held: a different shortcut, not a single-key one. */
  modifier: boolean;
  /** Something else (a grid, a menu) already acted on this key. */
  defaultPrevented?: boolean;
  /** A dialog, drawer, menu or pop-up is open over the page. */
  overlayOpen: boolean;
  /** The user's on/off choice (on unless they turned it off). */
  enabled: boolean;
};

export function shouldRunSingleKeyShortcut(c: ShortcutContext): boolean {
  if (!c.enabled || c.modifier || c.defaultPrevented || c.overlayOpen) return false;
  return !isOwnKeysTarget(c.target);
}

/** localStorage key for the calendar shortcuts on/off choice (per browser). */
export const CALENDAR_SHORTCUTS_KEY = "vf.calendarShortcuts";

/** Shortcuts stay on unless this browser stored "off". */
export function shortcutsEnabledFromStored(stored: string | null | undefined): boolean {
  return stored !== "off";
}
