import { describe, it, expect } from "vitest";
import {
  EMPTY_FILTERS, LIST_PARAM_KEYS, activeChips, activeCount, boardRows, clearFacet, clearFilters, compareRows, dayKeyRange,
  datePassedCount, defaultView, enrichRows, facetCounts, formatMonthRange, guestBand, inView, isChipOn, listRows, matchesFilters, needsKind,
  keptPlace, listLayout, quickChips, reviewPassedFilters, rowDatePassed, rowNeeds, shownListKey, stateFromParams, stateToParams, toggleChip, viewCounts, viewDefaultSort,
  type EnquiryFilters, type EnquiryView, type KeptPlace, type LeadLike, type ListCtx, type ListRow, type ListState,
} from "@shared/enquiryFilters";
import { DEFAULT_STATUSES } from "@shared/enquiryStatuses";
import { PARTIAL_LEAD_NOTE } from "@shared/leadConstants";
import { zonedWallTimeToDate } from "@shared/eventDate";
import { isOpenEnquiry } from "@shared/needsToday";

// The Enquiries list's views, filters, sorts and URL. Every client here is
// invented (@example.test). The clock is fixed at Tue 17 Nov 2026, 10:00 in
// Auckland (NZDT, UTC+13), and every date rule is read in the venue's zone.
const TZ = "Pacific/Auckland";
const NOW = Date.UTC(2026, 10, 16, 21, 0);
const HOUR = 3_600_000;
const DAY = 86_400_000;
const ago = (ms: number) => new Date(NOW - ms);
const nz = (y: number, m: number, d: number, h = 12, mi = 0) => zonedWallTimeToDate(y, m, d, h, mi, TZ);
const dateOnly = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

const SPACES = new Map<number, string>([[1, "Main Bar"], [2, "Restaurant"], [3, "Private Dining Room"], [4, "Courtyard"]]);
const ctxAt = (nowMs: number): ListCtx => ({ nowMs, tz: TZ, statusOrder: DEFAULT_STATUSES.map(s => s.key), spaceNames: SPACES });
const ctx = ctxAt(NOW);

let nextId = 1;
/** An in-progress enquiry unless told otherwise: replied to, active two days ago. */
function lead(o: Partial<LeadLike> = {}): LeadLike {
  const id = o.id ?? nextId++;
  return {
    id, firstName: "Test", lastName: `Client${id}`, email: `client${id}@example.test`,
    status: "contacted", createdAt: ago(30 * DAY), respondedAt: ago(29 * DAY), lastActivityAt: ago(2 * DAY),
    eventDate: null, ...o,
  } as LeadLike;
}
type Extra = { inbound?: Record<number, Date>; clash?: number[] };
function rowsOf(leads: LeadLike[], extra: Extra = {}, c: ListCtx = ctx): ListRow[] {
  const replyStatus = new Map(Object.entries(extra.inbound ?? {}).map(([id, at]) => [Number(id), { direction: "in", at }]));
  const clashMap: Record<number, unknown[]> = {};
  for (const id of extra.clash ?? []) clashMap[id] = [{ id: 1 }];
  return enrichRows(leads, { ...c, replyStatus, clashMap, isPartial: l => l.internalNotes === PARTIAL_LEAD_NOTE });
}
const one = (l: Partial<LeadLike>, extra?: Extra, c?: ListCtx) => rowsOf([lead(l)], extra, c)[0];
const viewsOf = (r: ListRow) => (["reply", "followup", "open", "confirmed", "closed", "all"] as EnquiryView[]).filter(v => inView(v, r));
const state = (o: Partial<ListState> = {}): ListState => ({ view: "all", filters: clearFilters(), q: "", sort: { key: "urgent", dir: "asc" }, ...o });
const withF = (f: Partial<EnquiryFilters>): EnquiryFilters => ({ ...clearFilters(), ...f });
const names = (rows: ListRow[]) => rows.map(r => r.lead.lastName);

// A fixture with one of everything, used for the invariants and counts.
function fixture() {
  const leads: LeadLike[] = [
    lead({ id: 101, lastName: "Evans", firstName: "Anahera", status: "new", respondedAt: null, createdAt: ago(20 * DAY + 6 * HOUR), lastActivityAt: ago(20 * DAY), eventDate: nz(2026, 11, 13, 18) }),
    lead({ id: 102, status: "new", respondedAt: null, createdAt: ago(10 * DAY), lastActivityAt: ago(10 * DAY), eventDate: dateOnly(2026, 12, 4) }),
    lead({ id: 103, status: "contacted", eventDate: dateOnly(2026, 12, 20) }), // client wrote back
    lead({ id: 104, status: "proposal_sent", followUpDate: ago(3 * DAY), eventDate: dateOnly(2027, 2, 6), spaceId: 4 }),
    lead({ id: 105, status: "contacted", lastActivityAt: ago(49 * DAY), eventDate: null }),
    lead({ id: 106, status: "negotiating", followUpDate: dateOnly(2026, 11, 24), eventDate: dateOnly(2026, 12, 12), spaceId: 2 }),
    lead({ id: 107, status: "tentative", holdUntil: new Date(NOW + 5 * DAY), eventDate: dateOnly(2026, 12, 5) }),
    lead({ id: 108, status: "contacted", eventDate: nz(2026, 11, 29, 13) }), // clash
    lead({ id: 109, status: "contacted", eventDate: dateOnly(2026, 11, 14) }), // date passed
    lead({ id: 110, status: "new", respondedAt: null, internalNotes: PARTIAL_LEAD_NOTE, createdAt: ago(HOUR) }),
    lead({ id: 111, status: "site_visit", eventDate: dateOnly(2027, 1, 9) }),
    lead({ id: 112, status: "booked", eventDate: nz(2026, 11, 28, 19), spaceName: "Courtyard", spaceId: null }),
    lead({ id: 113, status: "booked", eventDate: dateOnly(2026, 12, 3) }),
    lead({ id: 114, status: "booked", eventDate: dateOnly(2026, 10, 2) }),
    lead({ id: 115, status: "lost", lostReason: "price", eventDate: dateOnly(2026, 9, 1), createdAt: dateOnly(2026, 3, 1) }),
    lead({ id: 116, status: "finished", eventDate: dateOnly(2026, 8, 1) }),
    lead({ id: 117, status: "cancelled", eventDate: dateOnly(2026, 12, 1) }),
    lead({ id: 118, status: "lost", lostReason: "other_venue", createdAt: dateOnly(2025, 6, 1), eventDate: dateOnly(2025, 9, 1) }),
  ];
  return rowsOf(leads, { inbound: { 103: ago(5 * HOUR) }, clash: [108] });
}

