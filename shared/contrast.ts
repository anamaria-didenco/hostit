/**
 * WCAG colour-contrast maths, shared by the app (text colour on a venue's
 * accent) and the theme tests (every colour scheme in client/src/index.css).
 *
 * Accepts the colour forms the stylesheet uses: #rgb, #rrggbb, #rrggbbaa,
 * rgb()/rgba() and oklch(). Colours are [r, g, b, a] with r/g/b in 0-255.
 */
export type RGBA = [number, number, number, number];

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function oklchToRgb(l: number, c: number, hDeg: number): [number, number, number] {
  const h = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;
  const L = l_ ** 3, M = m_ ** 3, S = s_ ** 3;
  const lin = [
    4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
    -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
  ];
  const enc = (x: number) => {
    const v = clamp01(x);
    return 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
  };
  return [enc(lin[0]), enc(lin[1]), enc(lin[2])];
}

/** Parse a CSS colour string, or null when the form isn't supported. */
export function parseColor(input: string): RGBA | null {
  const s = input.trim().toLowerCase();
  let m = /^#([0-9a-f]{3,8})$/.exec(s);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = h.split("").map(ch => ch + ch).join("");
    if (h.length !== 6 && h.length !== 8) return null;
    const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
    return [n(0), n(2), n(4), h.length === 8 ? n(6) / 255 : 1];
  }
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(s);
  if (m) {
    const a = m[4] === undefined ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]), a];
  }
  m = /^oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)(?:deg)?(?:\s*\/\s*([\d.]+%?))?\s*\)$/.exec(s);
  if (m) {
    const l = m[1].endsWith("%") ? parseFloat(m[1]) / 100 : parseFloat(m[1]);
    const a = m[4] === undefined ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    const [r, g, b] = oklchToRgb(l, parseFloat(m[2]), parseFloat(m[3]));
    return [r, g, b, a];
  }
  return null;
}

/** `top` painted over an opaque `bottom`. */
export function composite(top: RGBA, bottom: RGBA): RGBA {
  const a = top[3];
  return [top[0] * a + bottom[0] * (1 - a), top[1] * a + bottom[1] * (1 - a), top[2] * a + bottom[2] * (1 - a), 1];
}

/** WCAG 2 relative luminance (alpha ignored). */
export function luminance(c: RGBA): number {
  const f = (v: number) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
}

/**
 * WCAG contrast ratio of two colours (1 to 21). A translucent foreground is
 * painted over the background first; a translucent background over white.
 */
export function contrastRatio(fg: string | RGBA, bg: string | RGBA): number {
  const b0 = typeof bg === "string" ? parseColor(bg) : bg;
  const f0 = typeof fg === "string" ? parseColor(fg) : fg;
  if (!b0 || !f0) throw new Error(`Unparseable colour: ${String(fg)} / ${String(bg)}`);
  const b = b0[3] < 1 ? composite(b0, [255, 255, 255, 1]) : b0;
  const f = f0[3] < 1 ? composite(f0, b) : f0;
  const l1 = luminance(f), l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/** Whichever of `dark` / `light` reads better on `bg` (by WCAG contrast). */
export function readableOn(bg: string, dark = "#1a1a1a", light = "#fff"): string {
  return contrastRatio(dark, bg) >= contrastRatio(light, bg) ? dark : light;
}
