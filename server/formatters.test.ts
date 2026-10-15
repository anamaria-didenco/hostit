import { describe, expect, it } from "vitest";
import { fmtDate, fmtTime, fmtDateTime } from "@/lib/dateTime";
import { money, currency, currencyWhole } from "@/lib/money";

// These are the shared client render-boundary formatters. They encode the
// venue's NZ identity (times/dates in Pacific/Auckland, lowercase am/pm,
// thousands-separated money) and must be deterministic regardless of the
// machine's TZ, so they're covered here in the node test suite.

describe("fmtTime", () => {
  it("formats a 24h clock string as lowercase am/pm", () => {
    expect(fmtTime("18:30")).toBe("6:30 pm");
    expect(fmtTime("00:00")).toBe("12:00 am");
    expect(fmtTime("12:00")).toBe("12:00 pm");
    expect(fmtTime("07:05")).toBe("7:05 am");
    expect(fmtTime("9:00")).toBe("9:00 am");
  });

  it("formats a Date's time-of-day in the venue timezone", () => {
    // June = NZST (UTC+12): 06:30 UTC → 18:30 NZ.
    expect(fmtTime(new Date("2026-06-15T06:30:00Z"))).toBe("6:30 pm");
  });

  it("returns empty for blank, invalid or date-only values", () => {
    expect(fmtTime("")).toBe("");
    expect(fmtTime(null)).toBe("");
    expect(fmtTime("not a time")).toBe("");
    // UTC-midnight date-only sentinel → no meaningful time.
    expect(fmtTime(new Date("2026-06-15T00:00:00Z"))).toBe("");
  });
});

describe("fmtDate", () => {
  it("formats a date short in the venue timezone", () => {
    expect(fmtDate("2026-10-15", "short")).toBe("15 Oct 2026");
    expect(fmtDate("2026-10-15")).toBe("15 Oct 2026"); // short is the default
  });

  it("supports long, weekday and dayMonth styles", () => {
    expect(fmtDate("2026-10-15", "long")).toContain("15 October 2026");
    expect(fmtDate("2026-10-15", "long")).toMatch(/^[A-Z][a-z]+, /);
    expect(fmtDate("2026-10-15", "weekday")).toContain("15 Oct 2026");
    expect(fmtDate("2026-10-15", "dayMonth")).toBe("15 Oct");
  });

  it("returns empty for blank or invalid input", () => {
    expect(fmtDate("")).toBe("");
    expect(fmtDate(null)).toBe("");
    expect(fmtDate("nonsense")).toBe("");
  });
});

describe("fmtDateTime", () => {
  it("joins date and time when a time is present", () => {
    expect(fmtDateTime(new Date("2026-06-15T06:30:00Z"))).toBe("15 Jun 2026 · 6:30 pm");
  });
  it("shows the date alone for a date-only value", () => {
    expect(fmtDateTime(new Date("2026-06-15T00:00:00Z"))).toBe("15 Jun 2026");
  });
});

describe("money", () => {
  it("always renders two decimal places with thousands separators", () => {
    expect(money(1756.5217)).toBe("1,756.52");
    expect(money(2070)).toBe("2,070.00");
    expect(money("3600")).toBe("3,600.00");
    expect(money(null)).toBe("0.00");
  });

  it("currency adds the symbol with the sign outside it", () => {
    expect(currency(1756.52)).toBe("$1,756.52");
    expect(currency(-12)).toBe("-$12.00");
    expect(currency(null)).toBe("$0.00");
  });

  it("currencyWhole rounds to whole dollars, still separated", () => {
    // The inconsistency the audit flagged: "$3600.00" vs "$2,070.00". Both go
    // through here now, so both come out separated and symbol-first.
    expect(currencyWhole(3600)).toBe("$3,600");
    expect(currencyWhole(2070)).toBe("$2,070");
    expect(currencyWhole(1756.52)).toBe("$1,757");
    expect(currencyWhole(null)).toBe("$0");
  });
});
