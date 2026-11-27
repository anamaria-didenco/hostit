import { describe, it, expect } from "vitest";
import { isDepositDue, isNewEnquiry, isOpenEnquiry, formatWait, daysAwayLabel, needsTodayEnquiries, needLane, NEEDS_GROUP_CAP, type EnquiryNeed } from "@shared/needsToday";
import { EMPTY_FILTERS, enrichRows, listRows, viewCounts, viewDefaultSort, type LeadLike, type ListCtx, type ListRow, type ReplyStatusMap } from "@shared/enquiryFilters";
import { rowLane } from "@shared/enquiryLane";
import { DEFAULT_STATUSES } from "@shared/enquiryStatuses";

describe("needs-today rules", () => {
  it("deposit due: confirmed, required and unpaid only (Payments board rule)", () => {
    expect(isDepositDue({ status: "confirmed", depositRequired: true, depositPaid: false })).toBe(true);
    expect(isDepositDue({ status: "confirmed", depositRequired: false, depositPaid: false })).toBe(false);
    expect(isDepositDue({ status: "confirmed", depositRequired: true, depositPaid: true })).toBe(false);
    expect(isDepositDue({ status: "tentative", depositRequired: true, depositPaid: false })).toBe(false);
    expect(isDepositDue({ status: "cancelled", depositRequired: true, depositPaid: false })).toBe(false);
  });

  it("NEW is part of OPEN; won, lost and cancelled are neither", () => {
    expect(isNewEnquiry("new")).toBe(true);
    expect(isOpenEnquiry("new")).toBe(true);
    expect(isOpenEnquiry("proposal_sent")).toBe(true);
    for (const s of ["booked", "confirmed", "finished", "lost", "cancelled"]) expect(isOpenEnquiry(s), s).toBe(false);
    expect(isNewEnquiry("contacted")).toBe(false);
  });

  it("words for waits and distances", () => {
    expect(formatWait(0.2)).toBe("1h");
    expect(formatWait(32)).toBe("32h");
    expect(formatWait(72)).toBe("3d");
    expect(daysAwayLabel(0)).toBe("today");
    expect(daysAwayLabel(1)).toBe("tomorrow");
    expect(daysAwayLabel(5)).toBe("in 5 days");
  });
});

// ── The enquiries in "Needs you today" ─────────────────────────────────────
// They are the Enquiries list's own Needs reply and Follow-up due rows, so the
// Overview can't name a different set of people, or count them differently,
// from the badge and the tabs. Every client here is invented (@example.test).

// Tue 17 Nov 2026, 10:00 in Auckland.
const TZ = "Pacific/Auckland";
const NOW = Date.UTC(2026, 10, 16, 21, 0);
const HOUR = 3_600_000;
const DAY = 86_400_000;
const ago = (ms: number) => new Date(NOW - ms);
const dateOnly = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const ctx: ListCtx = { nowMs: NOW, tz: TZ, statusOrder: DEFAULT_STATUSES.map(s => s.key) };

function rowsOf(specs: { lead: Partial<LeadLike>; inbound?: Date; clash?: boolean }[]): ListRow[] {
  const replyStatus: ReplyStatusMap = new Map();
  const clashMap: Record<number, unknown[]> = {};
  const leads = specs.map((sp, i) => {
    const id = i + 1;
    if (sp.inbound) replyStatus.set(id, { direction: "in", at: sp.inbound });
    if (sp.clash) clashMap[id] = [{ bookingId: 900 + id }];
    return {
      id, firstName: "Test", lastName: `Client${id}`, email: `client${id}@example.test`,
      status: "contacted", createdAt: ago(30 * DAY), respondedAt: ago(29 * DAY), lastActivityAt: ago(2 * DAY),
      eventDate: dateOnly(2027, 2, 6), ...sp.lead,
    } as LeadLike;
  });
  return enrichRows(leads, { ...ctx, replyStatus, clashMap, isPartial: () => false });
}

