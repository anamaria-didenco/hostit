/**
 * Bar Franco's "Event menus · 2026" — the single source for every food and
 * drink selection the app offers for this venue: the boot-time catalogue
 * update (server/eventMenus2026Backfill.ts), the proposal builder's drinks
 * list and shared-menu ticks, and the proposal page/PDF.
 *
 * Copied from the venue's PDF word for word. EVERY PRICE HERE EXCLUDES GST —
 * that is how the PDF quotes them and how the app treats catalogue prices
 * (proposals add GST on top; runsheets default to "GST added on top").
 */

export type DietaryTag = "V" | "VA" | "GF" | "GFA" | "DF" | "DFA" | "contains nuts";

export const DIETARY_LEGEND: Record<DietaryTag, string> = {
  V: "vegetarian",
  VA: "vegan available",
  GF: "gluten free",
  GFA: "gluten free available",
  DF: "dairy free",
  DFA: "dairy free available",
  "contains nuts": "contains nuts",
};

/** "V · GFA · DFA" — the PDF's own separator. Empty string for no tags. */
export function formatDietary(tags: readonly DietaryTag[] | undefined): string {
  return (tags ?? []).join(" · ");
}

export type MenuDish = {
  name: string;
  /** The rest of the PDF line after the first comma. */
  description?: string;
  tags?: DietaryTag[];
  /** Set-menu "or …" alternative printed under the dish. */
  alternative?: string;
};

/** The full PDF line: "Goats cheese croquettes, chilli honey". */
export function dishLine(d: MenuDish): string {
  return d.description ? `${d.name}, ${d.description}` : d.name;
}

export const GST_NOTE = "All prices exclude GST";

// ── Canapés ────────────────────────────────────────────────────────────────
export const CANAPES_NOTE = "Standing, passed on trays. Allow 4–6 pieces per guest, or leave it to the chef.";

export type CanapeGroup = { name: string; pricePerPiece: number; items: MenuDish[] };

export const CANAPE_GROUPS: CanapeGroup[] = [
  { name: "Bites", pricePerPiece: 9, items: [
    { name: "Goats cheese croquettes", description: "chilli honey", tags: ["V"] },
    { name: "Seasonal arancini", description: "pickled chilli, parsley mayonnaise", tags: ["V", "GFA", "DFA"] },
    { name: "Nonna’s meatballs", description: "tomato sugo, parmesan, basil", tags: ["GFA", "DFA"] },
    { name: "Market fish crudo", description: "orange, Sicilian olive, lemon oil", tags: ["GF", "DF"] },
    { name: "Oysters", description: "seasonal mignonette", tags: ["GF", "DF"] },
    { name: "Potatoes", description: "parsley mayonnaise", tags: ["GF", "DF"] },
    { name: "Caprese skewer", description: "bocconcini, tomato", tags: ["V", "GF", "DFA"] },
    { name: "Melon", description: "prosciutto", tags: ["GF", "DF"] },
  ]},
  { name: "Focaccia Sliders", pricePerPiece: 11, items: [
    { name: "Mortadella", description: "smoked provolone, rocket, sugo, balsamic onions", tags: ["DFA", "GFA"] },
    { name: "Marinated eggplant", description: "smoked provolone, rocket, sugo, balsamic onions", tags: ["V", "DFA", "GFA"] },
    { name: "Crostini", description: "whipped ricotta, pickled tomatoes", tags: ["V"] },
  ]},
  { name: "Piadini", pricePerPiece: 11, items: [
    { name: "Whipped ricotta", description: "pesto, peperonata", tags: ["V", "VA", "GFA"] },
    { name: "White anchovy", description: "gremolata", tags: ["DF", "GFA"] },
    { name: "Prosciutto", description: "stracciatella, rocket, balsamic glaze", tags: ["DFA", "GFA"] },
  ]},
];

