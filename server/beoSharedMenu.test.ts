import { describe, expect, it } from "vitest";
import { detectEmbeddedMenu, parseMenuBlob } from "./beoPdf";
import { SHARED_FRANCO, TUTTO_FRANCO, isSharedMenu, setMenuCoursesText } from "@shared/eventMenus2026";

describe("BEO: shared set menus", () => {
  it("reads Tutto Franco as its four courses, Antipasto misto kept whole", () => {
    const courses = parseMenuBlob(setMenuCoursesText(TUTTO_FRANCO));
    expect(courses.map(c => c.label)).toEqual(["Canapés", "Entrée", "Main", "Dessert"]);
    expect(courses[1].dishes.map(d => d.name)).toEqual([
      "Focaccia",
      "Antipasto misto, cured meats, marinated olives, roasted peppers, pickled onions (GF · DF)",
      "Stracciatella, peperonata, fig and pistachio agrodolce (contains nuts)",
    ]);
    expect(courses[2].dishes).toHaveLength(4);
  });

  it("a Shared Franco item on the run sheet is detected as one embedded menu", () => {
    const menu = detectEmbeddedMenu([{ dishName: SHARED_FRANCO.name, description: setMenuCoursesText(SHARED_FRANCO), qty: 15 }]);
    expect(menu?.map(c => c.label)).toEqual(["Entrée", "Main", "Dessert"]);
  });

  it("still splits real headings: capitals, alone, or followed by a separator", () => {
    expect(parseMenuBlob("ANTIPASTO\nBurrata\nSECONDI\nPorchetta").map(c => c.label)).toEqual(["Entrée", "Main"]);
    expect(parseMenuBlob("Antipasto: Burrata\nMains — Porchetta").map(c => [c.label, c.dishes[0].name])).toEqual([["Entrée", "Burrata"], ["Main", "Porchetta"]]);
    expect(parseMenuBlob("Entrée to share Burrata\nDessert\nTiramisu").map(c => [c.label, c.note])).toEqual([["Entrée", "To share"], ["Dessert", ""]]);
  });

  it("knows which food is shared", () => {
    expect(isSharedMenu("Tutto Franco")).toBe(true);
    expect(isSharedMenu(" shared franco ")).toBe(true);
    expect(isSharedMenu("Antipasti", "to share down the table")).toBe(true);
    expect(isSharedMenu("Pasta", "served family-style")).toBe(true);
    expect(isSharedMenu("Arancini", "canapé, passed on trays")).toBe(false);
    expect(isSharedMenu("Porchetta")).toBe(false);
  });
});
