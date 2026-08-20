import { describe, it, expect } from "vitest";
import {
  FOOD_BILLING_OPTIONS,
  DRINKS_BILLING_OPTIONS,
  DEPOSIT_APPLIED_OPTIONS,
  foodBillingSentence,
  drinksBillingSentence,
  depositAppliedClause,
  depositComesOffDrinks,
} from "@shared/billingTerms";

/**
 * These sentences are printed on the BEO and read by floor staff to decide what
 * to charge on the night, so a wrong one is a money error rather than a typo.
 *
 * The bug this guards: the Food line was hardcoded to "Invoiced and paid before
 * the event. Do not charge food on the night." — it printed that even on events
 * where food WAS charged on the night, which is the exact opposite instruction.
 */

describe("billing terms — wording follows the selection", () => {
  it("says the opposite thing for the two opposite food arrangements", () => {
    const prior = foodBillingSentence("invoiced_prior");
    const onNight = foodBillingSentence("on_night");
    expect(prior).toMatch(/before the event/i);
    expect(prior).toMatch(/do not charge food on the night/i);
    expect(onNight).toMatch(/charged on the night/i);
    expect(onNight).not.toMatch(/do not charge/i);
  });

  it("distinguishes every drinks arrangement", () => {
    const sentences = DRINKS_BILLING_OPTIONS.map(o => o.sentence);
    expect(new Set(sentences).size).toBe(DRINKS_BILLING_OPTIONS.length);
    expect(drinksBillingSentence("cash_bar", {})).toMatch(/guests pay/i);
    expect(drinksBillingSentence("on_night", {})).toMatch(/settled on the night/i);
    expect(drinksBillingSentence("tab_then_cash", {})).toMatch(/until the limit/i);
  });

  it("falls back to the previous behaviour when nothing has been chosen", () => {
    // Existing events have no selection stored; they must read exactly as they
    // did before this feature, which means inferring from the bar arrangement
    // and then the payment status.
    expect(foodBillingSentence(null)).toBe(FOOD_BILLING_OPTIONS[0].sentence);
    expect(drinksBillingSentence(null, { barOption: "cash_bar" })).toMatch(/guests pay/i);
    expect(drinksBillingSentence(null, { barOption: "bar_tab_then_cash" })).toMatch(/until the limit/i);
    expect(drinksBillingSentence(null, { drinksStatus: "on_night" })).toMatch(/settled on the night/i);
    expect(drinksBillingSentence(null, {})).toMatch(/invoiced after the event/i);
    expect(depositAppliedClause(null)).toMatch(/drinks bill/i);
  });

  it("only claims the deposit reduces the bar bill when it actually does", () => {
    // The drinks line appends "The $X deposit comes off this total." That
    // sentence is only true when the deposit is applied to drinks; saying it
    // when the deposit comes off the food invoice would double-count it.
    expect(depositComesOffDrinks("drinks")).toBe(true);
    expect(depositComesOffDrinks(null)).toBe(true); // legacy default
    expect(depositComesOffDrinks("food")).toBe(false);
    expect(depositComesOffDrinks("total")).toBe(false);
    expect(depositComesOffDrinks("none")).toBe(false);
  });

  it("gives every option a distinct label and a non-empty sentence", () => {
    for (const list of [FOOD_BILLING_OPTIONS, DRINKS_BILLING_OPTIONS, DEPOSIT_APPLIED_OPTIONS]) {
      expect(new Set(list.map(o => o.value)).size).toBe(list.length);
      expect(new Set(list.map(o => o.label)).size).toBe(list.length);
      for (const o of list) expect(o.sentence.trim().length).toBeGreaterThan(0);
    }
  });

  it("accepts an unknown stored value without throwing", () => {
    // Defensive: a value written by a future version shouldn't break the BEO.
    expect(foodBillingSentence("something_else")).toBe(FOOD_BILLING_OPTIONS[0].sentence);
    expect(drinksBillingSentence("something_else", {})).toMatch(/invoiced after the event/i);
    expect(depositAppliedClause("something_else")).toMatch(/drinks bill/i);
  });
});
