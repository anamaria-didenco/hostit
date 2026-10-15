/**
 * Proposal PDF Generator
 * Generates a styled PDF for a proposal using Puppeteer's bundled Chromium.
 * Called from a dedicated Express route: GET /api/proposal-pdf/:token
 */
import type { Request, Response } from "express";
import { getDb } from "./db";
import { escapeHtml as esc, cleanRichHtml } from "./sanitizeHtml";
import {
  proposals,
  leads,
  venueSettings,
  proposalDrinks,
  quoteSettings,
  quoteItems,
} from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { selectedDrinkItems, drinkPriceLabel } from "../shared/drinksMenu";
import { selectedSharedMenuSections } from "../shared/proposalSharedMenu";
import { DEFAULT_VENUE_TZ, formatEventDate } from "@shared/eventDate";
import { proposalMoney, clientLineText, isEmptyLine } from "@shared/proposalTotals";
import { isPackageLine } from "@shared/proposalPackages";
import type { ProposalMenu } from "./proposalMenus";
import { venueBrand } from "@shared/brand";

// Bar option labels
const BAR_LABELS: Record<string, string> = {
  bar_tab: "Bar Tab",
  cash_bar: "Cash Bar",
  bar_tab_then_cash: "Bar Tab then Cash Bar",
  unlimited: "Unlimited Bar Tab",
};

