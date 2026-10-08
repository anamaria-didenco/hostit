import { describe, it, expect } from "vitest";
import {
  isRealEnquiry, isImportedBooking, leadOutcome, bookedLeadIds, cohortConversion, conversionBy,
  conversionFunnel, firstResponseTimes, timeToBook, median, budgetRangeMidpoint, estimateLeadValue,
  pipelineByStage, cohortBuckets, presetRange, dayKeyInTz, weekStart, NBI_IMPORT_EVENT_TYPE,
  type ConvLead, type ConvBooking, type ConvProposal, type ConvActivity,
} from "../shared/conversion";
import { PARTIAL_LEAD_NOTE } from "../shared/leadConstants";
import { zonedDayBoundUtc } from "../shared/tz";

const TZ = "Pacific/Auckland";
const H = 60 * 60 * 1000;
const D = 24 * H;
const lead = (id: number, over: Partial<ConvLead> = {}): ConvLead => ({
  id, status: "new", source: "lead_form", internalNotes: null, createdAt: "2026-09-10T00:00:00Z", ...over,
});
const range = (from: string, to: string) => ({ start: zonedDayBoundUtc(from, TZ, "start"), end: zonedDayBoundUtc(to, TZ, "end") });

describe("what counts as a real enquiry", () => {
  it("excludes partial autosaves, healthchecks and NowBookIt imports", () => {
    expect(isRealEnquiry(lead(1))).toBe(true);
    expect(isRealEnquiry(lead(1, { source: null }))).toBe(true);
    expect(isRealEnquiry(lead(1, { internalNotes: PARTIAL_LEAD_NOTE }))).toBe(false);
    expect(isRealEnquiry(lead(1, { source: "healthcheck" }))).toBe(false);
    expect(isRealEnquiry(lead(1, { source: "nowbookit" }))).toBe(false);
    expect(isRealEnquiry(lead(1, { source: "NowBookIt" }))).toBe(false);
    // An ordinary note isn't the partial marker.
    expect(isRealEnquiry(lead(1, { internalNotes: "Partial payment discussed" }))).toBe(true);
  });

  it("recognises NowBookIt diary bookings only when they have no lead", () => {
    expect(isImportedBooking({ leadId: null, eventType: NBI_IMPORT_EVENT_TYPE })).toBe(true);
    expect(isImportedBooking({ leadId: null, eventType: "Wedding", email: "nbi-123@unknown.local" })).toBe(true);
    expect(isImportedBooking({ leadId: 4, eventType: NBI_IMPORT_EVENT_TYPE })).toBe(false);
    expect(isImportedBooking({ leadId: null, eventType: "Birthday", email: "a@b.nz" })).toBe(false);
  });
});

describe("outcome", () => {
  const booked = bookedLeadIds([
    { id: 1, leadId: 2, status: "confirmed" },
    { id: 2, leadId: 3, status: "cancelled" },
  ]);
  it("won by status or by a live booking made from the lead", () => {
    expect(leadOutcome(lead(1, { status: "booked" }), booked)).toBe("won");
    expect(leadOutcome(lead(1, { status: "confirmed" }), booked)).toBe("won");
    expect(leadOutcome(lead(1, { status: "finished" }), booked)).toBe("won");
    expect(leadOutcome(lead(2, { status: "negotiating" }), booked)).toBe("won");
  });
  it("a cancelled booking does not make a lead won", () => {
    expect(leadOutcome(lead(3, { status: "lost" }), booked)).toBe("lost");
    expect(leadOutcome(lead(3, { status: "contacted" }), booked)).toBe("open");
  });
  it("unknown custom statuses are open", () => {
    expect(leadOutcome(lead(9, { status: "site_visit" }), booked)).toBe("open");
  });
});

