/**
 * Branded, self-contained HTML blocks for the custom proposal template
 * (Settings → Brand Pack). Each builder returns an inline-styled HTML string in
 * the venue's accent colour/fonts, so it looks right dropped into any template
 * and renders identically in the browser and the PDF. These are the values for
 * the {{pricing}}, {{packages}}, {{menu}}, {{drinks}}, {{photos}}, {{intro}}
 * and {{terms}} tokens.
 *
 * The data shapes mirror server/proposalPdf.ts (same proposal/lead/venue rows,
 * menus from proposalMenus, drinks from proposal_drinks). Output is trusted —
 * it is built here, not pasted — but it stays within the cleanProposalHtml
 * allow-list so the whole rendered document can be sanitised once at the end.
 */
import { escapeHtml as esc, cleanRichHtml } from "./sanitizeHtml";
import { selectedDrinkItems, drinkPriceLabel } from "../shared/drinksMenu";
import { selectedSharedMenuSections } from "../shared/proposalSharedMenu";
import { proposalMoney, clientLineText, isEmptyLine } from "../shared/proposalTotals";
import { isPackageLine } from "../shared/proposalPackages";
import type { VenueBrand } from "../shared/brand";
import type { ProposalMenu } from "./proposalMenus";

const BAR_LABELS: Record<string, string> = {
  bar_tab: "Bar Tab",
  cash_bar: "Cash Bar",
  bar_tab_then_cash: "Bar Tab then Cash Bar",
  unlimited: "Unlimited Bar Tab",
};