describe("A. views", () => {
  it("1. a new enquiry nobody has answered needs a reply", () => {
    const r = one({ status: "new", respondedAt: null, createdAt: ago(2 * HOUR) });
    expect(r.signal.kind).toBe("waiting");
    expect(viewsOf(r)).toEqual(["reply", "open", "all"]);
  });
  it("2. …even after 10 quiet days it stays a reply, not a follow-up", () => {
    const r = one({ status: "new", respondedAt: null, createdAt: ago(10 * DAY), lastActivityAt: ago(10 * DAY) });
    expect(inView("reply", r)).toBe(true);
    expect(inView("followup", r)).toBe(false);
  });
  it("3. the client wrote last → needs reply", () => {
    const l = lead({ status: "contacted" });
    const r = rowsOf([l], { inbound: { [l.id]: ago(4 * HOUR) } })[0];
    expect(r.signal.kind).toBe("client_replied");
    expect(inView("reply", r)).toBe(true);
  });
  it("4. a proposal with a past follow-up date is a follow-up (overdue)", () => {
    const r = one({ status: "proposal_sent", followUpDate: ago(3 * DAY) });
    expect(r.signal.kind).toBe("followup_overdue");
    expect(viewsOf(r)).toEqual(["followup", "open", "all"]);
  });
  it("5. idle 8 days → gone quiet", () => {
    const r = one({ status: "contacted", lastActivityAt: ago(8 * DAY) });
    expect(r.signal.kind).toBe("gone_quiet");
    expect(inView("followup", r)).toBe(true);
  });
  it("6. a future follow-up date is open only, and says when", () => {
    const r = one({ status: "contacted", followUpDate: dateOnly(2026, 11, 24) });
    expect(viewsOf(r)).toEqual(["open", "all"]);
    expect(rowNeeds(r, ctx).text).toBe("Follow up Tue 24 Nov");
  });
  it("7. on hold → open, not reply or follow-up", () => {
    const r = one({ status: "tentative", holdUntil: new Date(NOW + 5 * DAY) });
    expect(r.signal.kind).toBe("hold");
    expect(viewsOf(r)).toEqual(["open", "all"]);
  });
  it("8. a date clash → open", () => {
    const l = lead({ status: "contacted", eventDate: dateOnly(2026, 12, 1) });
    const r = rowsOf([l], { clash: [l.id] })[0];
    expect(r.signal.kind).toBe("clash");
    expect(r.clash).toBe(true);
    expect(viewsOf(r)).toEqual(["open", "all"]);
  });
  it("8b. a clash on an enquiry waiting for a reply is still marked (the row's date line says so)", () => {
    const l = lead({ status: "new", respondedAt: null, createdAt: ago(2 * HOUR), eventDate: dateOnly(2026, 12, 1) });
    const r = rowsOf([l], { clash: [l.id] })[0];
    expect(r.signal.kind).toBe("waiting");
    expect(r.clash).toBe(true);
    expect(one({ status: "contacted" }).clash).toBe(false);
  });
  it("9. event 3 days ago → date passed, still open", () => {
    const r = one({ status: "contacted", eventDate: ago(3 * DAY) });
    expect(r.signal.kind).toBe("date_passed");
    expect(inView("open", r)).toBe(true);
  });
  it("10. an event yesterday evening is not passed yet (one-day margin)", () => {
    const r = one({ status: "contacted", eventDate: nz(2026, 11, 16, 19) });
    expect(r.signal.kind).not.toBe("date_passed");
  });
  it("11. a half-finished form is open, never a reply, even with a message in", () => {
    const l = lead({ status: "new", respondedAt: null, internalNotes: PARTIAL_LEAD_NOTE });
    const r = rowsOf([l], { inbound: { [l.id]: ago(HOUR) } })[0];
    expect(r.signal.kind).toBe("partial");
    expect(viewsOf(r)).toEqual(["open", "all"]);
  });
  it("12. unanswered with the event 5 days ago: still a reply, marked date passed", () => {
    const r = one({ status: "new", respondedAt: null, createdAt: ago(9 * DAY), eventDate: ago(5 * DAY) });
    expect(inView("reply", r)).toBe(true);
    expect(rowDatePassed(r, ctx)).toBe(true);
  });
  it("13. booked (future, today, past, client wrote back) → confirmed", () => {
    const future = one({ status: "booked", eventDate: dateOnly(2026, 12, 3) });
    const today = one({ status: "booked", eventDate: nz(2026, 11, 17, 19) });
    const past = one({ status: "booked", eventDate: ago(5 * DAY) });
    const l = lead({ status: "booked", eventDate: dateOnly(2026, 12, 9) });
    const wrote = rowsOf([l], { inbound: { [l.id]: ago(HOUR) } })[0];
    for (const r of [future, today, past, wrote]) expect(viewsOf(r)).toEqual(["confirmed", "all"]);
    expect(rowNeeds(today, ctx).text).toBe("Event today");
    expect(rowNeeds(past, ctx).text).toBe("Event passed");
  });
  it("14. lost, finished and cancelled → closed", () => {
    for (const status of ["lost", "finished", "cancelled"]) expect(viewsOf(one({ status }))).toEqual(["closed", "all"]);
    expect(rowNeeds(one({ status: "lost", lostReason: "price" }), ctx).text).toBe("Lost · Price / budget");
  });
  it("15. a custom status is open", () => {
    expect(viewsOf(one({ status: "site_visit" }))).toEqual(["open", "all"]);
  });
  it("16. the views fit together on the full fixture", () => {
    const rows = fixture();
    const ids = (v: EnquiryView) => new Set(rows.filter(r => inView(v, r)).map(r => r.lead.id));
    const reply = ids("reply"), followup = ids("followup"), open = ids("open");
    for (const id of reply) expect(followup.has(id)).toBe(false);
    for (const id of [...reply, ...followup]) expect(open.has(id)).toBe(true);
    expect(ids("open").size + ids("confirmed").size + ids("closed").size).toBe(rows.length);
    expect(open.size).toBe(rows.filter(r => isOpenEnquiry(r.lead.status)).length);
  });
});

describe("B. one count source", () => {
  const rows = fixture();
  it("17. the reply count is the reply group (the badge number)", () => {
    const c = viewCounts(rows, EMPTY_FILTERS, "", ctx);
    expect(c.reply).toBe(rows.filter(r => r.signal.group === "reply").length);
    expect(c.reply).toBe(3);
  });
  it("18. the follow-up count is the group, and new + idle counts once, under reply", () => {
    const c = viewCounts(rows, EMPTY_FILTERS, "", ctx);
    expect(c.followup).toBe(rows.filter(r => r.signal.group === "followup").length);
    expect(inView("followup", rows.find(r => r.lead.id === 102)!)).toBe(false);
  });
  it("19. with a filter, each view count is what the list shows", () => {
    const f = withF({ date: { preset: "upcoming" } });
    const c = viewCounts(rows, f, "", ctx);
    for (const v of ["reply", "followup", "open", "confirmed", "closed", "all"] as EnquiryView[]) {
      expect(c[v]).toBe(listRows(rows, state({ view: v, filters: f }), ctx).rows.length);
    }
  });
});

describe("C. most urgent", () => {
  const order = (rows: ListRow[]) => rows.slice().sort(compareRows({ key: "urgent", dir: "asc" }, ctx)).map(r => r.lead.id);
  it("20. waiting 20 days comes before gone quiet 49 days", () => {
    const rows = rowsOf([
      lead({ id: 1, status: "contacted", lastActivityAt: ago(49 * DAY) }),
      lead({ id: 2, status: "new", respondedAt: null, createdAt: ago(20 * DAY) }),
    ]);
    expect(order(rows)).toEqual([2, 1]);
  });
  it("21. overdue 1 day before gone quiet 9 days", () => {
    const rows = rowsOf([
      lead({ id: 1, lastActivityAt: ago(9 * DAY) }),
      lead({ id: 2, status: "proposal_sent", followUpDate: ago(DAY + HOUR) }),
    ]);
    expect(order(rows)).toEqual([2, 1]);
  });
  it("22. a client who replied 3 days ago before one waiting 2 days", () => {
    const rows = rowsOf([
      lead({ id: 1, status: "new", respondedAt: null, createdAt: ago(2 * DAY) }),
      lead({ id: 2 }),
    ], { inbound: { 2: ago(3 * DAY) } });
    expect(order(rows)).toEqual([2, 1]);
  });
  it("23. hold expired, then hold ending in 5 days, then a clash", () => {
    const rows = rowsOf([
      lead({ id: 1, eventDate: dateOnly(2026, 12, 1) }),
      lead({ id: 2, status: "tentative", holdUntil: new Date(NOW + 5 * DAY) }),
      lead({ id: 3, status: "tentative", holdUntil: ago(DAY) }),
    ], { clash: [1] });
    expect(order(rows)).toEqual([3, 2, 1]);
    expect(rows.find(r => r.lead.id === 3)!.signal.kind).toBe("hold_expired");
  });
  it("24. gone quiet: event next week, then 2027, then no date", () => {
    const rows = rowsOf([
      lead({ id: 1, lastActivityAt: ago(60 * DAY) }),
      lead({ id: 2, lastActivityAt: ago(9 * DAY), eventDate: dateOnly(2027, 3, 1) }),
      lead({ id: 3, lastActivityAt: ago(9 * DAY), eventDate: dateOnly(2026, 11, 24) }),
    ]);
    expect(order(rows)).toEqual([3, 2, 1]);
  });
  it("25. in progress: the sooner follow-up date first", () => {
    const rows = rowsOf([
      lead({ id: 1, followUpDate: dateOnly(2026, 12, 1) }),
      lead({ id: 2, followUpDate: dateOnly(2026, 11, 20) }),
    ]);
    expect(order(rows)).toEqual([2, 1]);
  });
  it("26. every open row before confirmed, confirmed before closed", () => {
    const sorted = fixture().sort(compareRows({ key: "urgent", dir: "asc" }, ctx));
    const rank = (r: ListRow) => (r.signal.group === "closed" ? 2 : r.signal.group === "confirmed" ? 1 : 0);
    const ranks = sorted.map(rank);
    expect(ranks).toEqual(ranks.slice().sort((a, b) => a - b));
  });
  it("27. equal keys keep a stable order, by id", () => {
    const rows = rowsOf([lead({ id: 9 }), lead({ id: 3 }), lead({ id: 5 })]);
    expect(order(rows)).toEqual([3, 5, 9]);
    expect(order(rows.reverse())).toEqual([3, 5, 9]);
  });
});