describe("cohort conversion", () => {
  const leads: ConvLead[] = [
    lead(1, { status: "booked", createdAt: "2026-09-01T00:00:00Z" }),
    lead(2, { status: "lost", createdAt: "2026-09-02T00:00:00Z" }),
    lead(3, { status: "new", createdAt: "2026-09-03T00:00:00Z" }),
    lead(4, { status: "contacted", createdAt: "2026-09-04T00:00:00Z" }),
    lead(5, { status: "new", createdAt: "2026-09-05T00:00:00Z", internalNotes: PARTIAL_LEAD_NOTE }),
    lead(6, { status: "new", createdAt: "2026-09-05T00:00:00Z", source: "healthcheck" }),
    lead(7, { status: "booked", createdAt: "2026-06-01T00:00:00Z" }), // outside the period
  ];
  const bookings: ConvBooking[] = [
    { id: 1, leadId: 1, status: "confirmed", totalNzd: "4000.00" },
    { id: 2, leadId: 4, status: "confirmed", totalNzd: "1500" },
    { id: 3, leadId: 7, status: "confirmed", totalNzd: "9999" },
    { id: 4, leadId: null, status: "confirmed", totalNzd: "500", eventType: NBI_IMPORT_EVENT_TYPE },
  ];

  it("counts only real enquiries received in the period, and reports open separately", () => {
    const t = cohortConversion(leads, bookings, range("2026-09-01", "2026-09-30"));
    expect(t).toEqual({ enquiries: 4, won: 2, lost: 1, open: 1, rate: 50, wonValue: 5500 });
  });

  it("rate is null with no enquiries rather than 0%", () => {
    expect(cohortConversion(leads, bookings, range("2025-01-01", "2025-01-31")).rate).toBeNull();
  });

  it("uses NZ calendar days for the period edges", () => {
    // 1 Oct 00:30 NZDT is still 30 Sep in UTC.
    const l = [lead(1, { createdAt: "2026-09-30T11:30:00Z" })];
    expect(cohortConversion(l, [], range("2026-10-01", "2026-10-31")).enquiries).toBe(1);
    expect(cohortConversion(l, [], range("2026-09-01", "2026-09-30")).enquiries).toBe(0);
  });

  it("breaks down by any attribute, blanks grouped", () => {
    const cohort = [
      lead(1, { status: "booked", utmSource: "google" }),
      lead(2, { status: "lost", utmSource: "google" }),
      lead(3, { utmSource: "" }),
      lead(4, { utmSource: null, status: "booked" }),
    ];
    const rows = conversionBy(cohort, [], l => l.utmSource, "No UTM tag");
    expect(rows.map(r => [r.key, r.enquiries, r.won, r.rate])).toEqual([
      ["google", 2, 1, 50],
      ["No UTM tag", 2, 1, 50],
    ]);
  });
});

describe("first response time", () => {
  const created = "2026-09-10T00:00:00Z";
  const acts: ConvActivity[] = [
    { leadId: 1, type: "note", createdAt: "2026-09-10T01:00:00Z" },
    { leadId: 1, type: "email", createdAt: "2026-09-10T05:00:00Z" },
    { leadId: 1, type: "status_change", createdAt: "2026-09-10T03:00:00Z" },
    { leadId: 2, type: "email", createdAt: "2026-09-09T00:00:00Z" }, // before creation: ignored
  ];
  it("takes the first outbound email or status change after creation; notes don't count", () => {
    const r = firstResponseTimes([lead(1, { createdAt: created }), lead(2, { createdAt: created })], acts);
    expect(r.get(1)).toBe(3 * H);
    expect(r.has(2)).toBe(false);
  });
  it("prefers a firstResponseAt column when the lead row has one", () => {
    const r = firstResponseTimes([{ ...lead(1, { createdAt: created }), firstResponseAt: "2026-09-10T00:30:00Z" }], acts);
    expect(r.get(1)).toBe(0.5 * H);
  });
});

describe("funnel", () => {
  const cohort = [
    lead(1, { status: "booked" }),
    lead(2, { status: "proposal_sent" }),
    lead(3, { status: "contacted" }),
    lead(4, { status: "new" }),
    lead(5, { status: "booked" }), // booked by phone: no proposal, no logged reply
  ];
  const proposals: ConvProposal[] = [
    { id: 1, leadId: 1, status: "accepted", sentAt: "2026-09-11T00:00:00Z", viewedAt: null, respondedAt: "2026-09-12T00:00:00Z" },
    { id: 2, leadId: 2, status: "viewed", sentAt: "2026-09-11T00:00:00Z", viewedAt: "2026-09-11T02:00:00Z" },
    { id: 3, leadId: 4, status: "draft" },
    { id: 4, leadId: 99, status: "accepted" }, // not in cohort
  ];
  const acts: ConvActivity[] = [{ leadId: 3, type: "email", createdAt: "2026-09-10T02:00:00Z" }];

  it("counts each stage on its own evidence, as a share of enquiries", () => {
    const f = conversionFunnel(cohort, proposals, acts, []);
    expect(f.map(s => [s.key, s.count])).toEqual([
      ["enquiries", 5], ["replied", 4], ["proposal_sent", 2], ["proposal_viewed", 2], ["accepted", 1], ["booked", 2],
    ]);
    expect(f.find(s => s.key === "booked")!.pct).toBe(40);
  });
});

