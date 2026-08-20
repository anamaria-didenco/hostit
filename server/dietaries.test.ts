import { describe, it, expect } from "vitest";
import {
  groupDietaries,
  dietaryKey,
  looksSwapped,
  unswap,
  totalDietaryCovers,
} from "@shared/dietaries";

/**
 * Dietary grouping, built from the twelve-row list that prompted it: the BEO
 * printed one "×1 <Guest> — <restriction>" line per person, so the kitchen had
 * to tally in their head how many plates avoided seafood.
 *
 * The tests that matter most here are the ones asserting that things do NOT
 * merge. Over-merging an allergy is how someone gets served food that hurts
 * them, so anything short of an exact match after normalisation stays separate.
 */

describe("dietary grouping", () => {
  it("merges the same requirement and counts the guests", () => {
    const grouped = groupDietaries([
      { name: "Gluten free", count: 1, names: ["Anna Palairet"] },
      { name: "gluten-free", count: 1, names: ["Tom Ellis"] },
      { name: "GF", count: 1, names: ["Sara Lin"] },
    ]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].count).toBe(3);
    expect(grouped[0].names).toEqual(["Anna Palairet", "Tom Ellis", "Sara Lin"]);
  });

  it("NEVER merges requirements that are merely similar", () => {
    // The real pair from the runsheet. Merging these would drop beef from the
    // second guest's restriction and put beef in front of them.
    const grouped = groupDietaries([
      { name: "No pork", count: 1, names: ["Hutheifa Hussein"] },
      { name: "No Pork or Beef/ OK with Seafood, Chicken and Lamb", count: 1, names: ["Ronald Kumar"] },
    ]);
    expect(grouped).toHaveLength(2);
  });

  it("keeps distinct seafood restrictions apart", () => {
    const grouped = groupDietaries([
      { name: "No fish", count: 1 },
      { name: "No seafood", count: 1 },
      { name: "Allergic to shellfish & nuts", count: 1 },
    ]);
    expect(grouped).toHaveLength(3);
  });

  it("does not lose notes when merging", () => {
    const grouped = groupDietaries([
      { name: "Vegetarian", count: 1, names: ["Helen"], notes: "no egg" },
      { name: "vegetarian", count: 1, names: ["Sarah"], notes: "halal, fish is fine" },
    ]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].notes).toContain("no egg");
    expect(grouped[0].notes).toContain("halal");
  });

  it("de-duplicates the same guest listed twice", () => {
    const grouped = groupDietaries([
      { name: "Keto", count: 1, names: ["Santiago"] },
      { name: "keto", count: 1, names: ["santiago"] },
    ]);
    expect(grouped[0].names).toHaveLength(1);
    expect(grouped[0].count).toBe(1);
  });

  it("sums stated counts when no guests are named", () => {
    const grouped = groupDietaries([
      { name: "Vegan", count: 3 },
      { name: "vegan", count: 2 },
    ]);
    expect(grouped[0].count).toBe(5);
  });

  it("leaves a list that is already correct untouched", () => {
    const input = [
      { name: "Gluten free", count: 2, names: ["A", "B"] },
      { name: "Vegan", count: 1, names: ["C"] },
    ];
    expect(groupDietaries(input.map(d => ({ ...d })))).toHaveLength(2);
  });

  it("normalises case, punctuation and spacing only", () => {
    expect(dietaryKey("Gluten-Free")).toBe(dietaryKey("gluten free"));
    expect(dietaryKey("  DAIRY   FREE ")).toBe("dairy free");
    expect(dietaryKey("No pork")).not.toBe(dietaryKey("No pork or beef"));
  });
});

describe("swapped guest name / requirement", () => {
  it("spots a row entered the wrong way round", () => {
    expect(looksSwapped({ name: "Anne Douglas", count: 1, notes: "Allergic to shellfish & nuts" })).toBe(true);
    expect(looksSwapped({ name: "Chris Boggs", count: 1, notes: "No Fish" })).toBe(true);
  });

  it("leaves a correctly entered row alone", () => {
    expect(looksSwapped({ name: "Gluten Free", count: 1, notes: "Anna Palairet" })).toBe(false);
    expect(looksSwapped({ name: "No raw meat and no seafood", count: 1, notes: "Claire Easter" })).toBe(false);
  });

  it("does not fire when there is nothing to compare", () => {
    expect(looksSwapped({ name: "Vegetarian", count: 1 })).toBe(false);
    expect(looksSwapped({ name: "", count: 1, notes: "No pork" })).toBe(false);
  });

  it("moves the guest into names and the requirement into name", () => {
    const fixed = unswap({ name: "Anne Douglas", count: 1, notes: "Allergic to shellfish & nuts" });
    expect(fixed.name).toBe("Allergic to shellfish & nuts");
    expect(fixed.names).toEqual(["Anne Douglas"]);
    expect(fixed.notes).toBeUndefined();
    expect(fixed.count).toBe(1);
  });

  it("un-swapping then grouping turns per-guest rows into per-requirement rows", () => {
    // The end-to-end shape of the reported problem.
    const raw = [
      { name: "Anne Douglas", count: 1, notes: "No fish" },
      { name: "Chris Boggs", count: 1, notes: "No fish" },
      { name: "Anna Palairet", count: 1, notes: "Gluten Free" },
    ];
    const tidied = groupDietaries(raw.map(d => (looksSwapped(d) ? unswap(d) : d)));
    expect(tidied).toHaveLength(2);
    const fish = tidied.find(d => /no fish/i.test(d.name))!;
    expect(fish.count).toBe(2);
    expect(fish.names).toEqual(["Anne Douglas", "Chris Boggs"]);
    expect(totalDietaryCovers(tidied)).toBe(3);
  });
});
