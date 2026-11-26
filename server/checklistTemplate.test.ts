import { describe, expect, it } from "vitest";
import { templateItemsFromText, templateItemsToText } from "../shared/checklistTemplate";

describe("checklist template items as lines", () => {
  const items = [
    { id: "1", text: "Set tables", category: "setup", required: true },
    { id: "2", text: "Ice in wells" },
    { id: "3", text: "Light candles" },
  ];

  it("shows one item per line", () => {
    expect(templateItemsToText(items)).toBe("Set tables\nIce in wells\nLight candles");
    expect(templateItemsToText([])).toBe("");
    expect(templateItemsToText(null)).toBe("");
  });

  it("numbers a new template's lines and skips blanks", () => {
    expect(templateItemsFromText("Set tables\n\n  Ice in wells  \r\n")).toEqual([
      { id: "1", text: "Set tables" },
      { id: "2", text: "Ice in wells" },
    ]);
  });

  it("keeps unchanged items' ids and details when lines move, are added or removed", () => {
    const out = templateItemsFromText("Light candles\nset  TABLES\nCheck the PA", items);
    expect(out).toEqual([
      { id: "3", text: "Light candles" },
      { id: "1", text: "set  TABLES", category: "setup", required: true },
      { id: "4", text: "Check the PA" },
    ]);
  });

  it("gives a repeated line its own id", () => {
    const out = templateItemsFromText("Ice in wells\nIce in wells", items);
    expect(out.map(i => i.id)).toEqual(["2", "4"]);
  });
});
