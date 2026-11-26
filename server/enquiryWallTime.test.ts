import { describe, it, expect } from "vitest";
import {
  enquiryEventInstant, isRealDateKey, isValidEnquiryDateInput, isWallTime, venueDayWindow, wallDateKeyInTz,
} from "@shared/enquiryWallTime";
import { formatEventDate, formatEventTime, isDateOnly } from "@shared/eventDate";

const NZ = "Pacific/Auckland";
const nzDay = (d: Date) => formatEventDate(d, { weekday: "short", day: "numeric", month: "short", year: "numeric" }, NZ);

describe("enquiry date and time in the venue's zone", () => {
  it("knows a real calendar day", () => {
    expect(isRealDateKey("2026-12-12")).toBe(true);
    expect(isRealDateKey("2028-02-29")).toBe(true);
    expect(isRealDateKey("2026-02-29")).toBe(false);
    expect(isRealDateKey("2026-02-30")).toBe(false);
    expect(isRealDateKey("2026-13-01")).toBe(false);
    expect(isRealDateKey("2026-00-10")).toBe(false);
    expect(isRealDateKey("2026-12-1")).toBe(false);
    expect(isRealDateKey("")).toBe(false);
    expect(isRealDateKey(null)).toBe(false);
  });

  it("knows a wall-clock time", () => {
    expect(isWallTime("19:00")).toBe(true);
    expect(isWallTime("00:00")).toBe(true);
    expect(isWallTime("23:59")).toBe(true);
    expect(isWallTime("24:00")).toBe(false);
    expect(isWallTime("7:00")).toBe(false);
    expect(isWallTime("19:60")).toBe(false);
    expect(isWallTime(undefined)).toBe(false);
  });

  it("accepts the shapes the server is sent, old and new", () => {
    expect(isValidEnquiryDateInput("")).toBe(true);
    expect(isValidEnquiryDateInput(undefined)).toBe(true);
    expect(isValidEnquiryDateInput("2026-12-12")).toBe(true);
    expect(isValidEnquiryDateInput("2026-12-12T06:00:00.000Z")).toBe(true);
    expect(isValidEnquiryDateInput("2026-02-30")).toBe(false);
    expect(isValidEnquiryDateInput("2026-13-01")).toBe(false);
    expect(isValidEnquiryDateInput("2026-13-01T19:00:00")).toBe(false);
    expect(isValidEnquiryDateInput("12/12/2026")).toBe(false);
    expect(isValidEnquiryDateInput("not-a-date")).toBe(false);
  });

  it("places a picked date and time in the venue's zone, whatever the visitor's phone is set to", () => {
    // 7:00 pm on Sat 12 Dec 2026, NZ daylight time (UTC+13).
    const at = enquiryEventInstant("2026-12-12", "19:00", NZ)!;
    expect(at.toISOString()).toBe("2026-12-12T06:00:00.000Z");
    expect(nzDay(at)).toBe("Sat, 12 Dec 2026");
    expect(formatEventTime(at, NZ)).toBe("7:00 pm");
    // Winter, UTC+12.
    expect(enquiryEventInstant("2027-06-12", "18:30", NZ)!.toISOString()).toBe("2027-06-12T06:30:00.000Z");
    // The days the clocks change.
    expect(enquiryEventInstant("2026-09-27", "19:00", NZ)!.toISOString()).toBe("2026-09-27T06:00:00.000Z");
    expect(enquiryEventInstant("2027-04-04", "19:00", NZ)!.toISOString()).toBe("2027-04-04T07:00:00.000Z");
  });

  it("keeps a date with no time as the date-only value", () => {
    const at = enquiryEventInstant("2026-12-12", undefined, NZ)!;
    expect(at.toISOString()).toBe("2026-12-12T00:00:00.000Z");
    expect(isDateOnly(at)).toBe(true);
    expect(enquiryEventInstant("2026-12-12", "", NZ)!.toISOString()).toBe("2026-12-12T00:00:00.000Z");
    // A bad time is no time: the date still counts.
    expect(enquiryEventInstant("2026-12-12", "7pm", NZ)!.toISOString()).toBe("2026-12-12T00:00:00.000Z");
    // Same as the server stored before: new Date("YYYY-MM-DD").
    expect(enquiryEventInstant("2026-12-12", null, NZ)!.getTime()).toBe(new Date("2026-12-12").getTime());
  });

  it("keeps noon in NZ standard time apart from date-only (the 1 ms bump)", () => {
    const at = enquiryEventInstant("2027-06-12", "12:00", NZ)!;
    expect(at.toISOString()).toBe("2027-06-12T00:00:00.001Z");
    expect(isDateOnly(at)).toBe(false);
    expect(formatEventTime(at, NZ)).toBe("12:00 pm");
  });

  it("keeps an older form's full timestamp as it was sent, ignoring any time", () => {
    expect(enquiryEventInstant("2026-12-12T08:00:00.000Z", "19:00", NZ)!.toISOString()).toBe("2026-12-12T08:00:00.000Z");
    expect(enquiryEventInstant("2026-12-12T08:00:00.000Z", undefined, NZ)!.toISOString()).toBe("2026-12-12T08:00:00.000Z");
  });

  it("has no date without a date, and none for a day that doesn't exist", () => {
    expect(enquiryEventInstant(undefined, "19:00", NZ)).toBeNull();
    expect(enquiryEventInstant("", "19:00", NZ)).toBeNull();
    expect(enquiryEventInstant("2026-02-30", "19:00", NZ)).toBeNull();
    expect(enquiryEventInstant("2026-13-01", undefined, NZ)).toBeNull();
    expect(enquiryEventInstant("soon", undefined, NZ)).toBeNull();
  });

  it("falls back to the default venue zone", () => {
    expect(enquiryEventInstant("2026-12-12", "19:00", null)!.toISOString()).toBe("2026-12-12T06:00:00.000Z");
    expect(enquiryEventInstant("2026-12-12", "19:00")!.toISOString()).toBe("2026-12-12T06:00:00.000Z");
  });

  it("works in another venue zone too", () => {
    expect(enquiryEventInstant("2026-12-12", "19:00", "Australia/Sydney")!.toISOString()).toBe("2026-12-12T08:00:00.000Z");
  });

  it("gives today's date on the venue's calendar", () => {
    // 11:30 am UTC on 12 Dec is already 13 Dec in NZ.
    expect(wallDateKeyInTz(new Date("2026-12-12T11:30:00Z"), NZ)).toBe("2026-12-13");
    expect(wallDateKeyInTz(new Date("2026-12-12T10:30:00Z"), NZ)).toBe("2026-12-12");
    expect(wallDateKeyInTz(new Date("2026-12-12T10:30:00Z"), "UTC")).toBe("2026-12-12");
  });
});