describe("D. event-date sort and dividers", () => {
  const rows = rowsOf([
    lead({ id: 1, lastName: "Yesterday", eventDate: nz(2026, 11, 16, 12) }),
    lead({ id: 2, lastName: "Old", eventDate: dateOnly(2025, 11, 2) }),
    lead({ id: 3, lastName: "Undated", eventDate: null }),
    lead({ id: 4, lastName: "NextYear", eventDate: dateOnly(2027, 2, 1) }),
    lead({ id: 5, lastName: "Tomorrow", eventDate: dateOnly(2026, 11, 18) }),
    lead({ id: 6, lastName: "Tonight", eventDate: nz(2026, 11, 17, 23) }),
  ]);
  it("28. soonest: upcoming, then undated, then past most recent; 2025 is never first", () => {
    const sorted = rows.slice().sort(compareRows({ key: "event", dir: "asc" }, ctx));
    expect(names(sorted)).toEqual(["Tonight", "Tomorrow", "NextYear", "Undated", "Yesterday", "Old"]);
  });
  it("29. latest: every dated row latest first, undated last", () => {
    const sorted = rows.slice().sort(compareRows({ key: "event", dir: "desc" }, ctx));
    expect(names(sorted)).toEqual(["NextYear", "Tomorrow", "Tonight", "Yesterday", "Old", "Undated"]);
  });
  it("30. an event earlier today counts as upcoming", () => {
    const r = one({ eventDate: nz(2026, 11, 17, 8) });
    const sorted = [r, rows[1]].sort(compareRows({ key: "event", dir: "asc" }, ctx));
    expect(sorted[0]).toBe(r);
  });
  it("31. dividers: one per upcoming month, then no date, then already happened", () => {
    // Four rows a month: each month gets its own heading (MONTH_HEADING_MIN_ROWS).
    const busy = [...rows, ...rowsOf([
      lead({ id: 7, lastName: "Nov25", eventDate: dateOnly(2026, 11, 25) }),
      lead({ id: 10, lastName: "Nov26", eventDate: dateOnly(2026, 11, 26) }),
      lead({ id: 8, lastName: "Feb10", eventDate: dateOnly(2027, 2, 10) }),
      lead({ id: 9, lastName: "Feb20", eventDate: dateOnly(2027, 2, 20) }),
      lead({ id: 11, lastName: "Feb25", eventDate: dateOnly(2027, 2, 25) }),
    ])];
    const res = listRows(busy, state({ sort: { key: "event", dir: "asc" } }), ctx);
    expect(res.dividers.map(d => [d.label, d.count, d.at])).toEqual([
      ["November 2026", 4, 0], ["February 2027", 4, 4], ["No date yet", 1, 8], ["Already happened", 2, 9],
    ]);
    const single = listRows(rowsOf([lead({ eventDate: dateOnly(2026, 11, 20) }), lead({ eventDate: dateOnly(2026, 11, 21) })]), state({ sort: { key: "event", dir: "asc" } }), ctx);
    expect(single.dividers).toEqual([]);
  });
  it("31b. Event date set to one month: no heading for that month, Already happened keeps its own", () => {
    const nov = rowsOf([
      lead({ id: 21, lastName: "Thu19", status: "booked", eventDate: dateOnly(2026, 11, 19) }),
      lead({ id: 25, lastName: "Sat21", status: "booked", eventDate: dateOnly(2026, 11, 21) }),
      lead({ id: 28, lastName: "Fri27", status: "booked", eventDate: dateOnly(2026, 11, 27) }),
      lead({ id: 22, lastName: "Sun29", status: "booked", eventDate: dateOnly(2026, 11, 29) }),
      lead({ id: 23, lastName: "Mon2", status: "booked", eventDate: dateOnly(2026, 11, 2) }),
      lead({ id: 24, lastName: "Dec5", status: "booked", eventDate: dateOnly(2026, 12, 5) }),
      lead({ id: 26, lastName: "Dec8", status: "booked", eventDate: dateOnly(2026, 12, 8) }),
      lead({ id: 27, lastName: "Dec15", status: "booked", eventDate: dateOnly(2026, 12, 15) }),
      lead({ id: 29, lastName: "Dec20", status: "booked", eventDate: dateOnly(2026, 12, 20) }),
    ]);
    const confirmed = (date: EnquiryFilters["date"]) => listRows(nov, state({ view: "confirmed", filters: withF({ date }), sort: { key: "event", dir: "asc" } }), ctx);
    const thisMonth = confirmed({ preset: "this_month" });
    expect(names(thisMonth.rows)).toEqual(["Thu19", "Sat21", "Fri27", "Sun29", "Mon2"]);
    expect(thisMonth.dividers.map(d => [d.label, d.count, d.at])).toEqual([["Already happened", 1, 4]]);
    expect(confirmed({ month: "2026-11" }).dividers.map(d => d.label)).toEqual(["Already happened"]);
    // Any other range keeps its month headings.
    expect(confirmed({ preset: "upcoming" }).dividers.map(d => d.label)).toEqual(["November 2026", "December 2026"]);
    expect(confirmed(null).dividers.map(d => d.label)).toEqual(["November 2026", "December 2026", "Already happened"]);
  });
  it("31c. no busy month: no month headings; No date yet and Already happened stay", () => {
    // November 2, February 1.
    const res = listRows(rows, state({ sort: { key: "event", dir: "asc" } }), ctx);
    expect(names(res.rows)).toEqual(["Tonight", "Tomorrow", "NextYear", "Undated", "Yesterday", "Old"]);
    expect(res.dividers.map(d => [d.label, d.count, d.at])).toEqual([["No date yet", 1, 3], ["Already happened", 2, 4]]);
  });
  it("31d. Closed, latest first: lost enquiries spread over many months get no month headings", () => {
    const lost = rowsOf([
      lead({ id: 31, lastName: "Feb", status: "lost", eventDate: dateOnly(2027, 2, 6) }),
      lead({ id: 32, lastName: "Dec", status: "lost", eventDate: dateOnly(2026, 12, 12) }),
      lead({ id: 33, lastName: "Nov", status: "lost", eventDate: dateOnly(2026, 11, 3) }),
      lead({ id: 34, lastName: "Oct1", status: "lost", eventDate: dateOnly(2026, 10, 20) }),
      lead({ id: 35, lastName: "Oct2", status: "lost", eventDate: dateOnly(2026, 10, 9) }),
      lead({ id: 36, lastName: "Undated", status: "lost", eventDate: null }),
    ]);
    const res = listRows(lost, state({ view: "closed", filters: withF({ status: ["lost"] }), sort: { key: "event", dir: "desc" } }), ctx);
    expect(names(res.rows)).toEqual(["Feb", "Dec", "Nov", "Oct1", "Oct2", "Undated"]);
    expect(res.dividers.map(d => [d.label, d.count, d.at])).toEqual([["No date yet", 1, 5]]);
    // Without the undated one nothing is left to head.
    expect(listRows(lost.slice(0, 5), state({ view: "closed", sort: { key: "event", dir: "desc" } }), ctx).dividers).toEqual([]);
  });
  it("31e. a month of 4 or more keeps its heading; quiet months next to each other share one", () => {
    const month = (id: number, y: number, m: number, d: number) => lead({ id, lastName: `M${m}D${d}`, status: "booked", eventDate: dateOnly(y, m, d) });
    const heads = (r: ListRow[], o: Partial<ListState> = {}) =>
      listRows(r, state({ view: "confirmed", sort: { key: "event", dir: "asc" }, ...o }), ctx).dividers.map(d => `${d.label} · ${d.count} @${d.at}`);
    const days = (id: number, y: number, m: number, n: number) => Array.from({ length: n }, (_, i) => month(id + i, y, m, 20 + i));
    // November 5, December 1, January 6: the quiet month between two busy ones keeps its own heading.
    const between = rowsOf([...days(41, 2026, 11, 5), month(46, 2026, 12, 5), ...days(47, 2027, 1, 6)]);
    expect(heads(between)).toEqual(["November 2026 · 5 @0", "December 2026 · 1 @5", "January 2027 · 6 @6"]);
    // November 5, then December 2, January 1, March 1: one heading for the quiet run, across the new year.
    const tail = rowsOf([...days(51, 2026, 11, 5), ...days(56, 2026, 12, 2), month(58, 2027, 1, 8), month(59, 2027, 3, 3)]);
    expect(heads(tail)).toEqual(["November 2026 · 5 @0", "December 2026 – March 2027 · 4 @5"]);
    // Latest first, the range still reads earliest month first.
    expect(heads(tail, { sort: { key: "event", dir: "desc" } })).toEqual(["December 2026 – March 2027 · 4 @0", "November 2026 · 5 @4"]);
    // Every view follows the same rule (here Open, sorted by event date).
    const open = rowsOf([...days(61, 2026, 11, 6), month(67, 2027, 2, 5), month(68, 2027, 4, 6)].map(l => ({ ...l, status: "contacted" })));
    expect(heads(open, { view: "open" })).toEqual(["November 2026 · 6 @0", "February – April 2027 · 2 @6"]);
  });
  it("31j. headings that would hold under 4 rows each on average are left out", () => {
    const month = (id: number, y: number, m: number, d: number) => lead({ id, lastName: `M${m}D${d}`, status: "booked", eventDate: dateOnly(y, m, d) });
    const days = (id: number, y: number, m: number, n: number) => Array.from({ length: n }, (_, i) => month(id + i, y, m, 20 + i));
    const heads = (r: ListRow[]) => listRows(r, state({ view: "confirmed", sort: { key: "event", dir: "asc" } }), ctx).dividers.map(d => `${d.label} · ${d.count}`);
    // November 4, December 4, then 3 more over February to May: 11 rows under 3 headings.
    const short = [...days(121, 2026, 11, 4), ...days(125, 2026, 12, 4), month(129, 2027, 2, 1), month(130, 2027, 3, 1), month(131, 2027, 5, 1)];
    expect(heads(rowsOf(short))).toEqual([]);
    // One more in the spring: 12 under 3, and the headings come back.
    expect(heads(rowsOf([...short, month(132, 2027, 4, 1)]))).toEqual(["November 2026 · 4", "December 2026 · 4", "February – May 2027 · 4"]);
  });
  it("31g. Confirmed with a few far-off bookings keeps its busy months' headings as the weeks pass", () => {
    // The shape of a venue's bookings on 25 Nov: busy months first, then one or two a month.
    const counts: [number, number, number][] = [[2026, 11, 4], [2026, 12, 7], [2027, 1, 4], [2027, 2, 2], [2027, 3, 1], [2027, 4, 1], [2027, 5, 1], [2027, 7, 1]];
    let id = 700;
    const booked = counts.flatMap(([y, m, n]) => Array.from({ length: n }, (_, i) => lead({ id: ++id, status: "booked", eventDate: dateOnly(y, m, m === 11 ? 26 + i : 6 + i) })));
    const past = Array.from({ length: 5 }, (_, i) => lead({ id: ++id, status: "booked", eventDate: dateOnly(2026, 11, 1 + i) }));
    const at25 = ctxAt(Date.UTC(2026, 10, 24, 21, 0)); // Wed 25 Nov, 10:00 in Auckland
    const heads = (leads: LeadLike[], c = at25) => listRows(rowsOf(leads, {}, c), state({ view: "confirmed", sort: { key: "event", dir: "asc" } }), c).dividers.map(d => `${d.label} · ${d.count}`);
    const expected = ["November 2026 · 4", "December 2026 · 7", "January 2027 · 4", "February – July 2027 · 6", "Already happened · 5"];
    expect(heads([...booked, ...past])).toEqual(expected);
    // Two more bookings in two new far-off months only widen the last month heading.
    const more = [lead({ id: ++id, status: "booked", eventDate: dateOnly(2027, 9, 4) }), lead({ id: ++id, status: "booked", eventDate: dateOnly(2027, 10, 9) })];
    expect(heads([...booked, ...more, ...past])).toEqual([...expected.slice(0, 3), "February – October 2027 · 8", "Already happened · 5"]);
    // A week on (2 Dec), November has passed: December and January keep their headings.
    const at2Dec = ctxAt(Date.UTC(2026, 11, 1, 21, 0));
    expect(heads([...booked, ...past], at2Dec)).toEqual(["December 2026 · 7", "January 2027 · 4", "February – July 2027 · 6", "Already happened · 9"]);
  });
  it("31h. month range wording", () => {
    expect(formatMonthRange("2027-02", "2027-07")).toBe("February – July 2027");
    expect(formatMonthRange("2027-07", "2027-02")).toBe("February – July 2027");
    expect(formatMonthRange("2026-12", "2027-02")).toBe("December 2026 – February 2027");
    expect(formatMonthRange("2026-12", "2026-12")).toBe("December 2026");
  });
  it("31i. latest first, rows spread thinly (busy months hold half the rows or fewer): no month headings", () => {
    const lost = (id: number, y: number, m: number, n: number) =>
      Array.from({ length: n }, (_, i) => lead({ id: id + i, lastName: `L${m}-${i}`, status: "lost", eventDate: dateOnly(y, m, 1 + i) }));
    const closed = (r: ListRow[]) => listRows(r, state({ view: "closed", sort: { key: "event", dir: "desc" } }), ctx).dividers.map(d => `${d.label} · ${d.count}`);
    // Closed's usual shape: three or four lost a month. October 4 of 15: no headings.
    expect(closed(rowsOf([...lost(80, 2026, 11, 3), ...lost(83, 2026, 10, 4), ...lost(87, 2026, 9, 3), ...lost(90, 2026, 8, 3), ...lost(93, 2026, 7, 2)]))).toEqual([]);
    // Exactly half in busy months: still none. More than half: headings.
    expect(closed(rowsOf([...lost(100, 2026, 11, 4), ...lost(104, 2026, 10, 2), ...lost(106, 2026, 9, 2)]))).toEqual([]);
    expect(closed(rowsOf([...lost(110, 2026, 11, 5), ...lost(115, 2026, 10, 2), ...lost(117, 2026, 9, 2)]))).toEqual(["November 2026 · 5", "September – October 2026 · 4"]);
  });
  it("31k. Confirmed, soonest first, keeps the headings of months that still hold several bookings as the weeks go by", () => {
    // Five in early November, then 3 in December, 4 in January and six more
    // over February to July. The data stays the same; only the clock moves.
    const days: [number, number, number[]][] = [
      [2026, 11, [2, 5, 9, 12, 14]], [2026, 12, [15, 18, 22]], [2027, 1, [5, 8, 16, 23]],
      [2027, 2, [6, 20]], [2027, 3, [13]], [2027, 4, [10]], [2027, 5, [8]], [2027, 7, [17]],
    ];
    let id = 800;
    const booked = days.flatMap(([y, m, ds]) => ds.map(d => lead({ id: ++id, status: "booked", eventDate: dateOnly(y, m, d) })));
    const heads = (c: ListCtx, dir: "asc" | "desc" = "asc") =>
      listRows(rowsOf(booked, {}, c), state({ view: "confirmed", sort: { key: "event", dir } }), c).dividers.map(d => `${d.label} · ${d.count}`);
    // 14 December: December 3 and January 4 keep their headings, even though
    // January is the only month of 4 or more (it holds under half the 13 to come).
    const at14Dec = ctxAt(Date.UTC(2026, 11, 13, 21, 0));
    expect(heads(at14Dec)).toEqual(["December 2026 · 3", "January 2027 · 4", "February – July 2027 · 6", "Already happened · 5"]);
    // 20 December: one December booking left. Three month headings would hold
    // 11 rows, under 4 each on average, so there are none.
    const at20Dec = ctxAt(Date.UTC(2026, 11, 19, 21, 0));
    expect(heads(at20Dec)).toEqual(["Already happened · 7"]);
    // 10 January: no month holds 4 any more; the eight still to come share one heading.
    const at10Jan = ctxAt(Date.UTC(2027, 0, 9, 21, 0));
    expect(heads(at10Jan)).toEqual(["January – July 2027 · 8", "Already happened · 10"]);
    // The same rows latest first follow the latest-first rule: the busy
    // months (November and January) hold only half the rows, so no month headings.
    expect(heads(at14Dec, "desc")).toEqual([]);
  });
  it("31l. Closed, latest first: a few busy months among many thin ones still get no month headings", () => {
    const STATUS = ["lost", "finished", "cancelled"] as const;
    let id = 900;
    const spread = (shape: [number, number, number][], status?: string) => shape.flatMap(([y, m, n]) =>
      Array.from({ length: n }, (_, i) => lead({ id: ++id, lastName: `C${y}-${m}-${i}`, status: status ?? STATUS[id % 3], eventDate: dateOnly(y, m, 1 + i) })));
    // Every closed enquiry: November 6, October 4, September 4, and one to
    // three a month either side (42 rows, 14 of them in the busy months).
    const closedAll = spread([
      [2027, 2, 1], [2027, 1, 1], [2026, 12, 3], [2026, 11, 6], [2026, 10, 4], [2026, 9, 4], [2026, 8, 3], [2026, 7, 2], [2026, 6, 2],
      [2026, 5, 3], [2026, 4, 2], [2026, 3, 2], [2026, 1, 3], [2025, 12, 2], [2025, 11, 1], [2025, 10, 1], [2025, 9, 1], [2025, 7, 1],
    ]);
    // Lost this year: no month holds 4.
    const lostThisYear = spread([
      [2027, 2, 1], [2027, 1, 1], [2026, 12, 3], [2026, 11, 3], [2026, 10, 2], [2026, 9, 2], [2026, 8, 2], [2026, 7, 1], [2026, 6, 1], [2026, 5, 1], [2026, 4, 1],
    ], "lost");
    const at14Dec = ctxAt(Date.UTC(2026, 11, 13, 21, 0));
    for (const c of [ctx, at14Dec]) {
      for (const leads of [closedAll, lostThisYear]) {
        const res = listRows(rowsOf(leads, {}, c), state({ view: "closed", sort: { key: "event", dir: "desc" } }), c);
        expect(res.rows).toHaveLength(leads.length);
        expect(res.dividers).toEqual([]);
      }
    }
    // Sorted soonest first instead, Closed follows the soonest-first rule:
    // December to February share a heading, then Already happened.
    const asc = listRows(rowsOf(closedAll), state({ view: "closed", sort: { key: "event", dir: "asc" } }), ctx);
    expect(asc.dividers.map(d => `${d.label} · ${d.count}`)).toEqual(["December 2026 – February 2027 · 5", "Already happened · 37"]);
  });
  it("31f. search keeps its pile headings however few rows each holds", () => {
    const piles = rowsOf([
      lead({ id: 61, lastName: "Pilecheck", status: "booked", eventDate: dateOnly(2026, 12, 1) }),
      lead({ id: 62, lastName: "Pilecheck", status: "lost", eventDate: dateOnly(2026, 10, 1) }),
    ]);
    const res = listRows(piles, state({ q: "pilecheck", sort: { key: "event", dir: "asc" } }), ctx);
    expect(res.dividers.map(d => `${d.label} · ${d.count}`)).toEqual(["Confirmed · 1", "Closed · 1"]);
  });
  it("32. most urgent has no dividers", () => {
    expect(listRows(rows, state(), ctx).dividers).toEqual([]);
  });
});