describe("needsTodayEnquiries", () => {
  const rows = rowsOf([
    { lead: { firstName: "Kiri", lastName: "Testwell" }, inbound: ago(2 * DAY) },                       // 1 client wrote back
    { lead: { firstName: "Aroha", lastName: "Testa", status: "new", respondedAt: null, createdAt: ago(20 * 60_000) } }, // 2 new, inside the reply hours
    { lead: { firstName: "Jamal", lastName: "Testor", status: "proposal_sent", followUpDate: ago(2 * DAY + HOUR) } },    // 3 follow-up 2 days late
    { lead: { firstName: "Hannah", lastName: "Testby", status: "proposal_sent", followUpDate: new Date(NOW + 3 * HOUR) } }, // 4 follow-up later today
    { lead: { firstName: "Sione", lastName: "Testfa", lastActivityAt: ago(12 * DAY) } },                // 5 gone quiet
    { lead: { firstName: "Liam", lastName: "Testan", status: "booked" } },                              // 6 booked: neither
    { lead: { firstName: "Ana", lastName: "Testora", status: "new", respondedAt: null, createdAt: ago(3 * DAY + 4 * HOUR) } }, // 7 new, reply overdue
    { lead: { firstName: "Mere", lastName: "Testkai", status: "new", respondedAt: null, createdAt: ago(HOUR) }, inbound: ago(HOUR) }, // 8 new, wrote in, inside the hours
  ]);
  // The server's reply-hours rule (dashboard.needsAttention): Ana's reply is
  // overdue, Aroha and Mere are still inside the reply hours.
  const rule = { overdueIds: new Set([7]), pendingIds: new Set([2, 8]) };
  const needs = needsTodayEnquiries(rows, ctx, rule);
  const counts = viewCounts(rows, EMPTY_FILTERS, "", ctx);
  const listOrder = (view: "reply" | "followup") =>
    listRows(rows, { view, filters: EMPTY_FILTERS, q: "", sort: viewDefaultSort(view) }, ctx).rows.map(r => r.lead.id);

  it("lists the Follow-up due tab's people, and the Needs reply tab's less brand-new ones inside the reply hours, in the list's order", () => {
    expect(needs.followup.length).toBe(counts.followup);
    expect(needs.followup.map(n => n.leadId)).toEqual(listOrder("followup"));
    // The tab (and the badge) still count Aroha and Mere.
    expect(counts.reply).toBe(4);
    expect(needs.reply.map(n => n.leadId)).toEqual(listOrder("reply").filter(id => id !== 2 && id !== 8));
  });

  it("includes a client who wrote back and a new enquiry past its reply hours, not one still inside them", () => {
    expect(needs.reply.map(n => n.name).sort()).toEqual(["Ana Testora", "Kiri Testwell"]);
  });

  it("lists no brand-new enquiry until the server's overdue list is known", () => {
    expect(needsTodayEnquiries(rows, ctx).reply.map(n => n.name)).toEqual(["Kiri Testwell"]);
  });

  it("marks the overdue first reply, and only that one", () => {
    expect(needs.reply.find(n => n.name === "Ana Testora")).toMatchObject({
      replyOverdue: true, lane: "blue", text: "Waiting 3d 4h",
      due: { lane: "red", text: "Reply overdue", sub: "Waiting 3d 4h" },
    });
    expect(needs.reply.find(n => n.name === "Kiri Testwell")?.replyOverdue).toBeUndefined();
    expect(needs.reply.find(n => n.name === "Kiri Testwell")?.due).toBeUndefined();
    // A client who wrote back is never "reply overdue", whatever the server says.
    expect(needsTodayEnquiries(rows, ctx, { ...rule, overdueIds: new Set([1, 7]) }).reply.find(n => n.leadId === 1)?.replyOverdue).toBeUndefined();
  });

  it("leaves out a follow-up due later today, as the Follow-up due tab does, and keeps gone-quiet ones", () => {
    expect(needs.followup.map(n => n.name).sort()).toEqual(["Jamal Testor", "Sione Testfa"]);
  });

  it("carries each row's lane and words, so the day counts match the list", () => {
    const byName = new Map([...needs.reply, ...needs.followup].map(n => [n.name, n]));
    for (const r of rows) {
      const n = byName.get(`${r.lead.firstName} ${r.lead.lastName}`);
      if (!n) continue;
      const lane = rowLane(r, ctx);
      expect({ lane: n.lane, text: n.text, sub: n.sub }).toEqual({ lane: lane.lane, text: lane.text, sub: lane.sub });
    }
    expect(byName.get("Jamal Testor")).toMatchObject({ lane: "red", text: "Follow-up overdue · 2d" });
    expect(byName.get("Kiri Testwell")).toMatchObject({ lane: "amber", text: "Replied 2d ago" });
  });
});

