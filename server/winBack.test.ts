import { describe, expect, it } from "vitest";
import {
  DEFAULT_ANNUAL_TYPES, isAnnualEventType, parseAnnualTypes, sameTimeNextYearWindow, winBackEligibility,
} from "../shared/winBack";
import { STARTER_TEMPLATES } from "../shared/starterTemplates";
import { TEMPLATE_VARIABLES } from "../client/src/lib/templateVars";
import { LOST_REASONS, lostReasonLabel } from "../shared/lostReasons";

const DAY = 86_400_000;

describe("winBackEligibility", () => {
  const now = Date.UTC(2026, 9, 8);
  it("allows a lead that has never had a win-back", () => {
    expect(winBackEligibility(null, now).eligible).toBe(true);
  });
  it("blocks a second win-back within 90 days and says when it opens", () => {
    const r = winBackEligibility(new Date(now - 30 * DAY), now);
    expect(r.eligible).toBe(false);
    expect(r.nextAt?.getTime()).toBe(now + 60 * DAY);
  });
  it("allows one again after 90 days", () => {
    expect(winBackEligibility(new Date(now - 91 * DAY), now).eligible).toBe(true);
  });
});

describe("annual event types", () => {
  it("falls back to the defaults when nothing valid is saved", () => {
    expect(parseAnnualTypes(null)).toEqual(DEFAULT_ANNUAL_TYPES);
    expect(parseAnnualTypes("not json")).toEqual(DEFAULT_ANNUAL_TYPES);
    expect(parseAnnualTypes('["Birthday", " ", 3]')).toEqual(["Birthday"]);
    expect(parseAnnualTypes("[]")).toEqual([]);
  });
  it("matches by contained words, ignoring case and hyphens", () => {
    expect(isAnnualEventType("Christmas Party", ["Christmas"])).toBe(true);
    expect(isAnnualEventType("Corporate end-of-year function", ["End of year"])).toBe(true);
    expect(isAnnualEventType("Wedding", DEFAULT_ANNUAL_TYPES)).toBe(false);
    expect(isAnnualEventType(null, DEFAULT_ANNUAL_TYPES)).toBe(false);
  });
});

describe("sameTimeNextYearWindow", () => {
  it("covers events 11 to 10 months ago in NZ calendar days", () => {
    // 8 Oct 2026, 9am NZ (still 7 Oct in UTC).
    const now = Date.UTC(2026, 9, 7, 20, 0, 0);
    const { from, to } = sameTimeNextYearWindow(now, "Pacific/Auckland");
    // From 8 Nov 2025 00:00 NZDT (7 Nov 11:00 UTC) up to, not including,
    // 9 Dec 2025 00:00 NZDT (8 Dec 11:00 UTC).
    expect(from.toISOString()).toBe("2025-11-07T11:00:00.000Z");
    expect(to.toISOString()).toBe("2025-12-08T11:00:00.000Z");
  });
  it("clamps to the end of shorter months", () => {
    const now = Date.UTC(2026, 11, 31, 0, 0, 0); // 31 Dec 2026 in NZ
    const { from } = sameTimeNextYearWindow(now, "Pacific/Auckland");
    // 11 months back from 31 Dec is 31 Jan; 10 months back is 28 Feb.
    expect(from.toISOString().slice(0, 10)).toBe("2026-01-30");
  });
});

describe("starter templates", () => {
  const known = new Set(TEMPLATE_VARIABLES.map(v => v.token));
  it("offers 6–8 templates with unique names", () => {
    expect(STARTER_TEMPLATES.length).toBeGreaterThanOrEqual(6);
    expect(STARTER_TEMPLATES.length).toBeLessThanOrEqual(8);
    expect(new Set(STARTER_TEMPLATES.map(t => t.name)).size).toBe(STARTER_TEMPLATES.length);
  });
  it("uses only known variables, apart from the deliberate fill-in", () => {
    for (const t of STARTER_TEMPLATES) {
      for (const m of `${t.subject}\n${t.body}`.matchAll(/\{\{\w+\}\}/g)) {
        if (m[0] === "{{alternativeDates}}") continue;
        expect(known.has(m[0]), `${t.name}: ${m[0]}`).toBe(true);
      }
    }
  });
  it("stays calm: no exclamation marks", () => {
    for (const t of STARTER_TEMPLATES) expect(`${t.subject}${t.body}`).not.toMatch(/!/);
  });
});

describe("lost reasons", () => {
  it("labels every key and passes unknown text through", () => {
    for (const r of LOST_REASONS) expect(lostReasonLabel(r.key)).toBe(r.label);
    expect(lostReasonLabel(null)).toBeNull();
  });
});
