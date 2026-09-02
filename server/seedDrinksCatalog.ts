/**
 * Ensure every venue that runs a drinks catalogue also has its beers and
 * non-alcoholic options in it.
 *
 * Bar Franco's catalogue was built with the wine and cocktail lists only, so
 * the drink picker offered nothing for the Peronis or the Fever Trees — the
 * operator had to type them as custom drinks each time. This backfill adds the
 * two missing categories with the venue's real list.
 *
 * Idempotent and conservative: it only touches owners who already have at
 * least one drink-type category (i.e. venues actually using a drinks
 * catalogue), and it never modifies an existing category — if a "Birra" or
 * "Non Alcolico" category exists in any casing, that category is theirs and is
 * left entirely alone.
 */
import { getDb } from "./db";
import { menuCategories, menuCategoryItems } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";

// Prices in DOLLARS here; stored ×100 like menuCatalog.createItem does.
const SEED: Array<{ category: string; items: Array<{ name: string; description?: string; price: number }> }> = [
  {
    category: "Birra",
    items: [
      { name: "Peroni Tap", description: "Italia", price: 14 },
      { name: "Peroni 330ml", description: "Italia", price: 12 },
      { name: "Peroni 0%", description: "Italia", price: 12 },
    ],
  },
  {
    category: "Non Alcolico",
    items: [
      { name: "Fever Tree Ginger Ale", price: 8 },
      { name: "Fever Tree Cola", price: 8 },
      { name: "Fever Tree Italian Blood Orange", price: 8 },
      { name: "Fever Tree Italian Lemonade", price: 8 },
    ],
  },
];

export async function seedDrinksCatalog(): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    const drinkCats = await db.select().from(menuCategories).where(eq(menuCategories.type, "drink"));
    const byOwner = new Map<number, typeof drinkCats>();
    for (const c of drinkCats) {
      const arr = byOwner.get(c.ownerId) ?? [];
      arr.push(c);
      byOwner.set(c.ownerId, arr);
    }
    for (const [ownerId, cats] of byOwner) {
      const have = new Set(cats.map(c => c.name.trim().toLowerCase()));
      let sortOrder = Math.max(0, ...cats.map(c => c.sortOrder ?? 0));
      for (const seed of SEED) {
        if (have.has(seed.category.toLowerCase())) continue;
        sortOrder += 1;
        const [cat] = await db.insert(menuCategories).values({
          ownerId,
          name: seed.category,
          type: "drink",
          sortOrder,
          createdAt: Date.now(),
        }).returning();
        await db.insert(menuCategoryItems).values(seed.items.map((it, i) => ({
          categoryId: cat.id,
          ownerId,
          name: it.name,
          description: it.description ?? null,
          pricingType: "per_item" as const,
          price: Math.round(it.price * 100),
          unit: "each",
          available: true,
          sortOrder: i,
          createdAt: Date.now(),
        })));
        console.log(`[DrinksCatalog] owner ${ownerId}: added "${seed.category}" with ${seed.items.length} item(s)`);
      }
    }
  } catch (err: any) {
    console.error("[DrinksCatalog] seed failed:", err?.message ?? err);
  }
}