// ── Red rows first, and why a brand-new enquiry is listed ──────────────────
describe("needsTodayEnquiries: red rows before the cap", () => {
  // Five clients who wrote back an hour or more ago (amber), a new enquiry far
  // past its reply hours (Priya), and Nikau: new, past his reply hours, who
  // wrote again 40 minutes ago. The list sorts him by that last message, so
  // he comes last in Needs reply.
  const wroteBack = [1, 2, 3, 4, 5].map(h => ({ lead: { firstName: "Wrote", lastName: `Back${h}h` }, inbound: ago(h * HOUR) }));
  const rows = rowsOf([
    ...wroteBack,                                                                                                       // 1-5
    { lead: { firstName: "Priya", lastName: "Testnew", status: "new", respondedAt: null, createdAt: ago(10 * DAY) } },     // 6
    { lead: { firstName: "Nikau", lastName: "Testinbound", status: "new", respondedAt: null, createdAt: ago(3 * DAY + HOUR) }, inbound: ago(40 * 60_000) }, // 7
    // Follow-ups: five due today (amber), and one gone quiet with a date clash (red).
    ...[1, 2, 3, 4, 5].map(h => ({ lead: { firstName: "Due", lastName: `Today${h}h`, status: "proposal_sent", followUpDate: ago(h * HOUR) } })), // 8-12
    { lead: { firstName: "Quiet", lastName: "Testclash", lastActivityAt: ago(12 * DAY) }, clash: true },                // 13
  ]);
  const needs = needsTodayEnquiries(rows, ctx, { overdueIds: new Set([6, 7]), pendingIds: new Set() });
  const listOrder = (view: "reply" | "followup") =>
    listRows(rows, { view, filters: EMPTY_FILTERS, q: "", sort: viewDefaultSort(view) }, ctx).rows.map(r => r.lead.id);
  /** No red row after a row that isn't red. */
  const redFirst = (list: EnquiryNeed[]) => list.every((n, i) => i === 0 || needLane(n) !== "red" || needLane(list[i - 1]) === "red");

  it("the list puts Nikau, and the gone-quiet clash, behind the amber rows", () => {
    expect(listOrder("reply").at(-1)).toBe(7);
    expect(listOrder("followup").at(-1)).toBe(13);
  });

  it("shows a red reply row within the cap, ahead of the amber ones", () => {
    const shown = needs.reply.slice(0, NEEDS_GROUP_CAP).map(n => n.leadId);
    expect(shown.slice(0, 2)).toEqual([6, 7]);
    expect(redFirst(needs.reply)).toBe(true);
    // Every row is still there, for "+N more" (the Needs reply tab holds them all).
    expect(needs.reply.map(n => n.leadId).sort((a, b) => a - b)).toEqual(listOrder("reply").sort((a, b) => a - b));
    // The amber rows keep the list's order.
    expect(needs.reply.slice(2).map(n => n.leadId)).toEqual(listOrder("reply").filter(id => id <= 5));
  });

  it("says how long the first reply has waited, not when the client last wrote", () => {
    const nikau = needs.reply.find(n => n.leadId === 7)!;
    // The list's own words stay as they are ("Replied 40m ago")…
    expect({ lane: nikau.lane, text: nikau.text }).toEqual({ lane: "amber", text: "Replied 40m ago" });
    // …the card says "Reply overdue · Waiting 3d 1h".
    expect(nikau).toMatchObject({ replyOverdue: true, due: { lane: "red", text: "Reply overdue", sub: "Waiting 3d 1h" } });
  });

  it("shows a red follow-up within the cap, ahead of the amber ones", () => {
    expect(needs.followup.slice(0, NEEDS_GROUP_CAP)[0]).toMatchObject({ leadId: 13, lane: "red", text: "Date clash", sub: "Gone quiet · 12d" });
    expect(redFirst(needs.followup)).toBe(true);
    expect(needs.followup.slice(1).map(n => n.leadId)).toEqual(listOrder("followup").filter(id => id !== 13));
  });
});

