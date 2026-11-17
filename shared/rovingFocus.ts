/**
 * Keyboard rules for a group of options that behaves like native radio buttons
 * or tabs: the group is ONE Tab stop, and the arrow keys (plus Home / End) move
 * to the next option and choose it. See client/src/lib/rovingKeys.ts.
 */

/** Where an arrow / Home / End key moves to from `index` in a group of `count` (wrapping), or null for any other key. */
export function nextIndexForKey(key: string, index: number, count: number): number | null {
  if (count <= 0) return null;
  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
      return (index + 1) % count;
    case "ArrowLeft":
    case "ArrowUp":
      return (index - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

/** tabIndex for option `index`: only the chosen option is a Tab stop, or the first when none is chosen yet. */
export function rovingTabIndex(isChosen: boolean, index: number, anyChosen: boolean): 0 | -1 {
  return isChosen || (!anyChosen && index === 0) ? 0 : -1;
}
