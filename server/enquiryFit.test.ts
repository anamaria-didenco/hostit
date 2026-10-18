import { describe, it, expect } from "vitest";
import { enquiryFit, budgetBounds, fitOkCount } from "../shared/enquiryFit";

const SPACE = { name: "Main Bar", minCapacity: 20, maxCapacity: 80, minSpend: 1500, minSpendWeekend: 4000 };

describe("budgetBounds", () => {
  it("maps a bracket to numeric bounds, or null", () => {
    expect(budgetBounds("5_10k")).toEqual({ lo: 5000, hi: 10000 });
    expect(budgetBounds("20k_plus")).toEqual({ lo: 20000, hi: null });
    expect(budgetBounds(undefined)).toBeNull();
    expect(budgetBounds("nonsense")).toBeNull();
  });
});

describe("enquiryFit", () => {
  it("good fit: free date, capacity fits, budget clears weekend minimum, returning client", () => {
    const items = enquiryFit(
      { guestCount: 60, budgetRange: "5_10k", eventDate: "2026-11-14" },
      SPACE,
      { hasClash: false, isWeekend: true, returningCount: 2 },
    );
    const by = Object.fromEntries(items.map((i) => [i.key, i]));
    expect(by.date.tone).toBe("green");
    expect(by.capacity.tone).toBe("green");
    expect(by.capacity.head).toBe("60 of 80");
    expect(by.budget.tone).toBe("green"); // hi 10000 >= weekend min 4000
    expect(by.budget.head).toContain("clears $4,000");
    expect(by.client.tone).toBe("green");
    expect(fitOkCount(items)).toBe(4);
  });

  it("clash → date red", () => {
    const items = enquiryFit({ guestCount: 40, eventDate: "2026-11-14" }, SPACE, { hasClash: true });
    expect(items.find((i) => i.key === "date")!.tone).toBe("red");
  });

  it("over capacity → amber", () => {
    const items = enquiryFit({ guestCount: 140, eventDate: "2026-11-14" }, SPACE, {});
    const cap = items.find((i) => i.key === "capacity")!;
    expect(cap.tone).toBe("amber");
    expect(cap.head).toBe("140 of 80 max");
  });

  it("budget under the weekday minimum → amber", () => {
    const items = enquiryFit({ guestCount: 40, budgetRange: "under_5k", eventDate: "2026-11-11" }, SPACE, { isWeekend: false });
    // under_5k hi = 5000 >= weekday min 1500 → actually clears; use a higher min space
    const tightSpace = { ...SPACE, minSpend: 8000 };
    const items2 = enquiryFit({ guestCount: 40, budgetRange: "under_5k", eventDate: "2026-11-11" }, tightSpace, { isWeekend: false });
    expect(items2.find((i) => i.key === "budget")!.tone).toBe("amber");
    expect(items.find((i) => i.key === "budget")!.tone).toBe("green");
  });

  it("no space data → gray capacity/budget, but date + client still resolve", () => {
    const items = enquiryFit({ guestCount: 30, budgetRange: "5_10k", eventDate: "2026-11-14" }, null, { spaceLabel: "Main Bar" });
    expect(items.find((i) => i.key === "capacity")!.tone).toBe("gray");
    expect(items.find((i) => i.key === "budget")!.tone).toBe("gray");
    expect(items.find((i) => i.key === "date")!.tone).toBe("green");
    expect(items.find((i) => i.key === "client")!.tone).toBe("gray");
  });

  it("no date, flexible → amber date", () => {
    const items = enquiryFit({ guestCount: 30, dateFlexible: true }, SPACE, {});
    const d = items.find((i) => i.key === "date")!;
    expect(d.tone).toBe("amber");
    expect(d.head).toBe("Flexible");
  });
});