describe("time to book", () => {
  it("is the median days from enquiry to the earliest booking evidence", () => {
    const cohort = [
      lead(1, { status: "booked", createdAt: "2026-09-01T00:00:00Z" }),
      lead(2, { status: "booked", createdAt: "2026-09-01T00:00:00Z" }),
      lead(3, { status: "booked", createdAt: "2026-09-01T00:00:00Z" }),
      lead(4, { status: "booked", createdAt: "2026-09-01T00:00:00Z" }), // no dated evidence: left out
      lead(5, { status: "new", createdAt: "2026-09-01T00:00:00Z" }),
    ];
    const bookings: ConvBooking[] = [{ id: 1, leadId: 1, status: "confirmed", createdAt: "2026-09-05T00:00:00Z" }];
    const proposals: ConvProposal[] = [{ id: 1, leadId: 2, status: "accepted", respondedAt: "2026-09-11T00:00:00Z" }];
    const acts: ConvActivity[] = [
      { leadId: 3, type: "status_change", content: "Status changed to booked", createdAt: "2026-09-21T00:00:00Z" },
      { leadId: 1, type: "status_change", content: "Status changed to booked", createdAt: "2026-09-03T00:00:00Z" },
    ];
    expect(timeToBook(cohort, bookings, proposals, acts)).toEqual({ medianDays: 10, count: 3 });
  });
  it("median handles even counts and empties", () => {
    expect(median([])).toBeNull();
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});

describe("pipeline value estimate", () => {
  it("budget bracket midpoints, open-ended top bracket at its floor", () => {
    expect(budgetRangeMidpoint("5_10k")).toBe(7500);
    expect(budgetRangeMidpoint("20k_plus")).toBe(20000);
    expect(budgetRangeMidpoint("nonsense")).toBeNull();
  });
  it("prefers the latest live proposal total over the budget", () => {
    const l = lead(1, { budgetRange: "5_10k" });
    const ps: ConvProposal[] = [
      { id: 1, leadId: 1, status: "sent", totalNzd: "6000", createdAt: "2026-09-01T00:00:00Z" },
      { id: 2, leadId: 1, status: "draft", totalNzd: "6500", createdAt: "2026-09-02T00:00:00Z" },
      { id: 3, leadId: 1, status: "declined", totalNzd: "9000", createdAt: "2026-09-03T00:00:00Z" },
    ];
    expect(estimateLeadValue(l, ps)).toEqual({ value: 6500, basis: "proposal" });
    expect(estimateLeadValue(l, [])).toEqual({ value: 7500, basis: "budget_range" });
    expect(estimateLeadValue(lead(2, { budget: "3000.00" }), [])).toEqual({ value: 3000, basis: "budget" });
    expect(estimateLeadValue(lead(3), [])).toEqual({ value: null, basis: null });
  });
  it("groups open real enquiries by stage and skips past-dated ones", () => {
    const now = Date.parse("2026-10-08T00:00:00Z");
    const leads = [
      lead(1, { status: "new", budgetRange: "under_5k" }),
      lead(2, { status: "new" }),
      lead(3, { status: "proposal_sent", budgetRange: "10_20k", eventDate: "2026-12-01T00:00:00Z" }),
      lead(4, { status: "contacted", eventDate: "2026-08-01T00:00:00Z", budgetRange: "20k_plus" }), // event passed
      lead(5, { status: "booked", budgetRange: "20k_plus" }),
      lead(6, { status: "new", budgetRange: "20k_plus", internalNotes: PARTIAL_LEAD_NOTE }),
    ];
    const p = pipelineByStage(leads, [], [], now);
    expect(p.count).toBe(3);
    expect(p.total).toBe(3500 + 15000);
    expect(p.unvalued).toBe(1);
    expect(p.stages.find(s => s.status === "new")).toEqual({ status: "new", count: 2, value: 3500, unvalued: 1 });
  });
});

describe("NZ calendar buckets", () => {
  it("day keys follow NZ, not UTC", () => {
    expect(dayKeyInTz("2026-09-30T11:30:00Z", TZ)).toBe("2026-10-01");
    expect(weekStart("2026-10-08")).toBe("2026-10-05");
  });
  it("presets end today and start on a month boundary", () => {
    expect(presetRange("month", "2026-10-08")).toEqual({ from: "2026-10-01", to: "2026-10-08" });
    expect(presetRange("3m", "2026-01-15")).toEqual({ from: "2025-11-01", to: "2026-01-15" });
    expect(presetRange("12m", "2026-10-08")).toEqual({ from: "2025-11-01", to: "2026-10-08" });
  });
  it("buckets by month for long ranges and by week for short ones", () => {
    const cohort = [
      lead(1, { createdAt: "2026-08-31T12:30:00Z", status: "booked" }), // 1 Sep NZ
      lead(2, { createdAt: "2026-08-15T00:00:00Z" }),
    ];
    const m = cohortBuckets(cohort, [], "2026-08-01", "2026-10-08", TZ);
    expect(m.unit).toBe("month");
    expect(m.buckets.map(b => [b.key, b.enquiries, b.won])).toEqual([["2026-08", 1, 0], ["2026-09", 1, 1], ["2026-10", 0, 0]]);
    const w = cohortBuckets(cohort, [], "2026-09-01", "2026-09-14", TZ);
    expect(w.unit).toBe("week");
    expect(w.buckets.map(b => [b.key, b.enquiries])).toEqual([["2026-08-31", 1], ["2026-09-07", 0], ["2026-09-14", 0]]);
  });
});
