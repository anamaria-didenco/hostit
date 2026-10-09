import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import {
  CANAPE_GROUPS, GRAZING_TABLE, SHARED_FRANCO, TUTTO_FRANCO, DRINK_CATEGORIES_2026,
  eventMenus2026Catalogue, eventMenus2026Packages, setMenuText,
} from "../shared/eventMenus2026";
import { DRINKS_MENU, DRINKS_BY_KEY, selectedDrinkItems, drinkPriceLabel } from "../shared/drinksMenu";
import { SHARED_MENU_SECTIONS, selectedSharedMenuSections } from "../shared/proposalSharedMenu";
import { catalogueDefaultQty, catalogueLineDescription } from "../shared/menuCatalogue";
import {
  planEventMenus2026, planIsEmpty, isBarFrancoVenue, applyEventMenus2026, hasEventMenus2026,
  type ExistingCategory, type ExistingItem, type ExistingPackage, type MenuPlan,
} from "./eventMenus2026Backfill";

describe("Event menus 2026 — the data matches the PDF", () => {
  it("canapés: 8 bites at $9, 3 sliders and 3 piadini at $11, with their tags", () => {
    expect(CANAPE_GROUPS.map(g => [g.name, g.items.length, g.pricePerPiece])).toEqual([
      ["Bites", 8, 9], ["Focaccia Sliders", 3, 11], ["Piadini", 3, 11],
    ]);
    const arancini = CANAPE_GROUPS[0].items[1];
    expect(arancini).toMatchObject({ name: "Seasonal arancini", description: "pickled chilli, parsley mayonnaise", tags: ["V", "GFA", "DFA"] });
  });

  it("grazing table: $40 per person or a $1,000 / $1,500 / $2,000 set amount", () => {
    expect(GRAZING_TABLE.pricePerPerson).toBe(40);
    expect([...GRAZING_TABLE.setAmounts]).toEqual([1000, 1500, 2000]);
    const grazing = eventMenus2026Catalogue().find(c => c.name === "Grazing Table")!;
    expect(grazing.items.map(i => [i.name, i.pricingType, i.price, i.unit])).toEqual([
      ["Grazing table", "per_person", 40, "person"],
      ["Grazing table, $1,000 set amount", "per_item", 1000, "table"],
      ["Grazing table, $1,500 set amount", "per_item", 1500, "table"],
      ["Grazing table, $2,000 set amount", "per_item", 2000, "table"],
    ]);
  });

  it("set menus: Shared Franco $80pp and Tutto Franco $110pp carry their courses", () => {
    expect(SHARED_FRANCO.pricePerPerson).toBe(80);
    expect(TUTTO_FRANCO.pricePerPerson).toBe(110);
    const text = setMenuText(SHARED_FRANCO);
    expect(text).toContain("TO START\nFocaccia\nAntipasto misto, cured meats, marinated olives, roasted peppers, pickled onions (GF · DF)");
    expect(text).toContain("Stracciatella, peperonata, fig and pistachio agrodolce (contains nuts)");
    expect(text).toContain("Pork ragù lasagne, rocket salad (GFA · DFA) — or seasonal risotto");
    expect(text).toContain("DOLCI\nTiramisu\nStrawberry sorbet (DF · V)");
    expect(setMenuText(TUTTO_FRANCO)).toContain("CANAPÉS\nChef’s-choice trio from the canapés list, as guests arrive");
    expect(eventMenus2026Packages().map(p => [p.name, p.pricePerHead])).toEqual([["Shared Franco", 80], ["Tutto Franco", 110]]);
  });

  it("drinks: 13 aperitivo, 5 birra, 4 non-alc and 20 wines by the bottle", () => {
    expect(DRINK_CATEGORIES_2026.map(c => [c.name, c.items.length])).toEqual([
      ["Aperitivo", 13], ["Birra", 5], ["Non-Alc", 4],
      ["Vino Spumante", 3], ["Vino Bianco", 7], ["Vino Rosato", 1], ["Vino Rosso", 9],
    ]);
    const all = DRINK_CATEGORIES_2026.flatMap(c => c.items);
    expect(all.find(d => d.name === "Boulevardier")!.price).toBe(26);
    expect(all.find(d => d.name === "Laurent-Perrier La Cuvée Brut NV")).toMatchObject({ description: "Champagne", price: 165 });
    expect(new Set(all.map(d => d.key)).size).toBe(all.length);
  });
});

