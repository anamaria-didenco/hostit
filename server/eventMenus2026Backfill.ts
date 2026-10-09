/**
 * Bar Franco's "Event menus · 2026" reaches the live catalogue on deploy.
 *
 * Runs on boot (after migrations), for Bar Franco only, exactly once:
 *   - upserts every 2026 food and drink item into Settings → Menu & Catalogue
 *     by name (case/accent-insensitive), fixing prices (excl. GST), wording,
 *     dietary tags, units and grouping;
 *   - adds Shared Franco and Tutto Franco as per-person menu packages;
 *   - RETIRES what is no longer on the menu — catalogue items are marked
 *     unavailable and packages inactive. Nothing is deleted, so past
 *     proposals, runsheets and BEOs still show what was sold.
 *
 * "Exactly once" is a `data_updates` row claimed in the same transaction as
 * the update. Once it exists the job never touches the venue's catalogue
 * again, so later edits in Settings stick.
 *
 * Categories the PDF doesn't cover but says are on request (spirits) are left
 * alone. Other venues are never touched.
 */
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "./db";
import { dataUpdates, menuCategories, menuCategoryItems, menuPackages, venueSettings } from "../drizzle/schema";
import {
  eventMenus2026Catalogue, eventMenus2026Packages, KEEP_CATEGORY_RE,
  type CatalogueCategorySpec, type MenuPackageSpec,
} from "../shared/eventMenus2026";

export const EVENT_MENUS_2026_KEY = "event-menus-2026";

// ── Venue detection ────────────────────────────────────────────────────────
export function isBarFrancoVenue(v: { name?: string | null; slug?: string | null; email?: string | null; website?: string | null }): boolean {
  if (/\bbar\s*franco\b/i.test(v.name ?? "")) return true;
  if (/^bar-?franco$/i.test((v.slug ?? "").trim())) return true;
  return /barfranco\.nz/i.test(`${v.email ?? ""} ${v.website ?? ""}`);
}

// ── Pure planning ──────────────────────────────────────────────────────────
export type ExistingCategory = { id: number; name: string; type: "food" | "drink"; description: string | null; sortOrder: number };
export type ExistingItem = {
  id: number; categoryId: number; name: string; description: string | null;
  pricingType: "per_person" | "per_item"; price: number; unit: string | null;
  available: boolean; allergens: string | null; sortOrder: number;
};
export type ExistingPackage = {
  id: number; name: string; type: string; description: string | null;
  pricePerHead: string | null; chefNotes: string | null; isActive: boolean;
};

/** A category id that already exists, or the name of one this plan creates. */
export type CategoryRef = number | string;
type ItemFields = {
  name: string; description: string | null; pricingType: "per_person" | "per_item";
  price: number; unit: string; allergens: string | null; available: boolean; sortOrder: number;
};
export type MenuPlan = {
  createCategories: Array<{ name: string; type: "food" | "drink"; description: string | null; sortOrder: number }>;
  updateCategories: Array<{ id: number; patch: Partial<Pick<ExistingCategory, "name" | "description" | "sortOrder">> }>;
  createItems: Array<ItemFields & { category: CategoryRef }>;
  updateItems: Array<{ id: number; category?: CategoryRef; patch: Partial<ItemFields> }>;
  retireItems: Array<{ id: number; name: string }>;
  createPackages: MenuPackageSpec[];
  reactivatePackages: number[];
  retirePackages: Array<{ id: number; name: string }>;
};

