/**
 * The Enquiries list: its six views, its filters, its sort orders and how they
 * are written to the URL. Pure (no React), so the list, the Overview tiles, the
 * sidebar badge and the tests all count from one place.
 *
 * Everything is built on enquirySignal (shared/enquirySignal.ts): no new
 * business rules live here. Every date rule uses venue days (the venue's time
 * zone), so "this month" means the venue's month wherever the browser is.
 */
import { enquirySignal, type EnquirySignal, type SignalTone } from "./enquirySignal";
import { CLOSED_LEAD_STATUSES, leadDatePassed } from "./followUp";
import { leadMatchesSearch } from "./leadSearch";
import { DEFAULT_VENUE_TZ, isDateOnly } from "./eventDate";
import { LOST_REASONS, lostReasonLabel } from "./lostReasons";
import { BUDGET_RANGE_OPTIONS } from "./formFields";
import { clientFlagLabels, type ClientFlag } from "./clientMatch";

// ── Types ───────────────────────────────────────────────────────────────────

export type EnquiryView = "reply" | "followup" | "open" | "confirmed" | "closed" | "all";
export type SortKey = "urgent" | "event" | "came" | "status" | "guests" | "name" | "space";
export interface ListSort { key: SortKey; dir: "asc" | "desc" }

export type NeedsKind = "reply" | "overdue" | "quiet" | "hold" | "clash" | "partial" | "passed" | "none";
export type DatePreset = "upcoming" | "today" | "this_week" | "weekend" | "next_30" | "this_month" | "next_month" | "past" | "none";
export type CamePreset = "last_7" | "last_30" | "this_month" | "this_year" | "last_year";
/** A preset, a calendar month (YYYY-MM), or an inclusive range of days (YYYY-MM-DD, either side optional). */
export type DateFilter<P extends string> = { preset: P } | { month: string } | { from?: string; to?: string } | null;
export type GuestBand = "lt20" | "20_49" | "50_99" | "100p";
export type BudgetKey = "under_5k" | "5_10k" | "10_20k" | "20k_plus" | "none";
export type ClientKind = "returning" | "duplicate";

export interface EnquiryFilters {
  status: string[];
  date: DateFilter<DatePreset>;
  space: (number | "none")[];
  source: string[];
  owner: "all" | "unassigned" | number;
  needs: NeedsKind[];
  type: string[];
  guests: GuestBand[];
  budget: string[];
  came: DateFilter<CamePreset>;
  lostReason: string[];
  client: ClientKind[];
}

export const EMPTY_FILTERS: EnquiryFilters = Object.freeze({
  status: [], date: null, space: [], source: [], owner: "all", needs: [], type: [],
  guests: [], budget: [], came: null, lostReason: [], client: [],
}) as EnquiryFilters;

export interface ListState {
  view: EnquiryView;
  filters: EnquiryFilters;
  q: string;
  sort: ListSort;
  /**
   * While searching, the list searches every enquiry (All) unless a tab was
   * clicked during the search: then it narrows to that tab (`view`), and that
   * tab is kept when the search is cleared.
   */
  searchIn?: boolean;
}

/** A lead as the list sees it: the leads.list row (only the fields used are named). */
export type LeadLike = {
  id: number;
  status?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  eventType?: string | null;
  eventDate?: Date | string | null;
  dateFlexible?: boolean | number | null;
  guestCount?: number | null;
  spaceId?: number | null;
  spaceName?: string | null;
  source?: string | null;
  assignedTo?: number | null;
  budget?: string | number | null;
  budgetRange?: string | null;
  lostReason?: string | null;
  createdAt?: Date | string | null;
  followUpDate?: Date | string | null;
  holdUntil?: Date | string | null;
  clientFlag?: ClientFlag | null;
  [key: string]: unknown;
};

export interface ListRow {
  lead: LeadLike;
  signal: EnquirySignal;
  /** The event's day in the venue's zone ("2026-11-17"), "" when there is no date. */
  eventDay: string;
  /** The day the enquiry came in, in the venue's zone. */
  cameDay: string;
  /** Its date and space are already taken (shown whatever the signal says). */
  clash?: boolean;
}

export interface ListCtx {
  nowMs: number;
  tz: string;
  /** The venue's status keys in pipeline order. */
  statusOrder: string[];
  /** Space id → name, for the spaceName fallback and the Space sort. */
  spaceNames?: Map<number, string>;
}

export type ReplyStatusMap = Map<number, { direction: string; at: Date | string | number }>;

// ── Labels and options ─────────────────────────────────────────────────────

export const VIEWS: readonly { id: EnquiryView; label: string; short: string; empty: string; defaultSort: ListSort }[] = [
  { id: "reply", label: "Needs reply", short: "Needs reply", empty: "Nobody is waiting on a reply.", defaultSort: { key: "urgent", dir: "asc" } },
  { id: "followup", label: "Follow-up due", short: "Follow-up", empty: "No follow-ups due. Everyone's been looked after.", defaultSort: { key: "urgent", dir: "asc" } },
  { id: "open", label: "Open", short: "Open", empty: "No open enquiries.", defaultSort: { key: "urgent", dir: "asc" } },
  { id: "confirmed", label: "Confirmed", short: "Confirmed", empty: "Nothing confirmed yet.", defaultSort: { key: "event", dir: "asc" } },
  { id: "closed", label: "Closed", short: "Closed", empty: "Nothing closed yet.", defaultSort: { key: "event", dir: "desc" } },
  { id: "all", label: "All", short: "All", empty: "No enquiries yet.", defaultSort: { key: "urgent", dir: "asc" } },
];
const VIEW_IDS = VIEWS.map(v => v.id);
export const viewInfo = (v: EnquiryView) => VIEWS.find(x => x.id === v) ?? VIEWS[0];
export const viewDefaultSort = (v: EnquiryView): ListSort => ({ ...viewInfo(v).defaultSort });

/** Which way each sort key runs when first picked. */
export const SORT_DEFAULT_DIR: Record<SortKey, "asc" | "desc"> = {
  urgent: "asc", event: "asc", came: "desc", status: "asc", guests: "desc", name: "asc", space: "asc",
};
const SORT_KEYS = Object.keys(SORT_DEFAULT_DIR) as SortKey[];

/** The Sort select's options, in order. `value` is the URL form. */
export const SORT_OPTIONS: readonly { value: string; label: string; sort: ListSort }[] = [
  { value: "urgent", label: "Most urgent", sort: { key: "urgent", dir: "asc" } },
  { value: "event", label: "Event date: soonest", sort: { key: "event", dir: "asc" } },
  { value: "-event", label: "Event date: latest", sort: { key: "event", dir: "desc" } },
  { value: "came", label: "Came in: newest", sort: { key: "came", dir: "desc" } },
  { value: "-came", label: "Came in: oldest", sort: { key: "came", dir: "asc" } },
  { value: "status", label: "Status (pipeline order)", sort: { key: "status", dir: "asc" } },
  { value: "guests", label: "Guests: most first", sort: { key: "guests", dir: "desc" } },
  { value: "name", label: "Name A–Z", sort: { key: "name", dir: "asc" } },
  { value: "space", label: "Space A–Z", sort: { key: "space", dir: "asc" } },
];

export function sortToParam(s: ListSort): string {
  if (s.key === "urgent") return "urgent";
  return s.dir === SORT_DEFAULT_DIR[s.key] ? s.key : `-${s.key}`;
}
export function sortFromParam(v: string | null | undefined): ListSort | null {
  const m = /^(-?)([a-z]+)$/.exec(v ?? "");
  if (!m || !SORT_KEYS.includes(m[2] as SortKey)) return null;
  const key = m[2] as SortKey;
  if (key === "urgent") return { key, dir: "asc" };
  const dir = SORT_DEFAULT_DIR[key];
  return { key, dir: m[1] ? (dir === "asc" ? "desc" : "asc") : dir };
}
export const sameSort = (a: ListSort, b: ListSort) => a.key === b.key && (a.key === "urgent" || a.dir === b.dir);

