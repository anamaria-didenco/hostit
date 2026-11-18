import { describe, expect, it } from "vitest";
import { normaliseTaskPriority, taskDuePrefix, taskDueState, taskOverdueBefore } from "../shared/taskFields";

describe("normaliseTaskPriority", () => {
  it("keeps low / normal / high and reads older words sensibly", () => {
    expect(normaliseTaskPriority("low")).toBe("low");
    expect(normaliseTaskPriority("normal")).toBe("normal");
    expect(normaliseTaskPriority("HIGH")).toBe("high");
    expect(normaliseTaskPriority("medium")).toBe("normal");
    expect(normaliseTaskPriority("urgent")).toBe("high");
    expect(normaliseTaskPriority("")).toBe("normal");
    expect(normaliseTaskPriority(null)).toBe("normal");
    expect(normaliseTaskPriority(undefined)).toBe("normal");
  });
});

describe("taskDueState", () => {
  const at = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min).getTime();
  const now = at(2026, 11, 17, 15, 30);

  it("a task due earlier today is due today, not overdue (both places agree)", () => {
    expect(taskDueState(at(2026, 11, 17, 12), now)).toBe("today");
    expect(taskDueState(at(2026, 11, 17, 0), now)).toBe("today");
    expect(taskDueState(at(2026, 11, 17, 23, 59), now)).toBe("today");
  });

  it("yesterday or before is overdue; tomorrow on is later", () => {
    expect(taskDueState(at(2026, 11, 16, 23, 59), now)).toBe("overdue");
    expect(taskDueState(at(2026, 10, 1), now)).toBe("overdue");
    expect(taskDueState(at(2026, 11, 18, 0), now)).toBe("later");
  });

  it("words before the date", () => {
    expect(taskDuePrefix("overdue")).toBe("Overdue — ");
    expect(taskDuePrefix("today")).toBe("Due today — ");
    expect(taskDuePrefix("later")).toBe("Due ");
  });
});

describe("taskOverdueBefore", () => {
  // 13:16 on Wed 18 Nov 2026 in Auckland (NZDT, UTC+13) is 00:16 UTC that day.
  const now = Date.UTC(2026, 10, 18, 0, 16);

  it("is the start of today in the venue's zone", () => {
    expect(new Date(taskOverdueBefore("Pacific/Auckland", now)).toISOString()).toBe("2026-11-17T11:00:00.000Z");
    expect(new Date(taskOverdueBefore("UTC", now)).toISOString()).toBe("2026-11-18T00:00:00.000Z");
    // Late evening in Sydney is still the 18th's start there.
    expect(new Date(taskOverdueBefore("Australia/Sydney", Date.UTC(2026, 10, 18, 12))).toISOString()).toBe("2026-11-17T13:00:00.000Z");
  });

  it("so a task due 9am today is not overdue, one due yesterday is", () => {
    const nineToday = Date.UTC(2026, 10, 17, 20); // 09:00 18 Nov NZDT
    const yesterday = Date.UTC(2026, 10, 17, 10, 59); // 23:59 17 Nov NZDT
    expect(nineToday < taskOverdueBefore("Pacific/Auckland", now)).toBe(false);
    expect(yesterday < taskOverdueBefore("Pacific/Auckland", now)).toBe(true);
    // An old date-only task (midnight UTC on the 18th) is due today too.
    expect(Date.UTC(2026, 10, 18) < taskOverdueBefore("Pacific/Auckland", now)).toBe(false);
  });

  it("handles the day daylight saving starts, and an unknown or empty zone", () => {
    // NZ daylight saving starts 2am Sun 27 Sep 2026: midnight that day is still +12.
    expect(new Date(taskOverdueBefore("Pacific/Auckland", Date.UTC(2026, 8, 27, 3))).toISOString()).toBe("2026-09-26T12:00:00.000Z");
    expect(taskOverdueBefore("Not/AZone", now)).toBe(taskOverdueBefore("Pacific/Auckland", now));
    expect(taskOverdueBefore(null, now)).toBe(taskOverdueBefore("Pacific/Auckland", now));
  });
});
