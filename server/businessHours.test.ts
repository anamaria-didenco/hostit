import { describe, expect, it } from "vitest";
import { addBusinessHours, businessMsBetween, isWithinBusinessHours, zonedTimeToUtcMs } from "@shared/businessHours";
import { isAwaitingFirstReply, shouldAlertReplyOverdue } from "./speedToLead";
import { PARTIAL_LEAD_NOTE } from "@shared/leadConstants";

const TZ = "Pacific/Auckland";
/** An NZ wall-clock time as a Date. */
const nz = (y: number, m: number, d: number, h: number, min = 0) => new Date(zonedTimeToUtcMs(y, m, d, h * 60 + min, TZ));
const fmt = (d: Date) => d.toLocaleString("en-NZ", { timeZone: TZ, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: false });

// Oct 2026: Thu 8, Fri 9, Sat 10, Sun 11, Mon 12. NZ is on daylight time (UTC+13).
describe("zonedTimeToUtcMs", () => {
  it("converts NZ wall-clock time to UTC across daylight saving", () => {
    expect(nz(2026, 10, 8, 9).toISOString()).toBe("2026-10-07T20:00:00.000Z"); // NZDT +13
    expect(nz(2026, 7, 1, 9).toISOString()).toBe("2026-06-30T21:00:00.000Z"); // NZST +12
  });
});

describe("addBusinessHours (Mon–Sat 9–18 NZ)", () => {
  it("adds within the same open day", () => {
    expect(addBusinessHours(nz(2026, 10, 8, 10, 15), 2)).toEqual(nz(2026, 10, 8, 12, 15));
  });

  it("an enquiry at 2am is due at 9am + N, not overnight", () => {
    expect(addBusinessHours(nz(2026, 10, 8, 2), 2)).toEqual(nz(2026, 10, 8, 11));
  });

  it("carries the remainder past closing into the next open day", () => {
    // 5:30pm Thursday + 2h = 30 min Thursday + 1.5h Friday → 10:30am Friday.
    expect(addBusinessHours(nz(2026, 10, 8, 17, 30), 2)).toEqual(nz(2026, 10, 9, 10, 30));
  });

  it("skips Sunday", () => {
    // Saturday 5pm + 2h → 1h Saturday, Sunday closed, 1h Monday → 10am Monday.
    expect(addBusinessHours(nz(2026, 10, 10, 17), 2)).toEqual(nz(2026, 10, 12, 10));
    // Anything on Sunday waits for Monday 9am.
    expect(addBusinessHours(nz(2026, 10, 11, 14), 2)).toEqual(nz(2026, 10, 12, 11));
  });

  it("an enquiry after closing is due N hours into the next open day", () => {
    expect(fmt(addBusinessHours(nz(2026, 10, 8, 21), 2))).toBe(fmt(nz(2026, 10, 9, 11)));
  });

  it("closing time exactly counts as closed", () => {
    expect(addBusinessHours(nz(2026, 10, 8, 18), 1)).toEqual(nz(2026, 10, 9, 10));
  });

  it("works on the daylight-saving change weekend (NZ springs forward Sun 27 Sep 2026)", () => {
    expect(addBusinessHours(nz(2026, 9, 26, 17), 2)).toEqual(nz(2026, 9, 28, 10));
  });

  it("is independent of the server's own timezone (uses UTC instants only)", () => {
    const start = new Date("2026-10-08T05:00:00.000Z"); // 6pm NZ Thu — closing
    expect(addBusinessHours(start, 3).toISOString()).toBe(nz(2026, 10, 9, 12).toISOString());
  });

  it("supports a custom week", () => {
    const weekdays = { timeZone: TZ, days: [1, 2, 3, 4, 5], openMin: 8 * 60, closeMin: 17 * 60 };
    expect(addBusinessHours(nz(2026, 10, 9, 16), 2, weekdays)).toEqual(nz(2026, 10, 12, 9));
  });
});

describe("businessMsBetween", () => {
  const H = 3_600_000;
  it("counts only open hours", () => {
    expect(businessMsBetween(nz(2026, 10, 8, 2), nz(2026, 10, 8, 11))).toBe(2 * H);
    expect(businessMsBetween(nz(2026, 10, 10, 17), nz(2026, 10, 12, 10))).toBe(2 * H);
    expect(businessMsBetween(nz(2026, 10, 12, 10), nz(2026, 10, 10, 17))).toBe(0);
  });
  it("is the inverse of addBusinessHours", () => {
    const start = nz(2026, 10, 9, 16, 40);
    expect(businessMsBetween(start, addBusinessHours(start, 7))).toBe(7 * H);
  });
});

describe("isWithinBusinessHours", () => {
  it("knows open and closed", () => {
    expect(isWithinBusinessHours(nz(2026, 10, 8, 9))).toBe(true);
    expect(isWithinBusinessHours(nz(2026, 10, 8, 18))).toBe(false);
    expect(isWithinBusinessHours(nz(2026, 10, 11, 12))).toBe(false);
  });
});

describe("reply-overdue alert rule", () => {
  const base = { status: "new", source: "lead_form", internalNotes: null, firstResponseAt: null, createdAt: nz(2026, 10, 8, 2) };

  it("does not alert at 3am about a lead that came in at 2am", () => {
    expect(shouldAlertReplyOverdue(base, 2, nz(2026, 10, 8, 3))).toBe(false);
    expect(shouldAlertReplyOverdue(base, 2, nz(2026, 10, 8, 10, 59))).toBe(false);
    expect(shouldAlertReplyOverdue(base, 2, nz(2026, 10, 8, 11))).toBe(true);
  });

  it("never alerts once someone has responded, or for partial / staff-entered leads", () => {
    const now = nz(2026, 10, 8, 12);
    expect(shouldAlertReplyOverdue({ ...base, firstResponseAt: nz(2026, 10, 8, 9) }, 2, now)).toBe(false);
    expect(shouldAlertReplyOverdue({ ...base, status: "contacted" }, 2, now)).toBe(false);
    expect(shouldAlertReplyOverdue({ ...base, internalNotes: PARTIAL_LEAD_NOTE }, 2, now)).toBe(false);
    expect(shouldAlertReplyOverdue({ ...base, source: "manual" }, 2, now)).toBe(false);
    expect(isAwaitingFirstReply(base)).toBe(true);
  });

  it("skips stale leads so a deploy doesn't alert on every old enquiry", () => {
    expect(shouldAlertReplyOverdue(base, 2, nz(2026, 10, 9, 10, 59))).toBe(true);
    expect(shouldAlertReplyOverdue(base, 2, nz(2026, 10, 9, 11, 1))).toBe(false);
  });
});