export const DATE_PRESETS: readonly { id: DatePreset; label: string }[] = [
  { id: "upcoming", label: "Upcoming" },
  { id: "today", label: "Today" },
  { id: "this_week", label: "This week" },
  { id: "weekend", label: "This weekend" },
  { id: "next_30", label: "Next 30 days" },
  { id: "this_month", label: "This month" },
  { id: "next_month", label: "Next month" },
  { id: "past", label: "Already happened" },
  { id: "none", label: "No date yet" },
];
export const CAME_PRESETS: readonly { id: CamePreset; label: string }[] = [
  { id: "last_7", label: "Last 7 days" },
  { id: "last_30", label: "Last 30 days" },
  { id: "this_month", label: "This month" },
  { id: "this_year", label: "This year" },
  { id: "last_year", label: "Last year" },
];
export const NEEDS_OPTIONS: readonly { id: NeedsKind; label: string }[] = [
  { id: "reply", label: "Needs reply" },
  { id: "overdue", label: "Follow-up overdue" },
  { id: "quiet", label: "Gone quiet" },
  { id: "hold", label: "Hold ending or expired" },
  { id: "clash", label: "Date clash" },
  { id: "partial", label: "Didn't finish the form" },
  { id: "passed", label: "Date passed" },
  { id: "none", label: "Nothing due" },
];
export const GUEST_OPTIONS: readonly { id: GuestBand; label: string }[] = [
  { id: "lt20", label: "Under 20" },
  { id: "20_49", label: "20–49" },
  { id: "50_99", label: "50–99" },
  { id: "100p", label: "100+" },
];
export const BUDGET_OPTIONS: readonly { id: BudgetKey; label: string }[] = [
  ...BUDGET_RANGE_OPTIONS.map(o => ({ id: o.value as BudgetKey, label: o.label })),
  { id: "none", label: "Not given" },
];
export const CLIENT_OPTIONS: readonly { id: ClientKind; label: string }[] = [
  { id: "returning", label: "Returning client" },
  { id: "duplicate", label: "Possible duplicate" },
];
export const LOST_OPTIONS: readonly { id: string; label: string }[] = LOST_REASONS.map(r => ({ id: r.key, label: r.label }));

const SOURCE_LABELS: Record<string, string> = {
  website: "Website form", google: "Google", instagram: "Instagram", facebook: "Facebook", referral: "Referral",
  phone: "Phone", email: "Email", walk_in: "Walk-in", lead_form: "Lead form", none: "Not recorded",
};
export function sourceLabel(key: string): string {
  return SOURCE_LABELS[key] ?? key.replace(/_/g, " ").replace(/^./, c => c.toUpperCase());
}
/** The order sources are listed in (the rest follow, A–Z). */
export const SOURCE_ORDER = ["website", "google", "instagram", "facebook", "referral", "phone", "email", "walk_in", "lead_form"];

export const FACET_LABELS: Record<keyof EnquiryFilters, string> = {
  status: "Status", date: "Event date", space: "Space", source: "Source", owner: "Owner", needs: "Needs",
  type: "Event type", guests: "Guests", budget: "Budget", came: "Came in", lostReason: "Lost reason", client: "Client",
};
/** Facet order for chips and the phone sheet. */
export const FACET_ORDER: readonly (keyof EnquiryFilters)[] = [
  "status", "date", "space", "source", "owner", "needs", "type", "guests", "budget", "came", "lostReason", "client",
];