describe("the venue's day around an event", () => {
  it("is the NZ day, not the server's UTC day", () => {
    // Fri 12 Mar 2027 (NZ daylight time, UTC+13).
    const w = venueDayWindow(new Date("2027-03-12T06:00:00Z"), NZ)!;
    expect(w.dayKey).toBe("2027-03-12");
    expect(w.start.toISOString()).toBe("2027-03-11T11:00:00.000Z");
    expect(w.end.toISOString()).toBe("2027-03-12T11:00:00.000Z");
    const inside = (iso: string) => { const t = new Date(iso).getTime(); return t >= w.start.getTime() && t < w.end.getTime(); };
    expect(inside("2027-03-11T11:00:00Z")).toBe(true);   // midnight starting Fri
    expect(inside("2027-03-12T11:00:00Z")).toBe(false);  // midnight starting Sat
    expect(inside("2027-03-11T23:30:00Z")).toBe(true);   // 12:30 pm Fri
    expect(inside("2027-03-12T07:00:00Z")).toBe(true);   // 8 pm Fri
    expect(inside("2027-03-12T21:00:00Z")).toBe(false);  // 10 am Sat
    expect(inside("2027-03-12T00:00:00Z")).toBe(true);   // Fri with no time
    expect(inside("2027-03-13T00:00:00Z")).toBe(false);  // Sat with no time
    expect(inside("2027-03-11T00:00:00Z")).toBe(false);  // Thu with no time
  });

  it("is a 23 or 25 hour day when daylight saving changes", () => {
    // NZ daylight saving starts Sun 27 Sep 2026 and ends Sun 4 Apr 2027.
    const short = venueDayWindow(new Date("2026-09-27T00:00:00Z"), NZ)!;
    expect(short.end.getTime() - short.start.getTime()).toBe(23 * 3_600_000);
    expect(short.start.toISOString()).toBe("2026-09-26T12:00:00.000Z");
    expect(short.end.toISOString()).toBe("2026-09-27T11:00:00.000Z");
    const long = venueDayWindow(new Date("2027-04-04T00:00:00Z"), NZ)!;
    expect(long.end.getTime() - long.start.getTime()).toBe(25 * 3_600_000);
    expect(long.start.toISOString()).toBe("2027-04-03T11:00:00.000Z");
    expect(long.end.toISOString()).toBe("2027-04-04T12:00:00.000Z");
  });

  it("works for a venue on UTC, where date-only values sit right on midnight", () => {
    const w = venueDayWindow(new Date("2027-03-12T00:00:00Z"), "UTC")!;
    expect(w.start.toISOString()).toBe("2027-03-12T00:00:00.000Z");
    expect(w.end.toISOString()).toBe("2027-03-13T00:00:00.000Z");
  });

  it("puts a date-only value on its own day", () => {
    expect(venueDayWindow(new Date("2027-03-12T00:00:00Z"), NZ)!.dayKey).toBe("2027-03-12");
    expect(venueDayWindow("2027-03-12", NZ)!.dayKey).toBe("2027-03-12");
  });

  it("is null without a date", () => {
    expect(venueDayWindow("", NZ)).toBeNull();
  });
});
