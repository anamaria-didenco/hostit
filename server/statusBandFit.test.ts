import { describe, it, expect } from "vitest";
import { longestWordEm, statusBandFontPx, statusBandFontSize, BAND_MAX_PX, BAND_MIN_PX } from "../shared/statusBandFit";

// Labels of the default statuses (client/src/components/StatusManager.tsx), plus
// the booking status shown for confirmed events.
const DEFAULT_LABELS = ["New Enquiry", "Contacted", "Proposal Sent", "Negotiating", "On Hold", "Confirmed", "Finished", "Lost"];

// Widths measured in Chromium (Hanken Grotesk 800, no letter spacing), in em.
const MEASURED: Record<string, number> = { NEGOTIATING: 6.463, CONTACTED: 5.833, CONFIRMED: 5.699, PROPOSAL: 4.99, ENQUIRY: 4.18, FINISHED: 4.31 };

// The narrowest band at sm and up (768 and 1024px windows) is 51.9px wide;
// with 2px padding each side that leaves 47.9px for the text.
const NARROWEST_TEXT_PX = 47.9;

describe("Overview status band sizing", () => {
  it("measures the longest word, never less than the real width", () => {
    for (const [word, em] of Object.entries(MEASURED)) {
      const est = longestWordEm(word);
      expect(est).toBeGreaterThanOrEqual(em);
      expect(est).toBeLessThan(em * 1.05);
    }
    expect(longestWordEm("Proposal Sent")).toBe(longestWordEm("PROPOSAL"));
    expect(longestWordEm("  new   enquiry ")).toBe(longestWordEm("ENQUIRY"));
    expect(longestWordEm("Réservé")).toBe(longestWordEm("RESERVE"));
    expect(longestWordEm("")).toBe(0);
  });

  it("counts characters it doesn't know as wide", () => {
    expect(longestWordEm("会")).toBe(1);
    expect(longestWordEm("A会")).toBeGreaterThan(longestWordEm("AW"));
  });

  it("every default status word fits the narrowest band without dropping below the minimum", () => {
    for (const label of DEFAULT_LABELS) {
      const px = statusBandFontPx(label, NARROWEST_TEXT_PX);
      expect(px).toBeGreaterThan(BAND_MIN_PX);
      for (const word of label.toUpperCase().split(" ")) {
        const real = MEASURED[word] ?? longestWordEm(word);
        expect(real * px).toBeLessThanOrEqual(NARROWEST_TEXT_PX);
      }
    }
    // CONTACTED was breaking as 'CONTA / CTED' at 1024px; it now fits at 8px.
    expect(statusBandFontPx("Contacted", NARROWEST_TEXT_PX)).toBeGreaterThanOrEqual(7.8);
  });

  it("keeps the normal 11px where the word already fits", () => {
    expect(statusBandFontPx("Contacted", 84)).toBe(BAND_MAX_PX);
    expect(statusBandFontPx("Lost", NARROWEST_TEXT_PX)).toBe(BAND_MAX_PX);
    expect(statusBandFontPx("", 10)).toBe(BAND_MAX_PX);
  });

  it("floors a word too long for any size at the minimum", () => {
    expect(statusBandFontPx("Provisionallyconfirmed", NARROWEST_TEXT_PX)).toBe(BAND_MIN_PX);
  });

  it("writes the same rule as CSS against the band's width", () => {
    const css = statusBandFontSize("Contacted", "2 * var(--bp)");
    expect(css).toMatch(/^clamp\(7px, calc\(\(100cqi - 2 \* var\(--bp\)\) \/ [\d.]+\), 11px\)$/);
    const divisor = Number(css.match(/\/ ([\d.]+)\)/)![1]);
    expect(NARROWEST_TEXT_PX / divisor).toBeCloseTo(statusBandFontPx("Contacted", NARROWEST_TEXT_PX), 2);
    expect(statusBandFontSize("")).toBe("11px");
  });
});
