/**
 * The "shared menu" a proposal can tick dishes from (Proposal Builder → Drinks
 * → Shared menu), shown to the client on the proposal page and PDF. One list
 * for all three; each used to carry its own copy.
 *
 * Current dishes are Shared Franco from Event menus 2026. The sample menu it
 * replaced is kept, unchanged, so a proposal saved before the update still
 * shows what was offered — its keys are what those proposals stored.
 */
import { SHARED_FRANCO, setMenuDishLine } from "./eventMenus2026";

export type SharedMenuSection = {
  category: string;
  note: string;
  items: { key: string; name: string }[];
  /** On the previous menu only — not offered for new proposals. */
  retired?: boolean;
};

const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

export const SHARED_MENU_SECTIONS: SharedMenuSection[] = SHARED_FRANCO.courses.map(c => ({
  category: c.name,
  note: "To share",
  items: c.dishes.map(d => ({ key: `2026:${slug(d.name)}`, name: setMenuDishLine(d) })),
}));

const PREVIOUS_SHARED_MENU_SECTIONS: SharedMenuSection[] = [
  { category: "Antipasto", note: "To share", retired: true, items: [
    { key: "antipasto_focaccia", name: "Focaccia with rosemary and olive oil" },
    { key: "antipasto_olives", name: "Citrus-thyme olives" },
    { key: "antipasto_salumi", name: "Salumi selection" },
    { key: "antipasto_ricotta", name: "Ricotta montata with pickled tomato and basil oil" },
  ]},
  { category: "Secondi", note: "To share", retired: true, items: [
    { key: "secondi_spaghetti", name: "Spaghetti al Ragù Toscano with free farmed pork" },
    { key: "secondi_risotto", name: "Cavolo Nero risotto with parmigiano cream and grilled kale" },
    { key: "secondi_milanese", name: "Chicken Milanese with tomato sugo and grilled peppers" },
  ]},
  { category: "Contorno", note: "To share", retired: true, items: [
    { key: "contorno_greens", name: "Mixed greens with mint and almond" },
    { key: "contorno_cos", name: "Fresh cos salad with citrus and pecorino" },
    { key: "contorno_potatoes", name: "Triple cooked potatoes with parsley mayonnaise" },
  ]},
  { category: "Dolce", note: "", retired: true, items: [
    { key: "dolce_tiramisu", name: "Tiramisu with Amaretto, coffee, mascarpone" },
  ]},
];

/** Sections holding only the ticked dishes — current menu first, then any from the previous one. */
export function selectedSharedMenuSections(keys: readonly string[] | null | undefined): SharedMenuSection[] {
  const set = new Set(keys ?? []);
  return [...SHARED_MENU_SECTIONS, ...PREVIOUS_SHARED_MENU_SECTIONS]
    .map(s => ({ ...s, items: s.items.filter(i => set.has(i.key)) }))
    .filter(s => s.items.length > 0);
}
