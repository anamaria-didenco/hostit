import { describe, it, expect } from "vitest";
import {
  zonedTimeToUtc, dateKeyInTz, tzOffsetMinutes, addDaysToKey, weekdayOfKey, formatSlotLabel,
  spacesCovered, aggregateAvailability,
  parseWalkthroughSettings, generateWalkthroughSlots, DEFAULT_WALKTHROUGH,
  buildIcs, formStartToken, checkFormStartToken, looksLikeBot, MIN_FORM_FILL_MS,
  walkthroughRequestDays, describeWalkthroughRequest,
} from "./enquiryConversion";

const SECRET = "test-secret-at-least-16-chars";

describe("NZ time maths", () => {
  it("converts Auckland wall-clock to UTC either side of daylight saving", () => {
    // Winter (NZST, +12)
    expect(zonedTimeToUtc(2026, 7, 15, 10, 30)!.toISOString()).toBe("2026-07-14T22:30:00.000Z");
    // Summer (NZDT, +13)
    expect(zonedTimeToUtc(2026, 12, 15, 10, 30)!.toISOString()).toBe("2026-12-14T21:30:00.000Z");
    expect(tzOffsetMinutes(new Date("2026-07-14T22:30:00Z"))).toBe(720);
    expect(tzOffsetMinutes(new Date("2026-12-14T21:30:00Z"))).toBe(780);
  });

  it("returns null for the hour skipped when DST starts, and the first of a repeated hour", () => {
    // DST starts Sun 27 Sep 2026: 2:00am jumps to 3:00am.
    expect(zonedTimeToUtc(2026, 9, 27, 2, 30)).toBeNull();
    expect(zonedTimeToUtc(2026, 9, 27, 3, 0)!.toISOString()).toBe("2026-09-26T14:00:00.000Z");
    // DST ends Sun 5 Apr 2026: 3:00am goes back to 2:00am, so 2:30 happens twice.
    expect(zonedTimeToUtc(2026, 4, 5, 2, 30)!.toISOString()).toBe("2026-04-04T13:30:00.000Z");
  });

  it("keys dates on the NZ calendar, not UTC's", () => {
    // 11pm UTC on the 10th is already the 11th in Auckland.
    expect(dateKeyInTz(new Date("2026-10-10T23:00:00Z"))).toBe("2026-10-11");
    expect(addDaysToKey("2026-12-31", 1)).toBe("2027-01-01");
    expect(weekdayOfKey("2026-10-13")).toBe(2); // a Tuesday
    expect(formatSlotLabel(new Date("2026-10-13T21:30:00Z"))).toBe("Wed 14 Oct, 10:30am");
  });
});

describe("availability aggregation", () => {
  const spaces = [{ id: 1, name: "Main Bar" }, { id: 2, name: "Restaurant" }];
  // Evening events in NZ — 7pm NZDT is 6am UTC the same day.
  const at = (key: string) => zonedTimeToUtc(...(key.split("-").map(Number) as [number, number, number]), 19, 0)!;

  it("matches booking space names, lists and whole-venue bookings", () => {
    expect(spacesCovered("main bar", spaces)).toEqual({ all: false, ids: [1], unknown: false });
    expect(spacesCovered("Main Bar + Restaurant", spaces).ids).toEqual([1, 2]);
    expect(spacesCovered("Whole venue", spaces).all).toBe(true);
    expect(spacesCovered("Courtyard", spaces).unknown).toBe(true);
    expect(spacesCovered(null, spaces).unknown).toBe(true);
  });

  it("marks a date booked only when every space is taken, otherwise limited", () => {
    const r = aggregateAvailability({
      monthKey: "2026-11", spaces,
      occupancies: [
        { at: at("2026-11-06"), spaceName: "Main Bar" },
        { at: at("2026-11-06"), spaceName: "Restaurant" },
        { at: at("2026-11-07"), spaceName: "Main Bar" },
        { at: at("2026-11-13"), spaceName: "Exclusive hire" },
        { at: at("2026-11-14"), spaceName: null },
        { at: at("2026-12-01"), spaceName: "Main Bar" }, // other month
      ],
    });
    expect(r).toEqual({ booked: ["2026-11-06", "2026-11-13"], limited: ["2026-11-07", "2026-11-14"] });
  });

  it("answers per space when the client picked one", () => {
    const occupancies = [
      { at: at("2026-11-07"), spaceName: "Main Bar" },
      { at: at("2026-11-08"), spaceName: "Restaurant" },
    ];
    expect(aggregateAvailability({ monthKey: "2026-11", spaces, occupancies, spaceId: 1 }))
      .toEqual({ booked: ["2026-11-07"], limited: ["2026-11-08"] });
  });

  it("treats a venue with no spaces as one room", () => {
    const r = aggregateAvailability({ monthKey: "2026-11", spaces: [], occupancies: [{ at: at("2026-11-07"), spaceName: "Anything" }] });
    expect(r).toEqual({ booked: ["2026-11-07"], limited: [] });
  });

  it("uses the NZ day for a booking stored late in the UTC day", () => {
    // 11:30am NZDT on the 1st = 22:30 UTC on 31 Oct.
    const r = aggregateAvailability({ monthKey: "2026-11", spaces: [], occupancies: [{ at: new Date("2026-10-31T22:30:00Z"), spaceName: null }] });
    expect(r.booked).toEqual(["2026-11-01"]);
  });
});

