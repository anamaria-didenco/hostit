import { describe, expect, it } from "vitest";
import {
  addEventChecklistItems, editEventChecklistItem, eventChecklistCategoryLabel, removeEventChecklistItem, reorderEventChecklist,
} from "../shared/eventChecklistEdit";

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

describe("editEventChecklistItem: photo", () => {
  it("sets and takes off an item's photo, keeping its tick", () => {
    const out = editEventChecklistItem(stored, "b", { imageUrl: "/uploads/ice.jpg" })!;
    expect(out[1]).toEqual({ ...stored[1], imageUrl: "/uploads/ice.jpg" });
    const off = editEventChecklistItem(stored, "c", { imageUrl: "" })!;
    expect("imageUrl" in off[2]).toBe(false);
    expect(off[1]).toBe(stored[1]);
  });
});

describe("addEventChecklistItems", () => {
  it("adds after the list as stored now, keeping a staff tick made meanwhile", () => {
    const r = addEventChecklistItems(stored, [{ id: "c-9", text: "Set up the photo booth", checked: false }]);
    expect(r.items.map(i => i.id)).toEqual(["a", "b", "c", "c-9"]);
    expect(r.items[1]).toBe(stored[1]);
    expect(r.added.map(i => i.text)).toEqual(["Set up the photo booth"]);
  });

  it("gives a taken id a suffix", () => {
    const r = addEventChecklistItems(stored, [{ id: "a", text: "Another", checked: false }, { id: "a", text: "And another", checked: false }]);
    expect(r.items.slice(3).map(i => i.id)).toEqual(["a-2", "a-3"]);
  });

  it("with skipSameText, leaves out words already on the list (any case) or repeated", () => {
    const r = addEventChecklistItems(stored, [
      { id: "x1", text: "ice in WELLS ", checked: false },
      { id: "x2", text: "Stock bar: Prosecco", checked: false },
      { id: "x3", text: "Stock bar: Prosecco", checked: false },
    ], { skipSameText: true });
    expect(r.added.map(i => i.id)).toEqual(["x2"]);
    expect(r.items).toHaveLength(4);
    // Without it, the same words can go on twice.
    expect(addEventChecklistItems(stored, [{ id: "x1", text: "Ice in wells", checked: false }]).added).toHaveLength(1);
  });

  it("doesn't change the list it was given", () => {
    const copy = JSON.parse(JSON.stringify(stored));
    addEventChecklistItems(stored, [{ id: "z", text: "New", checked: false }]);
    expect(stored).toEqual(copy);
  });
});

describe("removeEventChecklistItem", () => {
  it("removes only that item; one already gone leaves the list as it is", () => {
    expect(removeEventChecklistItem(stored, "a").map(i => i.id)).toEqual(["b", "c"]);
    expect(removeEventChecklistItem(stored, "gone")).toEqual(stored);
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
