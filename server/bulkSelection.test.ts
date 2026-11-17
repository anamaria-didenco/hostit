import { describe, expect, it } from "vitest";
import { allShownSelected, keepShown } from "@shared/bulkSelection";

// Enquiries > More actions > Select multiple. SELECT ALL used to select the
// page's older filtered list, not the rows on screen: with the All tab showing
// 11 it selected 3, and with a search showing 2 it selected 4, so a bulk
// Delete removed two enquiries that were never shown.

describe("SELECT ALL on the enquiries list", () => {
  it("is ticked only when exactly the rows shown are selected", () => {
    expect(allShownSelected(new Set([4, 5, 6]), [4, 5, 6])).toBe(true);
    expect(allShownSelected(new Set([6, 4, 5]), [4, 5, 6])).toBe(true);
    // The same number of rows is not the same rows (the old size check said yes).
    expect(allShownSelected(new Set([1, 2, 3]), [4, 5, 6])).toBe(false);
    // Some shown rows left out, or extra ones that aren't shown.
    expect(allShownSelected(new Set([4, 5]), [4, 5, 6])).toBe(false);
    expect(allShownSelected(new Set([4, 5, 6, 7]), [4, 5, 6])).toBe(false);
  });

  it("is not ticked when nothing is shown", () => {
    expect(allShownSelected(new Set(), [])).toBe(false);
    expect(allShownSelected(new Set([1]), [])).toBe(false);
  });
});

describe("keeping a selection to the rows shown", () => {
  it("drops rows that a tab, search or filter change took off the screen", () => {
    // All 11 selected, then the Needs reply tab shows 3 of them.
    const all = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(Array.from(keepShown(all, [2, 7, 9])).sort((a, b) => a - b)).toEqual([2, 7, 9]);
    // A search that shows none of them leaves nothing selected.
    expect(keepShown(new Set([1, 2]), [5, 6]).size).toBe(0);
  });

  it("does not add rows that weren't selected", () => {
    expect(Array.from(keepShown(new Set([2]), [1, 2, 3]))).toEqual([2]);
  });

  it("gives back the same set when every selected row is still shown", () => {
    const sel = new Set([2, 3]);
    expect(keepShown(sel, [1, 2, 3, 4])).toBe(sel);
    const none = new Set<number>();
    expect(keepShown(none, [1, 2])).toBe(none);
  });
});