describe("E. date presets, in the venue's zone", () => {
  const match = (f: EnquiryFilters["date"], l: Partial<LeadLike>, c = ctx) => matchesFilters(one(l, {}, c), withF({ date: f }), c);
  it("33. upcoming takes undated and today, not yesterday", () => {
    expect(match({ preset: "upcoming" }, { eventDate: null })).toBe(true);
    expect(match({ preset: "upcoming" }, { eventDate: nz(2026, 11, 17, 8) })).toBe(true);
    expect(match({ preset: "upcoming" }, { eventDate: nz(2026, 11, 16, 20) })).toBe(false);
  });
  it("34. this week (Monday to Sunday) on Sunday 22 Nov includes Monday 16 Nov", () => {
    const sun = ctxAt(nz(2026, 11, 22, 10).getTime());
    expect(match({ preset: "this_week" }, { eventDate: dateOnly(2026, 11, 16) }, sun)).toBe(true);
    expect(match({ preset: "this_week" }, { eventDate: dateOnly(2026, 11, 23) }, sun)).toBe(false);
  });
  it("35. this weekend: the coming Sat and Sun; on Sunday, just Sunday", () => {
    expect(dayKeyRange({ preset: "weekend" }, "2026-11-18")).toMatchObject({ from: "2026-11-21", to: "2026-11-22" });
    expect(dayKeyRange({ preset: "weekend" }, "2026-11-21")).toMatchObject({ from: "2026-11-21", to: "2026-11-22" });
    expect(dayKeyRange({ preset: "weekend" }, "2026-11-22")).toMatchObject({ from: "2026-11-22", to: "2026-11-22" });
  });
  it("36. next 30 days: today to day 29", () => {
    expect(match({ preset: "next_30" }, { eventDate: dateOnly(2026, 11, 17) })).toBe(true);
    expect(match({ preset: "next_30" }, { eventDate: dateOnly(2026, 12, 16) })).toBe(true);
    expect(match({ preset: "next_30" }, { eventDate: dateOnly(2026, 12, 17) })).toBe(false);
  });
  it("37. this month ends at midnight in Auckland", () => {
    expect(match({ preset: "this_month" }, { eventDate: nz(2026, 11, 30, 23, 30) })).toBe(true);
    expect(match({ preset: "this_month" }, { eventDate: nz(2026, 12, 1, 0, 30) })).toBe(false);
  });
  it("38. next month on 17 Nov is December", () => {
    expect(dayKeyRange({ preset: "next_month" }, "2026-11-17")).toMatchObject({ from: "2026-12-01", to: "2026-12-31" });
  });
  it("39. a picked month", () => {
    expect(match({ month: "2026-12" }, { eventDate: dateOnly(2026, 12, 31) })).toBe(true);
    expect(match({ month: "2026-12" }, { eventDate: dateOnly(2027, 1, 1) })).toBe(false);
  });
  it("40. a range is inclusive, swaps from > to, and can be open-ended", () => {
    expect(match({ from: "2026-11-01", to: "2026-11-30" }, { eventDate: nz(2026, 11, 30, 23, 59) })).toBe(true);
    expect(match({ from: "2026-11-30", to: "2026-11-01" }, { eventDate: dateOnly(2026, 11, 15) })).toBe(true);
    expect(match({ from: "2026-11-20" }, { eventDate: dateOnly(2028, 1, 1) })).toBe(true);
    expect(match({ from: "2026-11-20" }, { eventDate: dateOnly(2026, 11, 19) })).toBe(false);
  });
  it("41. no date yet: no event date, or a flexible one", () => {
    expect(match({ preset: "none" }, { eventDate: null })).toBe(true);
    expect(match({ preset: "none" }, { eventDate: dateOnly(2026, 12, 1), dateFlexible: true })).toBe(true);
    expect(match({ preset: "none" }, { eventDate: dateOnly(2026, 12, 1) })).toBe(false);
  });
  it("42. already happened leaves out undated and today", () => {
    expect(match({ preset: "past" }, { eventDate: null })).toBe(false);
    expect(match({ preset: "past" }, { eventDate: nz(2026, 11, 17, 8) })).toBe(false);
    expect(match({ preset: "past" }, { eventDate: dateOnly(2026, 11, 16) })).toBe(true);
  });
  it("43. came in this year starts 1 Jan in Auckland; last year is all of 2025", () => {
    const came = (f: EnquiryFilters["came"], createdAt: Date) => matchesFilters(one({ createdAt }), withF({ came: f }), ctx);
    expect(came({ preset: "this_year" }, nz(2026, 1, 1, 0, 0))).toBe(true);
    expect(came({ preset: "this_year" }, nz(2025, 12, 31, 23, 59))).toBe(false);
    expect(came({ preset: "last_year" }, nz(2025, 12, 31, 23, 59))).toBe(true);
    expect(came({ preset: "last_year" }, nz(2025, 1, 1, 0, 0))).toBe(true);
  });
});