describe("proposal lists point at the shared source and keep history", () => {
  it("the proposal drinks list is the 2026 list", () => {
    expect(DRINKS_MENU.map(c => c.category)).toEqual(DRINK_CATEGORIES_2026.map(c => c.name));
    expect(drinkPriceLabel(DRINKS_BY_KEY["2026:aperol_spritz"])).toBe("$23");
    expect(drinkPriceLabel(DRINKS_BY_KEY["2026:dog_point_chardonnay"])).toBe("$120 bottle");
  });

  it("a proposal saved on the old list still shows the old drinks at the old prices", () => {
    const picked = selectedDrinkItems(["aperol_spritz", "2026:aperol_spritz", "lambrusco"]);
    expect(picked.map(d => [d.name, drinkPriceLabel(d), !!d.retired])).toEqual([
      ["Aperol Spritz", "$23", false],
      ["Aperol Spritz", "$20", true],
      ["Paltrinieri Lambrusco Di Soraba Radice", "$105 bottle", true],
    ]);
  });

  it("the shared menu is Shared Franco; old sample-menu ticks still render", () => {
    expect(SHARED_MENU_SECTIONS.map(s => s.category)).toEqual(["To start", "Mains", "Dolci"]);
    const secs = selectedSharedMenuSections(["2026:tiramisu", "antipasto_salumi"]);
    expect(secs.map(s => [s.category, s.items.map(i => i.name), !!s.retired])).toEqual([
      ["Dolci", ["Tiramisu"], false],
      ["Antipasto", ["Salumi selection"], true],
    ]);
  });

  it("catalogue picks become proposal lines with sensible quantities", () => {
    const oyster = { name: "Oysters", description: "seasonal mignonette", pricingType: "per_item", price: 900, unit: "piece", allergens: "GF · DF" };
    expect(catalogueLineDescription(oyster)).toBe("Oysters, seasonal mignonette (GF · DF)");
    expect(catalogueDefaultQty(oyster, 40)).toBe(40);
    expect(catalogueDefaultQty({ pricingType: "per_item", unit: "table" }, 40)).toBe(1);
    expect(catalogueDefaultQty({ pricingType: "per_person", unit: "person" }, 0)).toBe(1);
    const shared = eventMenus2026Catalogue().find(c => c.name === "Set Menus")!.items[0];
    expect(catalogueLineDescription({ ...shared, price: 8000 })).toBe("Shared Franco"); // courses aren't crammed into the line
  });
});

describe("only Bar Franco is updated", () => {
  it("recognises the venue by name, slug or domain", () => {
    expect(isBarFrancoVenue({ name: "Bar Franco" })).toBe(true);
    expect(isBarFrancoVenue({ name: "My Venue", email: "events@barfranco.nz" })).toBe(true);
    expect(isBarFrancoVenue({ name: "My Venue", slug: "bar-franco" })).toBe(true);
    expect(isBarFrancoVenue({ name: "Franco's Pizza", slug: "francos", email: "hi@francos.co.nz" })).toBe(false);
    expect(isBarFrancoVenue({ name: "Test Venue", slug: "test-venue" })).toBe(false);
  });
});

// ── Planner ────────────────────────────────────────────────────────────────
type State = { categories: ExistingCategory[]; items: ExistingItem[]; packages: ExistingPackage[] };

/** Apply a plan to an in-memory catalogue, as the DB applier does. */
function applyInMemory(state: State, plan: MenuPlan): State {
  let id = 1 + Math.max(0, ...state.categories.map(c => c.id), ...state.items.map(i => i.id), ...state.packages.map(p => p.id));
  const categories = state.categories.map(c => ({ ...c }));
  const items = state.items.map(i => ({ ...i }));
  const packages = state.packages.map(p => ({ ...p }));
  const ref = new Map<string, number>();
  for (const c of plan.createCategories) { const nid = id++; ref.set(c.name, nid); categories.push({ id: nid, ...c }); }
  const resolve = (r: number | string) => typeof r === "number" ? r : ref.get(r)!;
  for (const u of plan.updateCategories) Object.assign(categories.find(c => c.id === u.id)!, u.patch);
  for (const c of plan.createItems) { const { category, ...f } = c; items.push({ id: id++, categoryId: resolve(category), ...f }); }
  for (const u of plan.updateItems) Object.assign(items.find(i => i.id === u.id)!, u.patch, u.category !== undefined ? { categoryId: resolve(u.category) } : {});
  for (const r of plan.retireItems) items.find(i => i.id === r.id)!.available = false;
  for (const p of plan.createPackages) packages.push({ id: id++, name: p.name, type: p.type, description: p.description, pricePerHead: p.pricePerHead.toFixed(2), chefNotes: p.chefNotes, isActive: true });
  for (const pid of plan.reactivatePackages) packages.find(p => p.id === pid)!.isActive = true;
  for (const r of plan.retirePackages) packages.find(p => p.id === r.id)!.isActive = false;
  return { categories, items, packages };
}

