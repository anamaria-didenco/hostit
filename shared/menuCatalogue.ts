/**
 * Small rules for turning a menu-catalogue item (Settings → Menu & Catalogue)
 * into something on a proposal or runsheet. Catalogue prices are stored in
 * CENTS and exclude GST.
 */
export type CatalogueItemLike = {
  name: string;
  description?: string | null;
  pricingType: "per_person" | "per_item" | string;
  price: number; // cents
  unit?: string | null;
  allergens?: string | null;
};

/** Units sold once per event rather than once per guest (a set-amount grazing table). */
const ONCE_PER_EVENT_UNITS = new Set(["table", "event", "flat"]);

/**
 * Starting quantity when an item is picked: per-person items and per-piece
 * food cover every guest (one canapé each — the operator tops it up), a
 * set-amount item is one. Falls back to 1 with no guest count.
 */
export function catalogueDefaultQty(item: Pick<CatalogueItemLike, "pricingType" | "unit">, covers: number): number {
  if (ONCE_PER_EVENT_UNITS.has(String(item.unit ?? "").toLowerCase())) return 1;
  return covers > 0 ? covers : 1;
}

/** "$9.00 / piece", "$80.00 / person". */
export function cataloguePriceLabel(item: Pick<CatalogueItemLike, "pricingType" | "price" | "unit">): string {
  const unit = item.unit || (item.pricingType === "per_person" ? "person" : "item");
  const [whole, cents] = (Number(item.price) / 100).toFixed(2).split(".");
  return `$${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${cents} / ${unit}`;
}

/**
 * A proposal line for the item: the name, a short description (not a set
 * menu's full course list), and its dietary tags — "Oysters, seasonal
 * mignonette (GF · DF)".
 */
export function catalogueLineDescription(item: Pick<CatalogueItemLike, "name" | "description" | "allergens">): string {
  const d = (item.description ?? "").trim();
  const short = d && !d.includes("\n") && d.length <= 80 ? `, ${d}` : "";
  const tags = (item.allergens ?? "").trim();
  return `${item.name}${short}${tags ? ` (${tags})` : ""}`;
}
