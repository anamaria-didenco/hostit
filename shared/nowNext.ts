// Pure logic behind the staff "Now & Next" phone view: which run-of-day step
// is happening now, how many of each dish, which dietaries are dangerous, and
// the billing steps in the same words the BEO prints.
import {
  foodBillingSentence,
  drinksBillingSentence,
  depositAppliedClause,
  depositComesOffDrinks,
  billingStageLabel,
  type BillingStage,
} from "./billingTerms";

// ── Run of day ─────────────────────────────────────────────────────────────

/** "18:30" → 1110. Null when the step has no usable time. */
export function toMinutes(t: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Minutes for each step on one running clock, so a night that runs past
 * midnight (11:00 PM, then 12:30 AM) keeps going forward instead of jumping
 * back to the start of the day. Untimed steps inherit the step before.
 */
export function stepClock(times: Array<string | null | undefined>): number[] {
  const out: number[] = [];
  let prev = -1;
  let dayOffset = 0;
  for (const t of times) {
    const raw = toMinutes(t);
    if (raw === null) { out.push(Math.max(prev, 0)); continue; }
    let v = raw + dayOffset;
    // A drop of more than six hours is the clock passing midnight.
    if (prev >= 0 && v < prev - 360) { dayOffset += 1440; v += 1440; }
    out.push(v);
    prev = v;
  }
  return out;
}

/**
 * The step happening now: the last one whose start time has passed. -1 before
 * the first step starts. `nowMin` is minutes since midnight on the device; in
 * the small hours after a late night it counts as the same evening.
 */
export function clockStepIndex(times: Array<string | null | undefined>, nowMin: number): number {
  const clock = stepClock(times);
  if (clock.length === 0) return -1;
  let now = nowMin;
  if (clock[clock.length - 1] >= 1440 && nowMin < clock[0] - 360) now += 1440;
  let idx = -1;
  clock.forEach((m, i) => { if (m <= now) idx = i; });
  return idx;
}

// ── Food ───────────────────────────────────────────────────────────────────

/**
 * How many of a dish to make. Matches the BEO: the entered quantity, unless
 * nothing on the sheet has a real quantity (every row ×1), in which case the
 * guest count is the portion count.
 */
export function dishQuantity(qty: unknown, allQtyOne: boolean, guestCount: unknown): number {
  const n = Number(qty);
  if (n > 0 && !allQtyOne) return n;
  return Number(guestCount) || (n > 0 ? n : 0);
}

// ── Dietaries ──────────────────────────────────────────────────────────────

// Same rule as the BEO. \bnuts?\b matches "nut"/"nut allergy"/"tree nut" but
// not coconut / butternut / nutmeg.
const SEVERE_RE = /allerg|anaphyla|\bnuts?\b|pregnan|coeliac|celiac|epipen|severe/i;
export function isSevereDietary(d: { name?: string | null; notes?: string | null }): boolean {
  return SEVERE_RE.test(d.name || "") || SEVERE_RE.test(d.notes || "");
}

// ── Billing ────────────────────────────────────────────────────────────────

export interface BillingStep {
  title: string;
  body: string;
  status?: BillingStage;
  /** Extra lines under the body (bar arrangement, bar notes). */
  lines?: string[];
}

const BAR_LABELS: Record<string, string> = {
  bar_tab: "Bar Tab",
  cash_bar: "Cash Bar",
  bar_tab_then_cash: "Bar Tab then Cash Bar",
  unlimited: "Unlimited Bar Tab",
};

function money(v: number): string {
  return `$${v.toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * "How this event is billed": the numbered steps printed on the BEO (deposit,
 * food, drinks / bar, any custom term, payment notes), as plain data.
 */
export function eventBillingSteps(o: {
  depositRequired?: boolean | null;
  depositAmount?: number | string | null;
  depositPaid?: boolean | null;
  billingFood?: string | null;
  billingDrinks?: string | null;
  billingDepositApplied?: string | null;
  billingNote?: string | null;
  foodStatus?: string | null;
  drinksStatus?: string | null;
  barOption?: string | null;
  tabAmount?: number | string | null;
  barNotes?: string | null;
  paymentNotes?: string | null;
}): BillingStep[] {
  const steps: BillingStep[] = [];
  const depAmt = Number(o.depositAmount ?? 0) || 0;
  const depositRequired = o.depositRequired !== false;
  if (depositRequired && depAmt > 0) {
    steps.push({
      title: "Deposit",
      body: `${money(depAmt)} to secure the date. ${capitalise(depositAppliedClause(o.billingDepositApplied))}.`,
      status: o.depositPaid ? { label: "Received", settled: true } : { label: "Outstanding", settled: false },
    });
  }
  steps.push({
    title: "Food",
    body: foodBillingSentence(o.billingFood),
    status: billingStageLabel("food", o.foodStatus || "to_invoice", o.billingFood),
  });
  const barOpt = o.barOption || null;
  const drinksState = o.drinksStatus
    ?? ((barOpt === "cash_bar" || barOpt === "bar_tab_then_cash") ? "on_night" : "to_invoice");
  const tab = Number(o.tabAmount ?? 0) || 0;
  const barBits = [barOpt ? (BAR_LABELS[barOpt] ?? barOpt) : "", tab > 0 ? `tab limit ${money(tab)}` : ""]
    .filter(Boolean).join(" · ");
  const lines: string[] = [];
  if (barBits) lines.push(`Bar: ${barBits}`);
  if ((o.barNotes ?? "").trim()) lines.push(o.barNotes!.trim());
  steps.push({
    title: "Drinks / bar",
    body: drinksBillingSentence(o.billingDrinks, { barOption: barOpt, drinksStatus: drinksState })
      + (depAmt > 0 && depositRequired && depositComesOffDrinks(o.billingDepositApplied)
        ? ` The ${money(depAmt)} deposit comes off this total.` : ""),
    status: billingStageLabel("drinks", drinksState, o.billingDrinks),
    lines: lines.length ? lines : undefined,
  });
  if ((o.billingNote ?? "").trim()) steps.push({ title: "Also for this event", body: o.billingNote!.trim() });
  if ((o.paymentNotes ?? "").trim()) steps.push({ title: "Payment notes", body: o.paymentNotes!.trim() });
  return steps;
}

function capitalise(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}