// ── Grazing table ──────────────────────────────────────────────────────────
export const GRAZING_TABLE = {
  name: "Grazing table",
  pricePerPerson: 40,
  /** "Or a set amount, 1,000 minimum · 1,500 · 2,000" */
  setAmounts: [1000, 1500, 2000] as const,
  minimumSetAmount: 1000,
};

// ── Set menus ──────────────────────────────────────────────────────────────
export type SetMenuCourse = { name: string; dishes: MenuDish[] };
export type SetMenu = {
  name: string;
  pricePerPerson: number;
  summary: string;
  serviceNote?: string;
  /** Extra course served before the shared menu (Tutto Franco's canapés). */
  arrival?: SetMenuCourse;
  courses: SetMenuCourse[];
  footnote?: string;
};

const SHARED_FRANCO_COURSES: SetMenuCourse[] = [
  { name: "To start", dishes: [
    { name: "Focaccia" },
    { name: "Antipasto misto", description: "cured meats, marinated olives, roasted peppers, pickled onions", tags: ["GF", "DF"] },
    { name: "Stracciatella", description: "peperonata, fig and pistachio agrodolce", tags: ["contains nuts"] },
  ]},
  { name: "Mains", dishes: [
    { name: "Pork ragù lasagne", description: "rocket salad", tags: ["GFA", "DFA"], alternative: "seasonal risotto" },
    { name: "Porchetta", description: "cannellini purée, gremolata", tags: ["GFA", "DFA", "VA"], alternative: "eggplant involtini, dairy-free ricotta" },
    { name: "Patate arrosto", description: "parsley mayo", tags: ["GF", "DF"] },
    { name: "Fennel and citrus salad", description: "mint, chilli", tags: ["GF", "DF", "V"] },
  ]},
  { name: "Dolci", dishes: [
    { name: "Tiramisu" },
    { name: "Strawberry sorbet", tags: ["DF", "V"] },
  ]},
];

export const SHARED_FRANCO: SetMenu = {
  name: "Shared Franco",
  pricePerPerson: 80,
  summary: "Three courses down the middle of the table, served family-style.",
  courses: SHARED_FRANCO_COURSES,
  footnote: "Vegetarian and dairy-free swaps are built in",
};

export const TUTTO_FRANCO: SetMenu = {
  name: "Tutto Franco",
  pricePerPerson: 110,
  summary: "Shared Franco, plus a chef’s-choice trio from the canapés list as guests arrive.",
  serviceNote: "Standing to start, then seated",
  arrival: { name: "Canapés", dishes: [{ name: "Chef’s-choice trio from the canapés list", description: "as guests arrive" }] },
  courses: SHARED_FRANCO_COURSES,
  footnote: "Vegetarian and dairy-free swaps are built in",
};

export const SET_MENUS: SetMenu[] = [SHARED_FRANCO, TUTTO_FRANCO];

/** One dish as a menu line: "Porchetta, cannellini purée, gremolata (GFA · DFA · VA) — or eggplant involtini, dairy-free ricotta". */
export function setMenuDishLine(d: MenuDish): string {
  const tags = formatDietary(d.tags);
  return `${dishLine(d)}${tags ? ` (${tags})` : ""}${d.alternative ? ` — or ${d.alternative}` : ""}`;
}

/**
 * The set menu as plain text, one course heading (upper case) per block. The
 * BEO's embedded-menu parser splits this into course columns, and Settings
 * shows it verbatim as the chef/staff menu.
 */
export function setMenuText(menu: SetMenu): string {
  const blocks: string[] = [];
  const intro = [`${menu.summary}`, menu.serviceNote].filter(Boolean).join(" ");
  blocks.push(`${menu.name.toUpperCase()} · $${menu.pricePerPerson} per person + GST\n${intro}`);
  for (const c of [...(menu.arrival ? [menu.arrival] : []), ...menu.courses]) {
    blocks.push([c.name.toUpperCase(), ...c.dishes.map(setMenuDishLine)].join("\n"));
  }
  if (menu.footnote) blocks.push(menu.footnote);
  return blocks.join("\n\n");
}

