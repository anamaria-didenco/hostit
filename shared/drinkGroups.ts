/**
 * Drinks grouped by type, the same way everywhere they're listed: the BEO,
 * the runsheet and the staff phone view. A drink's group comes from, in order:
 *  1. the type picked for it on the runsheet's Drinks tab ("Other" counts as
 *     not picked, so the drink can still be placed);
 *  2. its category on Bar Franco's drinks menu (Aperitivo, Birra, Vino Rosso…);
 *  3. its name (Prosecco → Sparkling, Menabrea → Beer, Limonata → Non-alc).
 */
import { DRINK_CATEGORIES_2026 } from "./eventMenus2026";

export type DrinkGroupKey = "cocktail" | "spark" | "white" | "rose" | "red" | "beer" | "nonalc" | "spirits" | "other";

/** In the order they're served and listed. */
export const DRINK_GROUPS: Array<{ key: DrinkGroupKey; label: string }> = [
  { key: "cocktail", label: "Cocktails" },
  { key: "spark", label: "Sparkling" },
  { key: "white", label: "White wine" },
  { key: "rose", label: "Rosé" },
  { key: "red", label: "Red wine" },
  { key: "beer", label: "Beer & cider" },
  { key: "nonalc", label: "Non-alcoholic" },
  { key: "spirits", label: "Spirits" },
  { key: "other", label: "Other" },
];
export const DRINK_GROUP_LABEL: Record<DrinkGroupKey, string> =
  Object.fromEntries(DRINK_GROUPS.map(g => [g.key, g.label])) as Record<DrinkGroupKey, string>;

// Older saved types used these codes (and the BEO used upper-case).
const TYPE_ALIASES: Record<string, DrinkGroupKey> = {
  cocktail: "cocktail", cocktails: "cocktail", aperitivo: "cocktail",
  spark: "spark", sparkling: "spark", bubbles: "spark",
  white: "white", rose: "rose", "rosé": "rose", red: "red",
  beer: "beer", cider: "beer", nonalc: "nonalc", "non-alc": "nonalc", spirits: "spirits",
};

const MENU_CATEGORY_GROUP: Record<string, DrinkGroupKey> = {
  "aperitivo": "cocktail", "birra": "beer", "non-alc": "nonalc", "non alcolico": "nonalc",
  "vino spumante": "spark", "vino bianco": "white", "vino rosato": "rose", "vino rosso": "red",
};

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9%]+/g, " ").trim();

const MENU_GROUP_BY_NAME: Record<string, DrinkGroupKey> = (() => {
  const out: Record<string, DrinkGroupKey> = {};
  for (const c of DRINK_CATEGORIES_2026) {
    const g = MENU_CATEGORY_GROUP[c.name.toLowerCase()];
    if (g) for (const d of c.items) out[norm(d.name)] = g;
  }
  return out;
})();

// Checked in this order: alcohol-free first so "Peroni 0%" isn't beer, rosé
// before red so a Rosato isn't red.
const NAME_RULES: Array<[RegExp, DrinkGroupKey]> = [
  [/\b0 ?%|alcohol free|non alc|\bzero\b|mocktail|kombucha|\bsoda\b|lemonade|limonata|aranciata|sanpellegrino|\bcola\b|ginger (ale|beer)|tonic|juice|\bwater\b|chinotto/, "nonalc"],
  [/rosato|\brose\b|rosado|blush/, "rose"],
  [/margarita|martini|spritz|negroni|mojito|daiquiri|paloma|cosmopolitan|old fashioned|aperol|hugo|cocktail|highball|americano|bellini|sbagliato/, "cocktail"],
  [/prosecco|champagne|\bcava\b|cliquot|spumante|sparkling|extra dry|\bbrut\b|franciacorta|cremant|lambrusco/, "spark"],
  [/sauvignon|pinot grigio|pinot gris|chardonnay|riesling|blanc|gewurz|malvasia|verdicchio|vermentino|\bgavi\b|falanghina|greco|grillo|bianco/, "white"],
  [/\bnero\b|shiraz|syrah|cabernet|merlot|pinot noir|malbec|rosso|tempranillo|sangiovese|montepulciano|nebbiolo|barolo|barbaresco|chianti|primitivo|zinfandel|grenache|\bgsm\b/, "red"],
  [/beer|pilsner|lager|\bale\b|\bipa\b|peroni|stout|cider|birra|bionda|menabrea|moretti|\btap\b/, "beer"],
  [/\bgin\b|vodka|whisk|bourbon|\brum\b|tequila|mezcal|brandy|cognac|amaro|grappa|limoncello|sambuca|vermouth/, "spirits"],
];

export function drinkGroupOf(name: string, pickedType?: string | null): DrinkGroupKey {
  const picked = TYPE_ALIASES[String(pickedType ?? "").trim().toLowerCase()];
  if (picked) return picked;
  const n = norm(name);
  const fromMenu = MENU_GROUP_BY_NAME[n];
  if (fromMenu) return fromMenu;
  for (const [re, g] of NAME_RULES) if (re.test(n)) return g;
  return "other";
}

/** Items bucketed into DRINK_GROUPS order, empty groups left out. */
export function groupDrinks<T>(
  items: T[],
  nameOf: (item: T) => string,
  typeOf?: (item: T) => string | null | undefined,
): Array<{ key: DrinkGroupKey; label: string; items: T[] }> {
  const buckets = new Map<DrinkGroupKey, T[]>();
  for (const it of items) {
    const g = drinkGroupOf(nameOf(it), typeOf?.(it));
    (buckets.get(g) ?? buckets.set(g, []).get(g)!).push(it);
  }
  return DRINK_GROUPS.filter(g => buckets.has(g.key)).map(g => ({ ...g, items: buckets.get(g.key)! }));
}