const cat = (id: number, name: string, type: "food" | "drink", sortOrder = 0): ExistingCategory => ({ id, name, type, description: null, sortOrder });
const item = (id: number, categoryId: number, name: string, price: number, over: Partial<ExistingItem> = {}): ExistingItem => ({
  id, categoryId, name, description: null, pricingType: "per_item", price, unit: "each", available: true, allergens: null, sortOrder: 0, ...over,
});

/** Roughly what Bar Franco's live catalogue held before the 2026 menu. */
function oldFrancoCatalogue(): State {
  return {
    categories: [
      cat(1, "Aperitivo", "drink"), cat(2, "Vino Bianco", "drink"), cat(3, "Non Alcolico", "drink"),
      cat(4, "Spirits", "drink"), cat(5, "Canapés", "food"), cat(6, "Birra", "drink"),
    ],
    items: [
      item(10, 1, "Aperol Spritz", 2000, { description: "Aperol, Prosecco, Soda" }),
      item(11, 1, "Cherry Negroni", 2500, { description: "Campari, Amaro, Rosso Vermouth, Gin" }),
      item(12, 2, "Vigneti Romio Pinot Grigio Rubione IGT", 8000, { description: "Friuli" }),
      item(13, 2, "Parthenium Grillo", 8500, { description: "Sicilia" }),
      item(14, 3, "Fever Tree Cola", 800),
      item(15, 4, "Bulldog Gin", 1400),
      item(16, 5, "Smoked salmon blini", 850),
      item(17, 6, "Peroni Tap", 1400, { description: "Italia" }),
      item(18, 6, "Peroni 330ml", 1200, { description: "Italia" }),
    ],
    packages: [
      { id: 30, name: "Shared Franco", type: "food", description: "Our shared menu", pricePerHead: "75.00", chefNotes: "ANTIPASTO\nFocaccia", isActive: true },
      { id: 31, name: "Drinks on arrival", type: "beverages", description: null, pricePerHead: "20.00", chefNotes: null, isActive: true },
    ],
  };
}

describe("planEventMenus2026", () => {
  it("builds the whole menu into an empty catalogue", () => {
    const plan = planEventMenus2026({ categories: [], items: [], packages: [] });
    const spec = eventMenus2026Catalogue();
    expect(plan.createCategories.map(c => c.name)).toEqual(spec.map(c => c.name));
    expect(plan.createItems).toHaveLength(spec.reduce((n, c) => n + c.items.length, 0));
    expect(plan.createItems.find(i => i.name === "Caprese skewer")).toMatchObject({ price: 900, pricingType: "per_item", unit: "piece", allergens: "V · GF · DFA", available: true });
    expect(plan.createPackages.map(p => p.name)).toEqual(["Shared Franco", "Tutto Franco"]);
    expect(plan.retireItems).toEqual([]);
  });

  it("updates in place, renames by alias, retires what's gone and leaves spirits alone", () => {
    const before = oldFrancoCatalogue();
    const plan = planEventMenus2026(before);
    // Aperol $20 → $23 and the 2026 wording, same row.
    expect(plan.updateItems.find(u => u.id === 10)!.patch).toMatchObject({ price: 2300, unit: "drink" });
    // Only what changed is written: the Cherry Negroni keeps its $25, gets the new wording.
    const cherry = plan.updateItems.find(u => u.id === 11)!.patch;
    expect(cherry.description).toBe("Campari, Cherry, Rosso Vermouth, Bulldog Gin");
    expect(cherry.price).toBeUndefined();
    // Renamed wine is the same row.
    expect(plan.updateItems.find(u => u.id === 12)!.patch).toMatchObject({ name: "Vigneti Romio Pinot Grigio", price: 9500 });
    // "Non Alcolico" becomes the PDF's "Non-Alc" rather than a duplicate category.
    expect(plan.updateCategories.find(u => u.id === 3)!.patch.name).toBe("Non-Alc");
    expect(plan.createCategories.map(c => c.name)).not.toContain("Non-Alc");
    // Retired, never deleted (the plan has no delete at all).
    expect(plan.retireItems.map(r => r.name).sort()).toEqual(["Fever Tree Cola", "Parthenium Grillo", "Peroni 330ml", "Smoked salmon blini"]);
    expect(plan.retireItems.map(r => r.id)).not.toContain(15); // spirits are "on request"
    // The old package isn't rewritten: past events' BEOs link to it.
    expect(plan.retirePackages.map(r => r.id).sort()).toEqual([30, 31]);
    expect(plan.createPackages.map(p => p.name)).toEqual(["Shared Franco", "Tutto Franco"]);
  });

  it("is idempotent: planning again after applying changes nothing", () => {
    const once = applyInMemory(oldFrancoCatalogue(), planEventMenus2026(oldFrancoCatalogue()));
    const again = planEventMenus2026(once);
    expect(planIsEmpty(again)).toBe(true);
    // Every old row is still there.
    expect(once.items.filter(i => i.id < 30)).toHaveLength(9);
    expect(once.items.find(i => i.id === 14)!.available).toBe(false);
    expect(once.packages.find(p => p.id === 30)).toMatchObject({ isActive: false, chefNotes: "ANTIPASTO\nFocaccia" });
  });
});

