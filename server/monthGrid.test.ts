import { describe, it, expect } from "vitest";
import { addDays, addMonths, monthGridTarget, monthGridDefaultDay, friendlyDay, monthCellLabel, statusWords } from "../shared/monthGrid";

describe("month grid keys", () => {
  it("arrows move a day or a week, across month ends", () => {
    expect(monthGridTarget("2026-11-20", "ArrowRight")).toBe("2026-11-21");
    expect(monthGridTarget("2026-11-20", "ArrowLeft")).toBe("2026-11-19");
    expect(monthGridTarget("2026-11-20", "ArrowDown")).toBe("2026-11-27");
    expect(monthGridTarget("2026-11-20", "ArrowUp")).toBe("2026-11-13");
    expect(monthGridTarget("2026-11-30", "ArrowRight")).toBe("2026-12-01");
    expect(monthGridTarget("2026-11-01", "ArrowLeft")).toBe("2026-10-31");
    expect(monthGridTarget("2026-12-29", "ArrowDown")).toBe("2027-01-05");
  });
  it("Page Up / Page Down move a month and stay inside it", () => {
    expect(monthGridTarget("2026-11-20", "PageDown")).toBe("2026-12-20");
    expect(monthGridTarget("2026-11-20", "PageUp")).toBe("2026-10-20");
    expect(monthGridTarget("2027-01-31", "PageDown")).toBe("2027-02-28");
    expect(monthGridTarget("2028-03-31", "PageUp")).toBe("2028-02-29");
  });
  it("ignores keys that don't move (Tab, Enter, letters)", () => {
    for (const k of ["Tab", "Enter", " ", "t", "Home", "End"]) expect(monthGridTarget("2026-11-20", k)).toBeNull();
  });
  it("doesn't lose or repeat a day across daylight-saving changes", () => {
    // NZ clocks go forward on 27 Sep 2026 and back on 5 Apr 2026.
    expect(addDays("2026-09-26", 1)).toBe("2026-09-27");
    expect(addDays("2026-09-27", 1)).toBe("2026-09-28");
    expect(addDays("2026-04-05", -1)).toBe("2026-04-04");
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-15");
  });
});

describe("month grid Tab stop", () => {
  it("starts on today in the current month, else on the 1st", () => {
    expect(monthGridDefaultDay(2026, 10, "2026-11-17")).toBe("2026-11-17");
    expect(monthGridDefaultDay(2026, 11, "2026-11-17")).toBe("2026-12-01");
    expect(monthGridDefaultDay(2025, 10, "2026-11-17")).toBe("2025-11-01");
  });
});

describe("month grid names", () => {
  it("names a day in words, not ISO", () => {
    expect(friendlyDay("2026-11-02")).toBe("Monday 2 November");
  });
  it("says what's on a day, with each event's status", () => {
    expect(monthCellLabel({ ymd: "2026-11-21", isToday: false, events: [{ name: "Grace Holloway", status: "Confirmed" }] }))
      .toBe("Saturday 21 November, 1 event: Grace Holloway (Confirmed)");
    expect(monthCellLabel({ ymd: "2026-11-17", isToday: true, title: "Staff training", events: [] }))
      .toBe("Tuesday 17 November, today, Staff training, no events");
    expect(monthCellLabel({ ymd: "2026-12-24", events: [{ name: "Mei Zhang", status: "Proposal Sent" }, { name: "Liam Brennan", status: "Contacted" }] }))
      .toBe("Thursday 24 December, 2 events: Mei Zhang (Proposal Sent); Liam Brennan (Contacted)");
  });
  it("turns shouted or snake-case status labels into words", () => {
    expect(statusWords("TENTATIVE")).toBe("Tentative");
    expect(statusWords("proposal_sent")).toBe("Proposal sent");
    expect(statusWords("PROPOSAL_SENT")).toBe("Proposal sent");
    expect(statusWords("New Enquiry")).toBe("New Enquiry");
  });
});
