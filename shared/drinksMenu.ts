/**
 * The standard drinks list a proposal can pick from. One list shared by the
 * Proposal Builder (which stores the keys), the client's proposal page and the
 * proposal PDF — the PDF used to carry its own list whose keys never matched,
 * so every selected drink silently disappeared from it.
 *
 * The current list is Bar Franco's Event menus 2026 (shared/eventMenus2026.ts,
 * prices excl. GST). The list it replaced is kept below, unchanged, so a
 * proposal saved before the update still shows exactly what was offered.
 */
import { DRINK_CATEGORIES_2026 } from "./eventMenus2026";

export type DrinkMenuItem = {
  key: string;
  name: string;
  description?: string;
  price?: number;
  priceGlass?: number;
  priceBottle?: number;
  /** Prices exclude GST (the 2026 menu). Unset on the previous list. */
  exGst?: boolean;
  /** On the previous menu only — never offered for new proposals. */
  retired?: boolean;
};

export const DRINKS_MENU: { category: string; items: DrinkMenuItem[] }[] = DRINK_CATEGORIES_2026.map(c => ({
  category: c.name,
  items: c.items.map(d => ({
    key: d.key,
    name: d.name,
    description: d.description,
    ...(c.unit === "bottle" ? { priceBottle: d.price } : { price: d.price }),
    exGst: true,
  })),
}));

// The pre-2026 list. Keys are what older proposals saved; never re-use them.
const PREVIOUS_DRINKS_MENU: { category: string; items: DrinkMenuItem[] }[] = [
  { category: "Aperitivo", items: [
    { key: "aperol_spritz", name: "Aperol Spritz", description: "Aperol, Prosecco, Soda", price: 20 },
    { key: "campari_spritz", name: "Campari Spritz", description: "Campari, Prosecco, Soda", price: 20 },
    { key: "limoncello_spritz", name: "Limoncello Spritz", description: "Limoncello, Prosecco, Soda", price: 20 },
    { key: "hugo_spritz", name: "Hugo Spritz", description: "Elderflower, Prosecco, Soda", price: 20 },
    { key: "classic_negroni", name: "Classic Negroni", description: "Campari, Rosso Vermouth, Gin", price: 24 },
    { key: "negroni_sbagliato", name: "Negroni Sbagliato", description: "Campari, Rosso Vermouth, Prosecco", price: 23 },
    { key: "cherry_negroni", name: "Cherry Negroni", description: "Campari, Amaro, Rosso Vermouth, Gin", price: 25 },
    { key: "americano", name: "Americano", description: "Campari, Rosso Vermouth, Soda", price: 23 },
  ]},
  { category: "Vino Spumante", items: [
    { key: "tallero_prosecco", name: "Tallero Prosecco Extra Dry", description: "Veneto", priceGlass: 17, priceBottle: 85 },
    { key: "lambrusco", name: "Paltrinieri Lambrusco Di Soraba Radice", description: "Emiglia Romagna", priceBottle: 105 },
  ]},
  { category: "Vino Bianco", items: [
    { key: "sauvignon_blanc", name: "Mezzacorona Castel Firmian Sauvignon Blanc", description: "Trentino", priceGlass: 17, priceBottle: 85 },
    { key: "malvasia_chardonnay", name: "Fantini Primo Malvasia Chardonnay", description: "Abruzzo", priceGlass: 16, priceBottle: 80 },
    { key: "pinot_grigio", name: "Vigneti Romio Pinot Grigio Rubione IGT", description: "Friuli", priceGlass: 16, priceBottle: 80 },
    { key: "grillo", name: "Parthenium Grillo", description: "Sicilia", priceBottle: 85 },
    { key: "pipoli_bianco", name: "Pipoli Bianco Basilicata IGT", description: "Basilicata", priceBottle: 90 },
  ]},
  { category: "Vino Rosato", items: [
    { key: "rosato", name: "Fattoria Di Basciano Rosato", description: "Toscana", priceGlass: 17, priceBottle: 85 },
  ]},
  { category: "Vino Rosso", items: [
    { key: "sangiovese_merlot", name: "Primo Sangiovese Merlot", description: "Puglia", priceGlass: 16, priceBottle: 80 },
    { key: "chianti", name: "Renzo Masi Chianti Cornioletta", description: "Toscana", priceGlass: 17, priceBottle: 85 },
    { key: "montepulciano", name: "Fantini Montepulciano", description: "Abruzzo", priceGlass: 17, priceBottle: 85 },
    { key: "nebbiolo", name: "Ascheri Langhe Nebbiolo San Giacomo", description: "Piemonte", priceBottle: 110 },
    { key: "barbaresco", name: "Fontanabianca Barbaresco DOCG", description: "Piemonte", priceBottle: 165 },
  ]},
  { category: "Birra", items: [
    { key: "peroni_tap", name: "Peroni Tap", description: "Italia", price: 14 },
    { key: "peroni_330", name: "Peroni 330ml", description: "Italia", price: 12 },
    { key: "peroni_0", name: "Peroni 0%", description: "Italia", price: 12 },
  ]},
  { category: "Non Alcolico", items: [
    { key: "ginger_ale", name: "Fever Tree Ginger Ale", price: 8 },
    { key: "cola", name: "Fever Tree Cola", price: 8 },
    { key: "blood_orange", name: "Fever Tree Italian Blood Orange", price: 8 },
    { key: "lemonade", name: "Fever Tree Italian Lemonade", price: 8 },
  ]},
].map(c => ({ ...c, items: c.items.map(i => ({ ...i, retired: true })) }));

export const DRINKS_BY_KEY: Record<string, DrinkMenuItem> = Object.fromEntries(
  [...DRINKS_MENU, ...PREVIOUS_DRINKS_MENU].flatMap(c => c.items.map(i => [i.key, i])),
);

/** "$17 glass · $85 bottle", "$20", or "" when the item has no price. */
export function drinkPriceLabel(d: DrinkMenuItem): string {
  if (d.price != null) return `$${d.price}`;
  const parts: string[] = [];
  if (d.priceGlass != null) parts.push(`$${d.priceGlass} glass`);
  if (d.priceBottle != null) parts.push(`$${d.priceBottle} bottle`);
  return parts.join(" · ");
}

/** The selected drinks in menu order (current menu, then the previous one), skipping unknown keys. */
export function selectedDrinkItems(keys: readonly string[] | null | undefined): DrinkMenuItem[] {
  const set = new Set(keys ?? []);
  return [...DRINKS_MENU, ...PREVIOUS_DRINKS_MENU].flatMap(c => c.items.filter(i => set.has(i.key)));
}
