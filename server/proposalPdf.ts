/**
 * Proposal PDF Generator
 * Generates a styled PDF for a proposal using Puppeteer + system Chromium.
 * Called from a dedicated Express route: GET /api/proposal-pdf/:token
 */
import type { Request, Response } from "express";
import { getDb } from "./db";
import {
  proposals,
  leads,
  venueSettings,
  proposalDrinks,
  quoteSettings,
  quoteItems,
} from "../drizzle/schema";
import { eq } from "drizzle-orm";

// Bar option labels
const BAR_LABELS: Record<string, string> = {
  bar_tab: "Bar Tab",
  cash_bar: "Cash Bar",
  bar_tab_then_cash: "Bar Tab then Cash Bar",
  unlimited: "Unlimited Bar Tab",
};

// Standard Franco drinks menu (same as frontend)
const FRANCO_DRINKS: Record<string, { label: string; description: string }> = {
  house_wine: { label: "House Wine", description: "Sauvignon Blanc, Pinot Gris, Rosé, Merlot" },
  sparkling: { label: "Sparkling Wine", description: "Prosecco & NZ Sparkling" },
  craft_beer: { label: "Craft Beer", description: "Rotating local taps" },
  bottled_beer: { label: "Bottled Beer", description: "Heineken, Corona, Peroni" },
  spirits: { label: "Spirits & Mixers", description: "House spirits with soft drink mixers" },
  cocktails: { label: "Cocktails", description: "Signature cocktail menu" },
  soft_drinks: { label: "Soft Drinks & Juice", description: "Coke, Sprite, OJ, Soda Water" },
  mocktails: { label: "Mocktails", description: "Non-alcoholic cocktail options" },
  tea_coffee: { label: "Tea & Coffee", description: "Plunger coffee, selection of teas" },
  cash_bar: { label: "Cash Bar", description: "Guests pay for their own drinks" },
  unlimited: { label: "Unlimited Bar Tab", description: "Unlimited drinks for the event" },
};

