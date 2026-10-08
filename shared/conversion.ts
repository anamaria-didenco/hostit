/**
 * The ONE definition of "how many enquiries turned into events".
 *
 * Every conversion figure in the app — the dashboard tile, the Reports page,
 * the Analytics page and the weekly report email — is computed from these
 * pure functions, so they can never disagree again. (They used to: Reports
 * divided booked-only leads by every lead, the dashboard divided won leads by
 * every lead including half-finished form autosaves, and neither looked at
 * when the enquiry arrived.)
 *
 * The rules:
 *  - A REAL ENQUIRY is a lead someone actually sent us. Not a half-finished
 *    form autosave (PARTIAL_LEAD_NOTE), not a synthetic healthcheck ping, and
 *    not a booking imported from NowBookIt's table diary.
 *  - An enquiry is WON when its status is a booked-like status, or a live
 *    (not cancelled) booking was created from it (bookings.leadId).
 *  - It is LOST when its status is lost/cancelled and it isn't won.
 *  - Anything else is still OPEN.
 *  - Conversion is a COHORT measure: of the enquiries RECEIVED in a period,
 *    how many are won now. Recent periods naturally have more still open, so
 *    "still open" is always reported beside the rate rather than hidden in it.
 *
 * Pure (no DB, no Date.now()) so it runs on the server, in the client and in
 * unit tests alike.
 */
import { PARTIAL_LEAD_NOTE } from "./leadConstants";
import { BUDGET_RANGE_OPTIONS } from "./formFields";

// ─── Shapes (structural, so drizzle rows and test fixtures both fit) ─────────
type When = Date | string | number | null | undefined;

export type ConvLead = {
  id: number;
  status: string | null;
  source?: string | null;
  internalNotes?: string | null;
  createdAt: When;
  eventType?: string | null;
  eventDate?: When;
  utmSource?: string | null;
  utmCampaign?: string | null;
  budgetRange?: string | null;
  budget?: string | number | null;
};
export type ConvBooking = {
  id: number;
  leadId: number | null;
  status: string | null;
  totalNzd?: string | number | null;
  eventType?: string | null;
  email?: string | null;
  createdAt?: When;
};
export type ConvProposal = {
  id: number;
  leadId: number;
  status: string | null;
  totalNzd?: string | number | null;
  sentAt?: When;
  viewedAt?: When;
  respondedAt?: When;
  createdAt?: When;
};
export type ConvActivity = {
  leadId: number;
  type: string;
  content?: string | null;
  createdAt: When;
};
export type Range = { start: Date; end: Date };

// ─── Statuses ────────────────────────────────────────────────────────────────
/** Lead statuses that mean "this became an event". 'booked' is the lead key
 *  (shown as "Confirmed"); 'confirmed'/'finished' are the booking names that
 *  some code paths also write onto the lead. */
export const WON_LEAD_STATUSES = ["booked", "confirmed", "finished"] as const;
export const LOST_LEAD_STATUSES = ["lost", "cancelled"] as const;

/** eventType nbiWebhook.ts writes on bookings made directly in NowBookIt. */
export const NBI_IMPORT_EVENT_TYPE = "Booking (from NowBookIt)";

const ms = (d: When): number | null => {
  if (d == null || d === "") return null;
  const t = d instanceof Date ? d.getTime() : new Date(d).getTime();
  return Number.isFinite(t) ? t : null;
};
const num = (v: string | number | null | undefined): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

// ─── What counts ─────────────────────────────────────────────────────────────
/** True for a lead that arrived from NowBookIt rather than as an enquiry. */
export function isNowBookItSource(source: string | null | undefined): boolean {
  return /now\s*book\s*it|^nbi\b/i.test(source ?? "");
}

/** A lead a real person actually sent (see the rules at the top). */
export function isRealEnquiry(lead: Pick<ConvLead, "source" | "internalNotes">): boolean {
  if ((lead.source ?? "") === "healthcheck") return false;
  if (lead.internalNotes === PARTIAL_LEAD_NOTE) return false;
  if (isNowBookItSource(lead.source)) return false;
  return true;
}

/** A booking pulled in from NowBookIt's diary (a table booking, not an event
 *  that came through the enquiry pipeline). */