function nzd(val: string | number | null | undefined): string {
  const n = Number(val ?? 0);
  return `$${n.toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function buildHtml(data: {
  proposal: any;
  lead: any;
  venue: any;
  drinks: any;
  quoteData: { settings: any; items: any[] } | null;
  /** The menu packages on the proposal, with their menus (see proposalMenus). */
  menus?: ProposalMenu[];
  /** Photos as data URLs, in display order. */
  photos?: Array<{ src: string; caption: string | null }>;
}): string {
  const { proposal, lead, venue, drinks, quoteData } = data;
  const menus = data.menus ?? [];
  const lineItems: Array<{ description: string; qty: number; unitPrice: number; total: number }> =
    JSON.parse(proposal.lineItems ?? "[]");

  const subtotal = Number(proposal.subtotalNzd ?? 0);
  const tax = Number(proposal.taxNzd ?? 0);
  const total = Number(proposal.totalNzd ?? 0);
  const deposit = Number(proposal.depositNzd ?? 0);
  const taxPct = Number(proposal.taxPercent ?? 15);
  const depositPct = Number(proposal.depositPercent ?? 25);

  // A choice of menus: each priced on its own, and the client picks one.
  const menuOptions = proposalMoney(lineItems, taxPct, depositPct, proposal.menuChoice).options;
  const shownLines = lineItems.filter(l => !isEmptyLine(l) && !(menuOptions.length && isPackageLine(l.description)));
  const menuFor = (line: string) => menus.find(m => m.line === line);

  const venueTz = venue?.timezone || DEFAULT_VENUE_TZ;
  const eventDate = proposal.eventDate
    ? formatEventDate(proposal.eventDate, { weekday: "long", day: "numeric", month: "long", year: "numeric" }, venueTz)
    : null;
  const expiresAt = proposal.expiresAt
    ? formatEventDate(proposal.expiresAt, { day: "numeric", month: "long", year: "numeric" }, venueTz)
    : null;

  const venueName = venue?.name ?? "The Venue";
  const venueAddress = venue?.address ?? "";
  const venuePhone = venue?.phone ?? "";
  const venueEmail = venue?.email ?? "";
  const venueWebsite = (venue?.website ?? "").replace(/^https?:\/\//, "").replace(/\/$/, "");
  const venueLogoUrl = venue?.logoUrl ?? "";
  // The venue's Brand Pack: accent colour, fonts and logo.
  const brand = venueBrand(venue);
  const primaryColor = brand.accent;
  const onAccent = brand.onAccent;
  const photos = data.photos ?? [];

  let sampleMenuHtml = "";
  const sampleSelected: string[] = (drinks as any)?.selectedSampleItems ?? [];
  if (sampleSelected.length > 0) {
    const sectionsHtml = selectedSharedMenuSections(sampleSelected)
      .map(sec => {
        const picked = sec.items;
        const rows = picked
          .map(i => `<tr><td class="item-name">${esc(i.name)}</td><td class="item-desc">${sec.note ? `<em>${esc(sec.note)}</em>` : ""}</td></tr>`)
          .join("");
        return `
          <div style="margin-top:12px;">
            <div style="font-style:italic; font-size:13px; color:${primaryColor}; border-bottom:1px solid #ddd; padding-bottom:4px; margin-bottom:6px;">
              ${sec.category}${sec.note ? ` <span style="font-style:normal; font-size:11px; color:#777;">(${sec.note})</span>` : ""}
            </div>
            <table class="items-table"><tbody>${rows}</tbody></table>
          </div>`;
      })
      .filter(Boolean)
      .join("");
    if (sectionsHtml) {
      sampleMenuHtml = `
        <div class="section">
          <h2 class="section-title">Shared Menu</h2>
          ${sectionsHtml}
        </div>`;
    }
  }

  // Drinks section HTML
  let drinksHtml = "";
  if (drinks) {
    const barLabel = BAR_LABELS[drinks.barOption] ?? drinks.barOption;
    const selectedKeys: string[] = drinks.selectedDrinks ?? [];
    const customDrinks: Array<{ name: string; description?: string; price?: number }> = drinks.customDrinks ?? [];
    const picked = selectedDrinkItems(selectedKeys);
    const drinkRows = picked
      .map((d) => {
        const price = drinkPriceLabel(d);
        return `<tr><td class="item-name">${esc(d.name)}${price ? ` — ${esc(price)}` : ""}</td><td class="item-desc">${esc(d.description ?? "")}</td></tr>`;
      })
      .join("");
    const customRows = customDrinks
      .map((d) => `<tr><td class="item-name">${esc(d.name)}${d.price ? ` — ${nzd(d.price)}` : ""}</td><td class="item-desc">${esc(d.description ?? "")}</td></tr>`)
      .join("");

    drinksHtml = `
      <div class="section">
        <h2 class="section-title">Bar &amp; Drinks</h2>
        <div class="bar-option">Bar Option: <strong>${barLabel}</strong>${drinks.tabAmount ? ` — Tab limit: ${nzd(drinks.tabAmount)}` : ""}</div>
        ${drinkRows || customRows ? `
        <table class="items-table">
          <thead><tr><th>Item</th><th>Description</th></tr></thead>
          <tbody>${drinkRows}${customRows}</tbody>
        </table>` : ""}
        ${picked.some(d => d.exGst) ? `<p style="font-size:11px; color:#777; margin-top:6px;">Drink prices exclude GST.</p>` : ""}
      </div>`;
  }

  // Quote / Min-Spend section HTML
  let quoteHtml = "";
  if (quoteData?.settings && (Number(quoteData.settings.minimumSpend ?? 0) > 0 || (quoteData.items ?? []).length > 0 || quoteData.settings.notes)) {
    const qs = quoteData.settings;
    const minSpend = Number(qs.minimumSpend ?? 0);
    const foodTotal = Number(qs.foodTotal ?? subtotal);
    const autoBarTab = qs.autoBarTab;
    const barTabAmount = autoBarTab && minSpend > foodTotal ? minSpend - foodTotal : 0;
    const qItems: any[] = quoteData.items ?? [];

    const qItemRows = qItems.map((item: any) => `
      <tr>
        <td class="item-name">${esc(item.name)}</td>
        <td class="item-desc">${esc(item.description ?? "")}</td>
        <td class="item-qty">${esc(item.qty)}</td>
        <td class="item-price">${nzd(Number(item.qty) * Number(item.unitPrice))}</td>
      </tr>`).join("");

    quoteHtml = `
      <div class="section quote-section">
        <h2 class="section-title">${minSpend > 0 ? "Minimum Spend" : "Extras"}</h2>
        ${minSpend > 0 ? `<table class="totals-table">
          <tr><td>Minimum Spend</td><td class="amount">${nzd(minSpend)}</td></tr>
          <tr><td>Food &amp; Beverage Total</td><td class="amount">${nzd(foodTotal)}</td></tr>
          ${autoBarTab && barTabAmount > 0 ? `<tr><td>Auto Bar Tab (remainder)</td><td class="amount">${nzd(barTabAmount)}</td></tr>` : ""}
          ${minSpend > 0 ? `<tr class="${foodTotal + barTabAmount >= minSpend ? 'met' : 'unmet'}">
            <td>Status</td>
            <td class="amount">${foodTotal + barTabAmount >= minSpend ? "Minimum met" : "Below minimum"}</td>
          </tr>` : ""}
        </table>` : ""}
        ${qItems.length > 0 ? `
        <h3 class="subsection-title">Additional Items</h3>
        <table class="items-table">
          <thead><tr><th>Item</th><th>Description</th><th>Qty</th><th>Total</th></tr></thead>
          <tbody>${qItemRows}</tbody>
        </table>` : ""}
        ${qs.notes ? `<p class="quote-notes">${cleanRichHtml(qs.notes)}</p>` : ""}
      </div>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(proposal.title)}</title>
