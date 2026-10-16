import { describe, it, expect } from "vitest";
import { venueBrand, inkOnAccent, BRAND_FONT_PAIRS } from "@shared/brand";

describe("venueBrand", () => {
  it("falls back to the editorial navy when nothing is set", () => {
    const b = venueBrand(null);
    expect(b.accent).toBe("#2f5488");
    expect(b.onAccent).toBe("#fff"); // navy is dark → white text
    expect(b.serif).toBe(BRAND_FONT_PAIRS.editorial.serif);
    expect(b.sans).toBe(BRAND_FONT_PAIRS.editorial.sans);
    expect(b.fontLink).toBe(BRAND_FONT_PAIRS.editorial.link);
    expect(b.logoUrl).toBeNull();
  });

  it("uses the venue colour when there is no Brand Pack accent", () => {
    const b = venueBrand({ primaryColor: "#C8102E" });
    expect(b.accent).toBe("#C8102E");
  });

  it("lets the Brand Pack accent win over the venue colour", () => {
    const b = venueBrand({ brandAccentColor: "#1d3f5e", primaryColor: "#C8102E" });
    expect(b.accent).toBe("#1d3f5e");
  });

  it("ignores an invalid accent and falls through to the next candidate", () => {
    expect(venueBrand({ brandAccentColor: "not-a-colour", primaryColor: "#123456" }).accent).toBe("#123456");
    expect(venueBrand({ brandAccentColor: "#zzzzzz", primaryColor: "bad" }).accent).toBe("#2f5488");
  });

  it("picks readable text for the accent (dark text on a light accent)", () => {
    expect(venueBrand({ brandAccentColor: "#ffffff" }).onAccent).toBe("#1a1a1a");
    expect(venueBrand({ brandAccentColor: "#000000" }).onAccent).toBe("#fff");
    expect(inkOnAccent("#ffffff")).toBe("#1a1a1a");
  });

  it("resolves the font pairing from brandFontKey, defaulting to editorial", () => {
    expect(venueBrand({ brandFontKey: "classic" }).serif).toBe(BRAND_FONT_PAIRS.classic.serif);
    expect(venueBrand({ brandFontKey: "classic" }).fontLink).toBe(BRAND_FONT_PAIRS.classic.link);
    // Unknown key → editorial default.
    expect(venueBrand({ brandFontKey: "does-not-exist" }).serif).toBe(BRAND_FONT_PAIRS.editorial.serif);
  });

  it("passes the logo through, treating an empty string as no logo", () => {
    expect(venueBrand({ logoUrl: "https://example.com/logo.png" }).logoUrl).toBe("https://example.com/logo.png");
    expect(venueBrand({ logoUrl: "" }).logoUrl).toBeNull();
  });
});