export function isImportedBooking(b: Pick<ConvBooking, "leadId" | "eventType" | "email">): boolean {
  if (b.leadId != null) return false;
  if (b.eventType === NBI_IMPORT_EVENT_TYPE) return true;
  return /^nbi-.*@unknown\.local$/i.test(b.email ?? "");
}

/** A booking that is still going ahead (or has happened). */
export function isLiveBooking(b: Pick<ConvBooking, "status">): boolean {
  return (b.status ?? "") !== "cancelled";
}

/** Lead ids that have a live booking created from them. */
export function bookedLeadIds(bookings: ConvBooking[]): Set<number> {
  const s = new Set<number>();
  for (const b of bookings) if (b.leadId != null && isLiveBooking(b)) s.add(b.leadId);
  return s;
}

export type Outcome = "won" | "lost" | "open";

export function leadOutcome(lead: Pick<ConvLead, "id" | "status">, booked: Set<number>): Outcome {
  const st = (lead.status ?? "").toLowerCase();
  if ((WON_LEAD_STATUSES as readonly string[]).includes(st) || booked.has(lead.id)) return "won";
  if ((LOST_LEAD_STATUSES as readonly string[]).includes(st)) return "lost";
  return "open";
}

export function inRange(d: When, r: Range): boolean {
  const t = ms(d);
  return t != null && t >= r.start.getTime() && t <= r.end.getTime();
}

/** Real enquiries received inside the range — the cohort every rate is "of". */
export function enquiryCohort<L extends ConvLead>(leads: L[], range: Range): L[] {
  return leads.filter(l => isRealEnquiry(l) && inRange(l.createdAt, range));
}

/** Value of a won lead: the total of its live bookings (bookings.totalNzd). */
export function wonValueByLead(bookings: ConvBooking[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const b of bookings) {
    if (b.leadId == null || !isLiveBooking(b)) continue;
    m.set(b.leadId, (m.get(b.leadId) ?? 0) + num(b.totalNzd));
  }
  return m;
}

export type ConversionTally = {
  enquiries: number;
  won: number;
  lost: number;
  open: number;
  /** won ÷ enquiries as a whole percentage; null when there were none. */
  rate: number | null;
  /** Sum of booking totals for the won enquiries (NZD). */
  wonValue: number;
};

export function pct(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 100) : null;
}

/** Tally an already-chosen cohort of real enquiries. */
export function tally(cohort: ConvLead[], bookings: ConvBooking[]): ConversionTally {
  const booked = bookedLeadIds(bookings);
  const values = wonValueByLead(bookings);
  let won = 0, lost = 0, open = 0, wonValue = 0;
  for (const l of cohort) {
    const o = leadOutcome(l, booked);
    if (o === "won") { won++; wonValue += values.get(l.id) ?? 0; }
    else if (o === "lost") lost++;
    else open++;
  }
  return { enquiries: cohort.length, won, lost, open, rate: pct(won, cohort.length), wonValue };
}

/** The headline: of the real enquiries received in `range`, how many are won. */
export function cohortConversion(leads: ConvLead[], bookings: ConvBooking[], range: Range): ConversionTally {
  return tally(enquiryCohort(leads, range), bookings);
}

export type BreakdownRow = ConversionTally & { key: string };

/** Conversion split by any attribute of the lead (source, UTM, event type…).
 *  Sorted by enquiries, then won. Blank keys are grouped under `blankLabel`. */
export function conversionBy(
  cohort: ConvLead[],
  bookings: ConvBooking[],
  keyOf: (l: ConvLead) => string | null | undefined,
  blankLabel = "(none)",
): BreakdownRow[] {
  const groups = new Map<string, ConvLead[]>();
  for (const l of cohort) {
    const k = (keyOf(l) ?? "").toString().trim() || blankLabel;
    const g = groups.get(k);
    if (g) g.push(l); else groups.set(k, [l]);
  }
  return Array.from(groups, ([key, ls]) => ({ key, ...tally(ls, bookings) }))
    .sort((a, b) => b.enquiries - a.enquiries || b.won - a.won || a.key.localeCompare(b.key));
}

