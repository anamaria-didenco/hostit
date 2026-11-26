/**
 * The colours a status pill and a Board column heading take, worked out from
 * the one colour the venue picked for that status in Settings > Statuses (the
 * same colour the calendar uses).
 *
 * Raw status colours can't be used as they are: the presets run from a pale
 * yellow (#fef08a, 1.2:1 on cream) to a dark navy, and a venue may pick any of
 * them for any status. So every colour here is rebuilt from the status
 * colour's hue (in OKLCH), with its lightness and strength clamped:
 *
 *  - tint:    a light fill of the same hue at one fixed lightness, so dark
 *             text always sits on a light fill.
 *  - ink:     dark text in the same hue, at least 6:1 on the tint.
 *  - outline: the status colour itself, darkened only as far as it takes to
 *             show 3:1 against OUTLINE_REF, which is darker than any surface
 *             a pill or a column heading sits on in any theme. A colour that
 *             already shows is kept exactly as it is.
 *
 * A see-through colour is first flattened over cream; a colour that can't be
 * read (or none) falls back to Gray.
 *
 * Pure, so server/statusPalette.test.ts can check every preset, every theme
 * and colours a venue might pick in the future.
 */
import { composite, contrastRatio, parseColor, type RGBA } from "./contrast";

export type StatusPalette = {
  /** Pill and Board heading fill: always light. */
  tint: string;
  /** Text on the tint (6:1 or more). */
  ink: string;
  /** The pill's outline and the Board heading's rule (3:1 on any row surface). */
  outline: string;
};

/** The tint's fixed OKLCH lightness and its strongest chroma. */
const TINT_L = 0.935;
const TINT_C = 0.06;
/** Below this OKLCH chroma a status colour counts as a grey. */
const NEUTRAL_C = 0.05;
/** The ink's strongest chroma, and the contrast it must reach on the tint. */
const INK_C = 0.13;
export const INK_MIN = 6;
/** Contrast the outline needs against what it sits on. */
export const OUTLINE_MIN = 3;
/**
 * Black at 13% over Champagne's card (oklch(0.96 0.025 80)), the darkest card
 * of any theme in client/src/index.css. It is darker than every real row
 * surface: the darkest selected row (#e0d2cb), hovered row (#f0e5d2) and card
 * or page (#f6e9d5). An outline that shows on it shows on all of them.
 */
export const OUTLINE_REF = "#dad1c2";
/** What a see-through status colour is flattened over: the app's cream. */
const CREAM: RGBA = [255, 253, 249, 1];
/** Gray, for a colour that can't be read. */
export const FALLBACK = "#9ca3af";

// ── sRGB ↔ OKLCH ───────────────────────────────────────────────────────────
const toLin = (v: number) => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
const fromLin = (x: number) => 255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055);

function rgbToOklch(c: RGBA): [number, number, number] {
  const r = toLin(c[0]), g = toLin(c[1]), b = toLin(c[2]);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const C = Math.hypot(A, B);
  const H = ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360;
  return [L, C, H];
}

/** OKLCH to sRGB, or null when it falls outside sRGB. */
function oklchToRgb(L: number, C: number, H: number): [number, number, number] | null {
  const h = (H * Math.PI) / 180;
  const a = C * Math.cos(h), b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  if (lin.some(x => x < -1e-4 || x > 1 + 1e-4)) return null;
  return lin.map(x => fromLin(Math.min(1, Math.max(0, x)))) as [number, number, number];
}

/** The colour at this lightness and hue, its chroma cut until it fits sRGB. */
function inGamut(L: number, C: number, H: number): RGBA {
  let c = C;
  for (let i = 0; i < 60; i++) {
    const rgb = oklchToRgb(L, c, H);
    if (rgb) return [rgb[0], rgb[1], rgb[2], 1];
    c *= 0.9;
  }
  const g = oklchToRgb(L, 0, H)!;
  return [g[0], g[1], g[2], 1];
}

const hex = (c: RGBA) => "#" + c.slice(0, 3).map(v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("");

/** The colour to derive from: see-through flattened over cream, unreadable → Gray. */
function baseColour(statusColour: string): RGBA {
  const parsed = (statusColour && parseColor(statusColour)) || parseColor(FALLBACK)!;
  return parsed[3] < 1 ? composite(parsed, CREAM) : [parsed[0], parsed[1], parsed[2], 1];
}

const cache = new Map<string, StatusPalette>();

/** The palette for one status colour (any CSS colour shared/contrast reads). */
export function statusPalette(statusColour: string | null | undefined): StatusPalette {
  const key = String(statusColour ?? "").trim().toLowerCase();
  const hit = cache.get(key);
  if (hit) return hit;
  const base = baseColour(key);
  const [L0, C0, H] = rgbToOklch(base);

  // Tint: fixed lightness, hue kept, chroma capped. A greyish status colour
  // (Gray, Stone, a near-black, white) stays greyish: at this lightness even
  // a hint of its hue would read as a pale blue or pink next to the real ones.
  const tintC = C0 < NEUTRAL_C ? C0 * 0.35 : Math.min(C0, TINT_C);
  const tint = inGamut(TINT_L, tintC, H);

  // Ink: same hue, dark enough for INK_MIN on the tint.
  let ink = inGamut(0.42, Math.min(C0, INK_C), H);
  for (let L = 0.42; contrastRatio(ink, tint) < INK_MIN && L > 0; L -= 0.01) ink = inGamut(L, Math.min(C0, INK_C), H);

  // Outline: the status colour, darkened in lightness only (hue and chroma
  // kept as far as sRGB allows) until it shows OUTLINE_MIN on OUTLINE_REF.
  const ref = parseColor(OUTLINE_REF)!;
  let outline: RGBA = base;
  for (let L = L0; contrastRatio(outline, ref) < OUTLINE_MIN && L > 0; L -= 0.01) outline = inGamut(L, C0, H);

  const out: StatusPalette = { tint: hex(tint), ink: hex(ink), outline: hex(outline) };
  cache.set(key, out);
  return out;
}
