/**
 * "Select multiple" on the enquiries list. The rows on screen are cut down by
 * the list's own tabs (Needs reply, Follow-up due, All, …) as well as the
 * search box and owner filter, so a bulk selection is made from, and kept to,
 * the ids of the rows actually shown. A bulk Delete or Set status must never
 * reach an enquiry the person can't see.
 */

/** SELECT ALL is ticked when something is shown and exactly those rows are selected. */
export function allShownSelected(selected: ReadonlySet<number>, shownIds: readonly number[]): boolean {
  const shown = new Set(shownIds);
  if (shown.size === 0 || selected.size !== shown.size) return false;
  for (const id of shown) if (!selected.has(id)) return false;
  return true;
}

/**
 * The selection cut to the rows still shown, after a tab, search or filter
 * change. Gives back the same Set when nothing has to go, so a state update
 * with it changes nothing.
 */
export function keepShown(selected: Set<number>, shownIds: readonly number[]): Set<number> {
  if (selected.size === 0) return selected;
  const shown = new Set(shownIds);
  let gone = false;
  for (const id of selected) if (!shown.has(id)) { gone = true; break; }
  if (!gone) return selected;
  return new Set(Array.from(selected).filter(id => shown.has(id)));
}

/**
 * The rows a selection may hold: the list's rows, or none while the Board or
 * Win back is showing instead of the list (the list isn't mounted then, so its
 * last rows would otherwise stay selectable behind those views).
 */
const NONE: readonly number[] = [];
export function selectableIds(shownIds: readonly number[], view: string, subTab: string): readonly number[] {
  return view === "kanban" || subTab === "winback" ? NONE : shownIds;
}