// ─── Response time ───────────────────────────────────────────────────────────
/** Activity that means the venue answered the enquiry. */
const RESPONSE_TYPES = new Set(["email", "status_change", "proposal_sent", "call"]);

/**
 * Time to first reply per lead, in ms. Kept behind this one function so it can
 * switch to the `leads.firstResponseAt` column once that lands: a lead row
 * that already carries `firstResponseAt` is used as-is; otherwise the first
 * outbound email, call, proposal or status change after the lead was created
 * is taken from `lead_activity`. Leads with no reply yet are absent.
 */
export function firstResponseTimes(
  leads: Array<ConvLead & { firstResponseAt?: When }>,
  activities: ConvActivity[],
): Map<number, number> {
  const out = new Map<number, number>();
  const created = new Map<number, number>();
  for (const l of leads) {
    const c = ms(l.createdAt);
    if (c == null) continue;
    const col = ms(l.firstResponseAt);
    if (col != null) { out.set(l.id, Math.max(0, col - c)); continue; }
    created.set(l.id, c);
  }
  for (const a of activities) {
    const c = created.get(a.leadId);
    if (c == null || !RESPONSE_TYPES.has(a.type)) continue;
    const t = ms(a.createdAt);
    if (t == null || t < c) continue;
    const prev = out.get(a.leadId);
    if (prev == null || t - c < prev) out.set(a.leadId, t - c);
  }
  return out;
}

// ─── Funnel ──────────────────────────────────────────────────────────────────
export const FUNNEL_STAGES = [
  { key: "enquiries", label: "Enquiries" },
  { key: "replied", label: "Replied" },
  { key: "proposal_sent", label: "Proposal sent" },
  { key: "proposal_viewed", label: "Proposal viewed" },
  { key: "accepted", label: "Accepted" },
  { key: "booked", label: "Booked" },
] as const;
export type FunnelStageKey = typeof FUNNEL_STAGES[number]["key"];
export type FunnelStage = { key: FunnelStageKey; label: string; count: number; pct: number | null };

const SENT_STATUSES = ["sent", "viewed", "accepted", "declined"];
const proposalWasSent = (p: ConvProposal) => ms(p.sentAt) != null || SENT_STATUSES.includes(p.status ?? "");
// Accepting or declining happens on the client's proposal page, so it implies a view.
const proposalWasViewed = (p: ConvProposal) => ms(p.viewedAt) != null || ["viewed", "accepted", "declined"].includes(p.status ?? "");

/**
 * How far each enquiry in the cohort got. Each stage is counted on its own
 * evidence, so "Booked" can be higher than "Accepted" — plenty of events are
 * confirmed by phone or email without an online proposal. "Replied" also
 * counts any enquiry that got a proposal or was booked, since both need a reply.
 */
export function conversionFunnel(
  cohort: ConvLead[],
  proposals: ConvProposal[],
  activities: ConvActivity[],
  bookings: ConvBooking[],
): FunnelStage[] {
  const ids = new Set(cohort.map(l => l.id));
  const byLead = new Map<number, ConvProposal[]>();
  for (const p of proposals) {
    if (!ids.has(p.leadId)) continue;
    const g = byLead.get(p.leadId);
    if (g) g.push(p); else byLead.set(p.leadId, [p]);
  }
  const replies = firstResponseTimes(cohort, activities);
  const booked = bookedLeadIds(bookings);
  const counts: Record<FunnelStageKey, number> = {
    enquiries: cohort.length, replied: 0, proposal_sent: 0, proposal_viewed: 0, accepted: 0, booked: 0,
  };
  for (const l of cohort) {
    const ps = byLead.get(l.id) ?? [];
    const sent = ps.some(proposalWasSent);
    const won = leadOutcome(l, booked) === "won";
    if (replies.has(l.id) || sent || won) counts.replied++;
    if (sent) counts.proposal_sent++;
    if (ps.some(proposalWasViewed)) counts.proposal_viewed++;
    if (ps.some(p => p.status === "accepted")) counts.accepted++;
    if (won) counts.booked++;
  }
  return FUNNEL_STAGES.map(s => ({ key: s.key, label: s.label, count: counts[s.key], pct: pct(counts[s.key], cohort.length) }));
}

