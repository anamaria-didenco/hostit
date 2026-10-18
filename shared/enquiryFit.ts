// The "Worth quoting?" checklist in the enquiry drawer (Option C): a quick,
// honest read on whether this enquiry is a good fit — date, capacity, budget
// and client history — each with a tone and a one-line reason. All real:
// capacity and minimum spend come from the matched event space, the budget
// bracket from the enquiry form, the date from the clash check.

import { BUDGET_RANGE_OPTIONS, budgetRangeLabel } from "./formFields";

export type FitTone = "green" | "amber" | "red" | "gray";
export type FitKey = "date" | "capacity" | "budget" | "client";

export interface FitItem {
  key: FitKey;
  label: string;
  /** bolded lead-in, e.g. "Free", "85 of 140 max", "First enquiry" */
  head: string;
  /** the rest of the sentence */
  text: string;
  tone: FitTone;
}

export interface FitSpace {
  name?: string | null;
  minCapacity?: number | null;
  maxCapacity?: number | null;
  minSpend?: number | null;
  minSpendWeekend?: number | null;
}

export interface FitLeadInput {
  guestCount?: number | null;
  budgetRange?: string | null;
  eventDate?: string | Date | null;
  dateFlexible?: boolean | null;
}

export interface FitContext {
  /** The date + space is already taken. */
  hasClash?: boolean;
  /** Fri/Sat — use the weekend minimum spend. */
  isWeekend?: boolean;
  /** Past events for this client; 0 / undefined = first enquiry. */
  returningCount?: number | null;
  /** Display name when no space row matched. */
  spaceLabel?: string | null;
}

function money(n: number): string {
  return `$${Math.round(n).toLocaleString("en-NZ")}`;
}

/** The numeric bounds for a budget bracket, or null if unknown. */
export function budgetBounds(range: string | null | undefined): { lo: number; hi: number | null } | null {
  const o = BUDGET_RANGE_OPTIONS.find((x) => x.value === range);
  return o ? { lo: o.lo, hi: o.hi } : null;
}

export function enquiryFit(lead: FitLeadInput, space: FitSpace | null, ctx: FitContext = {}): FitItem[] {
  const items: FitItem[] = [];
  const spaceName = space?.name ?? ctx.spaceLabel ?? "the space";
  const named = spaceName !== "the space";

  // ── Date ──────────────────────────────────────────────────────────────
  if (ctx.hasClash) {
    items.push({ key: "date", label: "Date", head: "Date clash", text: `Something else already holds ${named ? spaceName : "the space"} that day.`, tone: "red" });
  } else if (!lead.eventDate && lead.dateFlexible) {
    items.push({ key: "date", label: "Date", head: "Flexible", text: "No fixed date yet — offer what suits you.", tone: "amber" });
  } else if (!lead.eventDate) {
    items.push({ key: "date", label: "Date", head: "No date yet", text: "The enquiry didn't include a date.", tone: "amber" });
  } else {
    items.push({ key: "date", label: "Date", head: "Free", text: `Nothing else is booked for ${named ? spaceName : "the space"} that day.`, tone: "green" });
  }

  // ── Capacity ──────────────────────────────────────────────────────────
  const g = lead.guestCount ?? null;
  const hasCap = !!space && (space.minCapacity != null || space.maxCapacity != null);
  if (g == null) {
    items.push({ key: "capacity", label: "Capacity", head: "No guest count", text: "The enquiry didn't say how many people.", tone: "gray" });
  } else if (hasCap) {
    const max = space!.maxCapacity ?? Infinity;
    const min = space!.minCapacity ?? 0;
    if (g > max) {
      items.push({ key: "capacity", label: "Capacity", head: `${g} of ${space!.maxCapacity} max`, text: `Over what ${spaceName} seats — they'd likely want exclusive use.`, tone: "amber" });
    } else if (g < min) {
      items.push({ key: "capacity", label: "Capacity", head: `${g} guests`, text: `Under ${spaceName}'s usual minimum of ${min}.`, tone: "amber" });
    } else {
      items.push({ key: "capacity", label: "Capacity", head: space!.maxCapacity != null ? `${g} of ${space!.maxCapacity}` : `${g} guests`, text: `${spaceName} fits them comfortably.`, tone: "green" });
    }
  } else {
    items.push({ key: "capacity", label: "Capacity", head: `${g} guests`, text: named ? `In ${spaceName}.` : "No capacity set for this space yet.", tone: "gray" });
  }

  // ── Budget vs minimum spend ───────────────────────────────────────────
  const bounds = budgetBounds(lead.budgetRange);
  const minSpend = ctx.isWeekend ? (space?.minSpendWeekend ?? space?.minSpend ?? null) : (space?.minSpend ?? null);
  const bLabel = budgetRangeLabel(lead.budgetRange);
  if (!bounds) {
    items.push({ key: "budget", label: "Budget", head: "No budget given", text: "The enquiry didn't include a budget range.", tone: "gray" });
  } else if (minSpend == null) {
    items.push({ key: "budget", label: "Budget", head: bLabel ?? "Budget", text: "No minimum spend set for this space yet.", tone: "gray" });
  } else {
    const top = bounds.hi ?? bounds.lo;
    if (top >= minSpend) {
      items.push({ key: "budget", label: "Budget", head: `${bLabel} clears ${money(minSpend)}`, text: `Within the ${ctx.isWeekend ? "weekend " : ""}minimum spend.`, tone: "green" });
    } else {
      items.push({ key: "budget", label: "Budget", head: bLabel ?? "Budget", text: `Under the ${money(minSpend)} ${ctx.isWeekend ? "weekend " : ""}minimum — worth a conversation.`, tone: "amber" });
    }
  }

  // ── Client history ────────────────────────────────────────────────────
  const ret = ctx.returningCount ?? 0;
  if (ret > 0) {
    items.push({ key: "client", label: "Client", head: `Returning · ${ret} past ${ret === 1 ? "event" : "events"}`, text: "They've celebrated with you before.", tone: "green" });
  } else {
    items.push({ key: "client", label: "Client", head: "First enquiry", text: "New to you.", tone: "gray" });
  }

  return items;
}

/** How many items read as a clear "yes" (green) — for the "N of M look good" meta. */
export function fitOkCount(items: FitItem[]): number {
  return items.filter((i) => i.tone === "green").length;
}