describe("walkthrough slots", () => {
  it("parses settings with safe fallbacks", () => {
    expect(parseWalkthroughSettings(null)).toEqual(DEFAULT_WALKTHROUGH);
    const s = parseWalkthroughSettings({ walkthroughEnabled: 0, walkthroughDays: "1,9,3", walkthroughStart: "9am", walkthroughSlotMinutes: 5 });
    expect(s.enabled).toBe(false);
    expect(s.days).toEqual([1, 3]);
    expect(s.start).toBe("10:00");
    expect(s.slotMinutes).toBe(30);
  });

  it("generates NZ-time slots from tomorrow, on chosen days only", () => {
    const now = new Date("2026-10-12T20:00:00Z"); // Tue 13 Oct, 9am NZDT
    const slots = generateWalkthroughSlots({
      now, busy: [],
      settings: { ...DEFAULT_WALKTHROUGH, days: [3], start: "10:00", end: "11:30", slotMinutes: 30, daysAhead: 7 },
    });
    expect(slots.map(s => s.label)).toEqual(["Wed 14 Oct, 10:00am", "Wed 14 Oct, 10:30am", "Wed 14 Oct, 11:00am"]);
    expect(slots[0].start.toISOString()).toBe("2026-10-13T21:00:00.000Z");
    expect(slots[0].end.toISOString()).toBe("2026-10-13T21:30:00.000Z");
  });

  it("keeps wall-clock times steady across the DST change", () => {
    const now = new Date("2026-09-24T00:00:00Z"); // Thu 24 Sep, NZST
    const slots = generateWalkthroughSlots({
      now, busy: [],
      settings: { ...DEFAULT_WALKTHROUGH, days: [6, 1], start: "10:00", end: "10:30", slotMinutes: 30, daysAhead: 5 },
    });
    // Sat 26 Sep is +12, Mon 28 Sep is +13 — both still 10:00am locally.
    expect(slots.map(s => [s.label, s.start.toISOString()])).toEqual([
      ["Sat 26 Sep, 10:00am", "2026-09-25T22:00:00.000Z"],
      ["Mon 28 Sep, 10:00am", "2026-09-27T21:00:00.000Z"],
    ]);
  });

  it("skips slots that clash with another walkthrough or an event in progress", () => {
    const now = new Date("2026-10-12T20:00:00Z");
    const settings = { ...DEFAULT_WALKTHROUGH, days: [3], start: "10:00", end: "12:00", slotMinutes: 30, daysAhead: 2 };
    const at = (h: number, m: number) => zonedTimeToUtc(2026, 10, 14, h, m)!;
    const slots = generateWalkthroughSlots({
      now, settings,
      busy: [
        { start: at(10, 0), end: at(10, 30) },   // another walkthrough
        { start: at(11, 15), end: at(14, 0) },   // a lunch event
      ],
    });
    expect(slots.map(s => s.timeLabel)).toEqual(["10:30am"]);
  });

  it("returns nothing when walkthroughs are off", () => {
    expect(generateWalkthroughSlots({ now: new Date(), busy: [], settings: { ...DEFAULT_WALKTHROUGH, enabled: false } })).toEqual([]);
  });
});

