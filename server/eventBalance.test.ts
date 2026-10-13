import { describe, expect, it } from "vitest";
import { eventBalance } from "@shared/eventBilling";

describe("eventBalance (run sheet and runsheet screen)", () => {
  const fnb = [{ section: "foh", course: "Main", dishName: "Panini platter", qty: 20, unitPrice: 50 }];

  it("works from the itemised total incl. GST and never adds a bar tab", () => {
    const b = eventBalance({ fnb, costItems: [] });
    expect(b.itemisedInclGst).toBeCloseTo(1150);
    expect(b.contractTotal).toBeCloseTo(1150);
    expect(b.basis).toBe("");
    expect(b.balance).toBe(1150);
  });

  it("uses the minimum spend or booking total when larger, and says which", () => {
    expect(eventBalance({ fnb, costItems: [], minimumSpend: 5000 })).toMatchObject({ contractTotal: 5000, basis: "minimum spend", balance: 5000 });
    expect(eventBalance({ fnb, costItems: [], bookingTotal: 6000, minimumSpend: 5000 })).toMatchObject({ contractTotal: 6000, basis: "booking total" });
  });

  it("takes a paid deposit off only when it applies to this bill", () => {
    const base = { fnb, costItems: [], minimumSpend: 5000, depositAmount: 500, depositPaid: true };
    expect(eventBalance({ ...base, depositApplied: "total" })).toMatchObject({ depositOffThisBill: true, balance: 4500 });
    expect(eventBalance({ ...base, depositApplied: "drinks" })).toMatchObject({ depositOffThisBill: false, balance: 5000 });
    expect(eventBalance({ ...base, depositApplied: null })).toMatchObject({ depositOffThisBill: false, balance: 5000 });
    expect(eventBalance({ ...base, depositApplied: "total", depositPaid: false })).toMatchObject({ balance: 5000 });
  });

  it("keeps a food line whose name matches only an unbilled cost line", () => {
    const b = eventBalance({
      fnb: [{ section: "foh", course: "Main", dishName: "Grazing table", qty: 1, unitPrice: 1000 }],
      costItems: [{ label: "Grazing table", qty: 1, unitPrice: 300, category: "Other" }],
      gstInclusive: true,
    });
    expect(b.itemisedInclGst).toBe(1000);
  });

  it("counts food/beverage cost lines, not drinks rows or other costs", () => {
    const b = eventBalance({
      fnb: [...fnb, { section: "foh", course: "Drinks", dishName: "Prosecco", qty: 10, unitPrice: 60 }],
      costItems: [{ label: "Grazing", qty: 1, unitPrice: 1000, category: "Food & Beverage" }, { label: "AV", qty: 1, unitPrice: 400, category: "Equipment" }],
      gstInclusive: true,
    });
    expect(b.itemisedInclGst).toBe(2000);
  });
});

describe("eventBalance — contra", () => {
  it("owes nothing on a contra event, whatever the minimum spend, but keeps its value", () => {
    const b = eventBalance({
      fnb: [{ section: "foh", course: "Main", dishName: "Panini platter", qty: 20, unitPrice: 50 }],
      costItems: [], minimumSpend: 3000, bookingTotal: 2500,
      depositAmount: 500, depositPaid: true, depositApplied: "total", billingFood: "contra",
    });
    expect(b.itemisedInclGst).toBeCloseTo(1150);
    expect(b.basis).toBe("contra");
    expect(b.contractTotal).toBe(0);
    expect(b.balance).toBe(0);
    expect(b.depositOffThisBill).toBe(false);
  });
});