describe("F. facets", () => {
  const rows = fixture();
  const shown = (f: Partial<EnquiryFilters>) => rows.filter(r => matchesFilters(r, withF(f), ctx)).map(r => r.lead.id);
  it("44. values in a facet are OR'd", () => {
    expect(shown({ status: ["proposal_sent", "negotiating"] })).toEqual([104, 106]);
  });
  it("45. facets are AND'd", () => {
    expect(shown({ status: ["proposal_sent", "negotiating"], space: [2] })).toEqual([106]);
  });
  it("46. space: none, and the space name when there is no space id", () => {
    expect(shown({ space: [4] })).toEqual([104, 112]);
    expect(shown({ space: ["none"] })).not.toContain(112);
    expect(shown({ space: ["none"] })).toContain(101);
  });
  it("47. owner: unassigned", () => {
    const r = rowsOf([lead({ id: 1, assignedTo: 7 }), lead({ id: 2, assignedTo: null })]);
    expect(r.filter(x => matchesFilters(x, withF({ owner: "unassigned" }), ctx)).map(x => x.lead.id)).toEqual([2]);
    expect(r.filter(x => matchesFilters(x, withF({ owner: 7 }), ctx)).map(x => x.lead.id)).toEqual([1]);
  });
  it("48. guest bands", () => {
    expect([19, 20, 49, 50, 100, null].map(guestBand)).toEqual(["lt20", "20_49", "20_49", "50_99", "100p", null]);
  });
  it("49. budget not given", () => {
    const r = rowsOf([lead({ id: 1, budgetRange: "5_10k" }), lead({ id: 2, budgetRange: null })]);
    expect(r.filter(x => matchesFilters(x, withF({ budget: ["none"] }), ctx)).map(x => x.lead.id)).toEqual([2]);
  });
  it("50. event type ignores case", () => {
    const r = rowsOf([lead({ id: 1, eventType: "Christmas Party" }), lead({ id: 2, eventType: "christmas party " }), lead({ id: 3, eventType: "Wedding" })]);
    expect(r.filter(x => matchesFilters(x, withF({ type: ["Christmas party"] }), ctx)).map(x => x.lead.id)).toEqual([1, 2]);
  });
  it("51. lost reason narrows the lost rows only", () => {
    const ids = shown({ lostReason: ["price"] });
    expect(ids).toContain(115);
    expect(ids).not.toContain(118);
    expect(ids).toContain(101);
    expect(ids.length).toBe(rows.length - 1);
  });
  it("52. returning client and possible duplicate come from the client flag", () => {
    const r = rowsOf([
      lead({ id: 1, clientFlag: { bookedEvents: 2, pastEvents: 1, duplicateIds: [] } }),
      lead({ id: 2, clientFlag: { bookedEvents: 0, pastEvents: 0, duplicateIds: [9] } }),
      lead({ id: 3, clientFlag: null }),
    ]);
    const pick = (client: EnquiryFilters["client"]) => r.filter(x => matchesFilters(x, withF({ client }), ctx)).map(x => x.lead.id);
    expect(pick(["returning"])).toEqual([1]);
    expect(pick(["duplicate"])).toEqual([2]);
    expect(pick(["returning", "duplicate"])).toEqual([1, 2]);
  });
  it("53. needs = date passed gives exactly the date-passed rows", () => {
    expect(shown({ needs: ["passed"] })).toEqual(rows.filter(r => r.signal.kind === "date_passed").map(r => r.lead.id));
    expect(shown({ needs: ["passed"] })).toEqual([109]);
    expect(needsKind(rows.find(r => r.lead.id === 107)!)).toBe("hold");
  });
});

describe("G. facet counts", () => {
  const rows = fixture();
  it("54. a facet's own choice is ignored; the others apply", () => {
    const s = state({ filters: withF({ status: ["booked"], space: [4] }) });
    const status = facetCounts(rows, s, "status", ctx);
    expect(status.get("booked")).toBe(1);
    expect(status.get("proposal_sent")).toBe(1);
    const space = facetCounts(rows, s, "space", ctx);
    expect(space.get("4")).toBe(1);
    expect(space.get("none")).toBe(2); // the two booked rows with no space
  });
  it("55. counts in a one-value-per-row facet add up to the view count", () => {
    const s = state({ view: "open" });
    const c = facetCounts(rows, s, "budget", ctx);
    const sum = Array.from(c.entries()).filter(([k]) => k !== "*").reduce((a, [, n]) => a + n, 0);
    expect(sum).toBe(listRows(rows, s, ctx).rows.length);
    const needs = facetCounts(rows, s, "needs", ctx);
    expect(Array.from(needs.entries()).filter(([k]) => k !== "*").reduce((a, [, n]) => a + n, 0)).toBe(listRows(rows, s, ctx).rows.length);
  });
});

