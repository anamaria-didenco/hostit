import { describe, it, expect } from "vitest";
import { TRPCError } from "@trpc/server";
import {
  dayBounds, dayBoundsFromYmd, eventWindow, overlaps, spaceRelation, classifyClashes,
  fmtTimeRange, zonedYmd, assertNoClashes, ClashError, type ClashCandidate,
} from "./availability";

const iso = (d: Date) => d.toISOString();
const NOW = new Date("2026-10-08T00:00:00Z");

function booking(over: Partial<ClashCandidate> = {}): ClashCandidate {
  return {
    source: "booking", id: 1, leadId: null, bookingId: 1,
    firstName: "Jane", lastName: "Smith", eventType: "Wedding", status: "confirmed",
    start: new Date("2026-10-18T05:00:00Z"), // Sun 18 Oct, 6pm NZDT
    end: new Date("2026-10-18T10:00:00Z"),   // 11pm NZDT
    spaceName: "Main Bar", ...over,
  };
}
function lead(over: Partial<ClashCandidate> = {}): ClashCandidate {
  return {
    source: "lead", id: 50, leadId: 50, bookingId: null,
    firstName: "Tom", lastName: "Hold", eventType: "Birthday", status: "tentative",
    start: new Date("2026-10-18T00:00:00Z"), end: null, spaceName: "Main Bar",
    holdUntil: new Date("2026-10-15T10:59:59Z"), ...over,
  };
}

describe("NZ calendar days", () => {
  it("builds a normal NZDT day (UTC+13)", () => {
    const d = dayBoundsFromYmd("2026-10-18");
    expect(iso(d.start)).toBe("2026-10-17T11:00:00.000Z");
    expect(iso(d.end)).toBe("2026-10-18T11:00:00.000Z");
  });

  it("builds a normal NZST day (UTC+12)", () => {
    const d = dayBoundsFromYmd("2026-06-10");
    expect(iso(d.start)).toBe("2026-06-09T12:00:00.000Z");
    expect(iso(d.end)).toBe("2026-06-10T12:00:00.000Z");
  });

  it("DST ends in April: Sunday 5 April 2026 is 25 hours long", () => {
    const d = dayBoundsFromYmd("2026-04-05");
    expect(iso(d.start)).toBe("2026-04-04T11:00:00.000Z"); // midnight NZDT
    expect(iso(d.end)).toBe("2026-04-05T12:00:00.000Z");   // midnight NZST
    expect(d.end.getTime() - d.start.getTime()).toBe(25 * 3600_000);
  });

  it("DST starts in September: Sunday 27 September 2026 is 23 hours long", () => {
    const d = dayBoundsFromYmd("2026-09-27");
    expect(iso(d.start)).toBe("2026-09-26T12:00:00.000Z"); // midnight NZST
    expect(iso(d.end)).toBe("2026-09-27T11:00:00.000Z");   // midnight NZDT
    expect(d.end.getTime() - d.start.getTime()).toBe(23 * 3600_000);
  });

  it("puts an instant on its NZ day, not its UTC day", () => {
    // 10:59:59Z on the 17th is 11:59:59pm NZDT on the 17th; one second later is the 18th.
    expect(zonedYmd(new Date("2026-10-17T10:59:59Z"))).toBe("2026-10-17");
    expect(zonedYmd(new Date("2026-10-17T11:00:00Z"))).toBe("2026-10-18");
    // A legacy date-only value (UTC midnight) is 1pm NZ the same calendar day.
    expect(iso(dayBounds(new Date("2026-10-18T00:00:00Z")).start)).toBe("2026-10-17T11:00:00.000Z");
  });

  it("finds the day around the April DST change from an instant inside the repeated hour", () => {
    // 2:30am NZST on 5 April (after clocks went back) = 14:30Z on the 4th.
    const d = dayBounds(new Date("2026-04-04T14:30:00Z"));
    expect(iso(d.start)).toBe("2026-04-04T11:00:00.000Z");
  });
});

