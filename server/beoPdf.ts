/**
 * BEO (Banquet Event Order) PDF Generator
 * Generates a comprehensive event order document for FOH and Kitchen teams.
 * Called from a dedicated Express route: GET /api/beo/:bookingId
 * Requires authentication via session cookie.
 */
import type { Request, Response } from "express";
import { getDb } from "./db";
import {
  bookings,
  venueSettings,
  runsheets,
  runsheetItems,
  fnbItems,
  proposals,
  proposalDrinks,
  quoteSettings,
  quoteItems,
  menuPackages,
  menuItems,
} from "../drizzle/schema";
import { eq, and } from "drizzle-orm";

// Bar option labels
const BAR_LABELS: Record<string, string> = {
  bar_tab: "Bar Tab",
  cash_bar: "Cash Bar",
  bar_tab_then_cash: "Bar Tab then Cash Bar",
  unlimited: "Unlimited Bar Tab",
};

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

function fmt(d: Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-NZ", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}
function fmtTime(d: Date | null | undefined): string {
  if (!d) return "";
  return new Date(d).toLocaleTimeString("en-NZ", { hour: "2-digit", minute: "2-digit", hour12: true });
}
function fmtCurrency(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === "") return "—";
  return `$${Number(v).toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export async function handleBeoPdf(req: Request, res: Response) {
  try {
    const bookingId = parseInt(req.params.bookingId, 10);
    if (isNaN(bookingId)) return res.status(400).send("Invalid booking ID");

    // Auth check — session cookie must be present
    const userId: number | undefined = (req as any).user?.id;
    if (!userId) return res.status(401).send("Unauthorised");

    const db = await getDb();
    if (!db) return res.status(503).send("Database unavailable");

    // ── Fetch all data ────────────────────────────────────────────────────────
    const [booking] = await db.select().from(bookings)
      .where(and(eq(bookings.id, bookingId), eq(bookings.ownerId, userId)))
      .limit(1);
    if (!booking) return res.status(404).send("Booking not found");

    const [venue] = await db.select().from(venueSettings)
      .where(eq(venueSettings.ownerId, userId)).limit(1);

    // Linked runsheet (most recent for this booking)
    const [runsheet] = await db.select().from(runsheets)
      .where(and(eq(runsheets.bookingId, bookingId), eq(runsheets.ownerId, userId)))
      .limit(1);

    const timelineItems = runsheet
      ? await db.select().from(runsheetItems)
          .where(eq(runsheetItems.runsheetId, runsheet.id))
      : [];
    timelineItems.sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));

    const fnbList = runsheet
      ? await db.select().from(fnbItems)
          .where(and(eq(fnbItems.runsheetId, runsheet.id), eq(fnbItems.ownerId, userId)))
      : [];
    fnbList.sort((a, b) => a.sortOrder - b.sortOrder);

    // Linked proposal
    const proposalId = booking.proposalId;
    let proposal: any = null;
    let drinks: any = null;
    let lineItems: any[] = [];
    let quoteSettingsRow: any = null;
    let quoteItemsList: any[] = [];

    if (proposalId) {
      const [p] = await db.select().from(proposals)
        .where(and(eq(proposals.id, proposalId), eq(proposals.ownerId, userId))).limit(1);
      proposal = p ?? null;

      const [d] = await db.select().from(proposalDrinks)
        .where(eq(proposalDrinks.proposalId, proposalId)).limit(1);
      drinks = d ?? null;

      const [qs] = await db.select().from(quoteSettings)
        .where(eq(quoteSettings.proposalId, proposalId)).limit(1);
      quoteSettingsRow = qs ?? null;

      quoteItemsList = await db.select().from(quoteItems)
        .where(eq(quoteItems.proposalId, proposalId));

      // Menu package items from the proposal
      if (proposal?.menuPackageId) {
        lineItems = await db.select().from(menuItems)
          .where(eq(menuItems.packageId, proposal.menuPackageId));
      }
    }

    // ── Build HTML ────────────────────────────────────────────────────────────
    const venueName = venue?.name ?? "HOSTit Venue";
    const venueAddress = [venue?.address, venue?.city].filter(Boolean).join(", ");
    const clientName = `${booking.firstName}${booking.lastName ? " " + booking.lastName : ""}`;
    const eventDate = fmt(booking.eventDate);
    const eventTime = fmtTime(booking.eventDate);
    const endTime = booking.eventEndDate ? fmtTime(booking.eventEndDate) : "";
    const timeRange = eventTime ? (endTime ? `${eventTime} – ${endTime}` : eventTime) : "—";

    const dietaries: { name: string; count: number; notes?: string }[] = runsheet?.dietaries ?? [];
    const venueSetup = runsheet?.venueSetup ?? "";

    // Timeline HTML
    const timelineHtml = timelineItems.length > 0 ? `
      <section>
        <h2>Event Timeline</h2>
        <table>
          <thead><tr><th style="width:70px">Time</th><th style="width:80px">Duration</th><th>Item</th><th>Category</th><th>Assigned To</th></tr></thead>
          <tbody>
            ${timelineItems.map(item => `
              <tr>
                <td><strong>${item.time ?? ""}</strong></td>
                <td>${item.duration ? item.duration + " min" : "—"}</td>
                <td>
                  <strong>${item.title}</strong>
                  ${item.description ? `<br><span class="sub">${item.description}</span>` : ""}
                </td>
                <td><span class="badge">${item.category ?? "other"}</span></td>
                <td>${item.assignedTo ?? "—"}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </section>
    ` : "";

    // FOH F&B HTML
    const fohItems = fnbList.filter(i => i.section === "foh");
    const fohHtml = fohItems.length > 0 ? `
      <section>
        <h2>FOH — Food &amp; Beverage Service</h2>
        <table>
          <thead><tr><th>Course</th><th>Dish</th><th>Qty</th><th>Service Time</th><th>Dietary</th><th>Staff</th></tr></thead>
          <tbody>
            ${fohItems.map(item => `
              <tr>
                <td>${item.course ?? "—"}</td>
                <td>
                  <strong>${item.dishName}</strong>
                  ${item.description ? `<br><span class="sub">${item.description}</span>` : ""}
                  ${item.platingNotes ? `<br><span class="sub note">Plating: ${item.platingNotes}</span>` : ""}
                </td>
                <td>${item.qty ?? 1}</td>
                <td>${item.serviceTime ?? "—"}</td>
                <td>${item.dietary ?? "—"}</td>
                <td>${item.staffAssigned ?? "—"}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </section>
    ` : "";

    // Kitchen F&B HTML
    const kitchenItems = fnbList.filter(i => i.section === "kitchen");
    const kitchenHtml = kitchenItems.length > 0 ? `
      <section>
        <h2>Kitchen — Prep &amp; Production</h2>
        <table>
          <thead><tr><th>Course</th><th>Dish</th><th>Qty</th><th>Prep Notes</th><th>Dietary</th></tr></thead>
          <tbody>
            ${kitchenItems.map(item => `
              <tr>
                <td>${item.course ?? "—"}</td>
                <td>
                  <strong>${item.dishName}</strong>
                  ${item.description ? `<br><span class="sub">${item.description}</span>` : ""}
                </td>
                <td>${item.qty ?? 1}</td>
                <td>${item.prepNotes ?? "—"}</td>
                <td>${item.dietary ?? "—"}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </section>
    ` : "";

    // Dietary requirements HTML
    const dietaryHtml = dietaries.length > 0 ? `
      <section>
        <h2>Dietary Requirements</h2>
        <table>
          <thead><tr><th>Requirement</th><th>Count</th><th>Notes</th></tr></thead>
          <tbody>
            ${dietaries.map(d => `
              <tr>
                <td><strong>${d.name}</strong></td>
                <td>${d.count}</td>
                <td>${d.notes ?? "—"}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </section>
    ` : "";

    // Bar / Drinks HTML
    const barHtml = drinks ? `
      <section>
        <h2>Bar &amp; Drinks</h2>
        <table>
          <tbody>
            <tr><td style="width:160px"><strong>Bar Arrangement</strong></td><td>${BAR_LABELS[drinks.barOption] ?? drinks.barOption}</td></tr>
            ${drinks.tabAmount ? `<tr><td><strong>Bar Tab Amount</strong></td><td>${fmtCurrency(drinks.tabAmount)}</td></tr>` : ""}
          </tbody>
        </table>
        ${(drinks.selectedDrinks ?? []).length > 0 ? `
          <h3 style="margin-top:12px;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#666">Selected Drinks</h3>
          <ul style="margin:4px 0 0 16px;padding:0">
            ${(drinks.selectedDrinks as string[]).map((key: string) => {
              const d = FRANCO_DRINKS[key];
              return d ? `<li style="font-size:11px;margin-bottom:3px"><strong>${d.label}</strong> — ${d.description}</li>` : `<li style="font-size:11px">${key}</li>`;
            }).join("")}
            ${(drinks.customDrinks ?? []).map((d: any) => `<li style="font-size:11px;margin-bottom:3px"><strong>${d.name}</strong>${d.description ? ` — ${d.description}` : ""}</li>`).join("")}
          </ul>
        ` : ""}
      </section>
    ` : "";

    // Quote / Financials HTML
    const quoteHtml = quoteSettingsRow || quoteItemsList.length > 0 ? `
      <section>
        <h2>Financials</h2>
        <table>
          <tbody>
            ${quoteSettingsRow?.minimumSpend ? `<tr><td style="width:200px"><strong>Minimum Spend</strong></td><td>${fmtCurrency(quoteSettingsRow.minimumSpend)}</td></tr>` : ""}
            ${booking.totalNzd ? `<tr><td><strong>Total</strong></td><td>${fmtCurrency(booking.totalNzd)}</td></tr>` : ""}
            ${booking.depositNzd ? `<tr><td><strong>Deposit</strong></td><td>${fmtCurrency(booking.depositNzd)} ${booking.depositPaid ? "✓ Paid" : "— Outstanding"}</td></tr>` : ""}
          </tbody>
        </table>
        ${quoteItemsList.length > 0 ? `
          <table style="margin-top:8px">
            <thead><tr><th>Item</th><th style="text-align:right">Amount</th></tr></thead>
            <tbody>
              ${quoteItemsList.map(qi => `<tr><td>${qi.label}</td><td style="text-align:right">${fmtCurrency(qi.amount)}</td></tr>`).join("")}
            </tbody>
          </table>
        ` : ""}
      </section>
    ` : "";

    // Venue setup HTML
    const setupHtml = venueSetup ? `
      <section>
        <h2>Venue Setup Notes</h2>
        <p style="font-size:12px;white-space:pre-wrap">${venueSetup}</p>
      </section>
    ` : "";

    // Notes HTML
    const notesHtml = booking.notes ? `
      <section>
        <h2>Internal Notes</h2>
        <p style="font-size:12px;white-space:pre-wrap">${booking.notes}</p>
      </section>
    ` : "";

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>BEO — ${clientName} — ${eventDate}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Georgia', serif; font-size: 12px; color: #1a1a1a; background: white; padding: 32px 40px; }
  h1 { font-size: 22px; font-weight: bold; letter-spacing: 0.04em; margin-bottom: 2px; }
  h2 { font-size: 13px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.08em; color: #6b2737; border-bottom: 1.5px solid #6b2737; padding-bottom: 4px; margin: 20px 0 10px; }
  h3 { font-size: 11px; font-weight: bold; }
  section { margin-bottom: 16px; page-break-inside: avoid; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th { background: #f5f0ec; text-align: left; padding: 5px 8px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #555; border-bottom: 1px solid #ddd; }
  td { padding: 5px 8px; border-bottom: 1px solid #eee; vertical-align: top; }
  tr:last-child td { border-bottom: none; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; padding-bottom: 16px; border-bottom: 2px solid #6b2737; }
  .venue-name { font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: #6b2737; margin-bottom: 4px; }
  .event-title { font-size: 20px; font-weight: bold; }
  .event-sub { font-size: 12px; color: #555; margin-top: 4px; }
  .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 24px; font-size: 11px; margin-bottom: 16px; }
  .meta-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: #888; }
  .meta-value { font-weight: bold; }
  .badge { background: #f5f0ec; border: 1px solid #ddd; padding: 1px 5px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; color: #555; }
  .sub { color: #666; font-size: 10px; }
  .note { font-style: italic; }
  .status-confirmed { color: #15803d; font-weight: bold; }
  .status-tentative { color: #b45309; font-weight: bold; }
  .status-cancelled { color: #dc2626; font-weight: bold; }
  .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #ddd; font-size: 10px; color: #999; display: flex; justify-content: space-between; }
  @media print {
    body { padding: 16px 20px; }
    section { page-break-inside: avoid; }
  }
</style>
</head>
<body>

<div class="header">
  <div>
    <div class="venue-name">${venueName}${venueAddress ? ` · ${venueAddress}` : ""}</div>
    <div class="event-title">BANQUET EVENT ORDER</div>
    <div class="event-sub">${booking.eventType ?? "Event"} — ${clientName}</div>
  </div>
  <div style="text-align:right">
    <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#888">BEO #${booking.id}</div>
    <div style="font-size:18px;font-weight:bold;color:#6b2737">${eventDate}</div>
    <div style="font-size:12px;color:#555">${timeRange}</div>
    <div class="status-${booking.status}" style="margin-top:4px;font-size:11px">${booking.status.toUpperCase()}</div>
  </div>
</div>

<div class="meta-grid">
  <div>
    <div class="meta-label">Client</div>
    <div class="meta-value">${clientName}</div>
  </div>
  <div>
    <div class="meta-label">Email</div>
    <div class="meta-value">${booking.email}</div>
  </div>
  <div>
    <div class="meta-label">Event Type</div>
    <div class="meta-value">${booking.eventType ?? "—"}</div>
  </div>
  <div>
    <div class="meta-label">Guest Count</div>
    <div class="meta-value">${booking.guestCount ?? "—"}</div>
  </div>
  <div>
    <div class="meta-label">Space / Room</div>
    <div class="meta-value">${booking.spaceName ?? "—"}</div>
  </div>
  <div>
    <div class="meta-label">Deposit</div>
    <div class="meta-value">${booking.depositNzd ? fmtCurrency(booking.depositNzd) + (booking.depositPaid ? " ✓ Paid" : " — Outstanding") : "—"}</div>
  </div>
</div>

${setupHtml}
${dietaryHtml}
${timelineHtml}
${fohHtml}
${kitchenHtml}
${barHtml}
${quoteHtml}
${notesHtml}

<div class="footer">
  <span>Generated by HOSTit · ${new Date().toLocaleDateString("en-NZ", { day: "numeric", month: "long", year: "numeric" })}</span>
  <span>BEO #${booking.id} · ${clientName} · ${eventDate}</span>
</div>

</body>
</html>`;

    // ── Render to PDF via Puppeteer ───────────────────────────────────────────
    let puppeteer: any;
    try {
      puppeteer = await import("puppeteer-core");
    } catch {
      // Fallback: return HTML if puppeteer unavailable
      res.setHeader("Content-Type", "text/html");
      return res.send(html);
    }

    const browser = await puppeteer.launch({
      executablePath: "/usr/bin/chromium-browser",
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
      headless: true,
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "networkidle0" });
      const pdf = await page.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: "20mm", right: "15mm", bottom: "20mm", left: "15mm" },
      });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="BEO-${booking.id}-${clientName.replace(/\s+/g, "-")}.pdf"`
      );
      res.send(Buffer.from(pdf));
    } finally {
      await browser.close();
    }
  } catch (err) {
    console.error("[BEO PDF]", err);
    res.status(500).send("Failed to generate BEO");
  }
}