describe("H. search", () => {
  const callum = lead({ id: 300, firstName: "Callum", lastName: "Reid", status: "lost", email: "callum@example.test" });
  const margot = [
    lead({ id: 301, firstName: "Margot", lastName: "Ellingham", status: "finished", eventDate: dateOnly(2025, 12, 5) }),
    lead({ id: 302, firstName: "Margot", lastName: "Ellingham", status: "booked", eventDate: dateOnly(2026, 12, 11) }),
    lead({ id: 303, firstName: "Margot", lastName: "Ellingham", status: "proposal_sent", lastActivityAt: ago(8 * DAY), eventDate: dateOnly(2027, 3, 1) }),
    lead({ id: 304, firstName: "Margot", lastName: "Ellingham", status: "lost", eventDate: dateOnly(2026, 5, 1) }),
  ];
  const rows = [...fixture(), ...rowsOf([callum, ...margot])];
  it("56. typing from Needs reply searches everything: a lost client is found", () => {
    const res = listRows(rows, state({ view: "reply", q: "Callum" }), ctx);
    expect(res.rows.map(r => r.lead.id)).toEqual([300]);
  });
  it("57. every enquiry of one client, grouped by pile, in a fixed order", () => {
    const res = listRows(rows, state({ view: "reply", q: "ellingham" }), ctx);
    expect(res.rows.map(r => r.lead.id).sort()).toEqual([301, 302, 303, 304]);
    expect(res.dividers.map(d => `${d.label} · ${d.count}`)).toEqual(["Follow-up due · 1", "Confirmed · 1", "Closed · 2"]);
    expect(listRows(rows, state({ q: "ellingham margot" }), ctx).rows.length).toBe(4);
  });
  it("58. matches the filters hide are counted", () => {
    const res = listRows(rows, state({ view: "reply", q: "ellingham", filters: withF({ date: { preset: "upcoming" } }) }), ctx);
    expect(res.rows.map(r => r.lead.id).sort()).toEqual([302, 303]);
    expect(res.hiddenByFilters).toBe(2);
  });
  it("59. while searching, view counts are match counts", () => {
    const c = viewCounts(rows, EMPTY_FILTERS, "ellingham", ctx);
    expect(c).toEqual({ reply: 0, followup: 1, open: 1, confirmed: 1, closed: 2, all: 4 });
  });
  it("a tab clicked while searching narrows the results to it", () => {
    const res = listRows(rows, state({ view: "closed", q: "ellingham", searchIn: true, sort: viewDefaultSort("closed") }), ctx);
    expect(res.rows.map(r => r.lead.id).sort()).toEqual([301, 304]);
  });
});

describe("I. quick chips", () => {
  const [lostThisYear, lost] = quickChips("closed");
  it("60. Lost this year is on only with status lost and came in this year; off clears both", () => {
    const f = toggleChip(clearFilters(), lostThisYear);
    expect(f.status).toEqual(["lost"]);
    expect(f.came).toEqual({ preset: "this_year" });
    expect(isChipOn(f, lostThisYear)).toBe(true);
    expect(isChipOn({ ...f, came: null }, lostThisYear)).toBe(false);
    const off = toggleChip(f, lostThisYear);
    expect(off.status).toEqual([]);
    expect(off.came).toBeNull();
  });
  it("61. Lost and Lost this year are never both on", () => {
    const a = toggleChip(clearFilters(), lost);
    expect(isChipOn(a, lost)).toBe(true);
    expect(isChipOn(a, lostThisYear)).toBe(false);
    const b = toggleChip(a, lostThisYear);
    expect(isChipOn(b, lost)).toBe(false);
    expect(isChipOn(b, lostThisYear)).toBe(true);
  });
  it("62. This month and Next month replace each other", () => {
    const [thisMonth, nextMonth] = quickChips("confirmed");
    const f = toggleChip(toggleChip(clearFilters(), thisMonth), nextMonth);
    expect(f.date).toEqual({ preset: "next_month" });
    expect(isChipOn(f, thisMonth)).toBe(false);
  });
  it("63. a chip leaves other facets alone", () => {
    const f = toggleChip(withF({ space: [4], guests: ["50_99"] }), quickChips("open")[0]);
    expect(f.space).toEqual([4]);
    expect(f.guests).toEqual(["50_99"]);
  });
  it("64. Needs reply has no quick chips", () => {
    expect(quickChips("reply")).toEqual([]);
    expect(quickChips("followup").map(c => c.label)).toEqual(["Overdue", "Gone quiet"]);
  });
});

describe("J. active filter chips", () => {
  const labels = { status: (k: string) => DEFAULT_STATUSES.find(s => s.key === k)?.label ?? k, space: (id: number) => SPACES.get(id) };
  it("65. one chip per facet, with the venue's labels", () => {
    const chips = activeChips(withF({ status: ["booked", "proposal_sent"], space: [4], date: { preset: "this_month" } }), labels);
    expect(chips.map(c => c.text)).toEqual(["Status: Confirmed +1", "Event date: This month", "Space: Courtyard"]);
    expect(chips[0].aria).toBe("Remove filter Status: Confirmed, Proposal Sent");
  });
  it("66. activeCount counts facets, not values", () => {
    expect(activeCount(withF({ status: ["new", "contacted", "lost"], owner: "unassigned" }))).toBe(2);
    expect(activeCount(EMPTY_FILTERS)).toBe(0);
  });
  it("67. clearing one facet leaves the rest", () => {
    const f = clearFacet(withF({ status: ["new"], space: [4] }), "status");
    expect(f.status).toEqual([]);
    expect(f.space).toEqual([4]);
  });
  it("68. clear all empties the filters, never the view, search or sort", () => {
    const s = state({ view: "closed", q: "jane", sort: { key: "came", dir: "desc" }, filters: withF({ status: ["lost"] }) });
    const cleared = { ...s, filters: clearFilters() };
    expect(cleared.filters).toEqual(EMPTY_FILTERS);
    expect([cleared.view, cleared.q, cleared.sort.key]).toEqual(["closed", "jane", "came"]);
  });
});

describe("K. the URL", () => {
  const allowed = { statuses: DEFAULT_STATUSES.map(s => s.key), spaceIds: [1, 2, 3, 4] };
  const full: ListState = {
    view: "confirmed", q: "smith", searchIn: true, sort: { key: "came", dir: "asc" },
    filters: {
      status: ["booked", "proposal_sent"], date: { from: "2026-11-01", to: "2026-11-30" }, space: [4, "none"], source: ["instagram"],
      owner: "unassigned", needs: ["overdue"], type: ["Christmas party", "Wedding, small"], guests: ["50_99"], budget: ["none", "5_10k"],
      came: { preset: "this_year" }, lostReason: ["price"], client: ["returning"],
    },
  };
  it("69. a full state round-trips", () => {
    const back = stateFromParams(new URLSearchParams(stateToParams(full).toString()), allowed);
    expect(back).toEqual(full);
    const month = { ...full, filters: { ...full.filters, date: { month: "2026-12" } } };
    expect(stateFromParams(stateToParams(month), allowed).filters.date).toEqual({ month: "2026-12" });
  });
  it("70. the default state writes nothing; a view's own default sort is left out", () => {
    expect(stateToParams(state({ view: "reply" })).toString()).toBe("");
    expect(stateToParams(state({ view: "closed", sort: { key: "event", dir: "desc" } })).toString()).toBe("view=closed");
    expect(stateToParams(state({ view: "closed", sort: { key: "event", dir: "asc" } })).toString()).toBe("view=closed&sort=event");
    expect(stateToParams(state({ view: "open", sort: { key: "event", dir: "desc" } })).toString()).toBe("view=open&sort=-event");
  });
  it("71. keys come out in a fixed order", () => {
    const keys = Array.from(stateToParams(full).keys());
    expect(keys).toEqual(LIST_PARAM_KEYS.filter(k => keys.includes(k)));
    expect(keys[0]).toBe("view");
    expect(keys[keys.length - 1]).toBe("sort");
  });
  it("72. junk is dropped, not fatal", () => {
    const sp = new URLSearchParams("view=nope&status=__proto__,new,made_up&date=2026-13-40&guests=abc&space=abc,4&came=m:2026-99&sort=sideways&owner=-3");
    const s = stateFromParams(sp, allowed);
    expect(s.view).toBeUndefined();
    expect(s.sort).toBeUndefined();
    expect(s.filters).toEqual({ ...clearFilters(), status: ["new"], space: [4] });
  });
  it("73. LIST_PARAM_KEYS covers every key the state can write", () => {
    for (const k of stateToParams(full).keys()) expect(LIST_PARAM_KEYS).toContain(k);
  });
});

