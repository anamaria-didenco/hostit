import { describe, expect, it } from "vitest";
import { drinkGroupOf, groupDrinks } from "../shared/drinkGroups";

describe("drink groups", () => {
  it("uses the type picked on the runsheet", () => {
    expect(drinkGroupOf("House special", "red")).toBe("red");
    expect(drinkGroupOf("Prosecco", "SPARK")).toBe("spark");
  });
  it("treats a picked 'Other' as not picked", () => {
    expect(drinkGroupOf("Menabrea Bionda", "other")).toBe("beer");
  });
  it("places drinks the BEO used to leave under Other", () => {
    expect(drinkGroupOf("Menabrea Bionda")).toBe("beer");
    expect(drinkGroupOf("Sanpellegrino Limonata")).toBe("nonalc");
  });
  it("keeps alcohol-free drinks out of Beer and rosato out of Red", () => {
    // Off-menu names only: the menu itself lists Peroni 0% under Birra.
    expect(drinkGroupOf("Heineken 0% lager")).toBe("nonalc");
    expect(drinkGroupOf("Peroni 0%")).toBe("beer");
    expect(drinkGroupOf("Fattoria di Basciano Rosato")).toBe("rose");
  });
  it("reads the menu and common names", () => {
    expect(drinkGroupOf("Aperol Spritz")).toBe("cocktail");
    expect(drinkGroupOf("Tallero Prosecco Extra Dry")).toBe("spark");
    expect(drinkGroupOf("Mezzacorona Castel Firmian Sauvignon Blanc")).toBe("white");
    expect(drinkGroupOf("Renzo Masi Chianti Cornioletta")).toBe("red");
    expect(drinkGroupOf("Bulldog Gin")).toBe("spirits");
    expect(drinkGroupOf("Mystery drink")).toBe("other");
  });
  it("groups in serving order and skips empty groups", () => {
    const g = groupDrinks(["Peroni Tap", "Aperol Spritz", "Fantini Montepulciano"], s => s);
    expect(g.map(x => x.label)).toEqual(["Cocktails", "Red wine", "Beer & cider"]);
  });
});