// ── Venue days ─────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;
const zoneFormatters = new Map<string, Intl.DateTimeFormat>();
function zoneFormatter(tz: string): Intl.DateTimeFormat {
  let f = zoneFormatters.get(tz);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
    } catch {
      // An unknown zone name: fall back to the default venue zone.
      f = tz === DEFAULT_VENUE_TZ ? new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }) : zoneFormatter(DEFAULT_VENUE_TZ);
    }
    zoneFormatters.set(tz, f);
  }
  return f;
}
/** The calendar day of an instant in a zone: "2026-11-17". */
export function dayKeyAt(ms: number, tz: string): string {
  if (!Number.isFinite(ms)) return "";
  const parts = zoneFormatter(tz || DEFAULT_VENUE_TZ).formatToParts(new Date(ms));
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
const toDate = (v: unknown): Date | null => {
  if (v == null || v === "") return null;
  const d = v instanceof Date ? v : new Date(v as string | number);
  return isNaN(d.getTime()) ? null : d;
};
/** An event date's venue day: a date-only value (UTC midnight) is that calendar day, a timed one is read in the venue's zone. */
export function eventDayOf(v: unknown, tz: string): string {
  const d = toDate(v);
  if (!d) return "";
  return isDateOnly(d) ? d.toISOString().slice(0, 10) : dayKeyAt(d.getTime(), tz);
}
export const todayKey = (ctx: Pick<ListCtx, "nowMs" | "tz">) => dayKeyAt(ctx.nowMs, ctx.tz);

const keyToUtc = (k: string) => { const [y, m, d] = k.split("-").map(Number); return Date.UTC(y, m - 1, d); };
const utcToKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (k: string, n: number) => utcToKey(keyToUtc(k) + n * DAY_MS);
/** 0 = Sunday … 6 = Saturday. */
const weekdayOf = (k: string) => new Date(keyToUtc(k)).getUTCDay();
const monthEnd = (k: string) => { const [y, m] = k.split("-").map(Number); return utcToKey(Date.UTC(y, m, 0)); };
const nextMonthStart = (k: string) => { const [y, m] = k.split("-").map(Number); return utcToKey(Date.UTC(y, m, 1)); };
/** Whole days from `a` to `b` (positive when b is later). */
export const daysBetweenKeys = (a: string, b: string) => Math.round((keyToUtc(b) - keyToUtc(a)) / DAY_MS);

export function isValidDayKey(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const ms = keyToUtc(s);
  return Number.isFinite(ms) && utcToKey(ms) === s;
}
const isValidMonth = (s: string) => /^\d{4}-\d{2}$/.test(s) && isValidDayKey(`${s}-01`);

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "Fri 13 Nov", or "Fri 16 Jul 2027" when not in today's year. Weekday optional. */
export function formatDayKey(k: string, today: string, opts: { weekday?: boolean } = {}): string {
  if (!k) return "";
  const [y, m, d] = k.split("-").map(Number);
  const head = opts.weekday === false ? "" : `${WEEKDAYS[weekdayOf(k)]} `;
  return `${head}${d} ${MONTHS[m - 1]}${String(y) === today.slice(0, 4) ? "" : ` ${y}`}`;
}
/** "December 2026" for "2026-12". */
export const formatMonthLong = (ym: string) => { const [y, m] = ym.split("-").map(Number); return `${MONTHS_LONG[m - 1]} ${y}`; };
/** "Dec 2026" for "2026-12". */
export const formatMonthShort = (ym: string) => { const [y, m] = ym.split("-").map(Number); return `${MONTHS[m - 1]} ${y}`; };

/**
 * The days a date filter covers, relative to today's venue day. `undated`: rows
 * with no date yet match too. `onlyUndated`: only rows with no date match.
 * null: no filter.
 */
export function dayKeyRange(f: DateFilter<string>, today: string): { from?: string; to?: string; undated: boolean; onlyUndated?: boolean } | null {
  if (!f) return null;
  if ("preset" in f) {
    const y = today.slice(0, 4);
    switch (f.preset) {
      case "upcoming": return { from: today, undated: true };
      case "today": return { from: today, to: today, undated: false };
      case "this_week": {
        const mon = addDays(today, -((weekdayOf(today) + 6) % 7));
        return { from: mon, to: addDays(mon, 6), undated: false };
      }
      case "weekend": {
        const wd = weekdayOf(today);
        if (wd === 0) return { from: today, to: today, undated: false };
        const sat = addDays(today, 6 - wd);
        return { from: sat, to: addDays(sat, 1), undated: false };
      }
      case "next_30": return { from: today, to: addDays(today, 29), undated: false };
      case "this_month": return { from: `${today.slice(0, 7)}-01`, to: monthEnd(today), undated: false };
      case "next_month": { const s = nextMonthStart(today); return { from: s, to: monthEnd(s), undated: false }; }
      case "past": return { to: addDays(today, -1), undated: false };
      case "none": return { undated: true, onlyUndated: true };
      case "last_7": return { from: addDays(today, -6), to: today, undated: false };
      case "last_30": return { from: addDays(today, -29), to: today, undated: false };
      case "this_year": return { from: `${y}-01-01`, to: `${y}-12-31`, undated: false };
      case "last_year": return { from: `${Number(y) - 1}-01-01`, to: `${Number(y) - 1}-12-31`, undated: false };
      default: return null;
    }
  }
  if ("month" in f) return isValidMonth(f.month) ? { from: `${f.month}-01`, to: monthEnd(`${f.month}-01`), undated: false } : null;
  let { from, to } = f;
  if (from && !isValidDayKey(from)) from = undefined;
  if (to && !isValidDayKey(to)) to = undefined;
  if (!from && !to) return null;
  if (from && to && from > to) [from, to] = [to, from];
  return { from, to, undated: false };
}
const inRange = (k: string, r: { from?: string; to?: string }) => (!r.from || k >= r.from) && (!r.to || k <= r.to);
/** The month ("2026-11") an Event date filter covers exactly (This month, Next month, a picked month), else null. */
function filterMonth(f: DateFilter<DatePreset>, today: string): string | null {
  const r = dayKeyRange(f, today);
  if (!r?.from || !r.to || r.undated || !r.from.endsWith("-01") || r.to !== monthEnd(r.from)) return null;
  return r.from.slice(0, 7);
}

// ── Rows ───────────────────────────────────────────────────────────────────

/** A status as the filters compare it: lower case, the old "confirmed" read as "booked". */
export const statusKey = (s: unknown) => { const v = String(s ?? "").toLowerCase(); return v === "confirmed" ? "booked" : v; };
const normStatus = statusKey;
export const isConfirmedStatus = (s: unknown) => normStatus(s) === "booked";
export const isClosedStatus = (s: unknown) => ["finished", "lost", "cancelled"].includes(normStatus(s));
export const isOpenStatus = (s: unknown) => !CLOSED_LEAD_STATUSES.includes(String(s ?? "").toLowerCase());

/** Build the list's rows: each lead with its signal and its venue days. */
export function enrichRows(
  leads: readonly LeadLike[],
  ctx: ListCtx & { replyStatus?: ReplyStatusMap | null; clashMap?: Record<number, unknown[] | undefined> | null; isPartial?: (l: LeadLike) => boolean },
): ListRow[] {
  const out: ListRow[] = [];
  for (const lead of leads) {
    if (!lead || typeof lead !== "object" || lead.id == null) continue;
    const rs = ctx.replyStatus?.get(lead.id);
    const at = rs?.direction === "in" ? toDate(rs.at) : null;
    const hold = toDate(lead.holdUntil);
    const ev = toDate(lead.eventDate);
    const signal = enquirySignal(lead as any, {
      nowMs: ctx.nowMs,
      partial: ctx.isPartial ? ctx.isPartial(lead) : false,
      clientRepliedAtMs: at ? at.getTime() : null,
      hasClash: (ctx.clashMap?.[lead.id]?.length ?? 0) > 0,
      holdUntilMs: hold ? hold.getTime() : null,
      eventDateMs: ev ? ev.getTime() : null,
    });
    const came = toDate(lead.createdAt);
    const clash = (ctx.clashMap?.[lead.id]?.length ?? 0) > 0;
    out.push({ lead, signal, eventDay: eventDayOf(lead.eventDate, ctx.tz), cameDay: came ? dayKeyAt(came.getTime(), ctx.tz) : "", clash });
  }
  return out;
}

/** An open enquiry whose event date is more than a day behind us (the list marks it "Date passed"). */
export const rowDatePassed = (row: ListRow, ctx: Pick<ListCtx, "nowMs">) => leadDatePassed(row.lead as any, ctx.nowMs);

export function inView(view: EnquiryView, row: ListRow): boolean {
  switch (view) {
    case "reply": return row.signal.group === "reply";
    case "followup": return row.signal.group === "followup";
    case "open": return isOpenStatus(row.lead.status);
    case "confirmed": return isConfirmedStatus(row.lead.status);
    case "closed": return isClosedStatus(row.lead.status);
    default: return true;
  }
}

export function needsKind(row: ListRow): NeedsKind {
  switch (row.signal.kind) {
    case "waiting": case "client_replied": return "reply";
    case "followup_overdue": return "overdue";
    case "gone_quiet": return "quiet";
    case "hold": case "hold_expired": return "hold";
    case "clash": return "clash";
    case "partial": return "partial";
    case "date_passed": return "passed";
    default: return "none";
  }
}

export function guestBand(n: number | null | undefined): GuestBand | null {
  const v = Number(n);
  if (n == null || !Number.isFinite(v) || v <= 0) return null;
  return v < 20 ? "lt20" : v < 50 ? "20_49" : v < 100 ? "50_99" : "100p";
}

/** "No date yet": no event date, or the client said the date is flexible. */
const isUndated = (row: ListRow) => !row.eventDay || !!row.lead.dateFlexible;

function rowSpaceKeys(row: ListRow, ctx: ListCtx): (number | "none")[] {
  const id = row.lead.spaceId;
  if (id != null) return [Number(id)];
  const raw = String(row.lead.spaceName ?? "").trim();
  if (!raw) return ["none"];
  // No space id (older rows): match the name, which may list several spaces.
  const names = raw.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  const out: number[] = [];
  ctx.spaceNames?.forEach((name, sid) => { if (names.includes(name.trim().toLowerCase())) out.push(sid); });
  return out;
}
const rowSource = (row: ListRow) => (String(row.lead.source ?? "").trim().toLowerCase() || "none");
const rowBudget = (row: ListRow) => (row.lead.budgetRange ? String(row.lead.budgetRange) : "none");
const rowType = (row: ListRow) => String(row.lead.eventType ?? "").trim().toLowerCase();
function rowClient(row: ListRow): ClientKind[] {
  const l = clientFlagLabels(row.lead.clientFlag ?? null);
  return [...(l.returning ? ["returning" as const] : []), ...(l.duplicate ? ["duplicate" as const] : [])];
}

function matchEventDate(row: ListRow, f: DateFilter<DatePreset>, today: string): boolean {
  const r = dayKeyRange(f, today);
  if (!r) return true;
  const undated = isUndated(row);
  if (r.onlyUndated) return undated;
  if (row.eventDay && inRange(row.eventDay, r)) return true;
  return r.undated && undated;
}
function matchCame(row: ListRow, f: DateFilter<CamePreset>, today: string): boolean {
  const r = dayKeyRange(f, today);
  if (!r) return true;
  return !!row.cameDay && inRange(row.cameDay, r);
}

function matchesExcept(row: ListRow, f: EnquiryFilters, ctx: ListCtx, today: string, skip?: keyof EnquiryFilters): boolean {
  if (skip !== "status" && f.status.length && !f.status.includes(normStatus(row.lead.status))) return false;
  if (skip !== "date" && f.date && !matchEventDate(row, f.date, today)) return false;
  if (skip !== "space" && f.space.length) {
    const keys = rowSpaceKeys(row, ctx);
    if (!f.space.some(s => keys.includes(s))) return false;
  }
  if (skip !== "source" && f.source.length && !f.source.includes(rowSource(row))) return false;
  if (skip !== "owner" && f.owner !== "all") {
    const a = row.lead.assignedTo;
    if (f.owner === "unassigned" ? a != null : a !== f.owner) return false;
  }
  if (skip !== "needs" && f.needs.length && !f.needs.includes(needsKind(row))) return false;
  if (skip !== "type" && f.type.length) {
    const t = rowType(row);
    if (!t || !f.type.some(x => x.trim().toLowerCase() === t)) return false;
  }
  if (skip !== "guests" && f.guests.length) {
    const b = guestBand(row.lead.guestCount);
    if (!b || !f.guests.includes(b)) return false;
  }
  if (skip !== "budget" && f.budget.length && !f.budget.includes(rowBudget(row))) return false;
  if (skip !== "came" && f.came && !matchCame(row, f.came, today)) return false;
  // Lost reason narrows the lost enquiries only: everything else passes.
  if (skip !== "lostReason" && f.lostReason.length && normStatus(row.lead.status) === "lost"
    && !f.lostReason.includes(String(row.lead.lostReason ?? ""))) return false;
  if (skip !== "client" && f.client.length) {
    const c = rowClient(row);
    if (!f.client.some(k => c.includes(k))) return false;
  }
  return true;
}

export function matchesFilters(row: ListRow, f: EnquiryFilters, ctx: ListCtx): boolean {
  return matchesExcept(row, f, ctx, todayKey(ctx));
}

// ── Sorting ────────────────────────────────────────────────────────────────

export function eventBucket(row: ListRow, ctx: ListCtx): "upcoming" | "undated" | "past" {
  if (!row.eventDay) return "undated";
  return row.eventDay >= todayKey(ctx) ? "upcoming" : "past";
}

const URGENCY_TIER: Record<EnquirySignal["kind"], number> = {
  waiting: 0, client_replied: 0, followup_overdue: 1, hold_expired: 2, hold: 2, clash: 3, gone_quiet: 4,
  partial: 5, in_progress: 6, date_passed: 7, confirmed: 8, closed: 9,
};
export const urgencyTier = (row: ListRow) => URGENCY_TIER[row.signal.kind] ?? 6;

const ms = (v: unknown) => { const d = toDate(v); return d ? d.getTime() : NaN; };
const num = (a: number, b: number) => (Number.isNaN(a) ? (Number.isNaN(b) ? 0 : 1) : Number.isNaN(b) ? -1 : a - b);
const fullName = (l: LeadLike) => `${l.firstName ?? ""} ${l.lastName ?? ""}`.trim();

export function compareRows(sort: ListSort, ctx: ListCtx): (a: ListRow, b: ListRow) => number {
  const today = todayKey(ctx);
  const bucket = (r: ListRow) => (!r.eventDay ? 1 : r.eventDay >= today ? 0 : 2);
  const evMs = (r: ListRow) => ms(r.lead.eventDate);
  const cameMs = (r: ListRow) => ms(r.lead.createdAt);
  // Same day: a date-only event (no time) counts as the start of that day.
  const evAsc = (a: ListRow, b: ListRow) => (a.eventDay < b.eventDay ? -1 : a.eventDay > b.eventDay ? 1 : num(evMs(a), evMs(b)));
  /** Soonest event first, undated last. */
  const evSoonest = (a: ListRow, b: ListRow) => {
    if (!a.eventDay || !b.eventDay) return (a.eventDay ? -1 : b.eventDay ? 1 : 0);
    return evAsc(a, b);
  };
  /** Most recent event first, undated last. */
  const evLatest = (a: ListRow, b: ListRow) => {
    if (!a.eventDay || !b.eventDay) return (a.eventDay ? -1 : b.eventDay ? 1 : 0);
    return -evAsc(a, b);
  };
  /** Upcoming soonest → no date (newest enquiry first) → past most recent first. */
  const eventAsc = (a: ListRow, b: ListRow) => {
    const ba = bucket(a), bb = bucket(b);
    if (ba !== bb) return ba - bb;
    if (ba === 0) return evAsc(a, b);
    if (ba === 1) return num(cameMs(b), cameMs(a));
    return -evAsc(a, b);
  };
  /** Every dated row latest first, undated last (newest enquiry first). */
  const eventDesc = (a: ListRow, b: ListRow) => {
    if (!a.eventDay || !b.eventDay) {
      if (a.eventDay || b.eventDay) return a.eventDay ? -1 : 1;
      return num(cameMs(b), cameMs(a));
    }
    return -evAsc(a, b);
  };
  const futureFollowUp = (r: ListRow) => { const t = ms(r.lead.followUpDate); return Number.isFinite(t) && t > ctx.nowMs ? t : NaN; };
  const order = ctx.statusOrder.map(normStatus);
  const statusRank = (r: ListRow) => { const i = order.indexOf(normStatus(r.lead.status)); return i < 0 ? order.length : i; };
  const spaceOf = (r: ListRow) => {
    const n = String(r.lead.spaceName ?? "").trim();
    if (n) return n;
    const id = r.lead.spaceId;
    return id != null ? (ctx.spaceNames?.get(Number(id)) ?? "") : "";
  };
  const text = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base" });

  const urgent = (a: ListRow, b: ListRow) => {
    const ta = urgencyTier(a), tb = urgencyTier(b);
    if (ta !== tb) return ta - tb;
    switch (ta) {
      case 0: case 1: return b.signal.sortKey - a.signal.sortKey;
      case 2: {
        const ka = a.signal.kind === "hold_expired" ? 0 : 1, kb = b.signal.kind === "hold_expired" ? 0 : 1;
        return ka !== kb ? ka - kb : num(ms(a.lead.holdUntil), ms(b.lead.holdUntil));
      }
      case 3: return evSoonest(a, b);
      case 4: return evSoonest(a, b) || b.signal.sortKey - a.signal.sortKey;
      case 5: return num(cameMs(b), cameMs(a));
      case 6: return num(futureFollowUp(a), futureFollowUp(b)) || evSoonest(a, b);
      case 7: return evLatest(a, b);
      case 8: return eventAsc(a, b);
      case 9: return evLatest(a, b);
    }
    return 0;
  };

  let primary: (a: ListRow, b: ListRow) => number;
  const flip = sort.dir === SORT_DEFAULT_DIR[sort.key] ? 1 : -1;
  switch (sort.key) {
    case "event": primary = sort.dir === "desc" ? eventDesc : eventAsc; break;
    case "came": primary = (a, b) => (sort.dir === "asc" ? 1 : -1) * num(cameMs(a), cameMs(b)); break;
    case "status": primary = (a, b) => flip * (statusRank(a) - statusRank(b)) || eventAsc(a, b); break;
    case "guests": primary = (a, b) => {
      const ga = Number(a.lead.guestCount) || NaN, gb = Number(b.lead.guestCount) || NaN;
      if (Number.isNaN(ga) || Number.isNaN(gb)) return num(ga, gb); // no guest count last, either way
      return sort.dir === "asc" ? ga - gb : gb - ga;
    }; break;
    case "name": primary = (a, b) => {
      const na = fullName(a.lead), nb = fullName(b.lead);
      if (!na || !nb) return na ? -1 : nb ? 1 : 0;
      return flip * text(na, nb);
    }; break;
    case "space": primary = (a, b) => {
      const sa = spaceOf(a), sb = spaceOf(b);
      if (!sa || !sb) return sa ? -1 : sb ? 1 : 0; // "No space" last
      return flip * text(sa, sb);
    }; break;
    default: primary = (a, b) => urgent(a, b) || eventAsc(a, b);
  }
  return (a, b) => primary(a, b) || a.lead.id - b.lead.id;
}

// ── The list ───────────────────────────────────────────────────────────────

/** The piles a search's results are grouped by, in this order. */
const PILES: readonly { id: string; label: string; test: (r: ListRow) => boolean }[] = [
  { id: "reply", label: "Needs reply", test: r => r.signal.group === "reply" },
  { id: "followup", label: "Follow-up due", test: r => r.signal.group === "followup" },
  { id: "progress", label: "In progress", test: r => isOpenStatus(r.lead.status) },
  { id: "confirmed", label: "Confirmed", test: r => isConfirmedStatus(r.lead.status) },
  { id: "closed", label: "Closed", test: () => true },
];
const pileOf = (r: ListRow) => PILES.findIndex(p => p.test(r));

export const isSearching = (s: Pick<ListState, "q">) => s.q.trim().length > 0;
/** The view the rows come from: All while searching, unless a tab was clicked during the search. */
export const effectiveView = (s: Pick<ListState, "q" | "view" | "searchIn">): EnquiryView =>
  isSearching(s) && !s.searchIn ? "all" : s.view;

/** A group heading in the list. */
export interface ListDivider {
  /** The row it starts at. */
  at: number;
  label: string;
  /** Rows that belong under it (rows kept after a status change not counted). */
  count: number;
  /** The group: a month ("2026-12"), "none" or "past" when sorted by event date. */
  key: string;
  /** A shared month heading ("February – July 2027"): its last month in list order. */
  until?: string;
}

export interface ListResult {
  rows: ListRow[];
  /** Group headings: the row index each starts at. */
  dividers: ListDivider[];
  /** Each row's group (as ListDivider.key, whether or not it has a heading); null in a list without groups. */
  groups: (string | null)[];
  /** Rows in the view (and search) that the filters hide. */
  hiddenByFilters: number;
  /** alwaysInclude ids that are only shown because they were asked for. */
  pinnedOutside: number[];
}

/**
 * Where a row kept on screen after a status change ("Moved to … · Undo")
 * goes: in its own group, beside an enquiry it sat next to. Not a row number,
 * which new enquiries and other moves shift while the row is kept.
 */
export interface KeptPlace {
  /** The group it was in (ListResult.groups). */
  group: string | null;
  /** The enquiry just above it in that group, and just below (null: it was the group's first / last). */
  after: number | null;
  before: number | null;
  /** It was nearer the top of its group than the bottom: the end it goes to when both neighbours have left. */
  nearTop: boolean;
}

/** The list as shown, enough to say where a row is in it. */
export interface ListLayout {
  ids: readonly number[];
  groups: readonly (string | null)[];
  /** The rows headings start at. */
  starts: readonly number[];
}
export const listLayout = (res: ListResult): ListLayout =>
  ({ ids: res.rows.map(r => r.lead.id), groups: res.groups, starts: res.dividers.map(d => d.at) });

/** Where a row shown in this layout stays if its status changes now; null when it isn't shown. */
export function keptPlace(layout: ListLayout | null | undefined, id: number): KeptPlace | null {
  const i = layout ? layout.ids.indexOf(id) : -1;
  if (!layout || i < 0) return null;
  const lo = Math.max(0, ...layout.starts.filter(at => at <= i));
  const hi = Math.min(layout.ids.length, ...layout.starts.filter(at => at > i));
  return {
    group: layout.groups[i] ?? null,
    after: i > lo ? layout.ids[i - 1] : null,
    before: i + 1 < hi ? layout.ids[i + 1] : null,
    nearTop: i - lo <= hi - 1 - i,
  };
}

/** A month holding at least this many rows gets a heading of its own. */
export const MONTH_HEADING_MIN_ROWS = 4;
const isMonthKey = (key: string) => /^\d{4}-\d{2}$/.test(key);
/** "February – July 2027", or "December 2026 – February 2027" across a new year. Earliest month first. */
export function formatMonthRange(a: string, b: string): string {
  const [from, to] = a <= b ? [a, b] : [b, a];
  if (from === to) return formatMonthLong(from);
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  return `${sameYear ? MONTHS_LONG[Number(from.slice(5, 7)) - 1] : formatMonthLong(from)} – ${formatMonthLong(to)}`;
}
/**
 * Month headings that each group several rows. A month holding at least
 * MONTH_HEADING_MIN_ROWS keeps its heading; next-door months holding fewer
 * share one heading ("February – July 2027 · 6"); a quiet month between two
 * busy ones keeps its own. No month gets a heading (the Event date column
 * already names it) when the headings left would hold fewer than
 * MONTH_HEADING_MIN_ROWS rows each on average. Because quiet months next to
 * each other share one heading, a few far-off months with one booking each
 * never take the headings away from the busy months.
 *
 * Sorted latest first (Closed), a list whose busy months hold no more than
 * half the dated rows gets no month headings either: lost and finished
 * enquiries spread thinly over many months read better without them. Sorted
 * soonest first (Confirmed), that check is left out: as the weeks go by the
 * busy months move into "Already happened" and the months ahead thin out, and
 * a month that still holds several bookings keeps its heading.
 *
 * Other headings ("No date yet", "Already happened") are left as they are.
 */
function groupQuietMonths<G extends { key: string; until?: string; divider: { at: number; label: string; count: number } }>(groups: G[], dir: ListSort["dir"]): G[] {
  const isQuiet = (g: G) => isMonthKey(g.key) && g.divider.count < MONTH_HEADING_MIN_ROWS;
  const months = groups.filter(g => isMonthKey(g.key));
  const dated = months.reduce((n, g) => n + g.divider.count, 0);
  const noMonths = () => groups.filter(g => !isMonthKey(g.key));
  if (dir === "desc") {
    const inBusy = months.reduce((n, g) => n + (isQuiet(g) ? 0 : g.divider.count), 0);
    if (inBusy * 2 <= dated) return noMonths();
  }
  const out: G[] = [];
  for (let i = 0; i < groups.length;) {
    let j = i;
    if (isQuiet(groups[i])) while (j + 1 < groups.length && isQuiet(groups[j + 1])) j++;
    if (j === i) { out.push(groups[i]); i++; continue; }
    const count = groups.slice(i, j + 1).reduce((n, g) => n + g.divider.count, 0);
    out.push({ ...groups[i], until: groups[j].key, divider: { at: groups[i].divider.at, label: formatMonthRange(groups[i].key, groups[j].key), count } });
    i = j + 1;
  }
  // A shared heading keeps its first month's key, so this counts every month heading left.
  if (dated < out.filter(g => isMonthKey(g.key)).length * MONTH_HEADING_MIN_ROWS) return noMonths();
  return out;
}

export function listRows(
  rows: readonly ListRow[],
  s: ListState,
  ctx: ListCtx,
  opts: {
    /** Keep these rows even when they no longer match (an unsent quick reply), at their sorted place. */
    alwaysInclude?: readonly number[];
    /** Keep these rows where they were (a status just changed: "Moved to … · Undo"). See keptPlace. */
    keep?: ReadonlyMap<number, KeptPlace>;
  } = {},
): ListResult {
  const q = s.q.trim();
  const view = effectiveView(s);
  const today = todayKey(ctx);
  const keep = opts.keep ?? new Map<number, KeptPlace>();
  const always = new Set(opts.alwaysInclude ?? []);
  let inScope = 0;
  const shown: ListRow[] = [];
  const pinnedOutside: number[] = [];
  const kept: ListRow[] = [];
  for (const r of rows) {
    if (keep.has(r.lead.id)) { kept.push(r); continue; }
    const scoped = inView(view, r) && (!q || leadMatchesSearch(r.lead as any, q));
    if (scoped) inScope++;
    if (scoped && matchesExcept(r, s.filters, ctx, today)) shown.push(r);
    else if (always.has(r.lead.id)) { shown.push(r); pinnedOutside.push(r.lead.id); }
  }
  const hiddenByFilters = Math.max(0, inScope - (shown.length - pinnedOutside.length));
  const cmp = compareRows(s.sort, ctx);
  let out: ListRow[];
  let dividers: ListDivider[] = [];
  /** A row's group (ListResult.groups). */
  let groupKey: (r: ListRow) => string | null = () => null;
  /** Whether a group's rows go under this heading. */
  let covers: (d: ListDivider, key: string) => boolean = (d, key) => d.key === key;
  /** Whether group a comes before group b in the list. */
  let groupBefore: (a: string, b: string) => boolean = () => false;
  /** The heading a group gets back when it has none (its only row is a kept one); null when it goes without. */
  let headFor: (key: string) => ListDivider | null = () => null;
  if (q && view === "all") {
    out = [];
    PILES.forEach((p, i) => {
      const group = shown.filter(r => pileOf(r) === i).sort(cmp);
      if (!group.length) return;
      dividers.push({ at: out.length, label: p.label, count: group.length, key: p.id });
      out.push(...group);
    });
  } else {
    out = shown.sort(cmp);
    if (s.sort.key === "event") {
      const groupOf = (r: ListRow) => {
        if (!r.eventDay) return { key: "none", label: "No date yet" };
        if (s.sort.dir === "asc" && r.eventDay < today) return { key: "past", label: "Already happened" };
        return { key: r.eventDay.slice(0, 7), label: formatMonthLong(r.eventDay.slice(0, 7)) };
      };
      let groups: { key: string; until?: string; divider: ListDivider }[] = [];
      out.forEach((r, i) => {
        const g = groupOf(r);
        if (g.key !== groups[groups.length - 1]?.key) groups.push({ key: g.key, divider: { at: i, label: g.label, count: 0, key: g.key } });
        groups[groups.length - 1].divider.count++;
      });
      if (groups.length < 2) groups = [];
      // Event date set to one month ("This month"): the chip already names
      // it, so that month gets no heading of its own. "Already happened"
      // keeps its heading.
      const month = filterMonth(s.filters.date, today);
      if (month) groups = groups.filter(g => g.key !== month);
      // Month headings only help when they group several rows: quiet months
      // next to each other share one heading, and a list sorted latest first
      // whose rows are spread thinly over many months (lost enquiries) has none.
      groups = groupQuietMonths(groups, s.sort.dir);
      dividers = groups.map(g => (g.until ? { ...g.divider, key: g.key, until: g.until } : g.divider));
      const monthHeadings = groups.some(g => isMonthKey(g.key));
      groupKey = r => groupOf(r).key;
      covers = (d, key) => {
        const [a, b] = [d.key, d.until ?? d.key].sort();
        return key === d.key || (isMonthKey(key) && isMonthKey(a) && key >= a && key <= b);
      };
      const rank = (k: string) => (isMonthKey(k) ? 0 : k === "none" ? 1 : 2);
      groupBefore = (a, b) => (rank(a) !== rank(b) ? rank(a) < rank(b) : s.sort.dir === "asc" ? a < b : a > b);
      // Months without headings (too few rows, or the month the date filter
      // names) sit above the first heading.
      headFor = key => {
        if (!dividers.length || key === month || (isMonthKey(key) && !monthHeadings)) return null;
        const label = key === "none" ? "No date yet" : key === "past" ? "Already happened" : isMonthKey(key) ? formatMonthLong(key) : null;
        return label ? { at: 0, label, count: 0, key } : null;
      };
    }
  }
  // Rows kept on screen after a status change go back into the group they
  // were in, beside an enquiry they sat next to, else at the nearer end of
  // that group. A row that was its group's only one gets the group's heading
  // back, counting none. Other rows arriving, leaving or moving meanwhile
  // don't push a kept row under another heading.
  const rowGroups = out.map(groupKey);
  const pending = [...kept];
  const placeOf = (r: ListRow) => keep.get(r.lead.id)!;
  const isPending = (id: number | null) => id != null && pending.some(r => r.lead.id === id);
  while (pending.length) {
    // One kept beside another kept row goes in after that one.
    let k = pending.findIndex(r => !isPending(placeOf(r).after) && !isPending(placeOf(r).before));
    if (k < 0) k = Math.max(0, pending.findIndex(r => !isPending(placeOf(r).after)));
    const [r] = pending.splice(k, 1);
    const p = placeOf(r);
    const g = p.group;
    // Its group's rows: lo up to (not including) hi.
    let head = g == null ? null : dividers.find(d => covers(d, g)) ?? null;
    let lo = 0, hi = out.length;
    if (head) { lo = head.at; hi = dividers.find(d => d.at > lo)?.at ?? out.length; }
    else if (g != null && (head = headFor(g))) lo = hi = dividers.find(d => groupBefore(g, d.key))?.at ?? out.length;
    else if (g != null) hi = dividers[0]?.at ?? out.length;
    const indexIn = (id: number | null) => {
      const i = id == null ? -1 : out.findIndex(x => x.lead.id === id);
      return i >= lo && i < hi ? i : -1;
    };
    const a = indexIn(p.after), b = indexIn(p.before);
    const at = a >= 0 ? a + 1 : b >= 0 ? b : p.nearTop ? lo : hi;
    out.splice(at, 0, r);
    rowGroups.splice(at, 0, g);
    for (const d of dividers) if (d.at > at || (d.at === at && d !== head)) d.at++;
    if (head && !dividers.includes(head)) {
      head.at = at;
      dividers.splice(dividers.filter(d => d.at < at).length, 0, head);
    }
  }
  return { rows: out, dividers, groups: rowGroups, hiddenByFilters, pinnedOutside };
}

/**
 * The Board's cards: every enquiry the search and the filters let through,
 * whatever the view. Status is left out: the Board's columns are the statuses.
 */
export function boardRows(rows: readonly ListRow[], s: Pick<ListState, "filters" | "q">, ctx: ListCtx): ListRow[] {
  const q = s.q.trim();
  const today = todayKey(ctx);
  return rows.filter(r => (!q || leadMatchesSearch(r.lead as any, q)) && matchesExcept(r, s.filters, ctx, today, "status"));
}

export function viewCounts(rows: readonly ListRow[], filters: EnquiryFilters, q: string, ctx: ListCtx): Record<EnquiryView, number> {
  const out: Record<EnquiryView, number> = { reply: 0, followup: 0, open: 0, confirmed: 0, closed: 0, all: 0 };
  const today = todayKey(ctx);
  const term = q.trim();
  for (const r of rows) {
    if (term && !leadMatchesSearch(r.lead as any, term)) continue;
    if (!matchesExcept(r, filters, ctx, today)) continue;
    for (const v of VIEW_IDS) if (inView(v, r)) out[v]++;
  }
  return out;
}

/** The Open view's "Review them": the filters you have, with Needs set to Date passed. */
export const reviewPassedFilters = (f: EnquiryFilters): EnquiryFilters => ({ ...f, needs: ["passed"] });
/**
 * The Open view's "N open enquiries are past their event date": the ones your
 * filters and search let through, so the number is what "Review them" shows.
 */
export function datePassedCount(rows: readonly ListRow[], s: Pick<ListState, "filters" | "q">, ctx: ListCtx): number {
  return viewCounts(rows, reviewPassedFilters(s.filters), s.q, ctx).open;
}

/** Count key for "any value" in facetCounts. */
export const FACET_TOTAL = "*";

/**
 * How many rows each option of one facet would give: every other facet (and
 * the view and search) applied, this facet's own choice ignored. Keys: status
 * keys, date presets and "m:YYYY-MM" months, space ids ("none"), source keys,
 * "unassigned" / owner ids, needs kinds, lower-cased event types, guest bands,
 * budget keys, came presets, lost reason keys, client kinds. FACET_TOTAL is the
 * count with this facet cleared.
 */
export function facetCounts(rows: readonly ListRow[], s: ListState, facet: keyof EnquiryFilters, ctx: ListCtx): Map<string, number> {
  const out = new Map<string, number>();
  const add = (k: string) => out.set(k, (out.get(k) ?? 0) + 1);
  const today = todayKey(ctx);
  const view = effectiveView(s);
  const q = s.q.trim();
  const dateRanges = facet === "date" ? DATE_PRESETS.map(p => ({ id: p.id as string, f: { preset: p.id } as DateFilter<DatePreset> })) : [];
  const cameRanges = facet === "came" ? CAME_PRESETS.map(p => ({ id: p.id as string, f: { preset: p.id } as DateFilter<CamePreset> })) : [];
  for (const r of rows) {
    if (!inView(view, r) || (q && !leadMatchesSearch(r.lead as any, q))) continue;
    if (!matchesExcept(r, s.filters, ctx, today, facet)) continue;
    add(FACET_TOTAL);
    switch (facet) {
      case "status": add(normStatus(r.lead.status)); break;
      case "date":
        for (const d of dateRanges) if (matchEventDate(r, d.f, today)) add(d.id);
        if (r.eventDay) add(`m:${r.eventDay.slice(0, 7)}`);
        break;
      case "space": for (const k of rowSpaceKeys(r, ctx)) add(String(k)); break;
      case "source": add(rowSource(r)); break;
      case "owner": add(r.lead.assignedTo == null ? "unassigned" : String(r.lead.assignedTo)); break;
      case "needs": add(needsKind(r)); break;
      case "type": { const t = rowType(r); if (t) add(t); break; }
      case "guests": { const b = guestBand(r.lead.guestCount); if (b) add(b); break; }
      case "budget": add(rowBudget(r)); break;
      case "came": for (const d of cameRanges) if (matchCame(r, d.f, today)) add(d.id); break;
      case "lostReason": if (normStatus(r.lead.status) === "lost" && r.lead.lostReason) add(String(r.lead.lostReason)); break;
      case "client": for (const c of rowClient(r)) add(c); break;
    }
  }
  return out;
}

/** The distinct event types present, first spelling seen, most common first. */
export function eventTypeOptions(rows: readonly ListRow[]): { label: string; key: string; count: number }[] {
  const m = new Map<string, { label: string; key: string; count: number }>();
  for (const r of rows) {
    const label = String(r.lead.eventType ?? "").trim();
    if (!label) continue;
    const key = label.toLowerCase();
    const e = m.get(key);
    if (e) e.count++; else m.set(key, { label, key, count: 1 });
  }
  return Array.from(m.values()).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/** The sources present, in the usual order. */
export function sourceOptions(rows: readonly ListRow[]): string[] {
  const present = new Set(rows.map(rowSource));
  return [...SOURCE_ORDER.filter(s => present.has(s)), ...Array.from(present).filter(s => !SOURCE_ORDER.includes(s)).sort()];
}

// ── The Needs line ─────────────────────────────────────────────────────────

/** What a row says it needs, for the list's Needs column and the board's cards. */
export function rowNeeds(row: ListRow, ctx: ListCtx): { text: string; tone: SignalTone; icon: string } {
  const { signal, lead } = row;
  const today = todayKey(ctx);
  switch (signal.kind) {
    case "in_progress": {
      const fu = ms(lead.followUpDate);
      if (Number.isFinite(fu) && fu > ctx.nowMs) {
        return { text: `Follow up ${formatDayKey(eventDayOf(lead.followUpDate, ctx.tz), today)}`, tone: "gray", icon: "arrow-right" };
      }
      return { text: "In progress", tone: "gray", icon: "arrow-right" };
    }
    case "confirmed": {
      if (!row.eventDay) return { text: "Confirmed", tone: "green", icon: "circle-check" };
      const d = daysBetweenKeys(today, row.eventDay);
      if (d < 0) return { text: "Event passed", tone: "gray", icon: "circle-check" };
      return { text: d === 0 ? "Event today" : d === 1 ? "Event tomorrow" : `Event in ${d}d`, tone: "green", icon: "circle-check" };
    }
    case "closed": {
      const st = normStatus(lead.status);
      // An older or imported reason key ("went_elsewhere") reads as words, not code.
      const raw = st === "lost" ? lostReasonLabel(lead.lostReason as string | null) : null;
      const reason = raw && /_/.test(raw) ? raw.replace(/_/g, " ").replace(/^./, c => c.toUpperCase()) : raw;
      const text = st === "lost" ? (reason ? `Lost · ${reason}` : "Lost") : st === "finished" ? "Finished" : st === "cancelled" ? "Cancelled" : "Closed";
      return { text, tone: "gray", icon: "circle-minus" };
    }
    default:
      return { text: signal.text, tone: signal.tone, icon: signal.icon };
  }
}

// ── Quick chips ────────────────────────────────────────────────────────────

export type QuickChip = { id: string; label: string; set: Partial<EnquiryFilters> };
const CHIP_THIS_MONTH: QuickChip = { id: "this_month", label: "This month", set: { date: { preset: "this_month" } } };
const CHIP_NEXT_MONTH: QuickChip = { id: "next_month", label: "Next month", set: { date: { preset: "next_month" } } };
const QUICK: Record<EnquiryView, QuickChip[]> = {
  reply: [],
  followup: [
    { id: "overdue", label: "Overdue", set: { needs: ["overdue"] } },
    { id: "quiet", label: "Gone quiet", set: { needs: ["quiet"] } },
  ],
  open: [CHIP_THIS_MONTH, CHIP_NEXT_MONTH],
  confirmed: [CHIP_THIS_MONTH, CHIP_NEXT_MONTH],
  closed: [
    { id: "lost_this_year", label: "Lost this year", set: { status: ["lost"], came: { preset: "this_year" } } },
    { id: "lost", label: "Lost", set: { status: ["lost"], came: null } },
  ],
  all: [CHIP_THIS_MONTH, CHIP_NEXT_MONTH],
};
export const quickChips = (view: EnquiryView): QuickChip[] => QUICK[view] ?? [];

function sameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    const sa = a.map(String).sort(), sb = b.map(String).sort();
    return sa.every((v, i) => v === sb[i]);
  }
  if (a && b && typeof a === "object" && typeof b === "object") return JSON.stringify(a) === JSON.stringify(b);
  return a === b;
}
export function isChipOn(f: EnquiryFilters, chip: QuickChip): boolean {
  return (Object.keys(chip.set) as (keyof EnquiryFilters)[]).every(k => sameValue(f[k], chip.set[k]));
}
export function toggleChip(f: EnquiryFilters, chip: QuickChip): EnquiryFilters {
  const on = isChipOn(f, chip);
  const next: EnquiryFilters = { ...f };
  for (const k of Object.keys(chip.set) as (keyof EnquiryFilters)[]) {
    (next as any)[k] = on ? cloneValue(EMPTY_FILTERS[k]) : cloneValue(chip.set[k]);
  }
  return next;
}
const cloneValue = <T,>(v: T): T => (Array.isArray(v) ? (v.slice() as T) : v && typeof v === "object" ? ({ ...v } as T) : v);