// ─── Time to book ────────────────────────────────────────────────────────────
const WON_STATUS_RE = new RegExp(`changed to (${WON_LEAD_STATUSES.join("|")})\\b`, "i");

/**
 * When each won lead was booked: the earliest of its first live booking being
 * created, a proposal being accepted, or a status change to a booked-like
 * status. Won leads with no dated evidence are left out rather than guessed.
 */
export function bookedAtByLead(
  wonLeads: ConvLead[],
  bookings: ConvBooking[],
  proposals: ConvProposal[],
  activities: ConvActivity[],
): Map<number, number> {
  const ids = new Set(wonLeads.map(l => l.id));
  const out = new Map<number, number>();
  const take = (id: number, t: number | null) => {
    if (t == null || !ids.has(id)) return;
    const prev = out.get(id);
    if (prev == null || t < prev) out.set(id, t);
  };
  for (const b of bookings) if (b.leadId != null && isLiveBooking(b)) take(b.leadId, ms(b.createdAt));
  for (const p of proposals) if (p.status === "accepted") take(p.leadId, ms(p.respondedAt));
  for (const a of activities) if (a.type === "booking_created" || (a.type === "status_change" && WON_STATUS_RE.test(a.content ?? ""))) take(a.leadId, ms(a.createdAt));
  return out;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Median days from enquiry to booked, for the won enquiries in the cohort. */
export function timeToBook(
  cohort: ConvLead[],
  bookings: ConvBooking[],
  proposals: ConvProposal[],
  activities: ConvActivity[],
): { medianDays: number | null; count: number } {
  const booked = bookedLeadIds(bookings);
  const won = cohort.filter(l => leadOutcome(l, booked) === "won");
  const at = bookedAtByLead(won, bookings, proposals, activities);
  const days: number[] = [];
  for (const l of won) {
    const c = ms(l.createdAt), b = at.get(l.id);
    if (c == null || b == null) continue;
    days.push(Math.max(0, b - c) / DAY_MS);
  }
  const m = median(days);
  return { medianDays: m == null ? null : Math.round(m * 10) / 10, count: days.length };
}

// ─── Pipeline value (an ESTIMATE) ────────────────────────────────────────────
export type ValueBasis = "proposal" | "budget_range" | "budget" | null;

/** Midpoint of a budget bracket. The open-ended top bracket counts at its
 *  floor ($20k+ → $20k) so the estimate errs low rather than high. */
export function budgetRangeMidpoint(range: string | null | undefined): number | null {
  const o = BUDGET_RANGE_OPTIONS.find(b => b.value === range);
  if (!o) return null;
  return o.hi == null ? o.lo : (o.lo + o.hi) / 2;
}

/** Best guess at what an open enquiry is worth: its latest live proposal's
 *  total, else the middle of the budget bracket they picked, else the old
 *  free-number budget. */
export function estimateLeadValue(lead: ConvLead, proposals: ConvProposal[]): { value: number | null; basis: ValueBasis } {
  const live = proposals
    .filter(p => p.leadId === lead.id && !["declined", "expired"].includes(p.status ?? "") && num(p.totalNzd) > 0)
    .sort((a, b) => (ms(b.createdAt) ?? 0) - (ms(a.createdAt) ?? 0));
  if (live.length) return { value: num(live[0].totalNzd), basis: "proposal" };
  const mid = budgetRangeMidpoint(lead.budgetRange);
  if (mid != null) return { value: mid, basis: "budget_range" };
  if (num(lead.budget) > 0) return { value: num(lead.budget), basis: "budget" };
  return { value: null, basis: null };
}

export type PipelineStageRow = { status: string; count: number; value: number; unvalued: number };

/**
 * Open enquiries grouped by their current stage, with an estimated value.
 * Leaves out enquiries whose event date has already passed (`now`): those
 * can't be won any more, they just haven't been tidied up.
 */
export function pipelineByStage(
  leads: ConvLead[],
  bookings: ConvBooking[],
  proposals: ConvProposal[],
  now: number,
): { stages: PipelineStageRow[]; total: number; count: number; unvalued: number; byBasis: Record<"proposal" | "budget_range" | "budget", number> } {
  const booked = bookedLeadIds(bookings);
  const map = new Map<string, PipelineStageRow>();
  const byBasis = { proposal: 0, budget_range: 0, budget: 0 };
  let total = 0, count = 0, unvalued = 0;
  for (const l of leads) {
    if (!isRealEnquiry(l) || leadOutcome(l, booked) !== "open") continue;
    const ev = ms(l.eventDate);
    if (ev != null && ev < now - DAY_MS) continue;
    const st = l.status || "new";
    const row = map.get(st) ?? { status: st, count: 0, value: 0, unvalued: 0 };
    const est = estimateLeadValue(l, proposals);
    row.count++; count++;
    if (est.value == null) { row.unvalued++; unvalued++; }
    else { row.value += est.value; total += est.value; if (est.basis) byBasis[est.basis]++; }
    map.set(st, row);
  }
  return { stages: Array.from(map.values()), total, count, unvalued, byBasis };
}

// ─── NZ calendar helpers ─────────────────────────────────────────────────────
/** YYYY-MM-DD of an instant as the calendar reads in `tz` (server may be UTC). */
export function dayKeyInTz(instant: When, tz: string): string {
  const t = ms(instant) ?? 0;
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(t));
}

