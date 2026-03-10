/**
 * Floor Plan PDF Generator
 * Builds an SVG-based HTML page from canvasData and renders it via Puppeteer.
 * Route: GET /api/floor-plan-pdf/:token  (public — token acts as auth)
 */
import type { Request, Response } from "express";
import { resolveChromiumPath } from "./chromiumPath";
import { getDb } from "./db";
import { floorPlans } from "../drizzle/schema";
import { eq } from "drizzle-orm";

const ROUND_TYPES = new Set([
  "round-table-6", "round-table-8", "cocktail-table", "chair", "plant", "pillar",
]);

function isRound(type: string) {
  return ROUND_TYPES.has(type) || type.startsWith("custom-round");
}

function elementToSvg(el: any): string {
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  const color = el.color ?? "#888";
  const round = isRound(el.type);
  const isText = el.type === "text";
  const label = el.label ?? "";
  const seats = el.seats ?? 0;
  const rx = el.width / 2;
  const ry = el.height / 2;

  const transform = el.rotation
    ? `transform="rotate(${el.rotation} ${cx} ${cy})"`
    : "";

  if (isText) {
    return `
      <rect x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}"
        fill="none" stroke="#ccc" stroke-dasharray="4,3" rx="2" ${transform} />
      <text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle"
        font-size="12" font-weight="600" fill="${color}" ${transform}>${label}</text>`;
  }

  const shape = round
    ? `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${color}" stroke="rgba(0,0,0,0.2)" stroke-width="1.5" ${transform} />`
    : `<rect x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}"
         fill="${color}" stroke="rgba(0,0,0,0.2)" stroke-width="1.5" rx="3" ${transform} />`;

  const textY = seats > 0 ? cy - 5 : cy;
  const labelSvg = label
    ? `<text x="${cx}" y="${textY}" text-anchor="middle" dominant-baseline="middle"
         font-size="9" font-weight="600" fill="rgba(255,255,255,0.92)" ${transform}>${label}</text>`
    : "";
  const seatsSvg = seats > 0
    ? `<text x="${cx}" y="${cy + 8}" text-anchor="middle" dominant-baseline="middle"
         font-size="8" fill="rgba(255,255,255,0.7)" ${transform}>${seats} seats</text>`
    : "";

  return `${shape}${labelSvg}${seatsSvg}`;
}

function buildHtml(plan: any): string {
  const data = plan.canvasData ?? { width: 900, height: 600, elements: [] };
  const { width, height, elements } = data;
  const totalSeats = elements.reduce((s: number, el: any) => s + (el.seats ?? 0), 0);
  const tableCount = elements.filter((el: any) => el.type.includes("table")).length;
  const today = new Date().toLocaleDateString("en-NZ", { day: "numeric", month: "long", year: "numeric" });

  const svgElements = (elements as any[]).map(elementToSvg).join("\n");

  const gridLines = (() => {
    const lines = [];
    for (let x = 0; x <= width; x += 20) lines.push(`<line x1="${x}" y1="0" x2="${x}" y2="${height}" />`);
    for (let y = 0; y <= height; y += 20) lines.push(`<line x1="0" y1="${y}" x2="${width}" y2="${y}" />`);
    return lines.join("\n");
  })();

  const bgImg = plan.bgImageUrl
    ? `<image href="${plan.bgImageUrl}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet" opacity="0.25" />`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>${plan.name ?? "Floor Plan"}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'DM Sans', 'Inter', sans-serif; background: #fff; color: #1a1a1a; }
  .page { padding: 32px 40px; max-width: 1100px; margin: 0 auto; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #2D4A3E; }
  .title { font-size: 24pt; font-weight: 700; color: #1a1a1a; }
  .meta { font-size: 9pt; color: #666; text-align: right; line-height: 1.8; }
  .meta strong { color: #2D4A3E; font-size: 10pt; }
  .canvas-wrap { border: 1px solid #d1c9bc; box-shadow: 0 2px 12px rgba(0,0,0,0.08); margin-bottom: 24px; overflow: hidden; }
  .footer { display: flex; justify-content: space-between; font-size: 8.5pt; color: #999; border-top: 1px solid #e5e0d8; padding-top: 12px; }
  .stats { display: flex; gap: 24px; margin-bottom: 16px; }
  .stat { background: #f5f0eb; border: 1px solid #e5e0d8; padding: 8px 16px; border-radius: 3px; }
  .stat-label { font-size: 8pt; color: #888; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; }
  .stat-value { font-size: 16pt; font-weight: 700; color: #2D4A3E; line-height: 1.2; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div>
      <div class="title">${plan.name ?? "Floor Plan"}</div>
      <div style="font-size:10pt;color:#666;margin-top:4px;">Event Floor Plan</div>
    </div>
    <div class="meta">
      <div><strong>HOSTit</strong></div>
      <div>Generated ${today}</div>
    </div>
  </div>

  <div class="stats">
    <div class="stat">
      <div class="stat-label">Tables</div>
      <div class="stat-value">${tableCount}</div>
    </div>
    <div class="stat">
      <div class="stat-label">Total Seats</div>
      <div class="stat-value">${totalSeats}</div>
    </div>
    <div class="stat">
      <div class="stat-label">Elements</div>
      <div class="stat-value">${elements.length}</div>
    </div>
  </div>

  <div class="canvas-wrap">
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"
      style="display:block;max-width:100%;height:auto;">
      <!-- Background -->
      <rect width="${width}" height="${height}" fill="#faf9f7" />
      <!-- Grid -->
      <g stroke="rgba(0,0,0,0.05)" stroke-width="1">
        ${gridLines}
      </g>
      <!-- Background image -->
      ${bgImg}
      <!-- Elements -->
      ${svgElements}
    </svg>
  </div>

  <div class="footer">
    <div>Floor plan created with HOSTit · Event CRM for NZ Venues</div>
    <div>${today}</div>
  </div>
</div>
</body>
</html>`;
}

export async function handleFloorPlanPdf(req: Request, res: Response) {
  const { token } = req.params as { token: string };
  if (!token) return res.status(400).json({ error: "Missing token" });

  try {
    const db = await getDb();
    if (!db) return res.status(503).json({ error: "Database unavailable" });

    const [plan] = await db.select().from(floorPlans).where(eq(floorPlans.shareToken, token)).limit(1);
    if (!plan) return res.status(404).json({ error: "Floor plan not found or share link expired" });

    const html = buildHtml(plan);

    const puppeteer = await import("puppeteer-core");
    const browser = await puppeteer.launch({
      executablePath: await resolveChromiumPath(),
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
      headless: true,
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdfBuffer = await page.pdf({
      format: "A3",
      landscape: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
      printBackground: true,
    });
    await browser.close();

    const safeName = (plan.name ?? "floor-plan").replace(/[^a-z0-9]/gi, "_").toLowerCase();
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${safeName}.pdf"`);
    res.setHeader("Content-Length", pdfBuffer.length);
    res.end(pdfBuffer);
  } catch (err) {
    console.error("[FloorPlanPDF] Error:", err);
    res.status(500).json({ error: "Failed to generate PDF" });
  }
}