// ── Active filters ─────────────────────────────────────────────────────────

export function isFacetActive(f: EnquiryFilters, facet: keyof EnquiryFilters): boolean {
  const v = f[facet];
  if (facet === "owner") return v !== "all";
  if (Array.isArray(v)) return v.length > 0;
  return v != null;
}
/** How many facets are filtering (not how many values). */
export const activeCount = (f: EnquiryFilters) => FACET_ORDER.filter(k => isFacetActive(f, k)).length;
export function clearFacet(f: EnquiryFilters, facet: keyof EnquiryFilters): EnquiryFilters {
  return { ...f, [facet]: cloneValue(EMPTY_FILTERS[facet]) };
}
export const clearFilters = (): EnquiryFilters => ({ ...EMPTY_FILTERS, status: [], space: [], source: [], needs: [], type: [], guests: [], budget: [], lostReason: [], client: [] });
export const filtersKey = (f: EnquiryFilters) => JSON.stringify(FACET_ORDER.map(k => f[k]));
/**
 * "The same list": the view, filters, search and sort. A row kept on screen
 * after a status change ("Moved to … · Undo") stays only while this is
 * unchanged: in another order, the place it was kept at means nothing.
 */
export const shownListKey = (s: ListState) => `${effectiveView(s)}|${filtersKey(s.filters)}|${s.q.trim()}|${sortToParam(s.sort)}`;

