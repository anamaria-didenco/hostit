/**
 * How an event is billed — the options, and the exact sentence each one prints.
 *
 * Shared between the picker in the runsheet builder and the BEO renderer on the
 * server, so what you select is verbatim what floor staff read. The previous
 * version had this prose hardcoded in the BEO with no way to change it, which
 * meant the Food line told staff "do not charge food on the night" even on
 * events where food WAS charged on the night.
 *
 * Every list has a `null` fallback: an event that predates this feature keeps
 * the wording it had before, so nothing changes until someone picks something.
 */

export type BillingFood = "invoiced_prior" | "on_night" | "in_minimum" | "none";
export type BillingDrinks =
  | "invoiced_after"
  | "on_night"
  | "prepaid_tab"
  | "cash_bar"
  | "tab_then_cash";
export type BillingDepositApplied = "drinks" | "food" | "total" | "none";

export interface BillingOption<T extends string> {
  value: T;
  /** Short label for the dropdown. */
  label: string;
  /** The sentence printed on the BEO. Written as an instruction to staff. */
  sentence: string;
}

export const FOOD_BILLING_OPTIONS: BillingOption<BillingFood>[] = [
  {
    value: "invoiced_prior",
    label: "Invoiced & paid before the event",
    sentence: "Invoiced and paid before the event. Do not charge food on the night.",
  },
  {
    value: "on_night",
    label: "Charged on the night",
    sentence: "Food is charged on the night — put it through with the rest of the bill.",
  },
  {
    value: "in_minimum",
    label: "Included in the minimum spend",
    sentence: "Food counts towards the minimum spend. Do not invoice it separately.",
  },
  {
    value: "none",
    label: "No food for this event",
    sentence: "No food is being served for this event.",
  },
];

export const DRINKS_BILLING_OPTIONS: BillingOption<BillingDrinks>[] = [
  {
    value: "invoiced_after",
    label: "Invoiced after the event",
    sentence: "Bar bill is invoiced after the event.",
  },
  {
    value: "on_night",
    label: "Settled on the night",
    sentence: "Bar bill is settled on the night before the guests leave.",
  },
  {
    value: "prepaid_tab",
    label: "Prepaid bar tab",
    sentence: "The bar tab is prepaid — nothing further to collect on the night.",
  },
  {
    value: "cash_bar",
    label: "Cash bar — guests pay their own",
    sentence: "Cash bar. Guests pay for their own drinks; there is no bar bill to the client.",
  },
  {
    value: "tab_then_cash",
    label: "Tab, then cash bar at the limit",
    sentence:
      "Tab runs until the limit is reached, then the bar switches to cash and guests pay their own.",
  },
];

export const DEPOSIT_APPLIED_OPTIONS: BillingOption<BillingDepositApplied>[] = [
  { value: "drinks", label: "Comes off the drinks bill", sentence: "deducted off the final drinks bill" },
  { value: "food", label: "Comes off the food bill", sentence: "deducted off the food invoice" },
  { value: "total", label: "Comes off the total bill", sentence: "deducted off the final total" },
  { value: "none", label: "Non-refundable, not deducted", sentence: "non-refundable and not deducted from the final bill" },
];

function lookup<T extends string>(opts: BillingOption<T>[], v: string | null | undefined) {
  return opts.find(o => o.value === v);
}

/** The BEO sentence for the Food line, or the legacy wording when unset. */
export function foodBillingSentence(v: string | null | undefined): string {
  return lookup(FOOD_BILLING_OPTIONS, v)?.sentence ?? FOOD_BILLING_OPTIONS[0].sentence;
}

/**
 * The BEO sentence for the Drinks line.
 *
 * When nothing has been chosen, fall back to what the old code inferred: the
 * bar arrangement first, then the payment status.
 */
export function drinksBillingSentence(
  v: string | null | undefined,
  fallback: { barOption?: string | null; drinksStatus?: string | null },
): string {
  const chosen = lookup(DRINKS_BILLING_OPTIONS, v);
  if (chosen) return chosen.sentence;
  if (fallback.barOption === "cash_bar") return lookup(DRINKS_BILLING_OPTIONS, "cash_bar")!.sentence;
  if (fallback.barOption === "bar_tab_then_cash") return lookup(DRINKS_BILLING_OPTIONS, "tab_then_cash")!.sentence;
  if (fallback.drinksStatus === "on_night") return lookup(DRINKS_BILLING_OPTIONS, "on_night")!.sentence;
  return lookup(DRINKS_BILLING_OPTIONS, "invoiced_after")!.sentence;
}

/** The clause describing what the deposit comes off, or the legacy wording. */
export function depositAppliedClause(v: string | null | undefined): string {
  return lookup(DEPOSIT_APPLIED_OPTIONS, v)?.sentence ?? DEPOSIT_APPLIED_OPTIONS[0].sentence;
}

/**
 * Whether the deposit reduces the drinks bill, which the Drinks line mentions.
 * Only true when the deposit is actually applied there.
 */
export function depositComesOffDrinks(v: string | null | undefined): boolean {
  return (v ?? "drinks") === "drinks";
}
