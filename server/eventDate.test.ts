import { describe, expect, it } from "vitest";
import { dayWithTimeFrom, eventDayKey, formatEventDate, formatEventTime, isDateOnly, zonedWallTimeToDate } from "../shared/eventDate";

const NZ = "Pacific/Auckland";
const opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" };

describe("event dates", () => {
  it("shows a date-only value on its own calendar day", () => {
    const d = new Date("2026-10-24T00:00:00.000Z");
    expect(isDateOnly(d)).toBe(true);
    expect(formatEventDate(d, opts, NZ)).toBe("Sat, 24 Oct");
    expect(eventDayKey(d, NZ)).toBe("2026-10-24");
    expect(formatEventTime(d, NZ)).toBe("");
  });

  it("shows a morning event in NZ on the NZ day, not the UTC day", () => {
    // 6:30 am Sat 17 Oct in Auckland (NZDT, UTC+13) is 5:30 pm Fri 16 Oct UTC.
    const d = new Date("2026-10-16T17:30:00.000Z");
    expect(formatEventDate(d, opts, NZ)).toBe("Sat, 17 Oct");
    expect(eventDayKey(d, NZ)).toBe("2026-10-17");
    expect(formatEventTime(d, NZ)).toBe("6:30 am");
  });

  it("turns a wall-clock time in NZ into the right moment, across daylight saving", () => {
    expect(zonedWallTimeToDate(2026, 10, 24, 19, 0, NZ).toISOString()).toBe("2026-10-24T06:00:00.000Z"); // NZDT +13
    expect(zonedWallTimeToDate(2026, 6, 13, 19, 0, NZ).toISOString()).toBe("2026-06-13T07:00:00.000Z"); // NZST +12
    // Noon in winter lands on UTC midnight: nudged 1 ms so it isn't "date only".
    expect(isDateOnly(zonedWallTimeToDate(2026, 6, 13, 12, 0, NZ))).toBe(false);
  });

  it("keeps the enquiry's start time when a proposal (date only) is accepted", () => {
    const proposalDay = new Date("2026-11-07T00:00:00.000Z");
    const enquiry = zonedWallTimeToDate(2026, 11, 7, 19, 0, NZ);
    const booked = dayWithTimeFrom(proposalDay, enquiry, NZ)!;
    expect(eventDayKey(booked, NZ)).toBe("2026-11-07");
    expect(formatEventTime(booked, NZ)).toBe("7:00 pm");
    // The proposal moved the day: the new day, still at 7 pm.
    const moved = dayWithTimeFrom(new Date("2026-11-14T00:00:00.000Z"), enquiry, NZ)!;
    expect(eventDayKey(moved, NZ)).toBe("2026-11-14");
    expect(formatEventTime(moved, NZ)).toBe("7:00 pm");
    // No time on the enquiry: the day only, unchanged.
    expect(dayWithTimeFrom(proposalDay, new Date("2026-11-07T00:00:00.000Z"), NZ)).toEqual(proposalDay);
    expect(dayWithTimeFrom(null, enquiry, NZ)).toEqual(enquiry);
  });
});