<style>
  @import url('${brand.fontLink}');

  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: ${brand.sans}; font-size: 11pt; color: #1a1a1a; background: #fff; }

  /* Header */
  .header { background: ${primaryColor}; color: ${onAccent}; padding: 32px 48px; display: flex; justify-content: space-between; align-items: flex-start; }
  .header-left h1 { font-family: ${brand.serif}; font-size: 28pt; font-weight: 600; line-height: 1.1; }
  .header-left .subtitle { font-family: ${brand.sans}; text-transform: uppercase; font-weight: 600; letter-spacing: 0.12em; font-size: 10pt; color: ${onAccent}; opacity: 0.8; margin-top: 4px; }
  .header-right { text-align: right; font-size: 9pt; color: ${onAccent}; opacity: 0.85; line-height: 1.8; }
  .header-right .venue-name { font-family: ${brand.sans}; text-transform: uppercase; font-weight: 600; font-size: 13pt; letter-spacing: 0.1em; color: ${onAccent}; }
  .logo { max-height: 48px; max-width: 140px; object-fit: contain; ${onAccent === "#fff" ? "filter: brightness(0) invert(1);" : ""} margin-bottom: 8px; }

  /* Meta strip */
  .meta-strip { background: #f5f0eb; border-bottom: 2px solid ${primaryColor}; padding: 14px 48px; display: flex; gap: 40px; flex-wrap: wrap; }
  .meta-item { font-size: 9pt; }
  .meta-label { font-family: ${brand.sans}; text-transform: uppercase; font-weight: 600; letter-spacing: 0.1em; font-size: 8pt; color: #888; display: block; }
  .meta-value { font-weight: 500; color: #1a1a1a; }

  /* Body */
  .body { padding: 32px 48px; }

  /* Intro */
  .intro { font-family: ${brand.serif}; font-size: 13pt; line-height: 1.7; color: #333; margin-bottom: 28px; padding-bottom: 24px; border-bottom: 1px solid #e5e0d8; }

  /* Section */
  .section { margin-bottom: 28px; padding-bottom: 24px; border-bottom: 1px solid #e5e0d8; }
  .section:last-child { border-bottom: none; }
  .section-title { font-family: ${brand.sans}; text-transform: uppercase; font-weight: 600; letter-spacing: 0.12em; font-size: 11pt; color: ${primaryColor}; margin-bottom: 12px; border-left: 3px solid ${primaryColor}; padding-left: 10px; }
  .subsection-title { font-family: ${brand.sans}; text-transform: uppercase; font-weight: 600; letter-spacing: 0.1em; font-size: 9pt; color: #555; margin: 14px 0 8px; }

  /* Tables */
  .items-table { width: 100%; border-collapse: collapse; font-size: 10pt; }
  .items-table thead tr { background: ${primaryColor}; color: ${onAccent}; }
  .items-table thead th { padding: 7px 10px; text-align: left; font-family: ${brand.sans}; text-transform: uppercase; font-weight: 600; letter-spacing: 0.08em; font-size: 9pt; font-weight: 400; }
  .items-table tbody tr:nth-child(even) { background: #f9f6f2; }
  .items-table tbody td { padding: 7px 10px; vertical-align: top; }
  .item-name { font-weight: 500; }
  .item-desc { color: #666; font-size: 9.5pt; }
  .item-qty, .item-price { text-align: right; white-space: nowrap; }
  .item-price { font-weight: 500; }

  /* Totals */
  .totals-table { width: 100%; border-collapse: collapse; font-size: 10pt; }
  .totals-table td { padding: 5px 10px; }
  .totals-table .amount { text-align: right; font-weight: 500; }
  .totals-table .total-row { background: ${primaryColor}; color: ${onAccent}; font-weight: 600; font-size: 12pt; }
  .totals-table .total-row .amount { font-family: ${brand.serif}; font-size: 15pt; }
  .totals-table .deposit-row { background: #f5f0eb; }
  .totals-table .met td { color: #2d6a4f; font-weight: 600; }
  .totals-table .unmet td { color: #c0392b; font-weight: 600; }

  /* Bar option */
  .bar-option { font-size: 10pt; margin-bottom: 10px; color: #333; }

  /* Quote section */
  .quote-notes { font-size: 9.5pt; color: #666; margin-top: 10px; font-style: italic; }

  /* Photos */
  .photos { display: grid; grid-template-columns: repeat(${Math.min(3, Math.max(1, photos.length - 1))}, 1fr); gap: 6px; margin-bottom: 24px; }
  .photos figure { margin: 0; break-inside: avoid; }
  .photos figure:first-child { grid-column: 1 / -1; }
  .photos img { width: 100%; height: 150px; object-fit: cover; display: block; }
  .photos figure:first-child img { height: 260px; }
  .photos figcaption { font-size: 8.5pt; color: #777; margin-top: 3px; }

  /* Menu options + menus */
  .options { width: 100%; border-collapse: collapse; font-size: 10pt; margin-top: 4px; }
  .options td { padding: 10px; border-bottom: 1px solid #e5e0d8; vertical-align: top; }
  .options .opt-name { font-family: ${brand.serif}; font-size: 14pt; font-weight: 600; color: #1a1a1a; }
  .options .opt-desc { color: #666; font-size: 9pt; margin-top: 2px; }
  .options .opt-total { text-align: right; white-space: nowrap; font-family: ${brand.serif}; font-size: 15pt; font-weight: 600; color: ${primaryColor}; }
  .options .opt-dep { text-align: right; white-space: nowrap; font-size: 8.5pt; color: #777; }
  .choose-note { font-size: 9pt; color: #666; margin: 2px 0 6px; }
  .menu-block { margin-top: 14px; break-inside: avoid; }
  .section-title { break-after: avoid; page-break-after: avoid; }
  .menu-block h3 { font-family: ${brand.serif}; font-size: 14pt; font-weight: 600; color: #1a1a1a; }
  .menu-block .menu-desc { color: #666; font-size: 9.5pt; margin: 2px 0 6px; }
  .menu-text { white-space: pre-line; font-size: 9.5pt; line-height: 1.55; color: #333; }

  /* Terms */
  .terms { font-size: 9pt; color: #666; line-height: 1.7; white-space: pre-line; }

  /* Footer */
  .footer { background: #f5f0eb; border-top: 2px solid ${primaryColor}; padding: 16px 48px; display: flex; justify-content: space-between; align-items: center; font-size: 8.5pt; color: #888; margin-top: 32px; }
  .footer strong { color: ${primaryColor}; font-family: ${brand.sans}; text-transform: uppercase; font-weight: 600; letter-spacing: 0.08em; font-size: 10pt; }

  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .quote-section { -webkit-print-color-adjust: exact; }
  }
</style>
</head>
<body>

<!-- Header -->
<div class="header">
  <div class="header-left">
    ${venueLogoUrl ? `<img src="${esc(venueLogoUrl)}" alt="${esc(venueName)}" class="logo" />` : ""}
    <h1>${esc(proposal.title)}</h1>
    <div class="subtitle">${esc(eventDate ?? "Event Proposal")}</div>
  </div>
  <div class="header-right">
    <div class="venue-name">${esc(venueName)}</div>
    ${venueAddress ? `<div>${esc(venueAddress)}</div>` : ""}
    ${venuePhone ? `<div>${esc(venuePhone)}</div>` : ""}
    ${venueEmail ? `<div>${esc(venueEmail)}</div>` : ""}
  </div>
</div>

<!-- Meta strip -->
<div class="meta-strip">
  <div class="meta-item">
    <span class="meta-label">Prepared for</span>
    <span class="meta-value">${esc(lead?.firstName ?? "")} ${esc(lead?.lastName ?? "")}</span>
  </div>
  ${lead?.email ? `<div class="meta-item"><span class="meta-label">Email</span><span class="meta-value">${esc(lead.email)}</span></div>` : ""}
  ${eventDate ? `<div class="meta-item"><span class="meta-label">Event Date</span><span class="meta-value">${esc(eventDate)}</span></div>` : ""}
  ${proposal.guestCount ? `<div class="meta-item"><span class="meta-label">Guests</span><span class="meta-value">${esc(proposal.guestCount)}</span></div>` : ""}
  ${proposal.spaceName ? `<div class="meta-item"><span class="meta-label">Space</span><span class="meta-value">${esc(proposal.spaceName)}</span></div>` : ""}
  ${expiresAt ? `<div class="meta-item"><span class="meta-label">Valid Until</span><span class="meta-value">${expiresAt}</span></div>` : ""}
</div>

<div class="body">

  <!-- Intro message -->
  ${proposal.introMessage ? `<div class="intro">${cleanRichHtml(proposal.introMessage)}</div>` : ""}

  ${photos.length ? `<div class="photos">${photos.map(ph => `<figure><img src="${ph.src}" alt="" />${ph.caption ? `<figcaption>${esc(ph.caption)}</figcaption>` : ""}</figure>`).join("")}</div>` : ""}

  <!-- Line items / Pricing -->
  <div class="section">
    <h2 class="section-title">Pricing</h2>
    <table class="items-table">
      <thead>
        <tr><th>Description</th><th style="text-align:right">Qty</th><th style="text-align:right">Unit Price</th><th style="text-align:right">Total</th></tr>
      </thead>
      <tbody>
        ${shownLines.map((item) => `
        <tr>
          <td class="item-name">${esc(clientLineText(item.description))}</td>
          <td class="item-qty">${esc(item.qty)}</td>
          <td class="item-price">${Number(item.unitPrice) === 0 ? "" : nzd(item.unitPrice)}</td>
          <td class="item-price">${Number(item.total) === 0 ? "Included" : nzd(item.total)}</td>
        </tr>`).join("")}
      </tbody>
    </table>
    ${menuOptions.length ? `
    <h2 class="section-title" style="margin-top:22px;">Choose your menu</h2>
    <p class="choose-note">Each price includes everything above and GST (${taxPct}%). Pick one when you accept.</p>
    <table class="options"><tbody>
      ${menuOptions.map(o => {
        const m = menuFor(o.line);
        return `<tr>
          <td><div class="opt-name">${esc(o.name)}</div>${m?.description ? `<div class="opt-desc">${esc(m.description)}</div>` : ""}</td>
          <td><div class="opt-total">${nzd(o.total)}</div><div class="opt-dep">Deposit ${nzd(o.deposit)} (${depositPct}%)</div></td>
        </tr>`;
      }).join("")}
    </tbody></table>` : `
    <table class="totals-table" style="margin-top:12px; max-width:320px; margin-left:auto;">
      <tr><td>Subtotal</td><td class="amount">${nzd(subtotal)}</td></tr>
      <tr><td>GST (${taxPct}%)</td><td class="amount">${nzd(tax)}</td></tr>
      <tr class="total-row"><td>Total (incl. GST)</td><td class="amount">${nzd(total)}</td></tr>
      ${deposit > 0 ? `<tr class="deposit-row"><td>Deposit Required (${depositPct}%)</td><td class="amount">${nzd(deposit)}</td></tr>` : ""}
    </table>`}
  </div>

  ${menus.some(m => m.menu) ? `
  <div class="section">
    <h2 class="section-title">${menuOptions.length ? "The menus" : "Your menu"}</h2>
    ${menus.filter(m => m.menu).map(m => `
      <div class="menu-block">
        <h3>${esc(m.name)}</h3>
        ${m.description ? `<div class="menu-desc">${esc(m.description)}</div>` : ""}
        <div class="menu-text">${esc(m.menu)}</div>
      </div>`).join("")}
  </div>` : ""}

  <!-- Drinks -->
  ${drinksHtml}
  ${sampleMenuHtml}

  <!-- Quote / Min Spend -->
  ${quoteHtml}

  <!-- Terms & Conditions -->
  ${proposal.termsAndConditions ? `
  <div class="section">
    <h2 class="section-title">Terms &amp; Conditions</h2>
    <div class="terms">${cleanRichHtml(proposal.termsAndConditions)}</div>
  </div>` : ""}

</div>

<!-- Footer -->
<div class="footer">
  <div><strong>${esc(venueName)}</strong>${[venueAddress, venuePhone, venueEmail, venueWebsite].filter(Boolean).map(v => ` · ${esc(v)}`).join("")}</div>
  <div>Generated ${new Date().toLocaleDateString("en-NZ", { day: "numeric", month: "long", year: "numeric", timeZone: venueTz })}</div>
</div>

</body>
</html>`;
}

export async function handleProposalPdf(req: Request, res: Response) {
  const { token } = req.params as { token: string };
  if (!token) return res.status(400).json({ error: "Missing token" });

  let browser: any = null;
  try {
    const db = await getDb();
    if (!db) return res.status(503).json({ error: "Database unavailable" });

    // Fetch proposal
    const [proposal] = await db.select().from(proposals).where(eq(proposals.publicToken, token)).limit(1);
    if (!proposal) return res.status(404).json({ error: "Proposal not found" });

    // Fetch related data in parallel
    const [leadRows, venueRows, drinksRows, qSettingsRows, qItemRows] = await Promise.all([
      db.select().from(leads).where(eq(leads.id, proposal.leadId)).limit(1),
      db.select().from(venueSettings).where(eq(venueSettings.ownerId, proposal.ownerId)).limit(1),
      db.select().from(proposalDrinks).where(eq(proposalDrinks.proposalId, proposal.id)).limit(1),
      db.select().from(quoteSettings).where(eq(quoteSettings.proposalId, proposal.id)).limit(1),
      db.select().from(quoteItems).where(eq(quoteItems.proposalId, proposal.id)).orderBy(quoteItems.sortOrder),
    ]);

    const html = buildHtml({
      proposal,
      lead: leadRows[0] ?? null,
      venue: venueRows[0] ?? null,
      drinks: drinksRows[0] ?? null,
      quoteData: qSettingsRows[0] ? { settings: qSettingsRows[0], items: qItemRows } : null,
      menus: await (await import("./proposalMenus")).proposalMenus(proposal.ownerId, proposal.lineItems),
      photos: (await (await import("./proposalPhotos")).proposalPhotosWithData(proposal.id))
        .map(ph => ({ src: `data:${ph.contentType};base64,${ph.data}`, caption: ph.caption })),
    });

    // Generate PDF with Puppeteer's bundled Chromium (no system browser needed)
    const puppeteer = await import("puppeteer");
    browser = await puppeteer.default.launch({
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
      headless: true,
    });
    const page = await browser.newPage();
    // `networkidle0` waits for external resources (Google Fonts, venue logo) to
    // finish loading before rendering the PDF. Puppeteer's `setContent` type omits
    // it, but the underlying lifecycle watcher supports it identically to `goto`.
    await page.setContent(html, { waitUntil: "networkidle0" as "load" });
    const pdfBuffer = await page.pdf({
      format: "A4",
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
      printBackground: true,
    });
    await browser.close();
    browser = null;

    const safeTitle = (proposal.title ?? "proposal").replace(/[^a-z0-9]/gi, "_").toLowerCase();
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${safeTitle}.pdf"`);
    res.setHeader("Content-Length", pdfBuffer.length);
    res.end(pdfBuffer);
  } catch (err) {
    console.error("[ProposalPDF] Error:", err);
    res.status(500).json({ error: "Failed to generate PDF" });
  } finally {
    // Never leak a Chromium process if setContent/page.pdf threw.
    if (browser) await browser.close().catch(() => {});
  }
}
