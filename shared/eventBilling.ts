/**
 * The billable lines for an event — one computation, used by both the BEO's
 * cost summary and the Xero draft invoice.
 *
 * The Xero push modal used to open with every amount blank, so the operator
 * retyped figures the BEO had already worked out. Retyping is how an invoice
 * ends up disagreeing with the document the client was sent, so the invoice is
 * now seeded from exactly the same lines the BEO prints. Both call sites import
 * from here: if they ever diverge it is a code change, not a silent drift.
 *
 * Deliberately pure — no database, no formatting, no HTML — so it can be tested
 * directly and imported from the client, the server and the PDF renderer alike.
 */

export interface BillableLine {
  description: string;
  quantity: number;
  unitAmount: number;
}

export interface FnbLineInput {
  section?: string | null;
  course?: string | null;
  dishName?: string | null;
  qty?: number | string | null;
  unitPrice?: number | string | null;
}

export interface CostLineInput {
  label?: string | null;
  qty?: number | string | null;
  unitPrice?: number | string | null;
  category?: string | null;
}

const num = (v: unknown): number => {
  const n = typeof v === "string" ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Item names compared for the double-billing guard: trimmed, lowercased,
 *  whitespace collapsed. */
export function normBillName(s: unknown): string {
  return String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Cost-tab lines that belong on the CLIENT's bill. Other categories (AV, hire,
 *  styling) are the operator's own costs, kept for profitability but never
 *  auto-charged. */
export function isFoodBeverageCost(ci: CostLineInput): boolean {
  const c = String(ci.category ?? "").toLowerCase();
  return c.includes("food") || c.includes("beverage");
}

/**
 * Priced FOOD lines from the F&B sheet.
 *
 * Drinks are excluded — they bill on consumption. A food line whose name also
 * appears as a Costs-tab line is dropped: the operator entered the same item
 * twice and the Costs line is the authoritative charge, so counting both would
 * bill the client twice for one grazing table.
 */
export function fnbFoodLines(fnb: FnbLineInput[], costItems: CostLineInput[]): FnbLineInput[] {
  const costLabels = new Set((costItems ?? []).map(ci => normBillName(ci.label)).filter(Boolean));
  return (Array.isArray(fnb) ? fnb : []).filter(
    i =>
      i.section === "foh" &&
      (i.course ?? "") !== "Drinks" &&
      num(i.unitPrice) > 0 &&
      !costLabels.has(normBillName(i.dishName)),
  );
}

/** Every line that goes on the client's food bill, in the order the BEO prints
 *  them: priced F&B food first, then the F&B cost lines. */
export function eventFoodBillingLines(fnb: FnbLineInput[], costItems: CostLineInput[]): BillableLine[] {
  const food = fnbFoodLines(fnb, costItems).map(i => ({
    description: String(i.dishName ?? "Item").trim() || "Item",
    quantity: num(i.qty) || 1,
    unitAmount: num(i.unitPrice),
  }));
  const costs = (costItems ?? [])
    .filter(isFoodBeverageCost)
    .filter(ci => String(ci.label ?? "").trim() || num(ci.qty) * num(ci.unitPrice) > 0)
    .map(ci => ({
      description: String(ci.label ?? "Item").trim() || "Item",
      quantity: num(ci.qty) || 1,
      unitAmount: num(ci.unitPrice),
    }));
  return [...food, ...costs].filter(l => l.unitAmount !== 0);
}

/** What those lines add up to, in whatever GST treatment they were entered. */
export function billingLinesTotal(lines: BillableLine[]): number {
  const sum = (lines ?? []).reduce((s, l) => s + num(l.quantity) * num(l.unitAmount), 0);
  return Math.round(sum * 100) / 100;
}

/**
 * The drinks line, where the event has a figure worth seeding.
 *
 * A bar bill invoiced after the event is whatever the bar actually rang up, and
 * VenueFlow does not know that — seeding a guess would be worse than blank. The
 * one honest number is a prepaid or limited tab, so that is the only case that
 * produces a line.
 */
export function eventDrinksBillingLines(opts: {
  barOption?: string | null;
  tabAmount?: number | string | null;
}): BillableLine[] {
  const amt = num(opts.tabAmount);
  if (!(amt > 0)) return [];
  const opt = opts.barOption ?? "";
  if (opt === "cash_bar") return []; // guests pay their own — nothing to invoice
  const label = opt === "bar_tab_then_cash" ? "Bar tab (to the agreed limit)" : "Bar tab";
  return [{ description: label, quantity: 1, unitAmount: amt }];
}

export interface EventBalance {
  /** Priced F&B food + food/beverage cost lines, including GST. */
  itemisedInclGst: number;
  /** What the event is owed on: the larger of the booking total, the
   *  minimum spend and the itemised total. */
  contractTotal: number;
  /** Which of the three set contractTotal; "" when it's the itemised total. */
  basis: "" | "minimum spend" | "booking total";
  /** True when the paid deposit comes off this bill (applied to food or the
   *  total). Applied to drinks — the default — it comes off the bar bill. */
  depositOffThisBill: boolean;
  /** contractTotal less the deposit when it comes off this bill. */
  balance: number;
}

/**
 * The balance staff collect for an event. One rule for the run sheet PDF and
 * the runsheet screen, so the two never disagree. The bar tab is left out on
 * purpose: it's a ceiling, not money spent, and drinks are billed on
 * consumption on their own bill.
 */
export function eventBalance(o: {
  fnb: FnbLineInput[];
  costItems: CostLineInput[];
  gstInclusive?: boolean | null;
  bookingTotal?: number | string | null;
  minimumSpend?: number | string | null;
  depositAmount?: number | string | null;
  depositPaid?: boolean | null;
  depositApplied?: string | null;
}): EventBalance {
  const food = fnbFoodLines(o.fnb, o.costItems).reduce((s, i) => s + num(i.qty) * num(i.unitPrice), 0);
  const costs = (o.costItems ?? []).filter(isFoodBeverageCost).reduce((s, ci) => s + num(ci.qty) * num(ci.unitPrice), 0);
  const itemised = food + costs;
  const itemisedInclGst = o.gstInclusive ? itemised : itemised * 1.15;
  const bookingTotal = num(o.bookingTotal);
  const minimumSpend = num(o.minimumSpend);
  const contractTotal = Math.max(bookingTotal, minimumSpend, itemisedInclGst);
  const basis: EventBalance["basis"] = contractTotal <= 0 || (contractTotal === itemisedInclGst && itemisedInclGst > 0) ? ""
    : contractTotal === minimumSpend ? "minimum spend" : "booking total";
  const dep = num(o.depositAmount);
  const depositOffThisBill = dep > 0 && Boolean(o.depositPaid) && (o.depositApplied === "food" || o.depositApplied === "total");
  const balance = Math.round(Math.max(0, contractTotal - (depositOffThisBill ? dep : 0)) * 100) / 100;
  return { itemisedInclGst, contractTotal, basis, depositOffThisBill, balance };
}