describe("event windows and overlap", () => {
  it("uses real times when both start and end are set", () => {
    const w = eventWindow(new Date("2026-10-18T05:00:00Z"), new Date("2026-10-18T10:00:00Z"));
    expect(w.allDay).toBe(false);
    expect(fmtTimeRange(w)).toBe("6–11pm");
  });

  it("falls back to the whole NZ day without an end", () => {
    const w = eventWindow(new Date("2026-10-18T05:00:00Z"), null);
    expect(w.allDay).toBe(true);
    expect(iso(w.start)).toBe("2026-10-17T11:00:00.000Z");
  });

  it("ignores an end that is not after the start", () => {
    expect(eventWindow(new Date("2026-10-18T05:00:00Z"), new Date("2026-10-18T05:00:00Z")).allDay).toBe(true);
  });

  it("treats back-to-back events as not overlapping", () => {
    const a = { start: new Date("2026-10-18T00:00:00Z"), end: new Date("2026-10-18T05:00:00Z") };
    const b = { start: new Date("2026-10-18T05:00:00Z"), end: new Date("2026-10-18T09:00:00Z") };
    expect(overlaps(a, b)).toBe(false);
  });

  it("formats mixed am/pm ranges", () => {
    // 11:30am–2pm NZDT
    expect(fmtTimeRange({ start: new Date("2026-10-17T22:30:00Z"), end: new Date("2026-10-18T01:00:00Z"), allDay: false })).toBe("11:30am–2pm");
  });
});

describe("spaces", () => {
  it("matches by name, case-insensitively, across multi-space hires", () => {
    expect(spaceRelation({ spaceName: "Main Bar" }, { spaceName: "main bar" })).toBe("same");
    expect(spaceRelation({ spaceName: "Bar, Restaurant" }, { spaceName: "Restaurant" })).toBe("same");
    expect(spaceRelation({ spaceName: "Bar" }, { spaceName: "Restaurant" })).toBe("different");
  });
  it("prefers ids when both sides have one", () => {
    expect(spaceRelation({ spaceId: 1, spaceName: "Bar" }, { spaceId: 2, spaceName: "Bar" })).toBe("different");
  });
  it("is unknown when either side has no space", () => {
    expect(spaceRelation({ spaceName: "" }, { spaceName: "Bar" })).toBe("unknown");
    expect(spaceRelation({}, { spaceName: null })).toBe("unknown");
  });
});