export function nzd(val: string | number | null | undefined): string {
  const n = Number(val ?? 0);
  return `$${n.toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export interface ProposalBlockData {
  proposal: any;
  lead: any;
  venue: any;
  brand: VenueBrand;
  menus: ProposalMenu[];
  drinks: any;
  quoteData?: { settings: any; items: any[] } | null;
  /** Photos as { src, caption } — data URLs for the PDF, public URLs for web. */
  photos?: Array<{ src: string; caption: string | null }>;
}

function sectionTitle(text: string, accent: string): string {
  return `<div style="font-family:inherit;text-transform:uppercase;font-weight:700;letter-spacing:0.1em;font-size:13px;color:${accent};border-left:3px solid ${accent};padding-left:10px;margin:0 0 12px;">${esc(text)}</div>`;
}

function lineItemsOf(proposal: any): Array<{ description: string; qty: number; unitPrice: number; total: number }> {
  try { return JSON.parse(proposal.lineItems ?? "[]"); } catch { return []; }
}

export function introBlock(data: ProposalBlockData): string {
  const { proposal } = data;
  if (!proposal.introMessage) return "";
  return `<div style="font-family:${data.brand.serif};font-size:16px;font-style:italic;line-height:1.7;color:#333;margin:0 0 24px;padding-bottom:20px;border-bottom:1px solid #e5e0d8;">${cleanRichHtml(proposal.introMessage)}</div>`;
}

export function photosBlock(data: ProposalBlockData): string {
  const photos = data.photos ?? [];
  if (!photos.length) return "";
  const cols = Math.min(4, Math.max(1, photos.length));
  const cells = photos.map(ph => `
    <td style="width:${Math.floor(100 / cols)}%;padding:3px;vertical-align:top;">
      <img src="${esc(ph.src)}" alt="${esc(ph.caption ?? "")}" style="width:100%;height:150px;object-fit:cover;display:block;border-radius:2px;" />
      ${ph.caption ? `<div style="font-size:11px;color:#777;margin-top:3px;">${esc(ph.caption)}</div>` : ""}
    </td>`).join("");
  return `<table style="width:100%;border-collapse:collapse;margin:0 0 24px;"><tbody><tr>${cells}</tr></tbody></table>`;
}

export function pricingBlock(data: ProposalBlockData): string {
  const { proposal, brand } = data;
  const accent = brand.accent;
  const lineItems = lineItemsOf(proposal);
  const taxPct = Number(proposal.taxPercent ?? 15);
  const depositPct = Number(proposal.depositPercent ?? 25);
  const menuOptions = proposalMoney(lineItems, taxPct, depositPct, proposal.menuChoice).options;
  const shownLines = lineItems.filter(l => !isEmptyLine(l) && !(menuOptions.length && isPackageLine(l.description)));
  if (!shownLines.length && !menuOptions.length && !Number(proposal.totalNzd ?? 0)) return "";

  const rows = shownLines.map(item => `
    <tr>
      <td style="padding:7px 10px;vertical-align:top;font-weight:500;">${esc(clientLineText(item.description))}</td>
      <td style="padding:7px 10px;text-align:right;white-space:nowrap;">${esc(item.qty)}</td>
      <td style="padding:7px 10px;text-align:right;white-space:nowrap;">${Number(item.unitPrice) === 0 ? "" : esc(nzd(item.unitPrice))}</td>
      <td style="padding:7px 10px;text-align:right;white-space:nowrap;font-weight:500;">${Number(item.total) === 0 ? "Included" : esc(nzd(item.total))}</td>
    </tr>`).join("");

  const table = shownLines.length ? `
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:8px;">
      <thead><tr style="background:${accent};color:${brand.onAccent};">
        <th style="padding:7px 10px;text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:0.06em;font-weight:600;">Description</th>
        <th style="padding:7px 10px;text-align:right;font-size:12px;text-transform:uppercase;letter-spacing:0.06em;font-weight:600;">Qty</th>
        <th style="padding:7px 10px;text-align:right;font-size:12px;text-transform:uppercase;letter-spacing:0.06em;font-weight:600;">Unit</th>
        <th style="padding:7px 10px;text-align:right;font-size:12px;text-transform:uppercase;letter-spacing:0.06em;font-weight:600;">Total</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>` : "";

  // With a menu choice, the totals live on each package (see packagesBlock); the
  // pricing block just lists what every option includes.
  const totals = menuOptions.length ? `<div style="font-size:13px;color:#666;font-style:italic;margin-top:4px;">Each menu option below includes everything above and GST (${esc(taxPct)}%).</div>` : `
    <table style="width:100%;max-width:320px;margin-left:auto;border-collapse:collapse;font-size:14px;margin-top:8px;">
      <tr><td style="padding:5px 10px;">Subtotal</td><td style="padding:5px 10px;text-align:right;font-weight:500;">${esc(nzd(proposal.subtotalNzd))}</td></tr>
      <tr><td style="padding:5px 10px;">GST (${esc(taxPct)}%)</td><td style="padding:5px 10px;text-align:right;font-weight:500;">${esc(nzd(proposal.taxNzd))}</td></tr>
      <tr style="background:${accent};color:${brand.onAccent};font-weight:700;"><td style="padding:7px 10px;">Total (incl. GST)</td><td style="padding:7px 10px;text-align:right;font-family:${brand.serif};font-size:17px;">${esc(nzd(proposal.totalNzd))}</td></tr>
      ${Number(proposal.depositNzd ?? 0) > 0 ? `<tr style="background:#f5f0eb;"><td style="padding:7px 10px;">Deposit (${esc(depositPct)}%)</td><td style="padding:7px 10px;text-align:right;font-weight:500;">${esc(nzd(proposal.depositNzd))}</td></tr>` : ""}
    </table>`;

  return `<div style="margin:0 0 24px;padding-bottom:20px;border-bottom:1px solid #e5e0d8;">${sectionTitle("Pricing", accent)}${table}${totals}</div>`;
}

export function packagesBlock(data: ProposalBlockData): string {
  const { proposal, brand, menus } = data;
  const accent = brand.accent;
  const lineItems = lineItemsOf(proposal);
  const taxPct = Number(proposal.taxPercent ?? 15);
  const depositPct = Number(proposal.depositPercent ?? 25);
  const menuOptions = proposalMoney(lineItems, taxPct, depositPct, proposal.menuChoice).options;
  if (!menuOptions.length) return "";
  const menuFor = (line: string) => menus.find(m => m.line === line);
  const rows = menuOptions.map(o => {
    const m = menuFor(o.line);
    return `<tr>
      <td style="padding:10px;border-bottom:1px solid #e5e0d8;vertical-align:top;">
        <div style="font-family:${brand.serif};font-size:18px;font-weight:600;">${esc(o.name)}</div>
        ${m?.description ? `<div style="color:#666;font-size:13px;margin-top:2px;">${esc(m.description)}</div>` : ""}
      </td>
      <td style="padding:10px;border-bottom:1px solid #e5e0d8;text-align:right;white-space:nowrap;vertical-align:top;">
        <div style="font-family:${brand.serif};font-size:19px;font-weight:600;color:${accent};">${esc(nzd(o.total))}</div>
        <div style="font-size:12px;color:#777;">Deposit ${esc(nzd(o.deposit))} (${esc(depositPct)}%)</div>
      </td>
    </tr>`;
  }).join("");
  return `<div style="margin:0 0 24px;padding-bottom:20px;border-bottom:1px solid #e5e0d8;">${sectionTitle("Choose your menu", accent)}<div style="font-size:13px;color:#666;margin-bottom:6px;">Pick one when you accept.</div><table style="width:100%;border-collapse:collapse;font-size:14px;"><tbody>${rows}</tbody></table></div>`;
}

export function menuBlock(data: ProposalBlockData): string {
  const { brand, menus } = data;
  const withMenu = menus.filter(m => m.menu);
  if (!withMenu.length) return "";
  const blocks = withMenu.map(m => `
    <div style="margin-top:14px;">
      <div style="font-family:${brand.serif};font-size:18px;font-weight:600;">${esc(m.name)}</div>
      ${m.description ? `<div style="color:#666;font-size:13px;margin:2px 0 6px;">${esc(m.description)}</div>` : ""}
      <div style="white-space:pre-line;font-size:14px;line-height:1.55;color:#333;">${esc(m.menu)}</div>
    </div>`).join("");
  return `<div style="margin:0 0 24px;padding-bottom:20px;border-bottom:1px solid #e5e0d8;">${sectionTitle("Your menu", brand.accent)}${blocks}</div>`;
}

export function drinksBlock(data: ProposalBlockData): string {
  const { drinks, brand } = data;
  if (!drinks) return "";
  const accent = brand.accent;
  const barLabel = BAR_LABELS[drinks.barOption] ?? drinks.barOption ?? "";
  const picked = selectedDrinkItems(drinks.selectedDrinks ?? []);
  const customDrinks: Array<{ name: string; description?: string; price?: number }> = drinks.customDrinks ?? [];
  const drinkRows = picked.map(d => {
    const price = drinkPriceLabel(d);
    return `<tr><td style="padding:6px 10px;font-weight:500;">${esc(d.name)}${price ? ` — ${esc(price)}` : ""}</td><td style="padding:6px 10px;color:#666;font-size:13px;">${esc(d.description ?? "")}</td></tr>`;
  }).join("");
  const customRows = customDrinks.map(d => `<tr><td style="padding:6px 10px;font-weight:500;">${esc(d.name)}${d.price ? ` — ${esc(nzd(d.price))}` : ""}</td><td style="padding:6px 10px;color:#666;font-size:13px;">${esc(d.description ?? "")}</td></tr>`).join("");

  let sampleHtml = "";
  const sampleSelected: string[] = drinks.selectedSampleItems ?? [];
  if (sampleSelected.length) {
    sampleHtml = selectedSharedMenuSections(sampleSelected).map(sec => {
      const rows = sec.items.map(i => `<tr><td style="padding:5px 10px;font-weight:500;">${esc(i.name)}</td></tr>`).join("");
      return `<div style="margin-top:10px;"><div style="font-style:italic;font-size:13px;color:${accent};border-bottom:1px solid #ddd;padding-bottom:4px;margin-bottom:6px;">${esc(sec.category)}${sec.note ? ` <span style="font-style:normal;font-size:11px;color:#777;">(${esc(sec.note)})</span>` : ""}</div><table style="width:100%;border-collapse:collapse;font-size:14px;"><tbody>${rows}</tbody></table></div>`;
    }).join("");
  }

  const barLine = `<div style="font-size:14px;margin-bottom:10px;color:#333;">Bar: <strong>${esc(barLabel)}</strong>${drinks.tabAmount ? ` — Tab limit: ${esc(nzd(drinks.tabAmount))}` : ""}</div>`;
  const table = (drinkRows || customRows) ? `<table style="width:100%;border-collapse:collapse;font-size:14px;"><tbody>${drinkRows}${customRows}</tbody></table>` : "";
  const exGstNote = picked.some(d => d.exGst) ? `<div style="font-size:11px;color:#777;margin-top:6px;">Drink prices exclude GST.</div>` : "";
  return `<div style="margin:0 0 24px;padding-bottom:20px;border-bottom:1px solid #e5e0d8;">${sectionTitle("Bar & drinks", accent)}${barLine}${table}${sampleHtml}${exGstNote}</div>`;
}

export function termsBlock(data: ProposalBlockData): string {
  const { proposal, brand } = data;
  if (!proposal.termsAndConditions) return "";
  return `<div style="margin:0 0 8px;">${sectionTitle("Terms & conditions", brand.accent)}<div style="font-size:12px;color:#666;line-height:1.7;">${cleanRichHtml(proposal.termsAndConditions)}</div></div>`;
}

/** Logo <img> (or the venue name) for the {{venueLogo}} block. */
export function logoBlock(data: ProposalBlockData): string {
  const { venue, brand } = data;
  if (venue?.logoUrl) {
    return `<img src="${esc(venue.logoUrl)}" alt="${esc(venue?.name ?? "")}" style="max-height:52px;max-width:180px;object-fit:contain;" />`;
  }
  return `<span style="font-family:${brand.serif};font-size:22px;font-weight:700;">${esc(venue?.name ?? "")}</span>`;
}

/** Every block token's rendered HTML, keyed by token name (no braces). */
export function proposalBlockMap(data: ProposalBlockData): Record<string, string> {
  return {
    venueLogo: logoBlock(data),
    intro: introBlock(data),
    photos: photosBlock(data),
    pricing: pricingBlock(data),
    packages: packagesBlock(data),
    menu: menuBlock(data),
    drinks: drinksBlock(data),
    terms: termsBlock(data),
  };
}
