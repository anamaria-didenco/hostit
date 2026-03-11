import type { Request, Response } from "express";
import { resolveChromiumPath } from "./chromiumPath";

function formatTime12(t: string) {
  if (!t) return "";
  const [hStr, mStr] = t.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function addMinutes(time: string, mins: number) {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + mins;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

const CATEGORY_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  setup:         { bg: "#dbeafe", text: "#1d4ed8", label: "Setup" },
  guest:         { bg: "#f3e8ff", text: "#7e22ce", label: "Guest" },
  food:          { bg: "#fef3c7", text: "#b45309", label: "Food" },
  beverage:      { bg: "#d1fae5", text: "#065f46", label: "Beverage" },
  speech:        { bg: "#fce7f3", text: "#be185d", label: "Speech" },
  entertainment: { bg: "#e0e7ff", text: "#3730a3", label: "Entertainment" },
  packdown:      { bg: "#f3f4f6", text: "#374151", label: "Packdown" },
  other:         { bg: "#f5f5f4", text: "#57534e", label: "Other" },
};

const COURSE_ORDER = [
  "Canapes","Entree","Main","Dessert","Cheese","Late Night Snack",
  "Breakfast","Morning Tea","Lunch","Afternoon Tea","Drinks","Other",
];

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

    const rsRows = await db.select().from(runsheets)
      .where(and(eq(runsheets.id, runsheetId), eq(runsheets.ownerId, user.id)));
    if (!rsRows.length) return res.status(404).send("Runsheet not found");
    const rs = rsRows[0] as any;

    const items = await db.select().from(runsheetItems)
      .where(eq(runsheetItems.runsheetId, runsheetId))
      .orderBy(runsheetItems.sortOrder);

    const fnb = await db.select().from(fnbItems)
      .where(eq(fnbItems.runsheetId, runsheetId))
      .orderBy(fnbItems.sortOrder);

    // Fetch contact info from lead
    let contactName = "", contactPhone = "", contactEmail = "";
    if (rs.leadId) {
      try {
        const { leads } = await import("../drizzle/schema");
        const leadRows = await db.select().from(leads).where(eq(leads.id, rs.leadId)).limit(1);
        if (leadRows[0]) {
          const lead = leadRows[0] as any;
          contactName = [lead.firstName, lead.lastName].filter(Boolean).join(" ");
          contactPhone = lead.phone || "";
          contactEmail = lead.email || "";
        }
      } catch {}
    }

    // Parsed fields
    const eventDate = rs.eventDate
      ? new Date(rs.eventDate).toLocaleDateString("en-NZ", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
      : "";
    const venueName: string = rs.venueName || "";
    const spaceName: string = rs.spaceName || "";
    const guestCount: string = rs.guestCount ? String(rs.guestCount) : "";
    const eventType: string = rs.eventType || "";
    const title: string = rs.title || "Event Runsheet";
    const notes: string = rs.notes || "";
    const venueSetup: string = rs.venueSetup || "";
    const footerText: string = rs.footerText || "";

    let dietaries: Array<{ name: string; count: number; notes?: string }> = [];
    try {
      if (Array.isArray(rs.dietaries)) dietaries = rs.dietaries;
    } catch {}

    const fohItems = fnb.filter(f => f.section === "foh");
    const kitchenItems = fnb.filter(f => f.section === "kitchen");

    // Group F&B by course
    function groupByCourse(arr: typeof fohItems) {
      const groups: Record<string, typeof arr> = {};
      for (const item of arr) {
        const c = (item as any).course || "Other";
        if (!groups[c]) groups[c] = [];
        groups[c].push(item);
      }
      return groups;
    }

    // ── Section: Event Details ───────────────────────────────────────────────
    const detailItems = [
      eventDate ? `<div class="detail-item"><div class="detail-label">DATE</div><div class="detail-value">${eventDate}</div></div>` : "",
      eventType ? `<div class="detail-item"><div class="detail-label">EVENT TYPE</div><div class="detail-value">${eventType}</div></div>` : "",
      guestCount ? `<div class="detail-item"><div class="detail-label">GUESTS</div><div class="detail-value">${guestCount}</div></div>` : "",
      spaceName ? `<div class="detail-item"><div class="detail-label">VENUE / SPACE</div><div class="detail-value">${spaceName}</div></div>` : "",
      contactName ? `<div class="detail-item"><div class="detail-label">CLIENT</div><div class="detail-value">${contactName}</div></div>` : "",
      contactPhone ? `<div class="detail-item"><div class="detail-label">PHONE</div><div class="detail-value">${contactPhone}</div></div>` : "",
      contactEmail ? `<div class="detail-item"><div class="detail-label">EMAIL</div><div class="detail-value">${contactEmail}</div></div>` : "",
    ].filter(Boolean).join("");

    // ── Section: Venue Setup ─────────────────────────────────────────────────
    const venueSetupSection = venueSetup ? `
<div class="card">
  <div class="card-header">VENUE SETUP</div>
  <div class="notes-text">${venueSetup.replace(/\n/g, "<br>")}</div>
</div>` : "";

    // ── Section: Dietary ─────────────────────────────────────────────────────
    const dietarySection = dietaries.length > 0 ? `
<div class="card">
  <div class="card-header">DIETARY REQUIREMENTS</div>
  <div class="dietary-grid">
    ${dietaries.map(d => `
    <div class="dietary-item">
      <div class="dietary-badge">${d.count}×</div>
      <div>
        <div class="dietary-name">${d.name}</div>
        ${d.notes ? `<div class="dietary-notes">${d.notes}</div>` : ""}
      </div>
    </div>`).join("")}
  </div>
</div>` : "";

    // ── Section: Notes ───────────────────────────────────────────────────────
    const notesSection = notes ? `
<div class="card">
  <div class="card-header">NOTES</div>
  <div class="notes-text">${notes.replace(/\n/g, "<br>")}</div>
</div>` : "";

    // ── Section: Timeline ────────────────────────────────────────────────────
    const sortedItems = [...items].sort((a: any, b: any) => {
      if (a.time < b.time) return -1;
      if (a.time > b.time) return 1;
      return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    });

    const timelineSection = sortedItems.length > 0 ? `
<div class="card">
  <div class="card-header timeline-header">
    EVENT TIMELINE
    ${sortedItems.length > 0 ? `<span class="header-sub">${formatTime12((sortedItems[0] as any).time)} – ${formatTime12(addMinutes((sortedItems[sortedItems.length - 1] as any).time, (sortedItems[sortedItems.length - 1] as any).duration ?? 0))}</span>` : ""}
  </div>
  <div class="timeline-head">
    <div class="tl-time">TIME</div>
    <div class="tl-cat">CATEGORY</div>
    <div class="tl-title">ITEM</div>
    <div class="tl-staff">ASSIGNED TO</div>
  </div>
  ${sortedItems.map((item: any) => {
    const cat = CATEGORY_STYLES[item.category] || CATEGORY_STYLES.other;
    const endTime = item.duration ? formatTime12(addMinutes(item.time, item.duration)) : "";
    return `
  <div class="tl-row">
    <div class="tl-time">
      <div class="tl-time-start">${formatTime12(item.time)}</div>
      ${endTime ? `<div class="tl-time-end">${endTime}</div>` : ""}
    </div>
    <div class="tl-cat">
      <span class="cat-badge" style="background:${cat.bg};color:${cat.text}">${cat.label}</span>
      ${item.duration ? `<div class="tl-dur">${item.duration}m</div>` : ""}
    </div>
    <div class="tl-title">
      <div class="tl-item-title">${item.title || "—"}</div>
      ${item.description ? `<div class="tl-item-desc">${item.description}</div>` : ""}
    </div>
    <div class="tl-staff">${item.assignedTo || ""}</div>
  </div>`;
  }).join("")}
</div>` : "";

    // ── Section: F&B FOH ─────────────────────────────────────────────────────
    function renderFnbSection(sectionTitle: string, fnbArr: typeof fohItems) {
      if (!fnbArr.length) return "";
      const grouped = groupByCourse(fnbArr);
      const orderedCourses = COURSE_ORDER.filter(c => grouped[c]);
      const isFoh = sectionTitle.includes("FOH") || sectionTitle.includes("FRONT");
      const lastColHeader = isFoh ? "STAFF" : "PREP / PLATING";

      return `
<div class="card">
  <div class="card-header fnb-header">${sectionTitle}</div>
  <div class="fnb-head">
    <div class="fnb-course">COURSE</div>
    <div class="fnb-dish">DISH</div>
    <div class="fnb-qty">QTY</div>
    <div class="fnb-time">TIME</div>
    <div class="fnb-dietary">DIETARY</div>
    <div class="fnb-staff">${lastColHeader}</div>
  </div>
  ${orderedCourses.map(course => `
  <div class="course-group-header">${course}</div>
  ${grouped[course].map((f: any) => `
  <div class="fnb-row">
    <div class="fnb-course"></div>
    <div class="fnb-dish">
      <div class="fnb-dish-name">${f.dishName}</div>
      ${f.description ? `<div class="fnb-dish-desc">${f.description}</div>` : ""}
    </div>
    <div class="fnb-qty">${f.course === "Drinks" ? "" : f.qty}</div>
    <div class="fnb-time">${f.serviceTime ? formatTime12(f.serviceTime) : ""}</div>
    <div class="fnb-dietary">${f.dietary ? `<span class="dietary-tag">${f.dietary}</span>` : ""}</div>
    <div class="fnb-staff">
      ${isFoh
        ? (f.staffAssigned || "")
        : `${f.prepNotes ? `<div class="prep-note">${f.prepNotes}</div>` : ""}${f.platingNotes ? `<div class="plating-note">${f.platingNotes}</div>` : ""}`
      }
    </div>
  </div>`).join("")}`).join("")}
</div>`;
    }

    const fohSection = renderFnbSection("FRONT OF HOUSE — F&amp;B SERVICE", fohItems);
    const kitchenSection = renderFnbSection("KITCHEN — PREP &amp; PLATING", kitchenItems);

    // ── Build HTML ───────────────────────────────────────────────────────────
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Staff Sheet — ${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'DM Sans', 'Helvetica Neue', Arial, sans-serif;
    font-size: 9.5px;
    color: #1a1209;
    background: #f9f5ef;
    padding: 0;
  }
  .page { padding: 16px 20px; max-width: 210mm; margin: 0 auto; }

  /* ── Header ── */
  .doc-header {
    background: #2d5a27;
    color: white;
    padding: 14px 20px;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 14px;
  }
  .doc-header-left {}
  .doc-type {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 9px;
    letter-spacing: 0.18em;
    color: rgba(255,255,255,0.55);
    margin-bottom: 2px;
  }
  .doc-title {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 22px;
    letter-spacing: 0.04em;
    color: white;
    line-height: 1.1;
  }
  .doc-venue {
    font-family: 'DM Sans', sans-serif;
    font-size: 9px;
    color: rgba(255,255,255,0.6);
    margin-top: 3px;
  }
  .doc-header-right { text-align: right; }
  .doc-badge {
    display: inline-block;
    background: #c9a84c;
    color: #1a1209;
    font-family: 'Bebas Neue', sans-serif;
    font-size: 8px;
    letter-spacing: 0.12em;
    padding: 2px 7px;
    margin-bottom: 5px;
  }
  .doc-date {
    font-family: 'DM Sans', sans-serif;
    font-size: 10px;
    font-weight: 600;
    color: white;
  }
  .doc-sub {
    font-family: 'DM Sans', sans-serif;
    font-size: 8.5px;
    color: rgba(255,255,255,0.55);
    margin-top: 2px;
  }

  /* ── Details row ── */
  .details-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0;
    background: white;
    border: 1px solid rgba(201,168,76,0.35);
    margin-bottom: 10px;
  }
  .detail-item {
    padding: 7px 14px;
    border-right: 1px solid rgba(201,168,76,0.25);
    min-width: 80px;
  }
  .detail-item:last-child { border-right: none; }
  .detail-label {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 7.5px;
    letter-spacing: 0.1em;
    color: rgba(26,18,9,0.45);
    margin-bottom: 2px;
  }
  .detail-value {
    font-family: 'DM Sans', sans-serif;
    font-size: 9.5px;
    font-weight: 600;
    color: #1a1209;
  }

  /* ── Cards ── */
  .card {
    background: white;
    border: 1px solid rgba(201,168,76,0.35);
    margin-bottom: 10px;
    page-break-inside: avoid;
  }
  .card-header {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 9px;
    letter-spacing: 0.16em;
    color: white;
    background: #2d5a27;
    padding: 5px 12px;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .fnb-header { background: #1a3518; }
  .timeline-header { background: #2d5a27; }
  .header-sub {
    font-family: 'DM Sans', sans-serif;
    font-size: 8px;
    color: rgba(255,255,255,0.5);
    font-weight: 400;
    letter-spacing: 0;
  }
  .notes-text {
    padding: 9px 12px;
    font-size: 9.5px;
    line-height: 1.65;
    color: #3a2e1e;
    white-space: pre-wrap;
  }

  /* ── Dietary ── */
  .dietary-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 9px 12px;
  }
  .dietary-item {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    background: #f9f5ef;
    border: 1px solid rgba(201,168,76,0.3);
    padding: 5px 8px;
    min-width: 120px;
  }
  .dietary-badge {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 13px;
    color: #2d5a27;
    line-height: 1;
  }
  .dietary-name {
    font-size: 9px;
    font-weight: 600;
    color: #1a1209;
  }
  .dietary-notes {
    font-size: 8px;
    color: rgba(26,18,9,0.5);
    margin-top: 1px;
  }

  /* ── Timeline ── */
  .timeline-head {
    display: grid;
    grid-template-columns: 60px 80px 1fr 90px;
    gap: 6px;
    padding: 4px 10px;
    background: rgba(201,168,76,0.12);
    border-bottom: 1px solid rgba(201,168,76,0.3);
    font-family: 'Bebas Neue', sans-serif;
    font-size: 7.5px;
    letter-spacing: 0.1em;
    color: rgba(26,18,9,0.45);
  }
  .tl-row {
    display: grid;
    grid-template-columns: 60px 80px 1fr 90px;
    gap: 6px;
    padding: 5px 10px;
    border-bottom: 1px solid rgba(201,168,76,0.15);
    align-items: start;
  }
  .tl-row:last-child { border-bottom: none; }
  .tl-time { }
  .tl-time-start { font-weight: 700; font-size: 9.5px; }
  .tl-time-end { font-size: 8px; color: rgba(26,18,9,0.4); }
  .tl-cat {}
  .cat-badge {
    display: inline-block;
    font-family: 'Bebas Neue', sans-serif;
    font-size: 7.5px;
    letter-spacing: 0.08em;
    padding: 1.5px 5px;
  }
  .tl-dur {
    font-size: 7.5px;
    color: rgba(26,18,9,0.4);
    margin-top: 2px;
  }
  .tl-item-title { font-weight: 600; font-size: 9.5px; }
  .tl-item-desc { font-size: 8.5px; color: rgba(26,18,9,0.55); margin-top: 1px; }
  .tl-staff { font-size: 8.5px; color: #2d5a27; }

  /* ── F&B table ── */
  .fnb-head {
    display: grid;
    grid-template-columns: 65px 1fr 30px 50px 65px 1fr;
    gap: 6px;
    padding: 4px 10px;
    background: rgba(201,168,76,0.12);
    border-bottom: 1px solid rgba(201,168,76,0.3);
    font-family: 'Bebas Neue', sans-serif;
    font-size: 7.5px;
    letter-spacing: 0.1em;
    color: rgba(26,18,9,0.45);
  }
  .fnb-row {
    display: grid;
    grid-template-columns: 65px 1fr 30px 50px 65px 1fr;
    gap: 6px;
    padding: 4px 10px;
    border-bottom: 1px solid rgba(201,168,76,0.12);
    align-items: start;
  }
  .fnb-row:last-child { border-bottom: none; }
  .course-group-header {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 8px;
    letter-spacing: 0.12em;
    color: #8b6914;
    background: rgba(201,168,76,0.1);
    padding: 3px 10px;
    border-bottom: 1px solid rgba(201,168,76,0.2);
  }
  .fnb-dish-name { font-weight: 600; font-size: 9.5px; }
  .fnb-dish-desc { font-size: 8px; color: rgba(26,18,9,0.45); margin-top: 1px; }
  .dietary-tag {
    display: inline-block;
    background: #d1fae5;
    color: #065f46;
    font-family: 'Bebas Neue', sans-serif;
    font-size: 7.5px;
    letter-spacing: 0.06em;
    padding: 1px 4px;
  }
  .prep-note { font-size: 8.5px; color: rgba(26,18,9,0.6); }
  .plating-note { font-size: 8px; color: rgba(26,18,9,0.4); margin-top: 1px; font-style: italic; }

  /* ── Footer ── */
  .doc-footer {
    margin-top: 16px;
    padding-top: 8px;
    border-top: 1px solid rgba(201,168,76,0.35);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .footer-left {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 8px;
    letter-spacing: 0.1em;
    color: rgba(26,18,9,0.3);
  }
  .footer-right {
    font-family: 'DM Sans', sans-serif;
    font-size: 7.5px;
    color: rgba(26,18,9,0.3);
  }

  @media print {
    body { background: white; }
    .card { page-break-inside: avoid; }
  }
</style>
</head>
<body>

<div class="doc-header">
  <div class="doc-header-left">
    <div class="doc-type">FUNCTION RUNSHEET — STAFF COPY</div>
    <div class="doc-title">${title}</div>
    ${venueName ? `<div class="doc-venue">${venueName}${spaceName ? ` · ${spaceName}` : ""}</div>` : ""}
  </div>
  <div class="doc-header-right">
    <div class="doc-badge">STAFF ONLY</div>
    ${eventDate ? `<div class="doc-date">${eventDate}</div>` : ""}
    ${guestCount || eventType ? `<div class="doc-sub">${[guestCount ? `${guestCount} guests` : "", eventType].filter(Boolean).join(" · ")}</div>` : ""}
  </div>
</div>

<div class="page">

  ${detailItems ? `<div class="details-row">${detailItems}</div>` : ""}

  ${venueSetupSection}
  ${dietarySection}
  ${notesSection}
  ${timelineSection}
  ${fohSection}
  ${kitchenSection}

  ${footerText ? `
<div class="card" style="border-color:rgba(201,168,76,0.5);background:#fdf9f0;">
  <div class="card-header" style="background:#8b6914;">PAYMENT &amp; NOTES</div>
  <div class="notes-text" style="font-size:9.5px;color:#4a3800;">${footerText.replace(/\n/g, "<br>")}</div>
</div>` : ""}

  <div class="doc-footer">
    <div class="footer-left">POWERED BY HOSTIT · STAFF BRIEFING SHEET</div>
    <div class="footer-right">Generated ${new Date().toLocaleDateString("en-NZ", { day: "numeric", month: "long", year: "numeric" })}</div>
  </div>

</div>
</body>
</html>`;

    // ── Render to PDF via Puppeteer ──────────────────────────────────────────
    let puppeteer: any;
    try {
      puppeteer = await import("puppeteer-core");
    } catch {
      res.setHeader("Content-Type", "text/html");
      return res.send(html);
    }
    const browser = await puppeteer.launch({
      executablePath: await resolveChromiumPath(),
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
      headless: true,
    });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "networkidle0" });
      const pdf = await page.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: "0mm", right: "0mm", bottom: "12mm", left: "0mm" },
      });
      const safeTitle = title.replace(/[^a-zA-Z0-9\-_]/g, "-").replace(/-+/g, "-").slice(0, 50);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="StaffSheet-${safeTitle}.pdf"`);
      res.send(Buffer.from(pdf));
    } finally {
      await browser.close();
    }
  } catch (err) {
    console.error("[Staff Sheet PDF]", err);
    res.status(500).send("Failed to generate staff sheet");
  }
}
