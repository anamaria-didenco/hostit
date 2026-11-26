import { describe, it, expect } from "vitest";
import { isDepositDue, isNewEnquiry, isOpenEnquiry, formatWait, daysAwayLabel, needsTodayEnquiries } from "@shared/needsToday";
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

function rowsOf(specs: { lead: Partial<LeadLike>; inbound?: Date }[]): ListRow[] {
  const replyStatus: ReplyStatusMap = new Map();
  const leads = specs.map((sp, i) => {
    const id = i + 1;
    if (sp.inbound) replyStatus.set(id, { direction: "in", at: sp.inbound });
    return {
      id, firstName: "Test", lastName: `Client${id}`, email: `client${id}@example.test`,
      status: "contacted", createdAt: ago(30 * DAY), respondedAt: ago(29 * DAY), lastActivityAt: ago(2 * DAY),
      eventDate: dateOnly(2027, 2, 6), ...sp.lead,
    } as LeadLike;
  });
  return enrichRows(leads, { ...ctx, replyStatus, clashMap: {}, isPartial: () => false });
}

describe("needsTodayEnquiries", () => {
  const rows = rowsOf([
    { lead: { firstName: "Kiri", lastName: "Testwell" }, inbound: ago(2 * DAY) },                       // 1 client wrote back
    { lead: { firstName: "Aroha", lastName: "Testa", status: "new", respondedAt: null, createdAt: ago(20 * 60_000) } }, // 2 new, inside any reply window
    { lead: { firstName: "Jamal", lastName: "Testor", status: "proposal_sent", followUpDate: ago(2 * DAY + HOUR) } },    // 3 follow-up 2 days late
    { lead: { firstName: "Hannah", lastName: "Testby", status: "proposal_sent", followUpDate: new Date(NOW + 3 * HOUR) } }, // 4 follow-up later today
    { lead: { firstName: "Sione", lastName: "Testfa", lastActivityAt: ago(12 * DAY) } },                // 5 gone quiet
    { lead: { firstName: "Liam", lastName: "Testan", status: "booked" } },                              // 6 booked: neither
  ]);
  const needs = needsTodayEnquiries(rows, ctx);
  const counts = viewCounts(rows, EMPTY_FILTERS, "", ctx);

  it("lists exactly the people the Needs reply and Follow-up due tabs count, in the list's order", () => {
    expect(needs.reply.length).toBe(counts.reply);
    expect(needs.followup.length).toBe(counts.followup);
    const listOrder = (view: "reply" | "followup") =>
      listRows(rows, { view, filters: EMPTY_FILTERS, q: "", sort: viewDefaultSort(view) }, ctx).rows.map(r => r.lead.id);
    expect(needs.reply.map(n => n.leadId)).toEqual(listOrder("reply"));
    expect(needs.followup.map(n => n.leadId)).toEqual(listOrder("followup"));
  });

  it("includes a client who wrote back and a new enquiry still inside its reply window", () => {
    expect(needs.reply.map(n => n.name).sort()).toEqual(["Aroha Testa", "Kiri Testwell"]);
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
    expect(byName.get("Aroha Testa")).toMatchObject({ lane: "blue" });
  });
});
