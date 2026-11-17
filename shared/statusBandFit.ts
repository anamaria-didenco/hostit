/**
 * Sizing for the status band under each Overview mini-calendar chip
 * ("CONTACTED", "PROPOSAL SENT"...). Between about 768 and 1280px the chip is
 * only 52-76px wide, too narrow for a nine-letter status at 11px. The band
 * wraps only at spaces, never inside a word, so instead its text shrinks just
 * enough for the longest word to fit on one line, and only on chips that need it.
 *
 * The band is a size container (`container-type: inline-size`), so `100cqi`
 * is its width and the size follows the chip, not the window.
 */

/** Advance widths, in em, of Hanken Grotesk ExtraBold (800) capitals, digits
 *  and common marks: the band's font, measured in Chromium. */
const GLYPH_EM: Record<string, number> = {
  A: 0.686, B: 0.615, C: 0.711, D: 0.671, E: 0.575, F: 0.555, G: 0.737, H: 0.698,
  I: 0.269, J: 0.557, K: 0.672, L: 0.507, M: 0.862, N: 0.694, O: 0.747, P: 0.564,
  Q: 0.789, R: 0.615, S: 0.579, T: 0.583, U: 0.658, V: 0.677, W: 0.987, X: 0.679,
  Y: 0.632, Z: 0.613,
  "0": 0.56, "1": 0.56, "2": 0.56, "3": 0.56, "4": 0.56, "5": 0.56, "6": 0.56, "7": 0.56, "8": 0.56, "9": 0.56,
  "&": 0.705, "-": 0.327, "/": 0.322, "'": 0.199, ".": 0.24, ",": 0.24, "!": 0.256,
  "?": 0.514, "(": 0.296, ")": 0.296, "+": 0.56, "#": 0.693, ":": 0.26,
};
/** Anything not in the table counts as wide as a W, so a word is never under-measured. */
const UNKNOWN_EM = 1;

/** Width, in em, of the longest space-separated word of an upper-cased label
 *  (accents ignored: É is measured as E). */
export function longestWordEm(label: string): number {
  const words = label.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/\s+/).filter(Boolean);
  let widest = 0;
  for (const w of words) {
    let em = 0;
    for (const ch of w) em += GLYPH_EM[ch] ?? UNKNOWN_EM;
    widest = Math.max(widest, em);
  }
  return widest;
}

export const BAND_MAX_PX = 11; // the app's smallest text size, used wherever the word fits
export const BAND_MIN_PX = 7;  // a word that would need less than this is left at 7px

/** The font size, in px, at which the label's longest word fits `widthPx`. */
export function statusBandFontPx(label: string, widthPx: number): number {
  const em = longestWordEm(label);
  if (em === 0) return BAND_MAX_PX;
  return Math.min(BAND_MAX_PX, Math.max(BAND_MIN_PX, widthPx / (em * 1.02)));
}

/** The same rule as CSS, for an element inside the band (its container):
 *  `inset` is that element's left plus right padding. 2% slack covers rounding. */
export function statusBandFontSize(label: string, inset = "0px"): string {
  const em = longestWordEm(label);
  if (em === 0) return `${BAND_MAX_PX}px`;
  return `clamp(${BAND_MIN_PX}px, calc((100cqi - ${inset}) / ${(em * 1.02).toFixed(3)}), ${BAND_MAX_PX}px)`;
}
