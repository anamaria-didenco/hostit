/**
 * What a key press does in the floor plan editor. One item is "current" for
 * every key: the selected one, which is the item the properties panel shows.
 * The arrow keys used to move the focused item while Delete and R acted on
 * the selected one, and those could differ. And the keys act only while focus
 * is on the plan itself (the canvas or one of its items), never from a button
 * or other control: after a click on a table, R and Delete used to rotate or
 * delete it with focus still on "Zoom in".
 *
 * Pure so it can be tested on the server; FloorPlanEditor.tsx does the rest.
 */

export type PlanKeyAction =
  | { kind: "nudge"; id: string; dx: number; dy: number; big: boolean }
  | { kind: "delete"; id: string }
  | { kind: "rotate"; id: string };

export type PlanKey = {
  key: string;
  shift?: boolean;
  /** Ctrl, Cmd or Alt held. */
  modifier?: boolean;
};

const NUDGE: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
};

/**
 * focusOnPlan: focus is on the canvas or one of its items.
 * selected: the selected item's id, or null.
 */
export function planKeyAction(k: PlanKey, focusOnPlan: boolean, selected: string | null): PlanKeyAction | null {
  if (!focusOnPlan || !selected) return null;
  const d = NUDGE[k.key];
  // Alt+Left (Back) and Ctrl/Cmd+arrows belong to the browser.
  if (d) return k.modifier ? null : { kind: "nudge", id: selected, dx: d[0], dy: d[1], big: !!k.shift };
  if (k.key === "Delete" || k.key === "Backspace") return { kind: "delete", id: selected };
  if ((k.key === "r" || k.key === "R") && !k.modifier) return { kind: "rotate", id: selected };
  return null;
}
