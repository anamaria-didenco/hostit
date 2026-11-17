import { describe, it, expect } from "vitest";
import { floorPlanItemName, summarizeFloorPlan } from "../shared/floorPlanSummary";

const KINDS: Record<string, string> = {
  "round-table-8": "Round Table (8)",
  "rect-table-6": "Rect Table (6)",
  chair: "Chair",
  stage: "Stage",
  text: "Text Label",
};
const kindOf = (t: string) => KINDS[t] ?? t;

describe("floorPlanItemName", () => {
  it("names an item by its label and seats", () => {
    expect(floorPlanItemName({ type: "round-table-8", label: "Table 1", seats: 8 }, kindOf)).toBe("Table 1, 8 seats");
    expect(floorPlanItemName({ type: "chair", seats: 1 }, kindOf)).toBe("Chair, 1 seat");
    expect(floorPlanItemName({ type: "stage", label: "STAGE", seats: 0 }, kindOf)).toBe("STAGE");
    expect(floorPlanItemName({ type: "stage" }, kindOf)).toBe("Stage");
  });

  it("reads a text label as text", () => {
    expect(floorPlanItemName({ type: "text", label: "Bar this way" }, kindOf)).toBe("Text: Bar this way");
    expect(floorPlanItemName({ type: "text" }, kindOf)).toBe("Text: Label");
  });
});

describe("summarizeFloorPlan", () => {
  it("totals tables and seats the way the editor toolbar does", () => {
    const s = summarizeFloorPlan([
      { type: "round-table-8", label: "T1", seats: 8 },
      { type: "round-table-8", label: "T2", seats: 8 },
      { type: "chair", seats: 1 },
      { type: "stage", label: "STAGE", seats: 0 },
    ], kindOf);
    expect(s.tables).toBe(2);
    expect(s.seats).toBe(17);
    expect(s.headline).toBe("2 tables, 17 seats");
  });

  it("lists labelled items one by one, in plan order", () => {
    const s = summarizeFloorPlan([
      { type: "stage", label: "STAGE" },
      { type: "round-table-8", label: "T1", seats: 8 },
      { type: "round-table-8", label: "T2", seats: 8 },
    ], kindOf);
    expect(s.lines).toEqual(["STAGE: Stage", "T1: Round Table (8), 8 seats", "T2: Round Table (8), 8 seats"]);
  });

  it("counts identical unlabelled items instead of repeating them", () => {
    const chairs = Array.from({ length: 12 }, () => ({ type: "chair", seats: 1 }));
    const s = summarizeFloorPlan([...chairs, { type: "rect-table-6", label: "Rect Table (6)", seats: 6 }, { type: "rect-table-6", label: "Rect Table (6)", seats: 6 }], kindOf);
    expect(s.lines).toEqual(["12 × Chair, 1 seat each", "2 × Rect Table (6), 6 seats each"]);
    expect(s.headline).toBe("2 tables, 24 seats");
  });

  it("keeps different seat counts apart", () => {
    const s = summarizeFloorPlan([{ type: "rect-table-6", seats: 6 }, { type: "rect-table-6", seats: 8 }], kindOf);
    expect(s.lines).toEqual(["Rect Table (6), 6 seats", "Rect Table (6), 8 seats"]);
  });

  it("handles an empty plan", () => {
    const s = summarizeFloorPlan([], kindOf);
    expect(s).toEqual({ tables: 0, seats: 0, headline: "0 tables, 0 seats", lines: [] });
  });

  it("singular table and seat", () => {
    expect(summarizeFloorPlan([{ type: "round-table-8", seats: 1 }], kindOf).headline).toBe("1 table, 1 seat");
  });
});