/** Case, accent, apostrophe and spacing-insensitive name key. */
export const nameKey = (s: string | null | undefined) =>
  String(s ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[’‘`]/g, "'")
    .toLowerCase().replace(/\s+/g, " ").trim();

const samePrice = (a: string | number | null | undefined, b: number) => a != null && Math.abs(Number(a) - b) < 0.005;

export function planEventMenus2026(
  existing: { categories: ExistingCategory[]; items: ExistingItem[]; packages: ExistingPackage[] },
  spec: { catalogue: CatalogueCategorySpec[]; packages: MenuPackageSpec[] } = { catalogue: eventMenus2026Catalogue(), packages: eventMenus2026Packages() },
): MenuPlan {
  const plan: MenuPlan = {
    createCategories: [], updateCategories: [], createItems: [], updateItems: [],
    retireItems: [], createPackages: [], reactivatePackages: [], retirePackages: [],
  };

  // Categories: match by name, then by alias, within the same type.
  const catById = new Map(existing.categories.map(c => [c.id, c]));
  const claimedCats = new Set<number>();
  const targetCat = new Map<string, CategoryRef>(); // spec name → ref
  spec.catalogue.forEach((sc, idx) => {
    const sortOrder = idx;
    const keys = [sc.name, ...(sc.aliases ?? [])].map(nameKey);
    const pool = existing.categories.filter(c => c.type === sc.type && !claimedCats.has(c.id));
    const match = pool.find(c => nameKey(c.name) === keys[0]) ?? pool.find(c => keys.includes(nameKey(c.name)));
    if (!match) {
      plan.createCategories.push({ name: sc.name, type: sc.type, description: sc.description, sortOrder });
      targetCat.set(sc.name, sc.name);
      return;
    }
    claimedCats.add(match.id);
    targetCat.set(sc.name, match.id);
    const patch: MenuPlan["updateCategories"][number]["patch"] = {};
    if (match.name !== sc.name) patch.name = sc.name;
    if ((match.description ?? null) !== sc.description) patch.description = sc.description;
    if (match.sortOrder !== sortOrder) patch.sortOrder = sortOrder;
    if (Object.keys(patch).length) plan.updateCategories.push({ id: match.id, patch });
  });
  // Categories the PDF doesn't name (spirits, emptied old ones) go after the
  // 2026 ones, keeping their own relative order. Only the position changes.
  existing.categories
    .filter(c => !claimedCats.has(c.id))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
    .forEach((c, i) => {
      const sortOrder = spec.catalogue.length + i;
      if (c.sortOrder !== sortOrder) plan.updateCategories.push({ id: c.id, patch: { sortOrder } });
    });

  // Items in the venue's food/drink catalogue, minus the categories we leave alone.
  const managed = existing.items.filter(it => {
    const cat = catById.get(it.categoryId);
    return cat && !KEEP_CATEGORY_RE.test(cat.name);
  });
  const claimedItems = new Set<number>();
  for (const sc of spec.catalogue) {
    const ref = targetCat.get(sc.name)!;
    sc.items.forEach((si, sortOrder) => {
      const keys = [si.name, ...(si.aliases ?? [])].map(nameKey);
      const candidates = managed.filter(it =>
        !claimedItems.has(it.id) && catById.get(it.categoryId)!.type === sc.type && keys.includes(nameKey(it.name)));
      // Prefer the row already in the right category, then a live one, then the oldest.
      candidates.sort((a, b) =>
        Number(b.categoryId === ref) - Number(a.categoryId === ref)
        || Number(b.available) - Number(a.available)
        || a.id - b.id);
      const want: ItemFields = {
        name: si.name, description: si.description, pricingType: si.pricingType,
        price: Math.round(si.price * 100), unit: si.unit, allergens: si.allergens, available: true, sortOrder,
      };
      const hit = candidates[0];
      if (!hit) { plan.createItems.push({ ...want, category: ref }); return; }
      claimedItems.add(hit.id);
      const patch: Partial<ItemFields> = {};
      (Object.keys(want) as (keyof ItemFields)[]).forEach(f => {
        if ((hit[f] ?? null) !== want[f]) (patch as any)[f] = want[f];
      });
      const move = hit.categoryId !== ref;
      if (move || Object.keys(patch).length) plan.updateItems.push({ id: hit.id, ...(move ? { category: ref } : {}), patch });
    });
  }
  for (const it of managed) {
    if (!claimedItems.has(it.id) && it.available) plan.retireItems.push({ id: it.id, name: it.name });
  }

  // Packages: an identical live-or-retired row counts as done. A same-named
  // package with DIFFERENT content is retired untouched and a new one created —
  // the BEO links old events to their package, so editing it in place would
  // rewrite what past events were sold.
  const keptPkgs = new Set<number>();
  for (const sp of spec.packages) {
    const same = existing.packages.find(p => !keptPkgs.has(p.id)
      && nameKey(p.name) === nameKey(sp.name) && p.type === sp.type
      && (p.description ?? null) === sp.description && samePrice(p.pricePerHead, sp.pricePerHead)
      && (p.chefNotes ?? null) === sp.chefNotes);
    if (same) {
      keptPkgs.add(same.id);
      if (!same.isActive) plan.reactivatePackages.push(same.id);
    } else {
      plan.createPackages.push(sp);
    }
  }
  for (const p of existing.packages) {
    if (!keptPkgs.has(p.id) && p.isActive) plan.retirePackages.push({ id: p.id, name: p.name });
  }
  return plan;
}

export function planIsEmpty(p: MenuPlan): boolean {
  return Object.values(p).every(v => Array.isArray(v) && v.length === 0);
}

// ── Applying it ────────────────────────────────────────────────────────────
type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export type ApplyResult =
  | { status: "applied"; summary: Record<string, unknown> }
  | { status: "already-applied" };

/**
 * Apply the 2026 menus to one venue, once. The marker row is claimed first,
 * inside the same transaction, so a crash rolls both back and two boots
 * racing can't both apply it.
 */
export async function applyEventMenus2026(db: Db, ownerId: number): Promise<ApplyResult> {
  return db.transaction(async (tx) => {
    const claimed = await tx.insert(dataUpdates)
      .values({ ownerId, key: EVENT_MENUS_2026_KEY })
      .onConflictDoNothing()
      .returning({ id: dataUpdates.id });
    if (claimed.length === 0) return { status: "already-applied" as const };

    const categories = await tx.select().from(menuCategories).where(eq(menuCategories.ownerId, ownerId));
    const catIds = categories.map(c => c.id);
    const items = catIds.length
      ? await tx.select().from(menuCategoryItems).where(and(eq(menuCategoryItems.ownerId, ownerId), inArray(menuCategoryItems.categoryId, catIds)))
      : [];
    const packages = await tx.select().from(menuPackages).where(eq(menuPackages.ownerId, ownerId));
    const plan = planEventMenus2026({ categories, items: items as ExistingItem[], packages });

    const now = Date.now();
    const refToId = new Map<string, number>();
    for (const c of plan.createCategories) {
      const [row] = await tx.insert(menuCategories)
        .values({ ownerId, name: c.name, type: c.type, description: c.description, sortOrder: c.sortOrder, createdAt: now })
        .returning({ id: menuCategories.id });
      refToId.set(c.name, row.id);
    }
    const resolve = (ref: CategoryRef) => typeof ref === "number" ? ref : refToId.get(ref)!;
    for (const u of plan.updateCategories) {
      await tx.update(menuCategories).set(u.patch).where(and(eq(menuCategories.id, u.id), eq(menuCategories.ownerId, ownerId)));
    }
    if (plan.createItems.length) {
      await tx.insert(menuCategoryItems).values(plan.createItems.map(({ category, ...f }) => ({
        ...f, categoryId: resolve(category), ownerId, createdAt: now,
      })));
    }
    for (const u of plan.updateItems) {
      await tx.update(menuCategoryItems)
        .set({ ...u.patch, ...(u.category !== undefined ? { categoryId: resolve(u.category) } : {}) })
        .where(and(eq(menuCategoryItems.id, u.id), eq(menuCategoryItems.ownerId, ownerId)));
    }
    if (plan.retireItems.length) {
      await tx.update(menuCategoryItems).set({ available: false })
        .where(and(eq(menuCategoryItems.ownerId, ownerId), inArray(menuCategoryItems.id, plan.retireItems.map(r => r.id))));
    }
    for (const p of plan.createPackages) {
      await tx.insert(menuPackages).values({
        ownerId, name: p.name, type: p.type, description: p.description,
        pricePerHead: p.pricePerHead.toFixed(2), chefNotes: p.chefNotes, isActive: true,
      });
    }
    if (plan.reactivatePackages.length) {
      await tx.update(menuPackages).set({ isActive: true, updatedAt: new Date() })
        .where(and(eq(menuPackages.ownerId, ownerId), inArray(menuPackages.id, plan.reactivatePackages)));
    }
    if (plan.retirePackages.length) {
      await tx.update(menuPackages).set({ isActive: false, updatedAt: new Date() })
        .where(and(eq(menuPackages.ownerId, ownerId), inArray(menuPackages.id, plan.retirePackages.map(r => r.id))));
    }

    const summary = {
      categoriesAdded: plan.createCategories.map(c => c.name),
      categoriesUpdated: plan.updateCategories.length,
      itemsAdded: plan.createItems.length,
      itemsUpdated: plan.updateItems.length,
      itemsRetired: plan.retireItems.map(r => r.name),
      packagesAdded: plan.createPackages.map(p => p.name),
      packagesRetired: plan.retirePackages.map(r => r.name),
    };
    await tx.update(dataUpdates).set({ summary })
      .where(and(eq(dataUpdates.ownerId, ownerId), eq(dataUpdates.key, EVENT_MENUS_2026_KEY)));
    return { status: "applied" as const, summary };
  });
}

/** True once the 2026 menus have been applied to this venue. */
export async function hasEventMenus2026(db: Db, ownerId: number): Promise<boolean> {
  const rows = await db.select({ id: dataUpdates.id }).from(dataUpdates)
    .where(and(eq(dataUpdates.ownerId, ownerId), eq(dataUpdates.key, EVENT_MENUS_2026_KEY))).limit(1);
  return rows.length > 0;
}

/** Boot entry point. Never throws. */
export async function runEventMenus2026Backfill(): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    const venues = await db.select({
      ownerId: venueSettings.ownerId, name: venueSettings.name, slug: venueSettings.slug,
      email: venueSettings.email, website: venueSettings.website,
    }).from(venueSettings);
    const owners = Array.from(new Set(venues.filter(isBarFrancoVenue).map(v => v.ownerId)));
    if (owners.length === 0) { console.log("[EventMenus2026] no Bar Franco venue found — nothing to do"); return; }
    for (const ownerId of owners) {
      const res = await applyEventMenus2026(db, ownerId);
      if (res.status === "applied") console.log(`[EventMenus2026] owner ${ownerId}: applied`, JSON.stringify(res.summary));
    }
  } catch (err: any) {
    console.error("[EventMenus2026] update failed:", err?.message ?? err);
  }
}