export interface ChipLabels {
  status?: (key: string) => string;
  space?: (id: number) => string | undefined;
  owner?: (id: number) => string | undefined;
}

function dateFilterLabel(f: DateFilter<string>, presets: readonly { id: string; label: string }[]): string {
  if (!f) return "";
  if ("preset" in f) return presets.find(p => p.id === f.preset)?.label ?? f.preset;
  if ("month" in f) return formatMonthShort(f.month);
  const d = (k?: string) => (k ? `${formatDayKey(k, k, { weekday: false })} ${k.slice(0, 4)}` : "");
  if (f.from && f.to) return `${d(f.from)} – ${d(f.to)}`;
  return f.from ? `From ${d(f.from)}` : `Until ${d(f.to)}`;
}

/** The labels of a facet's current values, e.g. ["Confirmed", "Proposal Sent"]. */
export function facetValueLabels(f: EnquiryFilters, facet: keyof EnquiryFilters, labels: ChipLabels = {}): string[] {
  const opt = (list: readonly { id: string; label: string }[], id: string) => list.find(o => o.id === id)?.label ?? id;
  switch (facet) {
    case "status": return f.status.map(k => labels.status?.(k) ?? k.replace(/_/g, " "));
    case "date": return f.date ? [dateFilterLabel(f.date, DATE_PRESETS)] : [];
    case "space": return f.space.map(s => (s === "none" ? "No space yet" : labels.space?.(s) ?? `Space ${s}`));
    case "source": return f.source.map(sourceLabel);
    case "owner": return f.owner === "all" ? [] : [f.owner === "unassigned" ? "Unassigned" : labels.owner?.(f.owner) ?? "Team member"];
    case "needs": return f.needs.map(k => opt(NEEDS_OPTIONS, k));
    case "type": return f.type.slice();
    case "guests": return f.guests.map(k => opt(GUEST_OPTIONS, k));
    case "budget": return f.budget.map(k => opt(BUDGET_OPTIONS, k));
    case "came": return f.came ? [dateFilterLabel(f.came, CAME_PRESETS)] : [];
    case "lostReason": return f.lostReason.map(k => lostReasonLabel(k) ?? k);
    case "client": return f.client.map(k => opt(CLIENT_OPTIONS, k));
  }
  return [];
}