describe("ics", () => {
  it("builds a valid single VEVENT with escaped, folded text", () => {
    const ics = buildIcs({
      uid: "walkthrough-1@venueflowhq.com",
      start: new Date("2026-10-13T21:30:00Z"), end: new Date("2026-10-13T22:00:00Z"),
      summary: "Walkthrough, Bar Franco", description: "Line one\nLine two; with a semicolon " + "x".repeat(80),
      location: "1 Queen St, Auckland", organizerName: "Bar Franco", organizerEmail: "events@barfranco.nz",
      now: new Date("2026-10-08T00:00:00Z"),
    });
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("DTSTART:20261013T213000Z\r\n");
    expect(ics).toContain("DTEND:20261013T220000Z\r\n");
    expect(ics).toContain("SUMMARY:Walkthrough\\, Bar Franco\r\n");
    expect(ics).toContain("Line one\\nLine two\\; with");
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
    for (const line of ics.split("\r\n")) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
  });
});

describe("spam checks", () => {
  it("accepts a token older than the minimum fill time, rejects fast or forged ones", () => {
    const issued = 1_800_000_000_000;
    const t = formStartToken(1, issued, SECRET);
    expect(checkFormStartToken(t, 1, issued + MIN_FORM_FILL_MS + 1, SECRET)).toBe("ok");
    expect(checkFormStartToken(t, 1, issued + 1000, SECRET)).toBe("too_fast");
    expect(checkFormStartToken(t, 2, issued + 10_000, SECRET)).toBe("invalid");
    expect(checkFormStartToken("abc.def", 1, issued, SECRET)).toBe("invalid");
    expect(checkFormStartToken(undefined, 1, issued, SECRET)).toBe("missing");
  });

  it("flags a filled honeypot and lets a missing token through", () => {
    expect(looksLikeBot({ honeypot: "http://spam", ownerId: 1, now: Date.now(), secret: SECRET }).bot).toBe(true);
    expect(looksLikeBot({ honeypot: "", formToken: undefined, ownerId: 1, now: Date.now(), secret: SECRET }).bot).toBe(false);
  });
});

describe("walkthrough requests", () => {
  const settings = { ...DEFAULT_WALKTHROUGH, days: [2, 4], daysAhead: 14 }; // Tue + Thu
  it("offers the venue's weekdays from tomorrow (NZ), within the window", () => {
    // 11pm Monday NZ time (UTC is still Monday morning) — tomorrow is Tuesday.
    const now = new Date("2026-10-12T10:00:00Z");
    const days = walkthroughRequestDays(now, settings);
    expect(days[0]).toEqual({ key: "2026-10-13", label: "Tue 13 Oct" });
    expect(days.map(d => d.key)).toEqual(["2026-10-13", "2026-10-15", "2026-10-20", "2026-10-22"]);
  });
  it("offers nothing when walkthroughs are off", () => {
    expect(walkthroughRequestDays(new Date(), { ...settings, enabled: false })).toEqual([]);
  });
  it("describes a request in plain words", () => {
    expect(describeWalkthroughRequest({ dates: ["2026-10-13"], timeOfDay: "morning" })).toBe("Tue 13 Oct · Morning");
    expect(describeWalkthroughRequest({ dates: ["2026-10-13", "2026-10-15"], timeOfDay: "any" })).toBe("Tue 13 Oct or Thu 15 Oct · Any time");
    expect(describeWalkthroughRequest({ dates: ["2026-10-13", "2026-10-15", "2026-10-20"], timeOfDay: "evening", note: " after 5 " }))
      .toBe('Tue 13 Oct, Thu 15 Oct or Tue 20 Oct · Evening — "after 5"');
    expect(describeWalkthroughRequest({ dates: [], timeOfDay: "afternoon" })).toBe("Any day · Afternoon");
  });
});