function nzd(val: string | number | null | undefined): string {
  const n = Number(val ?? 0);
  return `$${n.toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function buildHtml(data: {
  proposal: any;
  lead: any;
  venue: any;
  drinks: any;
  quoteData: { settings: any; items: any[] } | null;
}): string {
  const { proposal, lead, venue, drinks, quoteData } = data;
  const lineItems: Array<{ description: string; qty: number; unitPrice: number; total: number }> =
    JSON.parse(proposal.lineItems ?? "[]");

  const subtotal = Number(proposal.subtotalNzd ?? 0);
  const tax = Number(proposal.taxNzd ?? 0);
  const total = Number(proposal.totalNzd ?? 0);
  const deposit = Number(proposal.depositNzd ?? 0);
  const taxPct = Number(proposal.taxPercent ?? 15);
  const depositPct = Number(proposal.depositPercent ?? 25);

  const eventDate = proposal.eventDate
    ? new Date(proposal.eventDate).toLocaleDateString("en-NZ", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    : null;
  const expiresAt = proposal.expiresAt
    ? new Date(proposal.expiresAt).toLocaleDateString("en-NZ", { day: "numeric", month: "long", year: "numeric" })
    : null;

  const venueName = venue?.name ?? "The Venue";
  const venueAddress = venue?.address ?? "";
  const venuePhone = venue?.phone ?? "";
  const venueEmail = venue?.email ?? "";
  const venueLogoUrl = venue?.logoUrl ?? "";
  const primaryColor = venue?.primaryColor ?? "#350513";

  // Drinks section HTML
  let drinksHtml = "";
  if (drinks) {
    const barLabel = BAR_LABELS[drinks.barOption] ?? drinks.barOption;
    const selectedKeys: string[] = drinks.selectedDrinks ?? [];
    const customDrinks: Array<{ name: string; description?: string; price?: number }> = drinks.customDrinks ?? [];
    const drinkRows = selectedKeys
      .map((k) => FRANCO_DRINKS[k])
      .filter(Boolean)
      .map((d) => `<tr><td class="item-name">${d.label}</td><td class="item-desc">${d.description}</td></tr>`)
      .join("");
    const customRows = customDrinks
      .map((d) => `<tr><td class="item-name">${d.name}${d.price ? ` — ${nzd(d.price)}` : ""}</td><td class="item-desc">${d.description ?? ""}</td></tr>`)
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
      </div>`;
  }

  // Quote / Min-Spend section HTML
  let quoteHtml = "";
  if (quoteData?.settings) {
    const qs = quoteData.settings;
    const minSpend = Number(qs.minimumSpend ?? 0);
    const foodTotal = Number(qs.foodTotal ?? subtotal);
    const autoBarTab = qs.autoBarTab;
    const barTabAmount = autoBarTab && minSpend > foodTotal ? minSpend - foodTotal : 0;
    const qItems: any[] = quoteData.items ?? [];

    const qItemRows = qItems.map((item: any) => `
      <tr>
        <td class="item-name">${item.name}</td>
        <td class="item-desc">${item.description ?? ""}</td>
        <td class="item-qty">${item.qty}</td>
        <td class="item-price">${nzd(Number(item.qty) * Number(item.unitPrice))}</td>
      </tr>`).join("");

    quoteHtml = `
      <div class="section quote-section">
        <h2 class="section-title">Minimum Spend &amp; Quote</h2>
        <table class="totals-table">
          <tr><td>Minimum Spend</td><td class="amount">${nzd(minSpend)}</td></tr>
          <tr><td>Food &amp; Beverage Total</td><td class="amount">${nzd(foodTotal)}</td></tr>
          ${autoBarTab && barTabAmount > 0 ? `<tr><td>Auto Bar Tab (remainder)</td><td class="amount">${nzd(barTabAmount)}</td></tr>` : ""}
          ${minSpend > 0 ? `<tr class="${foodTotal + barTabAmount >= minSpend ? 'met' : 'unmet'}">
            <td>Status</td>
            <td class="amount">${foodTotal + barTabAmount >= minSpend ? "✓ Minimum met" : "⚠ Below minimum"}</td>
          </tr>` : ""}
        </table>
        ${qItems.length > 0 ? `
        <h3 class="subsection-title">Additional Items</h3>
        <table class="items-table">
          <thead><tr><th>Item</th><th>Description</th><th>Qty</th><th>Total</th></tr></thead>
          <tbody>${qItemRows}</tbody>
        </table>` : ""}
        ${qs.notes ? `<p class="quote-notes">${qs.notes}</p>` : ""}
      </div>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${proposal.title}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400&family=DM+Sans:wght@400;500&family=Bebas+Neue&display=swap');

  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'DM Sans', sans-serif; font-size: 11pt; color: #1a1a1a; background: #fff; }

  /* Header */
  .header { background: ${primaryColor}; color: #f7f1e9; padding: 32px 48px; display: flex; justify-content: space-between; align-items: flex-start; }
  .header-left h1 { font-family: 'Cormorant Garamond', serif; font-size: 28pt; font-weight: 600; line-height: 1.1; }
  .header-left .subtitle { font-family: 'Bebas Neue', sans-serif; letter-spacing: 0.12em; font-size: 10pt; color: rgba(247,241,233,0.7); margin-top: 4px; }
  .header-right { text-align: right; font-size: 9pt; color: rgba(247,241,233,0.8); line-height: 1.8; }
  .header-right .venue-name { font-family: 'Bebas Neue', sans-serif; font-size: 13pt; letter-spacing: 0.1em; color: #f7f1e9; }
  .logo { max-height: 48px; max-width: 140px; object-fit: contain; filter: brightness(0) invert(1); margin-bottom: 8px; }

  /* Meta strip */
  .meta-strip { background: #f5f0eb; border-bottom: 2px solid ${primaryColor}; padding: 14px 48px; display: flex; gap: 40px; flex-wrap: wrap; }
  .meta-item { font-size: 9pt; }
  .meta-label { font-family: 'Bebas Neue', sans-serif; letter-spacing: 0.1em; font-size: 8pt; color: #888; display: block; }
  .meta-value { font-weight: 500; color: #1a1a1a; }

  /* Body */
  .body { padding: 32px 48px; }

  /* Intro */
  .intro { font-family: 'Cormorant Garamond', serif; font-size: 13pt; line-height: 1.7; color: #333; margin-bottom: 28px; padding-bottom: 24px; border-bottom: 1px solid #e5e0d8; }

  /* Section */
  .section { margin-bottom: 28px; padding-bottom: 24px; border-bottom: 1px solid #e5e0d8; }
  .section:last-child { border-bottom: none; }
  .section-title { font-family: 'Bebas Neue', sans-serif; letter-spacing: 0.12em; font-size: 11pt; color: ${primaryColor}; margin-bottom: 12px; border-left: 3px solid ${primaryColor}; padding-left: 10px; }
  .subsection-title { font-family: 'Bebas Neue', sans-serif; letter-spacing: 0.1em; font-size: 9pt; color: #555; margin: 14px 0 8px; }

  /* Tables */
  .items-table { width: 100%; border-collapse: collapse; font-size: 10pt; }
  .items-table thead tr { background: ${primaryColor}; color: #f7f1e9; }
  .items-table thead th { padding: 7px 10px; text-align: left; font-family: 'Bebas Neue', sans-serif; letter-spacing: 0.08em; font-size: 9pt; font-weight: 400; }
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
  .totals-table .total-row { background: ${primaryColor}; color: #f7f1e9; font-weight: 600; font-size: 12pt; }
  .totals-table .total-row .amount { font-family: 'Cormorant Garamond', serif; font-size: 15pt; }
  .totals-table .deposit-row { background: #f5f0eb; }
  .totals-table .met td { color: #2d6a4f; font-weight: 600; }
  .totals-table .unmet td { color: #c0392b; font-weight: 600; }

  /* Bar option */
  .bar-option { font-size: 10pt; margin-bottom: 10px; color: #333; }

  /* Quote section */
  .quote-section { background: #1a1a1a; color: #f7f1e9; padding: 20px; margin: 0 -48px 28px; padding-left: 48px; padding-right: 48px; }
  .quote-section .section-title { color: #d4a853; border-color: #d4a853; }
  .quote-section .totals-table { color: #f7f1e9; }
  .quote-section .totals-table .amount { color: #d4a853; }
  .quote-section .met td { color: #52b788 !important; }
  .quote-section .unmet td { color: #e76f51 !important; }
  .quote-section .subsection-title { color: #aaa; }
  .quote-section .items-table thead tr { background: #333; }
  .quote-section .items-table tbody tr:nth-child(even) { background: #222; }
  .quote-section .items-table tbody td { color: #f7f1e9; }
  .quote-section .item-desc { color: #aaa; }
  .quote-notes { font-size: 9.5pt; color: #aaa; margin-top: 10px; font-style: italic; }

  /* Terms */
  .terms { font-size: 9pt; color: #666; line-height: 1.7; white-space: pre-line; }

  /* Footer */
  .footer { background: #f5f0eb; border-top: 2px solid ${primaryColor}; padding: 16px 48px; display: flex; justify-content: space-between; align-items: center; font-size: 8.5pt; color: #888; margin-top: 32px; }
  .footer strong { color: ${primaryColor}; font-family: 'Bebas Neue', sans-serif; letter-spacing: 0.08em; font-size: 10pt; }

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
    ${venueLogoUrl ? `<img src="${venueLogoUrl}" alt="${venueName}" class="logo" />` : ""}
    <h1>${proposal.title}</h1>
    <div class="subtitle">Event Proposal</div>
  </div>
  <div class="header-right">
    <div class="venue-name">${venueName}</div>
    ${venueAddress ? `<div>${venueAddress}</div>` : ""}
    ${venuePhone ? `<div>${venuePhone}</div>` : ""}
    ${venueEmail ? `<div>${venueEmail}</div>` : ""}
  </div>
</div>

<!-- Meta strip -->
<div class="meta-strip">
  <div class="meta-item">
    <span class="meta-label">Prepared for</span>
    <span class="meta-value">${lead?.firstName ?? ""} ${lead?.lastName ?? ""}</span>
  </div>
  ${lead?.email ? `<div class="meta-item"><span class="meta-label">Email</span><span class="meta-value">${lead.email}</span></div>` : ""}
  ${eventDate ? `<div class="meta-item"><span class="meta-label">Event Date</span><span class="meta-value">${eventDate}</span></div>` : ""}
  ${proposal.guestCount ? `<div class="meta-item"><span class="meta-label">Guests</span><span class="meta-value">${proposal.guestCount}</span></div>` : ""}
  ${proposal.spaceName ? `<div class="meta-item"><span class="meta-label">Space</span><span class="meta-value">${proposal.spaceName}</span></div>` : ""}
  ${expiresAt ? `<div class="meta-item"><span class="meta-label">Valid Until</span><span class="meta-value">${expiresAt}</span></div>` : ""}
</div>

<div class="body">

  <!-- Intro message -->
  ${proposal.introMessage ? `<div class="intro">${proposal.introMessage}</div>` : ""}

  <!-- Line items / Pricing -->
  <div class="section">
    <h2 class="section-title">Pricing</h2>
    <table class="items-table">
      <thead>
        <tr><th>Description</th><th style="text-align:right">Qty</th><th style="text-align:right">Unit Price</th><th style="text-align:right">Total</th></tr>
      </thead>
      <tbody>
        ${lineItems.map((item) => `
        <tr>
          <td class="item-name">${item.description}</td>
          <td class="item-qty">${item.qty}</td>
          <td class="item-price">${nzd(item.unitPrice)}</td>
          <td class="item-price">${nzd(item.total)}</td>
        </tr>`).join("")}
      </tbody>
    </table>
    <table class="totals-table" style="margin-top:12px; max-width:320px; margin-left:auto;">
      <tr><td>Subtotal</td><td class="amount">${nzd(subtotal)}</td></tr>
      <tr><td>GST (${taxPct}%)</td><td class="amount">${nzd(tax)}</td></tr>
      <tr class="total-row"><td>Total (incl. GST)</td><td class="amount">${nzd(total)}</td></tr>
      <tr class="deposit-row"><td>Deposit Required (${depositPct}%)</td><td class="amount">${nzd(deposit)}</td></tr>
    </table>
  </div>

  <!-- Drinks -->
  ${drinksHtml}

  <!-- Quote / Min Spend -->
  ${quoteHtml}

  <!-- Terms & Conditions -->
  ${proposal.termsAndConditions ? `
  <div class="section">
    <h2 class="section-title">Terms &amp; Conditions</h2>
    <div class="terms">${proposal.termsAndConditions}</div>
  </div>` : ""}

</div>

<!-- Footer -->
<div class="footer">
  <div><strong>${venueName}</strong>${venueAddress ? ` · ${venueAddress}` : ""}</div>
  <div>Generated ${new Date().toLocaleDateString("en-NZ", { day: "numeric", month: "long", year: "numeric" })}</div>
</div>

</body>
</html>`;
}

export async function handleProposalPdf(req: Request, res: Response) {
  const { token } = req.params as { token: string };
  if (!token) return res.status(400).json({ error: "Missing token" });

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
    });

    // Generate PDF with Puppeteer + system Chromium
    const puppeteer = await import("puppeteer-core");
    const browser = await puppeteer.launch({
      executablePath: "/usr/bin/chromium-browser",
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
      headless: true,
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdfBuffer = await page.pdf({
      format: "A4",
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
      printBackground: true,
    });
    await browser.close();

    const safeTitle = (proposal.title ?? "proposal").replace(/[^a-z0-9]/gi, "_").toLowerCase();
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${safeTitle}.pdf"`);
    res.setHeader("Content-Length", pdfBuffer.length);
    res.end(pdfBuffer);
  } catch (err) {
    console.error("[ProposalPDF] Error:", err);
    res.status(500).json({ error: "Failed to generate PDF" });
  }
}
