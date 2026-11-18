import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { composite, contrastRatio, parseColor, readableOn } from "../shared/contrast";

// Every colour scheme in the Theme picker, checked against WCAG AA. A theme only
// swaps CSS variables, while much of the app paints hard-coded ink (#211d18) on
// hard-coded cream cards (#fffdf9), so a theme also has to work with those.
// Charcoal and Midnight Rose failed exactly that way (headings at 1.2:1).

const CSS = readFileSync(new URL("../client/src/index.css", import.meta.url), "utf8");

function tokens(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of block.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

const themes: Record<string, Record<string, string>> = {};
for (const m of CSS.matchAll(/\[data-theme="([\w-]+)"\]\s*\{([^}]*)\}/g)) themes[m[1]] = tokens(m[2]);
const root = tokens(/:root\s*\{([^}]*)\}/.exec(CSS)![1]);

const INK = "#211d18";    // .text-ink, ~1,700 uses
const CREAM = "#fffdf9";  // .dante-card / .bg-cream surfaces
const TEXT = 4.5, UI = 3;

// [foreground, background, minimum]; a name is a token, a # value is hard-coded.
const PAIRS: [string, string, number][] = [
  ["foreground", "background", TEXT], ["foreground", "card", TEXT], ["foreground", "muted", TEXT],
  ["card-foreground", "card", TEXT], ["popover-foreground", "popover", TEXT],
  ["muted-foreground", "background", TEXT], ["muted-foreground", "card", TEXT], ["muted-foreground", "muted", TEXT],
  ["primary-foreground", "primary", TEXT], ["primary", "background", TEXT], ["primary", "card", TEXT],
  ["secondary-foreground", "secondary", TEXT], ["accent-foreground", "accent", TEXT],
  ["destructive-foreground", "destructive", TEXT],
  ["ring", "background", UI], ["ring", "card", UI],
  ["sidebar-foreground", "sidebar", TEXT], ["sidebar-primary-foreground", "sidebar-primary", TEXT],
  // Hard-coded colours meeting the theme's own.
  [INK, "background", TEXT], [INK, "card", TEXT], [INK, "muted", TEXT],
  ["foreground", CREAM, TEXT], ["muted-foreground", CREAM, TEXT], ["primary", CREAM, TEXT],
  ["#ffffff", "primary", TEXT], ["ring", CREAM, UI],
];

function failures(t: Record<string, string>): string[] {
  const get = (k: string) => (k.startsWith("#") ? k : t[k] ?? root[k]);
  const out: string[] = [];
  for (const [fg, bg, min] of PAIRS) {
    const a = get(fg), b = get(bg);
    if (!a || !b || !parseColor(a) || !parseColor(b)) continue;
    const r = contrastRatio(a, b);
    if (r < min) out.push(`${fg} on ${bg}: ${r.toFixed(2)}:1 (needs ${min}:1)`);
  }
  return out;
}

describe("contrast maths", () => {
  it("matches the WCAG reference values", () => {
    expect(contrastRatio("#000", "#fff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
    expect(contrastRatio("#2f5488", "#fffdf9")).toBeCloseTo(7.53, 1);
  });
  it("reads oklch() like the browser", () => {
    // oklch(0.628 0.2577 29.23) is sRGB red.
    const red = parseColor("oklch(0.628 0.2577 29.23)")!;
    expect(red[0]).toBeGreaterThan(250);
    expect(red[1]).toBeLessThan(5);
    expect(red[2]).toBeLessThan(5);
  });
  it("puts translucent text over its background", () => {
    // cream at 70% on the navy dialog header (text-cream/70)
    expect(contrastRatio("rgba(255,253,249,0.7)", "#2f5488")).toBeGreaterThan(4.5);
  });
});

describe("colour themes", () => {
  it("found every theme in index.css", () => {
    expect(Object.keys(themes)).toEqual(expect.arrayContaining(["sage", "forest", "charcoal", "seafoam", "retro-warm", "midnight-rose", "olivie", "matcha"]));
  });

  it("the default (:root) tokens pass", () => {
    expect(failures(root)).toEqual([]);
  });

  for (const name of Object.keys(themes)) {
    it(`${name} passes AA for text (4.5:1) and focus ring (3:1)`, () => {
      expect(failures(themes[name])).toEqual([]);
    });
  }
});

describe("secondary text on a new-enquiry row", () => {
  // The Enquiries list used to fill a "New Enquiry" row with the status blue
  // at alpha 0x2b. Rows have no fill now (their colour is the lane band, dot
  // and words, checked in server/enquiryLane.test.ts, and the status pill, in
  // server/statusPalette.test.ts), so this no longer guards a painted surface;
  // it stays as a floor for any light blue wash a theme's muted text meets.
  const tintOver = (bg: string) => composite(parseColor("#2f54882b")!, parseColor(bg)!);
  for (const [name, t] of [[":root", root] as const, ...Object.entries(themes)]) {
    it(`${name}: muted text reads on the tint`, () => {
      const bg = t.background ?? root.background;
      expect(contrastRatio(t["muted-foreground"] ?? root["muted-foreground"], tintOver(bg))).toBeGreaterThanOrEqual(TEXT);
    });
  }
});

describe("text-box outline", () => {
  it("is 3:1 on cream, white and the sand fill", () => {
    for (const bg of [CREAM, "#ffffff", "#f4efe6"]) expect(contrastRatio(root["field-border"], bg)).toBeGreaterThanOrEqual(UI);
  });
});

describe("readableOn", () => {
  it("puts dark text on the sky-blue Contacted band (white was 2.1:1)", () => {
    expect(readableOn("#38bdf8")).toBe("#1a1a1a");
    expect(contrastRatio(readableOn("#38bdf8"), "#38bdf8")).toBeGreaterThan(4.5);
  });
  it("keeps white on dark fills", () => {
    expect(readableOn("#047857")).toBe("#fff");
    expect(readableOn("#2f5488")).toBe("#fff");
    expect(readableOn("#991b1b")).toBe("#fff");
  });
});
