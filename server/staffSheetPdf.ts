import type { Request, Response } from "express";

export async function handleStaffSheetPdf(req: Request, res: Response) {
  try {
    const runsheetId = parseInt(req.params.runsheetId, 10);
    if (isNaN(runsheetId)) return res.status(400).send("Invalid runsheet ID");

    const user = (req as any).user;
    if (!user) return res.status(401).send("Unauthorised");

    const { getDb } = await import("./db");
    const { runsheets, runsheetItems, fnbItems } = await import("../drizzle/schema");
    const { eq, and } = await import("drizzle-orm");
    const db = await getDb();
    if (!db) return res.status(503).send("DB unavailable");

    // Load runsheet
    const rsRows = await db.select().from(runsheets).where(and(eq(runsheets.id, runsheetId), eq(runsheets.ownerId, user.id)));
    if (!rsRows.length) return res.status(404).send("Runsheet not found");
    const rs = rsRows[0];

    // Load timeline items
    const items = await db.select().from(runsheetItems)
      .where(eq(runsheetItems.runsheetId, runsheetId))
      .orderBy(runsheetItems.sortOrder);

    // Load F&B items
    const fnb = await db.select().from(fnbItems)
      .where(eq(fnbItems.runsheetId, runsheetId))
      .orderBy(fnbItems.sortOrder);

    const fohItems = fnb.filter(f => f.section === "foh");
    const kitchenItems = fnb.filter(f => f.section === "kitchen");

    // Parse metadata from runsheet
    const meta = (rs as any);
    const eventDate = meta.eventDate
      ? new Date(meta.eventDate).toLocaleDateString("en-NZ", { weekday: "long", year: "numeric", month: "long", day: "numeric" })
      : "—";
    const venueName = meta.venueName || "HOSTit Venue";
    const spaceName = meta.spaceName || "";
    const guestCount = meta.guestCount || "";
    const eventType = meta.eventType || "";
    const title = meta.title || "Event Runsheet";

    // Parse dietaries from JSON field
    let dietaryHtml = "";
    try {
      const dietaries: Array<{ name: string; count: number; notes?: string }> = Array.isArray(meta.dietaries) ? meta.dietaries : [];
      if (dietaries.length > 0) {
        dietaryHtml = `
<section>
  <div class="section-title">DIETARY REQUIREMENTS</div>
  <table>
    <thead><tr><th>Requirement</th><th>Count</th><th>Notes</th></tr></thead>
    <tbody>
      ${dietaries.map((d) => `<tr><td>${d.name}</td><td>${d.count}</td><td>${d.notes || "—"}</td></tr>`).join("")}
    </tbody>
  </table>
</section>`;
      }
    } catch {}

    // Timeline HTML
    const CATEGORY_COLORS: Record<string, string> = {
      setup: "#dbeafe", guest: "#f3e8ff", food: "#fef3c7", beverage: "#d1fae5",
      speech: "#fce7f3", entertainment: "#e0e7ff", packdown: "#f3f4f6", other: "#fafaf9",
    };
    const timelineHtml = items.length > 0 ? `
<section>
  <div class="section-title">EVENT TIMELINE</div>
  <table>
    <thead><tr><th style="width:60px">Time</th><th style="width:80px">Duration</th><th>Item</th><th>Assigned To</th><th>Notes</th></tr></thead>
    <tbody>
      ${items.map(item => {
        const bg = CATEGORY_COLORS[(item as any).category] || "#fafaf9";
        return `<tr style="background:${bg}">
          <td><strong>${(item as any).time || "—"}</strong></td>
          <td>${(item as any).duration ? `${(item as any).duration} min` : "—"}</td>
          <td><strong>${(item as any).title}</strong>${(item as any).description ? `<br><span class="sub">${(item as any).description}</span>` : ""}</td>
          <td>${(item as any).assignedTo || "—"}</td>
          <td class="sub">${(item as any).notes || ""}</td>
        </tr>`;
      }).join("")}
    </tbody>
  </table>
</section>` : "";

    // FOH HTML
    const fohHtml = fohItems.length > 0 ? `
<section>
  <div class="section-title">FOH — FOOD & BEVERAGE SERVICE</div>
  <table>
    <thead><tr><th>Course</th><th>Dish</th><th>Qty</th><th>Service Time</th><th>Dietary</th><th>Staff</th></tr></thead>
    <tbody>
      ${fohItems.map(f => `<tr>
        <td>${(f as any).course || "—"}</td>
        <td><strong>${f.dishName}</strong>${f.description ? `<br><span class="sub">${f.description}</span>` : ""}</td>
        <td>${f.qty}</td>
        <td>${(f as any).serviceTime || "—"}</td>
        <td>${(f as any).dietary || "—"}</td>
        <td>${(f as any).staffAssigned || "—"}</td>
      </tr>`).join("")}
    </tbody>
  </table>
</section>` : "";

    // Kitchen HTML
    const kitchenHtml = kitchenItems.length > 0 ? `
<section>
  <div class="section-title">KITCHEN — PREP & PLATING NOTES</div>
  <table>
    <thead><tr><th>Course</th><th>Dish</th><th>Qty</th><th>Service Time</th><th>Prep Notes</th><th>Plating</th></tr></thead>
    <tbody>
      ${kitchenItems.map(f => `<tr>
        <td>${(f as any).course || "—"}</td>
        <td><strong>${f.dishName}</strong></td>
        <td>${f.qty}</td>
        <td>${(f as any).serviceTime || "—"}</td>
        <td class="sub">${(f as any).prepNotes || "—"}</td>
        <td class="sub">${(f as any).platingNotes || "—"}</td>
      </tr>`).join("")}
    </tbody>
  </table>
</section>` : "";

    // Venue setup
    const venueSetupHtml = meta.venueSetup ? `
<section>
  <div class="section-title">VENUE SETUP</div>
  <div class="notes-block">${meta.venueSetup.replace(/\n/g, "<br>")}</div>
</section>` : "";

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Staff Briefing Sheet — ${title}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 10px; color: #1a1a1a; padding: 20px 24px; background: #fff; }
  section { margin-bottom: 16px; page-break-inside: avoid; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 3px solid #6b2737; }
  .venue-name { font-size: 9px; text-transform: uppercase; letter-spacing: 0.12em; color: #6b2737; margin-bottom: 3px; }
  .sheet-title { font-size: 18px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em; }
  .sheet-sub { font-size: 11px; color: #555; margin-top: 3px; }
  .meta-row { display: flex; gap: 24px; flex-wrap: wrap; margin-bottom: 14px; padding: 8px 12px; background: #f5f0ec; border-left: 3px solid #6b2737; }
  .meta-item { display: flex; flex-direction: column; }
  .meta-label { font-size: 8px; text-transform: uppercase; letter-spacing: 0.08em; color: #888; }
  .meta-value { font-size: 11px; font-weight: 700; color: #1a1a1a; }
  .section-title { font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.12em; color: #6b2737; background: #fdf8f5; border-bottom: 1.5px solid #6b2737; padding: 4px 8px; margin-bottom: 0; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #f5f0ec; font-size: 8px; text-transform: uppercase; letter-spacing: 0.06em; color: #555; padding: 4px 6px; text-align: left; border-bottom: 1px solid #ddd; }
  td { padding: 4px 6px; border-bottom: 1px solid #eee; vertical-align: top; font-size: 9.5px; }
  tr:last-child td { border-bottom: none; }
  .sub { color: #666; font-size: 9px; }
  .notes-block { padding: 8px 10px; background: #fafaf9; border: 1px solid #e5e0d8; font-size: 10px; line-height: 1.6; white-space: pre-wrap; }
  .footer { margin-top: 20px; padding-top: 10px; border-top: 1px solid #ddd; font-size: 9px; color: #999; display: flex; justify-content: space-between; }
  .confidential { background: #6b2737; color: #fff; font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; padding: 2px 6px; display: inline-block; }
  @media print { body { padding: 12px 16px; } section { page-break-inside: avoid; } }
</style>
</head>
<body>
<div class="header">
  <div>
    <div class="venue-name">${venueName}${spaceName ? ` · ${spaceName}` : ""}</div>
    <div class="sheet-title">Staff Briefing Sheet</div>
    <div class="sheet-sub">${title}</div>
  </div>
  <div style="text-align:right">
    <div class="confidential">STAFF ONLY</div>
    <div style="font-size:14px;font-weight:800;color:#6b2737;margin-top:4px">${eventDate}</div>
    ${guestCount ? `<div style="font-size:10px;color:#555">${guestCount} guests${eventType ? ` · ${eventType}` : ""}</div>` : ""}
  </div>
</div>
<div class="meta-row">
  ${eventDate !== "—" ? `<div class="meta-item"><span class="meta-label">Event Date</span><span class="meta-value">${eventDate}</span></div>` : ""}
  ${guestCount ? `<div class="meta-item"><span class="meta-label">Guest Count</span><span class="meta-value">${guestCount}</span></div>` : ""}
  ${eventType ? `<div class="meta-item"><span class="meta-label">Event Type</span><span class="meta-value">${eventType}</span></div>` : ""}
  ${spaceName ? `<div class="meta-item"><span class="meta-label">Space</span><span class="meta-value">${spaceName}</span></div>` : ""}
</div>
${venueSetupHtml}
${dietaryHtml}
${timelineHtml}
${fohHtml}
${kitchenHtml}
<div class="footer">
  <span>Generated by HOSTit · ${new Date().toLocaleDateString("en-NZ", { day: "numeric", month: "long", year: "numeric" })}</span>
  <span>STAFF BRIEFING SHEET · ${title} · ${eventDate}</span>
</div>
</body>
</html>`;

    // Render to PDF via Puppeteer
    let puppeteer: any;
    try {
      puppeteer = await import("puppeteer-core");
    } catch {
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
        margin: { top: "15mm", right: "12mm", bottom: "15mm", left: "12mm" },
      });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="StaffSheet-${runsheetId}-${title.replace(/\s+/g, "-")}.pdf"`
      );
      res.send(Buffer.from(pdf));
    } finally {
      await browser.close();
    }
  } catch (err) {
    console.error("[Staff Sheet PDF]", err);
    res.status(500).send("Failed to generate staff sheet");
  }
}