/** Courses only (no title block) — the catalogue item's description. */
export function setMenuCoursesText(menu: SetMenu): string {
  return [...(menu.arrival ? [menu.arrival] : []), ...menu.courses]
    .map(c => [c.name.toUpperCase(), ...c.dishes.map(setMenuDishLine)].join("\n"))
    .join("\n");
}

// ── Drinks ─────────────────────────────────────────────────────────────────
export const DRINKS_NOTE = "Pick 6 cocktails, 4 beers and 4 non-alcoholic drinks for your bar tab, and 6 wines. Spirits and mixers are your call. Charged on consumption.";
export const WINE_NOTE = "Per bottle. Pick 6 for your bar tab. Eight pour by the glass on the night; the rest are bottle-only, made for the table.";
export const WELCOME_DRINK_NOTE = "A welcome drink is required for 30 guests or more";
export const SPIRITS_NOTE = "Spirits list available on request";

export type Drink2026 = {
  /** Stable key used by proposals (saved in proposal_drinks.selectedDrinks). */
  key: string;
  name: string;
  /** Ingredients for cocktails, region for wines. */
  description?: string;
  /** Excl. GST. Per drink, or per bottle for wines. */
  price: number;
};
export type DrinkCategory2026 = {
  name: string;
  /** Older names for the same category in a venue's catalogue. */
  aliases?: string[];
  description?: string;
  unit: "drink" | "bottle";
  items: Drink2026[];
};

const k = (slug: string) => `2026:${slug}`;