// ── Against the real database ─────────────────────────────────────────────
const HAS_DB = !!process.env.DATABASE_URL;
const d = HAS_DB ? describe : describe.skip;
const OWNER = 980000 + Math.floor(Math.random() * 9999);

d("applyEventMenus2026 (DB)", () => {
  let db: any;
  let schema: typeof import("../drizzle/schema");
  beforeAll(async () => {
    const { getDb } = await import("./db");
    db = (await getDb())!;
    schema = await import("../drizzle/schema");
    const { menuCategories, menuCategoryItems, menuPackages } = schema;
    const now = Date.now();
    const [aperitivo] = await db.insert(menuCategories).values({ ownerId: OWNER, name: "Aperitivo", type: "drink", sortOrder: 0, createdAt: now }).returning();
    const [soft] = await db.insert(menuCategories).values({ ownerId: OWNER, name: "Non Alcolico", type: "drink", sortOrder: 1, createdAt: now }).returning();
    await db.insert(menuCategoryItems).values([
      { ownerId: OWNER, categoryId: aperitivo.id, name: "Aperol Spritz", description: "Aperol, Prosecco, Soda", pricingType: "per_item", price: 2000, unit: "each", createdAt: now },
      { ownerId: OWNER, categoryId: soft.id, name: "Fever Tree Cola", pricingType: "per_item", price: 800, unit: "each", createdAt: now },
    ]);
    await db.insert(menuPackages).values({ ownerId: OWNER, name: "Franco Shared Menu", type: "food", pricePerHead: "75.00", isActive: true });
  });
  afterAll(async () => {
    if (!db) return;
    const { menuCategories, menuCategoryItems, menuPackages, dataUpdates } = schema;
    await db.delete(menuCategoryItems).where(eq(menuCategoryItems.ownerId, OWNER));
    await db.delete(menuCategories).where(eq(menuCategories.ownerId, OWNER));
    await db.delete(menuPackages).where(eq(menuPackages.ownerId, OWNER));
    await db.delete(dataUpdates).where(eq(dataUpdates.ownerId, OWNER));
  });

  it("applies once, retires rather than deletes, and then leaves the venue's edits alone", async () => {
    const { menuCategoryItems, menuPackages } = schema;
    expect(await hasEventMenus2026(db, OWNER)).toBe(false);
    const first = await applyEventMenus2026(db, OWNER);
    expect(first.status).toBe("applied");
    expect(await hasEventMenus2026(db, OWNER)).toBe(true);

    const rows = await db.select().from(menuCategoryItems).where(eq(menuCategoryItems.ownerId, OWNER));
    const total = eventMenus2026Catalogue().reduce((n, c) => n + c.items.length, 0);
    expect(rows.filter((r: any) => r.available)).toHaveLength(total);
    const cola = rows.find((r: any) => r.name === "Fever Tree Cola");
    expect(cola).toBeTruthy();               // still there for past events…
    expect(cola.available).toBe(false);      // …but off the menu
    const aperol = rows.find((r: any) => r.name === "Aperol Spritz");
    expect(aperol.price).toBe(2300);

    const pkgs = await db.select().from(menuPackages).where(eq(menuPackages.ownerId, OWNER));
    expect(pkgs.find((p: any) => p.name === "Franco Shared Menu").isActive).toBe(false);
    expect(pkgs.filter((p: any) => p.isActive).map((p: any) => [p.name, Number(p.pricePerHead)]).sort())
      .toEqual([["Shared Franco", 80], ["Tutto Franco", 110]]);

    // The venue edits a price and brings an old item back in Settings…
    await db.update(menuCategoryItems).set({ price: 2400 }).where(eq(menuCategoryItems.id, aperol.id));
    await db.update(menuCategoryItems).set({ available: true }).where(eq(menuCategoryItems.id, cola.id));
    // …and the next boot doesn't undo it.
    expect((await applyEventMenus2026(db, OWNER)).status).toBe("already-applied");
    const after = await db.select().from(menuCategoryItems)
      .where(and(eq(menuCategoryItems.ownerId, OWNER), inArray(menuCategoryItems.id, [aperol.id, cola.id])));
    expect(after.find((r: any) => r.id === aperol.id).price).toBe(2400);
    expect(after.find((r: any) => r.id === cola.id).available).toBe(true);
    expect(await db.select().from(menuCategoryItems).where(eq(menuCategoryItems.ownerId, OWNER))).toHaveLength(rows.length);
  });
});