describe("L. kept rows and the opening view", () => {
  it("74. an unsent reply's row stays at its sorted place when a filter would hide it", () => {
    const rows = rowsOf([
      lead({ id: 1, status: "new", respondedAt: null, createdAt: ago(5 * DAY), eventDate: dateOnly(2026, 11, 20) }),
      lead({ id: 2, status: "new", respondedAt: null, createdAt: ago(3 * DAY), eventDate: dateOnly(2027, 1, 20) }),
      lead({ id: 3, status: "new", respondedAt: null, createdAt: ago(DAY), eventDate: dateOnly(2026, 11, 25) }),
    ]);
    const s = state({ view: "reply", filters: withF({ date: { preset: "this_month" } }) });
    expect(listRows(rows, s, ctx).rows.map(r => r.lead.id)).toEqual([1, 3]);
    const kept = listRows(rows, s, ctx, { alwaysInclude: [2] });
    expect(kept.rows.map(r => r.lead.id)).toEqual([1, 2, 3]);
    expect(kept.pinnedOutside).toEqual([2]);
  });
  it("a row just moved to another status stays where it was", () => {
    const rows = rowsOf([lead({ id: 1, status: "new", respondedAt: null, createdAt: ago(5 * DAY) }), lead({ id: 2, status: "new", respondedAt: null, createdAt: ago(3 * DAY) }), lead({ id: 3, status: "new", respondedAt: null, createdAt: ago(DAY) })]);
    const s = state({ view: "reply" });
    const place = keptPlace(listLayout(listRows(rows, s, ctx)), 2)!;
    expect(place).toEqual({ group: null, after: 1, before: 3, nearTop: true });
    const moved = rows.map(r => (r.lead.id === 2 ? rowsOf([{ ...r.lead, status: "booked" }])[0] : r));
    const res = listRows(moved, s, ctx, { keep: new Map([[2, place]]) });
    expect(res.rows.map(r => r.lead.id)).toEqual([1, 2, 3]);
    // A row not shown has no place to keep.
    expect(keptPlace(listLayout(res), 99)).toBeNull();
    expect(keptPlace(null, 2)).toBeNull();
  });

  // Five open enquiries in each of November, December and January, soonest first.
  const monthDay = (m: number, d: number) => (m === 1 ? dateOnly(2027, 1, d) : dateOnly(2026, m, d));
  const months = () => [11, 12, 1].flatMap((m, i) => [20, 22, 24, 26, 28].map((d, k) => lead({ id: 200 + i * 10 + k, eventDate: monthDay(m, d) })));
  const soonest = state({ view: "open", sort: { key: "event", dir: "asc" } });
  const LOST = { status: "lost", lostReason: "price" } as const;
  /** Change these enquiries' status one after another from the list as shown, as the app does: each stays where it was (keptPlace). */
  function move(leads: LeadLike[], s: ListState, ids: number[], change: Partial<LeadLike> = LOST) {
    let now = leads;
    let res = listRows(rowsOf(now), s, ctx);
    const keep = new Map<number, KeptPlace>();
    for (const id of ids) {
      keep.set(id, keep.get(id) ?? keptPlace(listLayout(res), id)!);
      now = now.map(l => (l.id === id ? { ...l, ...change } : l));
      res = listRows(rowsOf(now), s, ctx, { keep });
    }
    return { res, keep, leads: now, again: (more: LeadLike[]) => listRows(rowsOf(more), s, ctx, { keep }) };
  }
  const heads = (res: ReturnType<typeof listRows>) => res.dividers.map(d => `${d.label} · ${d.count} @${d.at}`);
  /** Each row's heading, read down the list as a person would. */
  const under = (res: ReturnType<typeof listRows>) => {
    const at = new Map(res.dividers.map(d => [d.at, d.label]));
    let cur = "";
    return new Map(res.rows.map((r, i) => { cur = at.get(i) ?? cur; return [r.lead.id, cur]; }));
  };

  it("a row just moved stays under its own month heading, first or last in the month", () => {
    const leads = months();
    const before = listRows(rowsOf(leads), soonest, ctx);
    expect(heads(before)).toEqual(["November 2026 · 5 @0", "December 2026 · 5 @5", "January 2027 · 5 @10"]);
    expect(before.groups.slice(3, 7)).toEqual(["2026-11", "2026-11", "2026-12", "2026-12"]);
    // The first December row (index 5) stays under December.
    const first = move(leads, soonest, [210]).res;
    expect(first.rows.map(r => r.lead.id)).toEqual(before.rows.map(r => r.lead.id));
    expect(heads(first)).toEqual(["November 2026 · 5 @0", "December 2026 · 4 @5", "January 2027 · 5 @10"]);
    expect(first.groups).toEqual(before.groups);
    // The last November row (index 4) stays under November.
    expect(heads(move(leads, soonest, [204]).res)).toEqual(["November 2026 · 4 @0", "December 2026 · 5 @5", "January 2027 · 5 @10"]);
    // Both, in either order, and the very first row of the list.
    for (const ids of [[204, 210], [210, 204]]) {
      const both = move(leads, soonest, ids).res;
      expect(both.rows.map(r => r.lead.id)).toEqual(before.rows.map(r => r.lead.id));
      expect(heads(both)).toEqual(["November 2026 · 4 @0", "December 2026 · 4 @5", "January 2027 · 5 @10"]);
    }
    expect(move(leads, soonest, [200]).res.rows.map(r => r.lead.id)).toEqual(before.rows.map(r => r.lead.id));
  });
  it("rows moved one after another, side by side, stay in their order", () => {
    const leads = months();
    const before = listRows(rowsOf(leads), soonest, ctx).rows.map(r => r.lead.id);
    for (const ids of [[210, 211, 212], [212, 211, 210], [211, 210, 212], [214, 220], [220, 214]]) {
      const { res } = move(leads, soonest, ids);
      expect(res.rows.map(r => r.lead.id)).toEqual(before);
      expect(heads(res)).toEqual(["November 2026 · 5 @0", `December 2026 · ${5 - ids.filter(id => id < 220).length} @5`, `January 2027 · ${ids.includes(220) ? 4 : 5} @10`]);
    }
  });
  it("a new enquiry arriving above a moved row doesn't push it under the month before", () => {
    const leads = months();
    const moved = move(leads, soonest, [210]);
    // A new November enquiry comes in (the list refreshes every 30 seconds).
    const arrived = moved.again([...moved.leads, lead({ id: 290, eventDate: dateOnly(2026, 11, 26) })]);
    expect(under(arrived).get(210)).toBe("December 2026");
    expect(arrived.rows.map(r => r.lead.id).slice(4, 8)).toEqual([290, 204, 210, 211]);
    expect(heads(arrived)).toEqual(["November 2026 · 6 @0", "December 2026 · 4 @6", "January 2027 · 5 @11"]);
    // One arriving earlier in its own month: the moved row stays just above the row it was above.
    const sameMonth = moved.again([...moved.leads, lead({ id: 291, eventDate: dateOnly(2026, 12, 1) })]);
    expect(sameMonth.rows.map(r => r.lead.id).slice(4, 8)).toEqual([204, 291, 210, 211]);
    expect(under(sameMonth).get(210)).toBe("December 2026");
    // The last November row moved, then a December enquiry comes in: it stays at November's end.
    const last = move(leads, soonest, [204]);
    const later = last.again([...last.leads, lead({ id: 292, eventDate: dateOnly(2026, 12, 1) })]);
    expect(under(later).get(204)).toBe("November 2026");
    expect(later.rows.map(r => r.lead.id).slice(3, 7)).toEqual([203, 204, 292, 210]);
    // Enquiries leaving the list (another device) don't move it either.
    const gone = moved.again(moved.leads.filter(l => l.id !== 201));
    expect(under(gone).get(210)).toBe("December 2026");
    expect(heads(gone)).toEqual(["November 2026 · 4 @0", "December 2026 · 4 @4", "January 2027 · 5 @9"]);
  });
  it("when the rows beside it have gone, a moved row goes to the nearer end of its own group", () => {
    const leads = months();
    // 212 sat in the middle of December, nearer the top (2 above, 2 below → top).
    const { keep, leads: now, again } = move(leads, soonest, [212]);
    expect(keep.get(212)).toEqual({ group: "2026-12", after: 211, before: 213, nearTop: true });
    const res = again(now.filter(l => l.id !== 211 && l.id !== 213));
    expect(res.rows.map(r => r.lead.id).slice(4, 8)).toEqual([204, 212, 210, 214]);
    expect(under(res).get(212)).toBe("December 2026");
    // 213 sat nearer the bottom: it goes to December's end, above January.
    const low = move(leads, soonest, [213]);
    const res2 = low.again(low.leads.filter(l => l.id !== 212 && l.id !== 214));
    expect(res2.rows.map(r => r.lead.id).slice(5, 9)).toEqual([210, 211, 213, 220]);
    expect(under(res2).get(213)).toBe("December 2026");
  });
  it("a moved row stays under a shared month heading when the months under it change", () => {
    // November and January busy; February, March and April quiet, sharing one heading.
    const leads = [
      ...[19, 20, 21, 22, 23, 24, 25, 26].map((d, k) => lead({ id: 400 + k, eventDate: dateOnly(2026, 11, d) })),
      ...[8, 9, 10, 11, 12, 13, 14, 15].map((d, k) => lead({ id: 410 + k, eventDate: dateOnly(2027, 1, d) })),
      lead({ id: 420, eventDate: dateOnly(2027, 2, 6) }), lead({ id: 421, eventDate: dateOnly(2027, 3, 6) }), lead({ id: 422, eventDate: dateOnly(2027, 4, 6) }),
    ];
    const before = listRows(rowsOf(leads), soonest, ctx);
    expect(heads(before)).toEqual(["November 2026 · 8 @0", "January 2027 · 8 @8", "February – April 2027 · 3 @16"]);
    const moved = move(leads, soonest, [421]);
    expect(heads(moved.res)).toEqual(["November 2026 · 8 @0", "January 2027 · 8 @8", "February – April 2027 · 2 @16"]);
    expect(under(moved.res).get(421)).toBe("February – April 2027");
    // Four more March enquiries arrive: March gets a heading of its own, and the moved row goes under it, first.
    const busier = moved.again([...moved.leads, ...[10, 14, 18, 22].map((d, k) => lead({ id: 430 + k, eventDate: dateOnly(2027, 3, d) }))]);
    expect(heads(busier)).toEqual(["November 2026 · 8 @0", "January 2027 · 8 @8", "February 2027 · 1 @16", "March 2027 · 4 @17", "April 2027 · 1 @22"]);
    expect(under(busier).get(421)).toBe("March 2027");
    expect(busier.rows[17].lead.id).toBe(421);
  });
  it("in a list whose months have no headings, a moved row stays above the first heading or under its own", () => {
    // Closed, latest first: lost enquiries a month apart (too thin for month headings), two undated.
    const leads = [
      ...[10, 9, 8, 7, 6, 5].map((m, k) => lead({ id: 500 + k, status: "lost", lostReason: "price", eventDate: dateOnly(2026, m, 14) })),
      lead({ id: 510, status: "lost", lostReason: "price", createdAt: ago(3 * DAY) }), lead({ id: 511, status: "lost", lostReason: "price", createdAt: ago(9 * DAY) }),
    ];
    const latest = state({ view: "closed", sort: { key: "event", dir: "desc" } });
    const before = listRows(rowsOf(leads), latest, ctx);
    expect(heads(before)).toEqual(["No date yet · 2 @6"]);
    const reopen = { status: "contacted", lostReason: null } as Partial<LeadLike>;
    // The last dated one, reopened: still last above No date yet, not under it.
    const last = move(leads, latest, [505], reopen).res;
    expect(last.rows.map(r => r.lead.id)).toEqual(before.rows.map(r => r.lead.id));
    expect(heads(last)).toEqual(["No date yet · 2 @6"]);
    // The first undated one: still under No date yet.
    const undated = move(leads, latest, [510], reopen).res;
    expect(undated.rows.map(r => r.lead.id)).toEqual(before.rows.map(r => r.lead.id));
    expect(heads(undated)).toEqual(["No date yet · 1 @6"]);
  });
  it("a row just moved that was its month's only one keeps that month's heading, counting none", () => {
    const leads = [
      ...[19, 20, 22, 24, 26, 28].map((d, k) => lead({ id: 300 + k, eventDate: dateOnly(2026, 11, d) })),
      lead({ id: 310, eventDate: dateOnly(2026, 12, 1) }),
      ...[8, 12, 16, 20, 24].map((d, k) => lead({ id: 320 + k, eventDate: dateOnly(2027, 1, d) })),
      lead({ id: 330, eventDate: null }),
    ];
    const before = listRows(rowsOf(leads), soonest, ctx);
    expect(heads(before)).toEqual(["November 2026 · 6 @0", "December 2026 · 1 @6", "January 2027 · 5 @7", "No date yet · 1 @12"]);
    // December's only booking: it stays under December, not November.
    expect(heads(move(leads, soonest, [310]).res)).toEqual(["November 2026 · 6 @0", "December 2026 · 0 @6", "January 2027 · 5 @7", "No date yet · 1 @12"]);
    // The only undated one, last in the list: it stays under No date yet, not January.
    expect(heads(move(leads, soonest, [330]).res)).toEqual(["November 2026 · 6 @0", "December 2026 · 1 @6", "January 2027 · 5 @7", "No date yet · 0 @12"]);
    for (const ids of [[310, 330], [330, 310]]) {
      expect(heads(move(leads, soonest, ids).res)).toEqual(["November 2026 · 6 @0", "December 2026 · 0 @6", "January 2027 · 5 @7", "No date yet · 0 @12"]);
    }
    // A new November enquiry arriving meanwhile doesn't take December's place.
    const moved = move(leads, soonest, [310]);
    const arrived = moved.again([...moved.leads, lead({ id: 390, eventDate: dateOnly(2026, 11, 30) })]);
    expect(heads(arrived)).toEqual(["November 2026 · 7 @0", "December 2026 · 0 @7", "January 2027 · 5 @8", "No date yet · 1 @13"]);
    expect(arrived.rows[7].lead.id).toBe(310);
    // A list too thin for month headings gets none back.
    const few = leads.filter(l => [300, 310, 320, 330].includes(l.id));
    expect(heads(listRows(rowsOf(few), soonest, ctx))).toEqual(["No date yet · 1 @3"]);
    const fewAfter = move(few, soonest, [320]).res;
    expect(fewAfter.rows.map(r => r.lead.id)).toEqual([300, 310, 320, 330]);
    expect(heads(fewAfter)).toEqual(["No date yet · 1 @3"]);
  });
  it("a row kept after a status change goes when the sort changes, as when the view, filters or search do", () => {
    const base = state({ view: "open", sort: { key: "event", dir: "asc" } });
    const key = shownListKey(base);
    expect(shownListKey({ ...base, sort: { key: "event", dir: "desc" } })).not.toBe(key);
    expect(shownListKey({ ...base, sort: { key: "urgent", dir: "asc" } })).not.toBe(key);
    expect(shownListKey({ ...base, sort: { key: "came", dir: "desc" } })).not.toBe(key);
    expect(shownListKey({ ...base, view: "confirmed" })).not.toBe(key);
    expect(shownListKey({ ...base, filters: withF({ space: [4] }) })).not.toBe(key);
    expect(shownListKey({ ...base, q: "evans" })).not.toBe(key);
    // The same list: a fresh but equal state, or spaces around the search.
    expect(shownListKey({ ...base, filters: clearFilters(), sort: { ...base.sort } })).toBe(key);
    expect(shownListKey({ ...base, q: "evans " })).toBe(shownListKey({ ...base, q: "evans" }));
    // Most urgent has one order whichever way round.
    expect(shownListKey(state({ sort: { key: "urgent", dir: "desc" } }))).toBe(shownListKey(state()));
  });
  it("75. the opening view: reply, else follow-up, else open", () => {
    const c = { reply: 0, followup: 0, open: 0, confirmed: 4, closed: 1, all: 5 };
    expect(defaultView({ ...c, reply: 2, followup: 3 })).toBe("reply");
    expect(defaultView({ ...c, followup: 3 })).toBe("followup");
    expect(defaultView(c)).toBe("open");
  });
});