export const DRINK_CATEGORIES_2026: DrinkCategory2026[] = [
  { name: "Aperitivo", unit: "drink", items: [
    { key: k("aperol_spritz"), name: "Aperol Spritz", description: "Aperol, Prosecco, Soda", price: 23 },
    { key: k("campari_spritz"), name: "Campari Spritz", description: "Campari, Prosecco, Soda", price: 23 },
    { key: k("limoncello_spritz"), name: "Limoncello Spritz", description: "Santa Marta Limoncello, Prosecco, Soda", price: 23 },
    { key: k("hugo_spritz"), name: "Hugo Spritz", description: "Fiorente Elderflower, Prosecco, Soda", price: 23 },
    { key: k("classic_negroni"), name: "Classic Negroni", description: "Campari, Rosso Vermouth, Bulldog Gin", price: 24 },
    { key: k("negroni_sbagliato"), name: "Negroni Sbagliato", description: "Campari, Rosso Vermouth, Prosecco", price: 23 },
    { key: k("cherry_negroni"), name: "Cherry Negroni", description: "Campari, Cherry, Rosso Vermouth, Bulldog Gin", price: 25 },
    { key: k("americano"), name: "Americano", description: "Campari, Rosso Vermouth, Soda", price: 24 },
    { key: k("amaretto_sour"), name: "Amaretto Sour", description: "Disaronno, Wild Turkey Bourbon, Egg White, Lemon", price: 25 },
    { key: k("franco_margarita"), name: "Franco Margarita", description: "Espolon Tequila, Grand Marnier, Lemon", price: 24 },
    { key: k("espresso_martini"), name: "Espresso Martini", description: "Skyy Vodka, Tia Maria, Espresso", price: 25 },
    { key: k("boulevardier"), name: "Boulevardier", description: "Campari, Rosso Vermouth, Wild Turkey Bourbon", price: 26 },
    { key: k("olio_martini"), name: "Olio Martini, dry or dirty", description: "Vodka or Gin, Vermouth, Olives", price: 25 },
  ]},
  { name: "Birra", unit: "drink", items: [
    { key: k("peroni_tap"), name: "Peroni Tap", price: 15 },
    { key: k("peroni_0"), name: "Peroni 0%", price: 12 },
    { key: k("brb_pilsner"), name: "BRB Pilsner", price: 15 },
    { key: k("menabrea_bionda"), name: "Menabrea Bionda", price: 17 },
    { key: k("menabrea_zero"), name: "Menabrea Zero Zero", price: 17 },
  ]},
  { name: "Non-Alc", aliases: ["Non Alcolico", "Non-Alcoholic", "Non Alcoholic"], description: "Sanpellegrino Italian sparkling", unit: "drink", items: [
    { key: k("limonata"), name: "Limonata", description: "Sanpellegrino Italian sparkling", price: 15 },
    { key: k("aranciata"), name: "Aranciata", description: "Sanpellegrino Italian sparkling", price: 15 },
    { key: k("aranciata_rossa"), name: "Aranciata Rossa", description: "Sanpellegrino Italian sparkling", price: 15 },
    { key: k("pompelmo"), name: "Pompelmo", description: "Sanpellegrino Italian sparkling", price: 15 },
  ]},
  { name: "Vino Spumante", unit: "bottle", items: [
    { key: k("tallero_prosecco"), name: "Tallero Prosecco Extra Dry", description: "Veneto", price: 90 },
    { key: k("ferrari_brut"), name: "Ferrari Brut Trento DOC", description: "Trentino", price: 140 },
    { key: k("laurent_perrier"), name: "Laurent-Perrier La Cuvée Brut NV", description: "Champagne", price: 165 },
  ]},
  { name: "Vino Bianco", unit: "bottle", items: [
    { key: k("mezzacorona_sauvignon"), name: "Mezzacorona Castel Firmian Sauvignon Blanc", description: "Trentino", price: 95 },
    { key: k("fantini_malvasia_chardonnay"), name: "Fantini Primo Malvasia Chardonnay", description: "Abruzzo", price: 85 },
    { key: k("romio_pinot_grigio"), name: "Vigneti Romio Pinot Grigio", description: "Friuli", price: 95 },
    { key: k("vesevo_falanghina"), name: "Vesevo Beneventano Falanghina IGT", description: "Campania", price: 90 },
    { key: k("pipoli_bianco"), name: "Pipoli Bianco Basilicata IGT", description: "Basilicata", price: 110 },
    { key: k("mahi_sauvignon"), name: "Mahi Sauvignon Blanc 2025", description: "Marlborough", price: 85 },
    { key: k("dog_point_chardonnay"), name: "Dog Point Chardonnay 2023", description: "Marlborough", price: 120 },
  ]},
  { name: "Vino Rosato", unit: "bottle", items: [
    { key: k("basciano_rosato"), name: "Fattoria di Basciano Rosato", description: "Toscana", price: 90 },
  ]},
  { name: "Vino Rosso", unit: "bottle", items: [
    { key: k("masi_chianti"), name: "Renzo Masi Chianti Cornioletta", description: "Toscana", price: 95 },
    { key: k("fantini_montepulciano"), name: "Fantini Montepulciano", description: "Abruzzo", price: 90 },
    { key: k("romio_sangiovese"), name: "Vigneti Romio Organic Sangiovese Rubicone", description: "Emilia-Romagna", price: 85 },
    { key: k("sallier_syrah"), name: "Sallier de la Tour Syrah", description: "Sicilia", price: 95 },
    { key: k("atzei_cannonau"), name: "Atzei Saragat Cannonau di Sardegna", description: "Sardegna", price: 100 },
    { key: k("ascheri_nebbiolo"), name: "Ascheri Langhe Nebbiolo San Giacomo", description: "Piemonte", price: 110 },
    { key: k("vanita_primitivo"), name: "Vanita Primitivo di Manduria DOP", description: "Puglia", price: 93 },
    { key: k("basciano_chianti_rufina"), name: "Fattoria di Basciano Chianti Rufina Riserva", description: "Toscana", price: 107 },
    { key: k("dicey_pinot_noir"), name: "Dicey Bannockburn Pinot Noir 2022", description: "Central Otago", price: 110 },
  ]},
];

