import { describe, it, expect } from "vitest";
import { nextIndexForKey, rovingTabIndex } from "@shared/rovingFocus";

describe("nextIndexForKey (radio groups and tab lists: arrow keys move and choose)", () => {
  it("moves forward and back with the arrow keys, wrapping at the ends", () => {
    expect(nextIndexForKey("ArrowRight", 0, 4)).toBe(1);
    expect(nextIndexForKey("ArrowDown", 3, 4)).toBe(0);
    expect(nextIndexForKey("ArrowLeft", 0, 4)).toBe(3);
    expect(nextIndexForKey("ArrowUp", 2, 4)).toBe(1);
  });

  it("jumps to the first and last option with Home and End", () => {
    expect(nextIndexForKey("Home", 2, 4)).toBe(0);
    expect(nextIndexForKey("End", 0, 4)).toBe(3);
  });

  it("leaves Tab, Space, Enter and letters to the browser", () => {
    for (const key of ["Tab", " ", "Enter", "a", "Escape"]) expect(nextIndexForKey(key, 1, 4)).toBeNull();
    expect(nextIndexForKey("ArrowRight", 0, 0)).toBeNull();
  });
});

describe("rovingTabIndex (one Tab stop per group)", () => {
  it("makes only the chosen option a Tab stop", () => {
    expect([0, 1, 2].map(i => rovingTabIndex(i === 1, i, true))).toEqual([-1, 0, -1]);
  });

  it("makes the first option the Tab stop when nothing is chosen yet", () => {
    expect([0, 1, 2].map(i => rovingTabIndex(false, i, false))).toEqual([0, -1, -1]);
  });
});
