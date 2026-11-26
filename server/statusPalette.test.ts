import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { composite, contrastRatio, parseColor, type RGBA } from "../shared/contrast";
import { FALLBACK, INK_MIN, OUTLINE_MIN, OUTLINE_REF, statusPalette } from "../shared/statusPalette";
import { LANE_INK, LANE_MARK } from "../shared/enquiryLane";

// The status pills on the enquiry list and the Board's column headings take
// their colours from the colour a venue picks in Settings > Statuses. Every
// one of them, and colours a venue might pick in the future, has to keep the
// pill's words readable and its outline visible on every row surface of every
// theme.

const CSS = readFileSync(new URL("../client/src/index.css", import.meta.url), "utf8");
const MANAGER = readFileSync(new URL("../client/src/components/StatusManager.tsx", import.meta.url), "utf8");

function tokens(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of block.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}
const root = tokens(/:root\s*\{([^}]*)\}/.exec(CSS)![1]);
const themes: [string, Record<string, string>][] = [[":root", root]];
for (const m of CSS.matchAll(/\[data-theme="([\w-]+)"\]\s*\{([^}]*)\}/g)) themes.push([m[1], { ...root, ...tokens(m[2]) }]);

// The presets a venue can pick today.
const PRESETS = [...MANAGER.matchAll(/id:\s*"([\w-]+)"[^\n]*?swatch:\s*"(#[0-9a-f]{6})"/gi)].map(m => [m[1], m[2]] as const);
// Colours a venue might pick if the choice ever widens: pale, glaring, near
// black, see-through, unreadable and empty.
const AWKWARD = ["#fff", "#fffde0", "#fff59d", "#ffff00", "#00ff00", "#ff00ff", "#000", "#111", "#141414", "rgba(255,0,0,0.3)", "not a colour", ""];
// And a sweep round the wheel: 72 hues at three lightnesses and strengths.
const hslToHex = (h: number, s: number, l: number) => {
  s /= 100; l /= 100;
  const k = (n: number) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n: number) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
  return "#" + [f(0), f(8), f(4)].map(v => v.toString(16).padStart(2, "0")).join("");
};
const SWEEP: string[] = [];
for (let h = 0; h < 360; h += 5) for (const [s, l] of [[100, 50], [90, 80], [60, 20]]) SWEEP.push(hslToHex(h, s, l));
const COLOURS = [...PRESETS.map(p => p[1]), ...AWKWARD, ...SWEEP];

const CREAM = "#fffdf9";
const over = (top: string, alpha: number, bottom: RGBA): RGBA => {
  const t = parseColor(top)!;
  return composite([t[0], t[1], t[2], alpha], bottom);
};

describe("status palette", () => {
  it("found the presets and the themes", () => {
    expect(PRESETS.length).toBeGreaterThanOrEqual(14);
    expect(themes.length).toBeGreaterThanOrEqual(10);
  });

  it("pill words read on the pill, for every colour", () => {
    const bad: string[] = [];
    for (const c of COLOURS) {
      const p = statusPalette(c);
      const r = contrastRatio(p.ink, p.tint);
      if (r < INK_MIN) bad.push(`${c}: ink ${p.ink} on ${p.tint} ${r.toFixed(2)}`);
    }
    expect(bad).toEqual([]);
  });

  it("dark text on light fills: the tint is always light, the ink always dark", () => {
    for (const c of COLOURS) {
      const p = statusPalette(c);
      expect(contrastRatio(p.tint, "#000"), c).toBeGreaterThan(14);
      expect(contrastRatio(p.ink, "#fff"), c).toBeGreaterThanOrEqual(INK_MIN);
    }
  });

  it("the outline reference is darker than every row surface of every theme", () => {
    const ref = contrastRatio(OUTLINE_REF, "#fff");
    for (const [name, t] of themes) {
      const card = parseColor(t.card)!;
      for (const s of [card, parseColor(t.background)!, over(t.muted, 0.7, card), over(t.primary, 0.13, card)]) {
        expect(contrastRatio(s, "#fff"), name).toBeLessThan(ref);
      }
    }
  });

  for (const [name, t] of themes) {
    it(`${name}: the outline shows 3:1 on the card, page, hovered and selected rows and the Board`, () => {
      const card = parseColor(t.card)!;
      const where: [string, RGBA][] = [
        ["card", card], ["page", parseColor(t.background)!], ["hovered row", over(t.muted, 0.7, card)],
        ["selected row", over(t.primary, 0.13, card)], ["Board cream", parseColor(CREAM)!],
      ];
      const bad: string[] = [];
      for (const c of COLOURS) {
        const p = statusPalette(c);
        for (const [w, s] of where) {
          const r = contrastRatio(p.outline, s);
          if (r < OUTLINE_MIN) bad.push(`${c} outline ${p.outline} on ${w} ${r.toFixed(2)}`);
        }
      }
      expect(bad).toEqual([]);
    });
  }

  it("the Board's red \"N late\" reads on any column heading's tint", () => {
    for (const c of COLOURS) {
      const p = statusPalette(c);
      expect(contrastRatio(LANE_INK.red, p.tint), c).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(LANE_MARK.red, p.tint), c).toBeGreaterThanOrEqual(3);
    }
  });

  it("keeps a colour that already shows exactly as it is", () => {
    expect(statusPalette("#2f5488").outline).toBe("#2f5488");
    expect(statusPalette("#047857").outline).toBe("#047857");
    expect(statusPalette("#141414").outline).toBe("#141414");
  });

  it("darkens a pale yellow until it shows, and it stays a yellow", () => {
    const p = statusPalette("#fef08a");
    expect(contrastRatio(p.outline, OUTLINE_REF)).toBeGreaterThanOrEqual(OUTLINE_MIN);
    const [r, g, b] = parseColor(p.outline)!;
    expect(r).toBeGreaterThan(b);
    expect(g).toBeGreaterThan(b);
  });

  it("flattens a see-through colour over cream, and reads nothing as Gray", () => {
    // 30% red over cream is a pink: its palette is a pink one, not a full red.
    const seeThrough = statusPalette("rgba(255,0,0,0.3)");
    const flat = composite([255, 0, 0, 0.3], parseColor(CREAM)!);
    const flatHex = "#" + flat.slice(0, 3).map(v => Math.round(v).toString(16).padStart(2, "0")).join("");
    expect(seeThrough).toEqual(statusPalette(flatHex));
    expect(statusPalette("not a colour")).toEqual(statusPalette(FALLBACK));
    expect(statusPalette("")).toEqual(statusPalette(FALLBACK));
    expect(statusPalette(null)).toEqual(statusPalette(FALLBACK));
  });

  it("a grey stays grey", () => {
    for (const c of ["#9ca3af", "#a8a29e", "#141414", "#ffffff"]) {
      const [r, g, b] = parseColor(statusPalette(c).tint)!;
      expect(Math.max(r, g, b) - Math.min(r, g, b), c).toBeLessThanOrEqual(8);
    }
  });

  it("the default statuses stay apart: no two share an outline", () => {
    const ids = ["blue", "sky", "amber", "orange", "purple", "forest", "gray", "red"];
    const outlines = ids.map(id => statusPalette(PRESETS.find(p => p[0] === id)![1]).outline);
    expect(new Set(outlines).size).toBe(ids.length);
  });
});
