import { describe, expect, it } from "vitest";
import { clockStepIndex, dishQuantity, eventBillingSteps, isSevereDietary, stepClock } from "../shared/nowNext";

describe("Now & Next: which step is now", () => {
  const times = ["17:00", "17:30", "18:30", "20:15", "23:00"];
  it("is -1 before the first step starts", () => {
    expect(clockStepIndex(times, 16 * 60 + 45)).toBe(-1);
  });
  it("is the last step whose start time has passed", () => {
    expect(clockStepIndex(times, 18 * 60 + 40)).toBe(2);
    expect(clockStepIndex(times, 17 * 60 + 30)).toBe(1);
  });
  it("keeps counting forward past midnight", () => {
    const late = ["22:00", "23:30", "00:30", "01:15"];
    expect(stepClock(late)).toEqual([1320, 1410, 1470, 1515]);
    // 12:45 am on the same night: the 12:30 am step is on.
    expect(clockStepIndex(late, 45)).toBe(2);
  });
  it("gives untimed steps the time of the step before", () => {
    expect(stepClock(["18:00", "", "19:00"])).toEqual([1080, 1080, 1140]);
  });
});

describe("Now & Next: food quantities", () => {
  it("uses the entered quantity", () => {
    expect(dishQuantity(40, false, 35)).toBe(40);
  });
  it("falls back to the guest count when every row is ×1", () => {
    expect(dishQuantity(1, true, 35)).toBe(35);
  });
});

describe("Now & Next: allergies", () => {
  it("flags nut, shellfish and coeliac but not coconut", () => {
    expect(isSevereDietary({ name: "Nut allergy" })).toBe(true);
    expect(isSevereDietary({ name: "Shellfish", notes: "carries an EpiPen" })).toBe(true);
    expect(isSevereDietary({ name: "Coeliac" })).toBe(true);
    expect(isSevereDietary({ name: "No coconut" })).toBe(false);
    expect(isSevereDietary({ name: "Vegetarian" })).toBe(false);
  });
});

describe("Now & Next: billing steps", () => {
  it("matches the BEO's numbered steps", () => {
    const steps = eventBillingSteps({
      depositRequired: true, depositAmount: "575", depositPaid: false,
      billingFood: "invoiced_prior", billingDrinks: "invoiced_after", billingDepositApplied: "drinks",
      foodStatus: "paid", drinksStatus: null, barOption: "bar_tab", tabAmount: 2400, barNotes: "Warn Kylie at $2,000.",
      paymentNotes: "Balance due 21 Oct.",
    });
    expect(steps.map(s => s.title)).toEqual(["Deposit", "Food", "Drinks / bar", "Payment notes"]);
    expect(steps[0].body).toBe("$575.00 to secure the date. Deducted off the final drinks bill.");
    expect(steps[0].status).toEqual({ label: "Outstanding", settled: false });
    expect(steps[1].status).toEqual({ label: "Paid", settled: true });
    expect(steps[2].body).toContain("The $575.00 deposit comes off this total.");
    expect(steps[2].lines).toEqual(["Bar: Bar Tab · tab limit $2,400.00", "Warn Kylie at $2,000."]);
  });
  it("leaves the deposit out when none is required", () => {
    const steps = eventBillingSteps({ depositRequired: false, depositAmount: 500 });
    expect(steps[0].title).toBe("Food");
  });
});
