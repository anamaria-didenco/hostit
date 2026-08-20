import { describe, it, expect } from "vitest";
import {
  eventFoodBillingLines,
  eventDrinksBillingLines,
  billingLinesTotal,
  fnbFoodLines,
  isFoodBeverageCost,
} from "@shared/eventBilling";

/**
 * These lines seed the Xero draft AND print on the BEO's cost summary, so a
 * difference between the two is a client being invoiced for something other
 * than the document they were sent. The tests below are the rules that keep
 * them identical.
 */

const food = (dishName: string, qty: number, unitPrice: number, course = "Main") =>
  ({ section: "foh", course, dishName, qty, unitPrice });

describe("food billing lines", () => {
  it("bills priced food from the F&B sheet", () => {
    const lines = eventFoodBillingLines([food("Grazing table", 1, 1500), food("Canapés", 40, 12)], []);
    expect(lines).toEqual([
      { description: "Grazing table", quantity: 1, unitAmount: 1500 },
      { description: "Canapés", quantity: 40, unitAmount: 12 },
    ]);
    expect(billingLinesTotal(lines)).toBe(1980);
  });

  it("never bills the same item twice when it is on both tabs", () => {
    // The operator priced the grazing table on the F&B sheet and again as a
    // Costs line. The Costs line is authoritative; billing both would charge
    // the client $3,000 for one table.
    const lines = eventFoodBillingLines(
      [food("Grazing Table", 1, 1500)],
      [{ label: "  grazing   table ", qty: 1, unitPrice: 1500, category: "Food" }],
    );
    expect(lines).toHaveLength(1);
    expect(billingLinesTotal(lines)).toBe(1500);
  });

  it("leaves drinks off the food invoice", () => {
    const lines = eventFoodBillingLines([food("House red", 12, 14, "Drinks"), food("Mains", 40, 45)], []);
    expect(lines.map(l => l.description)).toEqual(["Mains"]);
  });

  it("bills only food and beverage cost lines, not the operator's own costs", () => {
    const lines = eventFoodBillingLines([], [
      { label: "Beverage package", qty: 40, unitPrice: 35, category: "Beverage" },
      { label: "AV hire", qty: 1, unitPrice: 400, category: "AV" },
      { label: "Styling", qty: 1, unitPrice: 900, category: "Styling" },
    ]);
    expect(lines.map(l => l.description)).toEqual(["Beverage package"]);
    expect(isFoodBeverageCost({ category: "Food & Beverage" })).toBe(true);
    expect(isFoodBeverageCost({ category: "Equipment hire" })).toBe(false);
  });

  it("skips unpriced menu items rather than sending $0 lines to Xero", () => {
    const lines = eventFoodBillingLines([food("Bread service", 40, 0), food("Mains", 40, 45)], []);
    expect(lines).toHaveLength(1);
    expect(fnbFoodLines([food("Bread service", 40, 0)], [])).toHaveLength(0);
  });

  it("ignores kitchen-section rows, which are prep and not billable", () => {
    const lines = eventFoodBillingLines(
      [{ section: "kitchen", course: "Main", dishName: "Prep beef", qty: 40, unitPrice: 20 }],
      [],
    );
    expect(lines).toHaveLength(0);
  });

  it("returns nothing for an event with nothing priced", () => {
    expect(eventFoodBillingLines([], [])).toEqual([]);
    expect(billingLinesTotal([])).toBe(0);
  });

  it("copes with amounts stored as strings", () => {
    const lines = eventFoodBillingLines(
      [{ section: "foh", course: "Main", dishName: "Mains", qty: "40", unitPrice: "45.50" }],
      [],
    );
    expect(billingLinesTotal(lines)).toBe(1820);
  });
});

describe("drinks billing lines", () => {
  it("seeds a prepaid or limited tab, the one drinks figure that is known", () => {
    expect(eventDrinksBillingLines({ barOption: "bar_tab", tabAmount: 1800 }))
      .toEqual([{ description: "Bar tab", quantity: 1, unitAmount: 1800 }]);
    expect(eventDrinksBillingLines({ barOption: "bar_tab_then_cash", tabAmount: 1800 })[0].description)
      .toMatch(/limit/i);
  });

  it("seeds nothing on a cash bar — there is no bill to the client", () => {
    expect(eventDrinksBillingLines({ barOption: "cash_bar", tabAmount: 1800 })).toEqual([]);
  });

  it("stays blank rather than guessing a consumption bar bill", () => {
    // What the bar rang up is not something VenueFlow knows. A guess here would
    // be worse than an empty field the operator has to fill in.
    expect(eventDrinksBillingLines({ barOption: "bar_tab", tabAmount: null })).toEqual([]);
    expect(eventDrinksBillingLines({})).toEqual([]);
  });
});