/** One chip per active facet: "Status: Confirmed +1", and the × button's name. */
export function activeChips(f: EnquiryFilters, labels: ChipLabels = {}): { facet: keyof EnquiryFilters; text: string; aria: string }[] {
  return FACET_ORDER.filter(k => isFacetActive(f, k)).map(facet => {
    const vals = facetValueLabels(f, facet, labels);
    const name = FACET_LABELS[facet];
    return {
      facet,
      text: `${name}: ${vals[0] ?? ""}${vals.length > 1 ? ` +${vals.length - 1}` : ""}`,
      aria: `Remove filter ${name}: ${vals.join(", ")}`,
    };
  });
}

/** Words for an empty list: "Event date: This month and Space: Courtyard". */
export function describeFilters(f: EnquiryFilters, labels: ChipLabels = {}): string {
  const parts = FACET_ORDER.filter(k => isFacetActive(f, k)).map(k => `${FACET_LABELS[k]}: ${facetValueLabels(f, k, labels).join(" or ")}`);
  return parts.length <= 1 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

// ── Which view opens ───────────────────────────────────────────────────────

/** Needs reply → Follow-up due → Open: the first with something in it. */
export function defaultView(counts: Record<EnquiryView, number>): EnquiryView {
  return counts.reply > 0 ? "reply" : counts.followup > 0 ? "followup" : "open";
}

// ── URL ────────────────────────────────────────────────────────────────────

/** Every query parameter the list owns, in the order they are written. */
export const LIST_PARAM_KEYS = [
  "view", "q", "in", "status", "date", "space", "src", "owner", "needs", "type", "guests", "budget", "came", "lost", "client", "sort",
] as const;
const DEFAULT_VIEW: EnquiryView = "reply";

const joinList = (vals: readonly (string | number)[]) => vals.map(v => String(v).replace(/,/g, "%2C")).join(",");
const splitList = (v: string) => Array.from(new Set(v.split(",").map(x => x.replace(/%2C/gi, ",").trim()).filter(Boolean)));

function dateToParam(f: DateFilter<string>): string {
  if (!f) return "";
  if ("preset" in f) return f.preset;
  if ("month" in f) return `m:${f.month}`;
  return f.from || f.to ? `${f.from ?? ""}..${f.to ?? ""}` : "";
}
function dateFromParam<P extends string>(v: string, presets: readonly { id: P }[]): DateFilter<P> {
  const p = presets.find(x => x.id === v);
  if (p) return { preset: p.id };
  const m = /^m:(\d{4}-\d{2})$/.exec(v);
  if (m) return isValidMonth(m[1]) ? { month: m[1] } : null;
  const r = /^(\d{4}-\d{2}-\d{2})?\.\.(\d{4}-\d{2}-\d{2})?$/.exec(v);
  if (!r) return null;
  const from = r[1] && isValidDayKey(r[1]) ? r[1] : undefined;
  const to = r[2] && isValidDayKey(r[2]) ? r[2] : undefined;
  if ((r[1] && !from) || (r[2] && !to) || (!from && !to)) return null;
  return { ...(from ? { from } : {}), ...(to ? { to } : {}) };
}

/** The list's state as query parameters: defaults left out, keys in a fixed order. */
export function stateToParams(s: ListState): URLSearchParams {
  const p = new URLSearchParams();
  const f = s.filters;
  if (s.view !== DEFAULT_VIEW) p.set("view", s.view);
  if (s.q.trim()) p.set("q", s.q);
  if (s.q.trim() && s.searchIn) p.set("in", "view");
  if (f.status.length) p.set("status", joinList(f.status));
  if (f.date) { const v = dateToParam(f.date); if (v) p.set("date", v); }
  if (f.space.length) p.set("space", joinList(f.space));
  if (f.source.length) p.set("src", joinList(f.source));
  if (f.owner !== "all") p.set("owner", String(f.owner));
  if (f.needs.length) p.set("needs", joinList(f.needs));
  if (f.type.length) p.set("type", joinList(f.type));
  if (f.guests.length) p.set("guests", joinList(f.guests));
  if (f.budget.length) p.set("budget", joinList(f.budget));
  if (f.came) { const v = dateToParam(f.came); if (v) p.set("came", v); }
  if (f.lostReason.length) p.set("lost", joinList(f.lostReason));
  if (f.client.length) p.set("client", joinList(f.client));
  if (!sameSort(s.sort, viewDefaultSort(s.view))) p.set("sort", sortToParam(s.sort));
  return p;
}

/** True when the URL says anything about the list. */
export const hasListParams = (sp: URLSearchParams) => LIST_PARAM_KEYS.some(k => sp.has(k));

/**
 * Read the list's state back from the URL. Anything unknown or malformed is
 * dropped rather than failing. `filters` is always given (empty when none);
 * `view`, `q`, `searchIn` and `sort` only when the URL has a valid one.
 * `allowed.spaceIds` empty means the spaces aren't known yet: any id is kept.
 */
export function stateFromParams(sp: URLSearchParams, allowed: { statuses: readonly string[]; spaceIds: readonly number[] }): Partial<ListState> & { filters: EnquiryFilters } {
  const out: Partial<ListState> & { filters: EnquiryFilters } = { filters: clearFilters() };
  const f = out.filters;
  const get = (k: string) => sp.get(k) ?? "";
  const view = get("view");
  if ((VIEW_IDS as string[]).includes(view)) out.view = view as EnquiryView;
  const q = get("q");
  if (q.trim()) out.q = q.slice(0, 200);
  if (out.q && get("in") === "view") out.searchIn = true;
  const statuses = allowed.statuses.map(normStatus);
  if (sp.has("status")) f.status = splitList(get("status")).map(normStatus).filter(k => statuses.includes(k));
  if (sp.has("date")) f.date = dateFromParam(get("date"), DATE_PRESETS);
  if (sp.has("space")) {
    f.space = splitList(get("space")).flatMap((v): (number | "none")[] => {
      if (v === "none") return ["none"];
      if (!/^\d{1,9}$/.test(v)) return [];
      const n = Number(v);
      return n > 0 && (allowed.spaceIds.length === 0 || allowed.spaceIds.includes(n)) ? [n] : [];
    });
  }
  if (sp.has("src")) f.source = splitList(get("src")).map(v => v.toLowerCase()).filter(v => /^[a-z0-9_]{1,30}$/.test(v));
  const owner = get("owner");
  if (owner === "unassigned") f.owner = "unassigned";
  else if (/^\d{1,9}$/.test(owner) && Number(owner) > 0) f.owner = Number(owner);
  const pick = <T extends string>(k: string, list: readonly { id: T }[]): T[] =>
    splitList(get(k)).filter((v): v is T => list.some(o => o.id === v));
  if (sp.has("needs")) f.needs = pick("needs", NEEDS_OPTIONS);
  if (sp.has("type")) f.type = splitList(get("type")).filter(v => v.length <= 80);
  if (sp.has("guests")) f.guests = pick("guests", GUEST_OPTIONS);
  if (sp.has("budget")) f.budget = pick("budget", BUDGET_OPTIONS);
  if (sp.has("came")) f.came = dateFromParam(get("came"), CAME_PRESETS);
  if (sp.has("lost")) f.lostReason = pick("lost", LOST_OPTIONS);
  if (sp.has("client")) f.client = pick("client", CLIENT_OPTIONS);
  const sort = sortFromParam(get("sort"));
  if (sort) out.sort = sort;
  return out;
}
