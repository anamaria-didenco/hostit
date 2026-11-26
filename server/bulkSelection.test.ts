import { describe, expect, it } from "vitest";
import { allShownSelected, keepShown, selectableIds } from "@shared/bulkSelection";
import { clearFilters, enrichRows, listRows, type LeadLike } from "@shared/enquiryFilters";

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

describe("what a selection may hold while the list isn't shown", () => {
  // Select all on the All tab, then WIN BACK or BOARD: the floating toolbar
  // used to stay with every enquiry still selected, so SET STATUS or DELETE
  // there changed enquiries that weren't on screen.
  it("is nothing on the Board or in Win back", () => {
    expect(selectableIds([1, 2, 3], "kanban", "all")).toEqual([]);
    expect(selectableIds([1, 2, 3], "table", "winback")).toEqual([]);
    expect(selectableIds([1, 2, 3], "list", "winback")).toEqual([]);
    expect(keepShown(new Set([1, 2, 3]), selectableIds([1, 2, 3], "table", "winback")).size).toBe(0);
  });

  it("is the list's rows in the list view", () => {
    expect(selectableIds([1, 2, 3], "table", "all")).toEqual([1, 2, 3]);
    expect(selectableIds([4], "list", "new")).toEqual([4]);
  });

  it("keeps the same empty list while the list is hidden, so nothing re-runs", () => {
    expect(selectableIds([1], "kanban", "all")).toBe(selectableIds([2], "table", "winback"));
  });
});

describe("a filter narrowing the list cuts the selection to the rows left", () => {
  // Needs reply shows 24; a Space filter leaves 9. The 15 others must drop out
  // of the selection, so a bulk change only reaches what is on screen.
  it("keeps exactly the rows the filtered list shows", () => {
    const NOW = Date.UTC(2026, 10, 16, 21, 0);
    const leads: LeadLike[] = Array.from({ length: 24 }, (_, i) => ({
      id: i + 1, firstName: "Test", lastName: `Client${i + 1}`, email: `client${i + 1}@example.test`,
      status: "new", createdAt: new Date(NOW - (i + 1) * 3_600_000), spaceId: i < 9 ? 4 : 2,
    }));
    const ctx = { nowMs: NOW, tz: "Pacific/Auckland", statusOrder: ["new"] };
    const rows = enrichRows(leads, ctx);
    const view = (space: number[]) => listRows(rows, { view: "reply", q: "", sort: { key: "urgent", dir: "asc" }, filters: { ...clearFilters(), space } }, ctx).rows.map(r => r.lead.id);
    const all = view([]);
    expect(all.length).toBe(24);
    const selected = new Set(all);
    expect(allShownSelected(selected, all)).toBe(true);
    const shown = view([4]);
    expect(shown.length).toBe(9);
    const kept = keepShown(selected, shown);
    expect(kept.size).toBe(9);
    expect(allShownSelected(kept, shown)).toBe(true);
    expect(allShownSelected(kept, all)).toBe(false);
  });
});