describe("needsTodayEnquiries: brand-new enquiries the reply hours don't cover", () => {
  const brandNew = { status: "new", respondedAt: null };
  const rows = rowsOf([
    { lead: { ...brandNew, firstName: "Tama", lastName: "Testmanual", source: "manual", createdAt: ago(2 * DAY), followUpDate: ago(DAY + HOUR) } }, // 1 follow-up a day late
    { lead: { ...brandNew, firstName: "Rua", lastName: "Testtoday", source: "manual", createdAt: ago(3 * HOUR), followUpDate: ago(HOUR) } },       // 2 follow-up earlier today
    { lead: { ...brandNew, firstName: "Hine", lastName: "Testlater", source: "manual", createdAt: ago(3 * HOUR), followUpDate: new Date(NOW + 3 * HOUR) } }, // 3 later today
    { lead: { ...brandNew, firstName: "Wiki", lastName: "Testnodate", source: "manual", createdAt: ago(5 * DAY) } },                               // 4 no follow-up date
    { lead: { ...brandNew, firstName: "Pita", lastName: "Testpending", source: "form", createdAt: ago(20 * 60_000), followUpDate: ago(10 * 60_000) } }, // 5 inside the reply hours
    { lead: { ...brandNew, firstName: "Hemi", lastName: "Testclash", source: "manual", createdAt: ago(4 * DAY), followUpDate: ago(2 * DAY) }, clash: true }, // 6 date clash
  ]);
  // Staff-entered enquiries have no reply hours; Pita's are still running.
  const needs = needsTodayEnquiries(rows, ctx, { overdueIds: new Set(), pendingIds: new Set([5]) });
  const byId = new Map(needs.reply.map(n => [n.leadId, n]));

  it("lists one once its follow-up date arrives, as a follow-up, with the list's words under it", () => {
    expect(byId.get(1)).toMatchObject({ lane: "blue", text: "Waiting 2d", due: { lane: "red", text: "Follow-up overdue · 1d", sub: "Waiting 2d" } });
    expect(byId.get(1)?.replyOverdue).toBeUndefined();
    expect(byId.get(2)).toMatchObject({ due: { lane: "amber", text: "Follow up today", sub: "Waiting 3h" } });
  });

  it("waits for a follow-up later today, and leaves out one with no follow-up date", () => {
    expect(byId.has(3)).toBe(false);
    expect(byId.has(4)).toBe(false);
  });

  it("still leaves out one inside its reply hours, follow-up date or not", () => {
    expect(byId.has(5)).toBe(false);
  });

  it("keeps the list's red words for a date clash", () => {
    expect(byId.get(6)).toMatchObject({ lane: "red", text: "Date clash", sub: "Waiting 4d" });
    expect(byId.get(6)?.due).toBeUndefined();
  });

  it("with reply alerts off (nothing overdue, nothing pending), the follow-up date decides for every one", () => {
    const off = needsTodayEnquiries(rows, ctx, { overdueIds: new Set(), pendingIds: new Set() });
    expect(off.reply.map(n => n.leadId).sort()).toEqual([1, 2, 5, 6]);
  });

  it("lists them red first, and all in the Needs reply tab", () => {
    expect(needs.reply.map(n => n.leadId)).toEqual([6, 1, 2]);
    const tab = listRows(rows, { view: "reply", filters: EMPTY_FILTERS, q: "", sort: viewDefaultSort("reply") }, ctx).rows.map(r => r.lead.id);
    for (const n of needs.reply) expect(tab).toContain(n.leadId);
  });
});
