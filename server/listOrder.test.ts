import { describe, expect, it } from "vitest";
import { applyOrder, moveAnnouncement, moveInList } from "../shared/listOrder";

describe("moveInList", () => {
  it("swaps with the neighbour", () => {
    expect(moveInList([1, 2, 3], 2, -1)).toEqual([2, 1, 3]);
    expect(moveInList([1, 2, 3], 2, 1)).toEqual([1, 3, 2]);
    expect(moveInList(["a", "b"], "a", 1)).toEqual(["b", "a"]);
  });
  it("leaves the list alone at the ends or for an unknown id", () => {
    expect(moveInList([1, 2, 3], 1, -1)).toEqual([1, 2, 3]);
    expect(moveInList([1, 2, 3], 3, 1)).toEqual([1, 2, 3]);
    expect(moveInList([1, 2, 3], 9, 1)).toEqual([1, 2, 3]);
  });
  it("doesn't change the list it was given", () => {
    const ids = [1, 2, 3];
    moveInList(ids, 1, 1);
    expect(ids).toEqual([1, 2, 3]);
  });
});

describe("applyOrder", () => {
  it("uses the requested order", () => {
    expect(applyOrder([1, 2, 3], [3, 1, 2])).toEqual([3, 1, 2]);
  });
  it("keeps an item added meanwhile (at the end) and drops one deleted meanwhile", () => {
    expect(applyOrder([1, 2, 3, 4], [2, 1, 3])).toEqual([2, 1, 3, 4]);
    expect(applyOrder([1, 3], [3, 2, 1])).toEqual([3, 1]);
  });
  it("ignores repeats and ids from another list", () => {
    expect(applyOrder([1, 2], [2, 2, 99, 1])).toEqual([2, 1]);
    expect(applyOrder([1, 2], [])).toEqual([1, 2]);
  });
});

describe("moveAnnouncement", () => {
  it("says where the item went", () => {
    expect(moveAnnouncement(" Polish glasses ", 2, 5)).toBe("Moved Polish glasses to position 2 of 5");
    expect(moveAnnouncement("", 1, 1)).toBe("Moved item to position 1 of 1");
  });
});
