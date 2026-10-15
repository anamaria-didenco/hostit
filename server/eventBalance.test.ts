import { describe, expect, it } from "vitest";
import { eventBalance } from "@shared/eventBilling";
import { clientBillBalanceRows } from "./beoPdf";

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

describe("eventBalance — GST and payments (F-25)", () => {
  const fnb = [{ section: "foh", course: "Main", dishName: "Panini platter", qty: 20, unitPrice: 50 }];

  it("breaks the itemised total into ex-GST and GST either way it was entered", () => {
    const ex = eventBalance({ fnb, costItems: [] });
    expect(ex.itemisedExGst).toBeCloseTo(1000);
    expect(ex.itemisedInclGst - ex.itemisedExGst).toBeCloseTo(150);
    const incl = eventBalance({ fnb, costItems: [], gstInclusive: true });
    expect(incl.itemisedInclGst).toBe(1000);
    expect(incl.itemisedExGst).toBeCloseTo(869.57, 2);
  });

  it("never adds GST on top of the booking total, whatever the toggle says", () => {
    // Nothing priced: the old client-copy formula printed $2,875 here.
    for (const gstInclusive of [true, false]) {
      expect(eventBalance({ fnb: [], costItems: [], gstInclusive, bookingTotal: 2500 }))
        .toMatchObject({ contractTotal: 2500, basis: "booking total", balance: 2500 });
    }
  });

  it("takes payments already received off the balance, after the deposit", () => {
    const b = eventBalance({
      fnb, costItems: [], minimumSpend: 5000,
      depositAmount: 500, depositPaid: true, depositApplied: "food", paidToDate: 1000,
    });
    expect(b).toMatchObject({ paidToDate: 1000, balance: 3500 });
    expect(eventBalance({ fnb, costItems: [], paidToDate: 5000 }).balance).toBe(0);
  });
});

describe("client copy balance rows (one balance per event)", () => {
  const fnb = [{ section: "foh", course: "Main", dishName: "Panini platter", qty: 20, unitPrice: 50 }];
  const balanceOf = (rows: ReturnType<typeof clientBillBalanceRows>) => rows.find(r => r.balance)?.amount;

  it("prints the run sheet's balance, with the deposit and payments that come off it", () => {
    const bal = eventBalance({
      fnb, costItems: [], minimumSpend: 5000,
      depositAmount: 500, depositPaid: true, depositApplied: "total", paidToDate: 250,
    });
    const rows = clientBillBalanceRows(bal, { depositAmount: 500 });
    expect(rows.map(r => r.label)).toEqual(["Less deposit received", "Less paid so far", "Balance to collect"]);
    expect(balanceOf(rows)).toBe(bal.balance);
    expect(bal.balance).toBe(4250);
  });

  it("doesn't take a deposit applied to drinks off the food bill", () => {
    const bal = eventBalance({ fnb, costItems: [], minimumSpend: 5000, depositAmount: 500, depositPaid: true, depositApplied: "drinks" });
    const rows = clientBillBalanceRows(bal, { depositAmount: 500 });
    expect(rows.some(r => r.minus)).toBe(false);
    expect(balanceOf(rows)).toBe(5000);
  });

  it("leaves the balance off when it's just the total above it", () => {
    expect(clientBillBalanceRows(eventBalance({ fnb, costItems: [] }), { depositAmount: 0 })).toEqual([]);
  });

  it("shows a booking-total balance without grossing it up", () => {
    const bal = eventBalance({ fnb: [], costItems: [], bookingTotal: 2500, depositAmount: 500, depositPaid: true, depositApplied: "total" });
    expect(balanceOf(clientBillBalanceRows(bal, { depositAmount: 500 }))).toBe(2000);
  });

  it("collects nothing on a contra event", () => {
    const bal = eventBalance({ fnb, costItems: [], minimumSpend: 3000, billingFood: "contra" });
    const rows = clientBillBalanceRows(bal, { depositAmount: 0 });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ amount: 0 });
  });
});