describe("classifyClashes", () => {
  const sun = new Date("2026-10-18T00:00:00Z"); // date-only Sunday 18 Oct

  it("flags a confirmed booking in the same space on the same day", () => {
    const out = classifyClashes({ start: sun, spaceName: "Main Bar" }, [booking()], { now: NOW });
    expect(out).toHaveLength(1);
    expect(out[0].certainty).toBe("clash");
    expect(out[0].kind).toBe("booked");
    expect(out[0].summary).toBe("Sunday 18 Oct: Main Bar is already booked for Jane Smith (Wedding, 6–11pm).");
  });

  it("lets a lunch and a dinner share a room", () => {
    const lunchStart = new Date("2026-10-17T23:00:00Z"); // 12pm NZDT
    const lunchEnd = new Date("2026-10-18T02:00:00Z");   // 3pm
    expect(classifyClashes({ start: lunchStart, end: lunchEnd, spaceName: "Main Bar" }, [booking()], { now: NOW })).toHaveLength(0);
  });

  it("ignores other spaces, cancelled bookings and the event itself", () => {
    expect(classifyClashes({ start: sun, spaceName: "Restaurant" }, [booking()], { now: NOW })).toHaveLength(0);
    expect(classifyClashes({ start: sun, spaceName: "Main Bar" }, [booking({ status: "cancelled" })], { now: NOW })).toHaveLength(0);
    expect(classifyClashes({ start: sun, spaceName: "Main Bar", excludeBookingId: 1 }, [booking()], { now: NOW })).toHaveLength(0);
    expect(classifyClashes({ start: sun, spaceName: "Main Bar", excludeLeadId: 9 }, [booking({ leadId: 9 })], { now: NOW })).toHaveLength(0);
  });

  it("does not clash across the NZ midnight boundary", () => {
    // Saturday 17 Oct 11:30pm NZDT, no end → whole of Saturday only.
    const lateSaturday = new Date("2026-10-17T10:30:00Z");
    expect(classifyClashes({ start: lateSaturday, spaceName: "Main Bar" }, [booking()], { now: NOW })).toHaveLength(0);
  });

  it("returns same-day items as 'possible' when the space is unknown", () => {
    const out = classifyClashes({ start: sun }, [booking()], { now: NOW });
    expect(out[0].certainty).toBe("possible");
    const out2 = classifyClashes({ start: sun, spaceName: "Main Bar" }, [booking({ spaceName: null })], { now: NOW });
    expect(out2[0].certainty).toBe("possible");
  });

  it("counts a live hold, and drops one that has lapsed", () => {
    const live = classifyClashes({ start: sun, spaceName: "Main Bar" }, [lead()], { now: NOW });
    expect(live[0].kind).toBe("hold");
    expect(live[0].summary).toContain("Main Bar is on hold for Tom Hold");
    const lapsed = classifyClashes({ start: sun, spaceName: "Main Bar" }, [lead()], { now: new Date("2026-10-16T00:00:00Z") });
    expect(lapsed).toHaveLength(0);
  });

  it("ignores leads that aren't booked or held", () => {
    expect(classifyClashes({ start: sun, spaceName: "Main Bar" }, [lead({ status: "new", holdUntil: null })], { now: NOW })).toHaveLength(0);
    expect(classifyClashes({ start: sun, spaceName: "Main Bar" }, [lead({ status: "booked", holdUntil: null })], { now: NOW })[0].kind).toBe("booked");
  });

  it("checks DST-day events on the right day", () => {
    // Booking 7pm NZST on Sun 5 April 2026 (= 07:00Z) vs a date-only query for 5 April.
    const dstBooking = booking({ start: new Date("2026-04-05T07:00:00Z"), end: null });
    expect(classifyClashes({ start: new Date("2026-04-05T00:00:00Z"), spaceName: "Main Bar" }, [dstBooking], { now: NOW })).toHaveLength(1);
    // …and not for Saturday 4 April late evening (11pm NZDT = 10:00Z).
    expect(classifyClashes({ start: new Date("2026-04-04T10:00:00Z"), spaceName: "Main Bar" }, [dstBooking], { now: NOW })).toHaveLength(0);
    // September: 1am NZST Sun 27 Sept (= 26th 13:00Z) is on the 27th.
    const sept = booking({ start: new Date("2026-09-26T13:00:00Z"), end: null });
    expect(classifyClashes({ start: new Date("2026-09-27T00:00:00Z"), spaceName: "Main Bar" }, [sept], { now: NOW })).toHaveLength(1);
    expect(classifyClashes({ start: new Date("2026-09-26T00:00:00Z"), spaceName: "Main Bar" }, [sept], { now: NOW })).toHaveLength(0);
  });

  it("sorts definite clashes before possibles", () => {
    const out = classifyClashes({ start: sun, spaceName: "Main Bar" }, [booking({ id: 2, bookingId: 2, spaceName: null }), booking()], { now: NOW });
    expect(out.map(c => c.certainty)).toEqual(["clash", "possible"]);
  });
});

describe("assertNoClashes", () => {
  const clash = classifyClashes({ start: new Date("2026-10-18T00:00:00Z"), spaceName: "Main Bar" }, [booking()], { now: NOW });
  const possible = classifyClashes({ start: new Date("2026-10-18T00:00:00Z") }, [booking()], { now: NOW });

  it("throws CONFLICT carrying the clash list", () => {
    try {
      assertNoClashes(clash);
      throw new Error("expected a throw");
    } catch (e) {
      expect(e).toBeInstanceOf(TRPCError);
      expect((e as TRPCError).code).toBe("CONFLICT");
      expect((e as TRPCError).cause).toBeInstanceOf(ClashError);
      expect(((e as TRPCError).cause as ClashError).clashes).toHaveLength(1);
    }
  });
  it("lets an explicit override through", () => {
    expect(() => assertNoClashes(clash, true)).not.toThrow();
  });
  it("doesn't block on 'possible' alone", () => {
    expect(() => assertNoClashes(possible)).not.toThrow();
  });
});
