/**
 * Grouping for dietary requirements and allergies.
 *
 * The BEO listed one row per guest — twelve rows of "×1 <Name> — <restriction>"
 * — so the kitchen had to read every line and tally in their head how many
 * plates actually needed to avoid seafood. Rows carrying the same restriction
 * now collapse into a single line with a real count and the guests named
 * underneath.
 *
 * ── Safety rule ────────────────────────────────────────────────────────────
 * Only EXACT matches merge, after normalising case, punctuation and a short
 * list of unambiguous abbreviations. Nothing fuzzy. Getting this wrong means
 * serving someone food they can't eat: "No pork" and "No pork or beef" are
 * near-identical as strings and must never collapse, because the merged row
 * would silently drop beef.
 */

export interface DietaryEntry {
  name: string;
  count: number;
  notes?: string;
  names?: string[];
}

/** Abbreviations that are genuinely the same requirement, not merely similar. */
const SYNONYMS: Record<string, string> = {
  gf: "gluten free",
  "gluten-free": "gluten free",
  coeliac: "gluten free",
  celiac: "gluten free",
  df: "dairy free",
  "dairy-free": "dairy free",
  "lactose free": "dairy free",
  v: "vegetarian",
  veg: "vegetarian",
  vege: "vegetarian",
  veggie: "vegetarian",
  vgn: "vegan",
  nf: "nut free",
  "nut-free": "nut free",
};

/**
 * Reduce a restriction to a comparison key: lowercase, punctuation stripped,
 * whitespace collapsed, then a synonym lookup on the WHOLE string only.
 *
 * The synonym pass is deliberately whole-string: mapping "gf" inside a longer
 * phrase would rewrite meaning it doesn't own.
 */
export function dietaryKey(raw: string): string {
  const base = (raw ?? "")
    .toLowerCase()
    .replace(/[.,/\\()[\]{}'"`•·–—-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return SYNONYMS[base] ?? base;
}

/** Does this text read like a dietary requirement rather than a person's name? */
export function looksLikeRestriction(text: string): boolean {
  return /allerg|intoleran|free\b|\bno\b|\bnot\b|avoid|vegetarian|vegan|pescat|halal|kosher|keto|paleo|fodmap|coeliac|celiac|gluten|dairy|lactose|nut|shellfish|seafood|pork|beef|egg|soy|onion|garlic|diabet|pregnan|only\b/i.test(
    text ?? "",
  );
}

/**
 * A row where the guest's name was typed into the requirement field and the
 * requirement into the notes — the two are the wrong way round.
 *
 * Deliberately conservative: it must look like a restriction on ONE side and
 * not the other. This drives a suggestion the operator confirms, never a silent
 * rewrite, because a person can legitimately be called "Olive".
 */
export function looksSwapped(d: DietaryEntry): boolean {
  const name = (d.name ?? "").trim();
  const notes = (d.notes ?? "").trim();
  if (!name || !notes) return false;
  return looksLikeRestriction(notes) && !looksLikeRestriction(name);
}

/** Put the requirement in `name` and the person into `names`. */
export function unswap(d: DietaryEntry): DietaryEntry {
  const guest = (d.name ?? "").trim();
  return {
    ...d,
    name: (d.notes ?? "").trim(),
    notes: undefined,
    names: [...(d.names ?? []), guest].filter(Boolean),
    count: Math.max(1, [...(d.names ?? []), guest].filter(Boolean).length),
  };
}

/**
 * Merge entries sharing a requirement.
 *
 * `count` becomes the number of guests where they're named (the honest figure),
 * otherwise the sum of the stated counts. Notes are kept and de-duplicated so
 * no detail is lost in the merge.
 */
export function groupDietaries(entries: DietaryEntry[]): DietaryEntry[] {
  const out: DietaryEntry[] = [];
  const byKey = new Map<string, DietaryEntry>();

  for (const e of entries ?? []) {
    const key = dietaryKey(e.name);
    if (!key) { out.push(e); continue; }

    const existing = byKey.get(key);
    if (!existing) {
      const copy: DietaryEntry = { ...e, names: [...(e.names ?? [])] };
      byKey.set(key, copy);
      out.push(copy);
      continue;
    }

    // Merge names, preserving order and dropping repeats.
    const seen = new Set((existing.names ?? []).map(n => n.trim().toLowerCase()));
    for (const n of e.names ?? []) {
      const t = n.trim();
      if (t && !seen.has(t.toLowerCase())) { (existing.names ??= []).push(t); seen.add(t.toLowerCase()); }
    }

    // Keep both notes when they differ — a merged row must not lose detail.
    const a = (existing.notes ?? "").trim();
    const b = (e.notes ?? "").trim();
    if (b && b.toLowerCase() !== a.toLowerCase()) existing.notes = a ? `${a} · ${b}` : b;

    const named = (existing.names ?? []).length;
    existing.count = named > 0 ? named : (Number(existing.count) || 1) + (Number(e.count) || 1);
  }

  // Where guests are named, the count is however many are named.
  for (const e of out) {
    const named = (e.names ?? []).length;
    if (named > 0) e.count = named;
    if (!(Number(e.count) > 0)) e.count = 1;
  }
  return out;
}

/** How many covers the requirements cover in total. */
export function totalDietaryCovers(entries: DietaryEntry[]): number {
  return (entries ?? []).reduce((n, d) => n + (Number(d.count) || 1), 0);
}
