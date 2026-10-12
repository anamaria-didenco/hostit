import { describe, expect, it } from "vitest";
import {
  buildGoogleAdsConversionCsv, cleanLandingPage, googleAdsTime, isVenueSiteOrigin, originOf, parseAdClickAt,
} from "@shared/adAttribution";
import { zonedWallTimeToDate } from "@shared/eventDate";

const NZ = "Pacific/Auckland";

describe("ad attribution", () => {
  it("recognises the venue's own website only", () => {
    expect(isVenueSiteOrigin("https://www.barfranco.nz", "barfranco.nz")).toBe(true);
    expect(isVenueSiteOrigin("https://barfranco.nz", "https://www.barfranco.nz")).toBe(true);
    expect(isVenueSiteOrigin("https://events.barfranco.nz", "barfranco.nz")).toBe(true);
    expect(isVenueSiteOrigin("http://www.barfranco.nz", "barfranco.nz")).toBe(false);
    expect(isVenueSiteOrigin("https://barfranco.nz.evil.com", "barfranco.nz")).toBe(false);
    expect(isVenueSiteOrigin("https://notbarfranco.nz", "barfranco.nz")).toBe(false);
    expect(isVenueSiteOrigin(null, "barfranco.nz")).toBe(false);
    expect(originOf("https://www.barfranco.nz/functions/?x=1")).toBe("https://www.barfranco.nz");
    expect(originOf("javascript:alert(1)")).toBeNull();
  });

  it("keeps only origin + path of the landing page", () => {
    expect(cleanLandingPage("https://www.barfranco.nz/christmas-functions/?gclid=abc&email=a@b.c#x")).toBe("https://www.barfranco.nz/christmas-functions/");
    expect(cleanLandingPage("javascript:alert(1)")).toBeUndefined();
  });

  it("accepts a sensible click time only", () => {
    const now = Date.parse("2026-10-12T00:00:00Z");
    expect(parseAdClickAt(String(now - 3_600_000), now)?.getTime()).toBe(now - 3_600_000);
    expect(parseAdClickAt("2026-10-11T10:00:00Z", now)?.toISOString()).toBe("2026-10-11T10:00:00.000Z");
    expect(parseAdClickAt(String(now + 86_400_000), now)).toBeUndefined();
    expect(parseAdClickAt("2026-01-01T00:00:00Z", now)).toBeUndefined();
    expect(parseAdClickAt("nonsense", now)).toBeUndefined();
  });

  it("writes Conversion Time with that day's NZ offset", () => {
    expect(googleAdsTime(zonedWallTimeToDate(2026, 10, 24, 18, 30, NZ), NZ)).toBe("2026-10-24 18:30:00+13:00");
    expect(googleAdsTime(zonedWallTimeToDate(2026, 6, 13, 19, 0, NZ), NZ)).toBe("2026-06-13 19:00:00+12:00");
  });

  it("builds the offline conversion CSV", () => {
    const confirmed = zonedWallTimeToDate(2026, 10, 9, 14, 5, NZ);
    const { csv, included, skipped } = buildGoogleAdsConversionCsv([
      { gclid: "Cj0KCQ-gclid", gbraid: "ignored", confirmedAt: confirmed, value: "4140.00", adClickAt: new Date(confirmed.getTime() - 86_400_000) },
      { gbraid: "GB-1", confirmedAt: confirmed, value: 0 },
      { wbraid: "WB-1", confirmedAt: confirmed, value: 1200 },
      { confirmedAt: confirmed, value: 99 },
      { gclid: "late", confirmedAt: confirmed, adClickAt: new Date(confirmed.getTime() - 91 * 86_400_000) },
      // No click time passed: the enquiry date stands in (the click came first).
      { gclid: "late-enquiry", confirmedAt: confirmed, enquiredAt: new Date(confirmed.getTime() - 100 * 86_400_000) },
      // Confirmed 80 days ago after a 20-day sales cycle: the click is 100 days old at upload.
      { gclid: "expired-at-upload", confirmedAt: new Date(confirmed.getTime() - 79 * 86_400_000), adClickAt: new Date(confirmed.getTime() - 99 * 86_400_000) },
    ], NZ, confirmed.getTime() + 86_400_000);
    expect(csv.split("\n")).toEqual([
      "Google Click ID,GBRAID,WBRAID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency",
      "Cj0KCQ-gclid,,,Booking confirmed (VenueFlow),2026-10-09 14:05:00+13:00,4140.00,NZD",
      ",GB-1,,Booking confirmed (VenueFlow),2026-10-09 14:05:00+13:00,,NZD",
      ",,WB-1,Booking confirmed (VenueFlow),2026-10-09 14:05:00+13:00,1200.00,NZD",
      "",
    ]);
    expect(included).toBe(3);
    expect(skipped.map(s => s.reason)).toEqual(["no click ID", "click over 90 days ago", "click over 90 days ago", "click over 90 days ago"]);
  });
});