/** Add whole calendar days to a YYYY-MM-DD string. */
export function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** First day of the month `back` months before the month of `ymd`. */
export function monthStart(ymd: string, back = 0): string {
  const [y, m] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 - back, 1));
  return dt.toISOString().slice(0, 10);
}

/** Monday of the week containing `ymd`. */
export function weekStart(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sun
  return addDays(ymd, -((dow + 6) % 7));
}

export type Bucket = { key: string; label: string; enquiries: number; won: number };

/**
 * Chart buckets across [fromYmd, toYmd] in the venue's calendar: weeks for a
 * range of five weeks or less, months otherwise. Each enquiry lands in the
 * bucket of the NZ day it arrived, and "won" counts that bucket's enquiries
 * that are won now (the same cohort rule as the headline).
 */
export function cohortBuckets(
  cohort: ConvLead[],
  bookings: ConvBooking[],
  fromYmd: string,
  toYmd: string,
  tz: string,
): { unit: "week" | "month"; buckets: Bucket[] } {
  const spanDays = Math.round((Date.parse(toYmd) - Date.parse(fromYmd)) / DAY_MS) + 1;
  const unit: "week" | "month" = spanDays <= 35 ? "week" : "month";
  const keyOf = (ymd: string) => (unit === "week" ? weekStart(ymd) : ymd.slice(0, 7));
  const fmtDay = (ymd: string) => {
    const [y, m, d] = ymd.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-NZ", { day: "numeric", month: "short", timeZone: "UTC" });
  };
  const fmtMonth = (ym: string) => {
    const [y, m] = ym.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-NZ", { month: "short", year: "2-digit", timeZone: "UTC" });
  };
  const buckets: Bucket[] = [];
  const index = new Map<string, Bucket>();
  let cur = unit === "week" ? weekStart(fromYmd) : fromYmd.slice(0, 7) + "-01";
  while (cur <= toYmd) {
    const key = keyOf(cur);
    const b: Bucket = { key, label: unit === "week" ? `w/c ${fmtDay(key)}` : fmtMonth(key), enquiries: 0, won: 0 };
    buckets.push(b); index.set(key, b);
    cur = unit === "week" ? addDays(cur, 7) : monthStart(addDays(cur, 32));
  }
  const booked = bookedLeadIds(bookings);
  for (const l of cohort) {
    const b = index.get(keyOf(dayKeyInTz(l.createdAt, tz)));
    if (!b) continue;
    b.enquiries++;
    if (leadOutcome(l, booked) === "won") b.won++;
  }
  return { unit, buckets };
}

export type PeriodPreset = "month" | "3m" | "12m";

/** NZ-calendar start/end dates for a preset, ending today (`todayYmd`). */
export function presetRange(preset: PeriodPreset, todayYmd: string): { from: string; to: string } {
  const back = preset === "month" ? 0 : preset === "3m" ? 2 : 11;
  return { from: monthStart(todayYmd, back), to: todayYmd };
}