describe("M. the Board", () => {
  const rows = fixture();
  const ids = (r: ListRow[]) => r.map(x => x.lead.id).sort((a, b) => a - b);
  it("shows every enquiry when nothing is filtered (the columns sort them by status)", () => {
    expect(boardRows(rows, { filters: clearFilters(), q: "" }, ctx)).toHaveLength(rows.length);
  });
  it("ignores the Status filter (the columns are the statuses) but applies the others", () => {
    const f = withF({ status: ["booked"], date: { preset: "this_month" } });
    const got = ids(boardRows(rows, { filters: f, q: "" }, ctx));
    expect(got).toEqual(ids(rows.filter(r => r.eventDay >= "2026-11-01" && r.eventDay <= "2026-11-30")));
    expect(got).toContain(101); // a New Enquiry in November, though Status says Confirmed
  });
  it("search reaches every status, lost ones included", () => {
    const got = boardRows(rows, { filters: clearFilters(), q: "Evans" }, ctx);
    expect(got.map(r => r.lead.id)).toEqual([101]);
    const lost = boardRows(rows, { filters: clearFilters(), q: "example.test" }, ctx).filter(r => r.lead.status === "lost");
    expect(lost.map(r => r.lead.id).sort()).toEqual([115, 118]);
  });
});

describe("N. the Needs line for a lost enquiry", () => {
  it("names the reason, in words even for an old reason key", () => {
    expect(rowNeeds(one({ status: "lost", lostReason: "price" }), ctx).text).toBe("Lost · Price / budget");
    expect(rowNeeds(one({ status: "lost", lostReason: "went_elsewhere" }), ctx).text).toBe("Lost · Went elsewhere");
    expect(rowNeeds(one({ status: "lost", lostReason: null }), ctx).text).toBe("Lost");
  });
});

describe("O. the Open view's Date passed notice", () => {
  const rows = fixture();
  // What "Review them" shows: the same filters and search, Needs = Date passed.
  const review = (s: ListState) => listRows(rows, { ...s, filters: reviewPassedFilters(s.filters) }, ctx).rows.map(r => r.lead.id);
  it("with nothing filtered, counts every open enquiry past its date", () => {
    const s = state({ view: "open" });
    expect(datePassedCount(rows, s, ctx)).toBe(1);
    expect(review(s)).toEqual([109]);
  });
  it("counts only what the filters let through, so the notice never promises rows Review them won't show", () => {
    const insta = state({ view: "open", filters: withF({ source: ["instagram"] }) });
    expect(datePassedCount(rows, insta, ctx)).toBe(0);
    expect(review(insta)).toEqual([]);
    // A Needs filter is replaced by Date passed, as Review them does.
    const nov = state({ view: "open", filters: withF({ date: { preset: "this_month" }, needs: ["reply"] }) });
    expect(datePassedCount(rows, nov, ctx)).toBe(1);
    expect(review(nov)).toEqual([109]);
  });
  it("counts only what the search finds", () => {
    expect(datePassedCount(rows, state({ view: "open", searchIn: true, q: "Client109" }), ctx)).toBe(1);
    expect(datePassedCount(rows, state({ view: "open", searchIn: true, q: "Evans" }), ctx)).toBe(0);
  });
});
