import { describe, expect, it } from "vitest";
import { editEventChecklistItem, eventChecklistCategoryLabel, reorderEventChecklist } from "../shared/eventChecklistEdit";

type Item = { id: string; text: string; category?: string; checked: boolean; checkedAt?: string; notes?: string; imageUrl?: string };

// What the server has now: a staff member ticked "Ice" from their link after
// the run sheet loaded its copy.
const stored: Item[] = [
  { id: "a", text: "Set tables", category: "setup", checked: false },
  { id: "b", text: "Ice in wells", category: "bar", checked: true, checkedAt: "2026-11-18T01:00:00Z" },
  { id: "c", text: "Light candles", category: "other", checked: false, imageUrl: "/uploads/candles.jpg" },
];

describe("editEventChecklistItem", () => {
  it("changes only that item's words and category, keeping a staff tick made meanwhile", () => {
    const out = editEventChecklistItem(stored, "a", { text: "  Set the long table  ", category: "staff" })!;
    expect(out[0]).toEqual({ id: "a", text: "Set the long table", category: "staff", checked: false });
    expect(out[1]).toEqual(stored[1]);
    expect(out[2]).toEqual(stored[2]);
  });

  it("keeps the item's own tick and photo", () => {
    const out = editEventChecklistItem(stored, "b", { text: "Ice in both wells" })!;
    expect(out[1]).toEqual({ ...stored[1], text: "Ice in both wells" });
    const out2 = editEventChecklistItem(stored, "c", { category: "guest" })!;
    expect(out2[2]).toEqual({ ...stored[2], category: "guest" });
  });

  it("ignores blank text, sets and clears notes", () => {
    const out = editEventChecklistItem(stored, "a", { text: "   ", notes: "By 5pm" })!;
    expect(out[0]).toEqual({ ...stored[0], notes: "By 5pm" });
    const cleared = editEventChecklistItem(out, "a", { notes: "" })!;
    expect(cleared[0]).toEqual(stored[0]);
    expect("notes" in cleared[0]).toBe(false);
  });

  it("an empty category becomes other", () => {
    expect(editEventChecklistItem(stored, "a", { category: "" })![0].category).toBe("other");
  });

  it("says when the item was deleted meanwhile, and doesn't change the list it was given", () => {
    expect(editEventChecklistItem(stored, "zz", { text: "X" })).toBeNull();
    const copy = JSON.parse(JSON.stringify(stored));
    editEventChecklistItem(stored, "a", { text: "Changed" });
    expect(stored).toEqual(copy);
  });
});

describe("reorderEventChecklist", () => {
  it("puts the items in the asked order with their current ticks", () => {
    const out = reorderEventChecklist(stored, ["c", "a", "b"]);
    expect(out.map(i => i.id)).toEqual(["c", "a", "b"]);
    expect(out[2]).toBe(stored[1]);
  });

  it("keeps an item added meanwhile and skips one deleted meanwhile", () => {
    const now = [...stored.slice(0, 2), { id: "d", text: "Check the PA", checked: false }];
    expect(reorderEventChecklist(now, ["c", "b", "a"]).map(i => i.id)).toEqual(["b", "a", "d"]);
  });
});

describe("eventChecklistCategoryLabel", () => {
  it("capitalises", () => {
    expect(eventChecklistCategoryLabel("bar")).toBe("Bar");
    expect(eventChecklistCategoryLabel("")).toBe("Other");
  });
});