// ── The venue catalogue (Settings → Menu & Catalogue) ──────────────────────
export type CatalogueItemSpec = {
  name: string;
  /** Older names for the same product, matched when upserting. */
  aliases?: string[];
  description: string | null;
  pricingType: "per_person" | "per_item";
  /** Dollars, excl. GST (stored ×100 as cents). */
  price: number;
  unit: string;
  /** Dietary tags, "V · GFA · DFA". Stored in the catalogue's allergens field. */
  allergens: string | null;
};
export type CatalogueCategorySpec = {
  name: string;
  type: "food" | "drink";
  aliases?: string[];
  description: string | null;
  items: CatalogueItemSpec[];
};

/** Catalogue unit for a grazing table bought as one set amount. */
export const SET_AMOUNT_UNIT = "table";

// Not toLocaleString: these strings are upsert keys and must not vary by runtime locale.
const fmtDollars = (n: number) => `$${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;

/** Every 2026 food and drink item, grouped the way the PDF groups them. */
export function eventMenus2026Catalogue(): CatalogueCategorySpec[] {
  const canapes: CatalogueCategorySpec[] = CANAPE_GROUPS.map(g => ({
    name: `Canapés · ${g.name}`,
    type: "food",
    description: `${fmtDollars(g.pricePerPiece)} each + GST. ${CANAPES_NOTE}`,
    items: g.items.map(d => ({
      name: d.name,
      description: d.description ?? null,
      pricingType: "per_item",
      price: g.pricePerPiece,
      unit: "piece",
      allergens: formatDietary(d.tags) || null,
    })),
  }));
  const grazing: CatalogueCategorySpec = {
    name: "Grazing Table",
    type: "food",
    aliases: ["Grazing", "Grazing Tables"],
    description: `${fmtDollars(GRAZING_TABLE.pricePerPerson)} per person, or a set amount (${fmtDollars(GRAZING_TABLE.minimumSetAmount)} minimum) + GST`,
    items: [
      { name: "Grazing table", description: null, pricingType: "per_person", price: GRAZING_TABLE.pricePerPerson, unit: "person", allergens: null },
      ...GRAZING_TABLE.setAmounts.map(amt => ({
        name: `Grazing table, ${fmtDollars(amt)} set amount`,
        description: null,
        pricingType: "per_item" as const,
        price: amt,
        unit: SET_AMOUNT_UNIT,
        allergens: null,
      })),
    ],
  };
  const setMenus: CatalogueCategorySpec = {
    name: "Set Menus",
    type: "food",
    description: "Per person + GST. Picked as one item; the courses travel with it.",
    items: SET_MENUS.map(m => ({
      name: m.name,
      description: setMenuCoursesText(m),
      pricingType: "per_person",
      price: m.pricePerPerson,
      unit: "person",
      allergens: null,
    })),
  };
  const drinks: CatalogueCategorySpec[] = DRINK_CATEGORIES_2026.map(c => ({
    name: c.name,
    type: "drink",
    aliases: c.aliases,
    description: c.unit === "bottle" ? `${WINE_NOTE} Prices + GST.` : (c.description ? `${c.description}. Prices + GST.` : "Prices + GST."),
    items: c.items.map(d => ({
      name: d.name,
      aliases: d.name === "Vigneti Romio Pinot Grigio" ? ["Vigneti Romio Pinot Grigio Rubione IGT"] : undefined,
      description: d.description ?? null,
      pricingType: "per_item",
      price: d.price,
      unit: c.unit,
      allergens: null,
    })),
  }));
  return [...canapes, grazing, setMenus, ...drinks];
}

export type MenuPackageSpec = {
  name: string;
  type: "food";
  description: string;
  pricePerHead: number;
  chefNotes: string;
};

/** Shared Franco and Tutto Franco as per-person menu packages. */
export function eventMenus2026Packages(): MenuPackageSpec[] {
  return SET_MENUS.map(m => ({
    name: m.name,
    type: "food",
    description: m.summary,
    pricePerHead: m.pricePerPerson,
    chefNotes: setMenuText(m),
  }));
}

/** Catalogue categories the update leaves alone — the PDF says spirits are on request. */
export const KEEP_CATEGORY_RE = /spirit|liquor|digestiv|amari|whisk/i;
