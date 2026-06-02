/**
 * BEO (Banquet Event Order) PDF Generator
 * VenueFlow branded, comprehensive event order document.
 * Route: GET /api/beo/:bookingId
 */
import type { Request, Response } from "express";
import path from "path";
import fs from "fs";
import { resolveChromiumPath } from "./chromiumPath";
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
  leads,
  menuPackages,
  menuItems,
} from "../drizzle/schema";
import { eq, and, inArray } from "drizzle-orm";

const VENUE_AREA_LABELS: Record<string, string> = {
  bar: "Bar",
  restaurant: "Restaurant",
  full_venue: "Both",
};

const BAR_LABELS: Record<string, string> = {
  bar_tab: "Bar Tab",
  cash_bar: "Cash Bar",
  bar_tab_then_cash: "Bar Tab then Cash Bar",
  unlimited: "Unlimited Bar Tab",
};

const COURSE_ORDER = [
  "Canapes","Entree","Main","Dessert","Cheese","Late Night Snack",
  "Breakfast","Morning Tea","Lunch","Afternoon Tea","Drinks","Other",
];

function fmt12(t: string | null | undefined): string {
  if (!t) return "";
  const [hStr, mStr] = t.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function fmtDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-NZ", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

function fmtCurrency(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === "") return "—";
  return `$${Number(v).toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function groupByCourse(items: any[]) {
  const groups: Record<string, any[]> = {};
  for (const item of items) {
    const c = item.course || "Other";
    if (!groups[c]) groups[c] = [];
    groups[c].push(item);
  }
  return groups;
}

/**
 * Finds menu packages whose items appear on this booking's F&B list,
 * loads any attached PDFs from disk, and appends their pages onto the
 * end of the BEO PDF. No-op when nothing matches.
 *
 * Match strategy: dish names on fnb_items → menu_items.name (case-
 * insensitive) → distinct package IDs → menuPackages.pdfUrl. This way
 * we only include menus the kitchen is actually cooking from, not every
 * menu the venue has on file.
 */
async function appendLinkedMenuPdfs(opts: {
  beoPdfBytes: Uint8Array;
  db: any;
  userId: number;
  fnbList: any[];
}): Promise<Uint8Array> {
  const { beoPdfBytes, db, userId, fnbList } = opts;
  const dishNames = Array.from(new Set(
    fnbList.map(i => String(i.dishName || "").trim().toLowerCase()).filter(Boolean)
  ));
  if (dishNames.length === 0) return beoPdfBytes;

  // Look up matching menu items for this owner. We compare normalised
  // (lowercase + trimmed) names so casing differences between the
  // saved F&B row and the menu library don't miss a match.
  const allItems = await db.select({ name: menuItems.name, packageId: menuItems.packageId })
    .from(menuItems)
    .where(eq(menuItems.ownerId, userId));
  const packageIds = new Set<number>();
  for (const mi of allItems) {
    if (dishNames.includes(String(mi.name || "").trim().toLowerCase())) {
      packageIds.add(mi.packageId);
    }
  }
  if (packageIds.size === 0) return beoPdfBytes;

  const pkgs = await db.select().from(menuPackages)
    .where(and(eq(menuPackages.ownerId, userId), inArray(menuPackages.id, Array.from(packageIds))));
  const pdfPkgs = pkgs.filter((p: any) => p.pdfUrl && /\.pdf$/i.test(p.pdfUrl));
  if (pdfPkgs.length === 0) return beoPdfBytes;

  const { PDFDocument } = await import("pdf-lib");
  const uploadsDir = path.join(process.cwd(), "public", "uploads");
  const merged = await PDFDocument.load(beoPdfBytes);

  for (const pkg of pdfPkgs) {
    // pdfUrl is stored as "/uploads/<name>.pdf". Strip the prefix and
    // resolve against the on-disk uploads dir. Reject anything that
    // escapes uploadsDir (path traversal guard).
    const rel = String(pkg.pdfUrl).replace(/^\/uploads\//, "");
    const filePath = path.resolve(uploadsDir, rel);
    if (!filePath.startsWith(uploadsDir + path.sep)) {
      console.warn("[BEO PDF] refusing menu PDF outside uploads dir:", pkg.pdfUrl);
      continue;
    }
    if (!fs.existsSync(filePath)) {
      console.warn("[BEO PDF] menu PDF missing on disk:", filePath);
      continue;
    }
    try {
      const bytes = fs.readFileSync(filePath);
      const src = await PDFDocument.load(bytes);
      const pages = await merged.copyPages(src, src.getPageIndices());
      for (const p of pages) merged.addPage(p);
    } catch (e) {
      console.warn("[BEO PDF] could not merge menu PDF:", pkg.pdfUrl, e);
    }
  }

  return await merged.save();
}

export async function handleBeoPdf(req: Request, res: Response) {
  return _renderBeo(req, res, "auth");
}

export async function handleBeoPdfPublic(req: Request, res: Response) {
  return _renderBeo(req, res, "token");
}

async function _renderBeo(req: Request, res: Response, mode: "auth" | "token") {
  const isPublic = mode === "token";
  try {
    const db = await getDb();
    if (!db) return res.status(503).send("Database unavailable");

    let booking: any = null;
    let userId: number;

    if (mode === "token") {
      const token = String(req.params.token || "").trim();
      if (!token) return res.status(400).send("Invalid token");
      const [b] = await db.select().from(bookings)
        .where(eq(bookings.beoShareToken, token)).limit(1);
      if (!b) return res.status(404).send("Event pack not found or link revoked");
      booking = b;
      userId = b.ownerId;
    } else {
      const bookingId = parseInt(req.params.bookingId, 10);
      if (isNaN(bookingId)) return res.status(400).send("Invalid booking ID");
      const sessionUserId: number | undefined = (req as any).user?.id;
      if (!sessionUserId) return res.status(401).send("Unauthorised");
      const [b] = await db.select().from(bookings)
        .where(and(eq(bookings.id, bookingId), eq(bookings.ownerId, sessionUserId)))
        .limit(1);
      if (!b) return res.status(404).send("Booking not found");
      booking = b;
      userId = sessionUserId;
    }
    const bookingId = booking.id;

    // ── Print View hide list ───────────────────────────────────────
    // Operator-controlled section toggles, sent as ?hide=key1,key2
    // from the runsheet's Print View editor. Public event-pack route
    // ignores them (guests always get the curated public view).
    const hideRaw = mode === "auth" ? String((req.query.hide as string) || "") : "";
    const hideSet = new Set(
      hideRaw.split(",").map(s => s.trim().toLowerCase()).filter(Boolean)
    );
    const show = (key: string, html: string) => hideSet.has(key) ? "" : html;

    const [venue] = await db.select().from(venueSettings)
      .where(eq(venueSettings.ownerId, userId)).limit(1);

    // Lead contact info
    let leadPhone = "", leadEmail = "";
    if (booking.leadId) {
      try {
        const [lead] = await db.select().from(leads).where(eq(leads.id, booking.leadId)).limit(1);
        if (lead) { leadPhone = (lead as any).phone || ""; leadEmail = (lead as any).email || booking.email || ""; }
      } catch {}
    }
    if (!leadEmail) leadEmail = booking.email || "";

    // Linked runsheet — match by bookingId first; fall back to leadId
    // (runsheets created via the unified event drawer / lead pipeline have
    // bookingId=NULL but leadId set, so without this fallback the BEO would
    // miss all F&B, drinks and event-time data)
    let [runsheet] = await db.select().from(runsheets)
      .where(and(eq(runsheets.bookingId, bookingId), eq(runsheets.ownerId, userId)))
      .limit(1);
    if (!runsheet && booking.leadId) {
      const { isNull, desc } = await import("drizzle-orm");
      const [rsByLead] = await db.select().from(runsheets)
        .where(and(
          eq(runsheets.leadId, booking.leadId),
          eq(runsheets.ownerId, userId),
          isNull(runsheets.bookingId),
        ))
        .orderBy(desc(runsheets.updatedAt))
        .limit(1);
      runsheet = rsByLead;
    }

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
    let proposal: any = null;
    let drinks: any = null;
    let quoteSettingsRow: any = null;
    let quoteItemsList: any[] = [];

    if (booking.proposalId) {
      const [p] = await db.select().from(proposals)
        .where(and(eq(proposals.id, booking.proposalId), eq(proposals.ownerId, userId))).limit(1);
      proposal = p ?? null;
      const [d] = await db.select().from(proposalDrinks)
        .where(eq(proposalDrinks.proposalId, booking.proposalId)).limit(1);
      drinks = d ?? null;
      const [qs] = await db.select().from(quoteSettings)
        .where(eq(quoteSettings.proposalId, booking.proposalId)).limit(1);
      quoteSettingsRow = qs ?? null;
      quoteItemsList = await db.select().from(quoteItems)
        .where(eq(quoteItems.proposalId, booking.proposalId));
    }

    // Prefer runsheet's drinksData (which includes barNotes saved from RunsheetBuilder).
    // Merge over proposalDrinks so runsheet edits win, but proposal data still acts as fallback.
    const rsDrinks = (runsheet as any)?.drinksData;
    if (rsDrinks && (rsDrinks.barOption || rsDrinks.barNotes || (rsDrinks.selectedDrinks ?? []).length > 0 || (rsDrinks.customDrinks ?? []).length > 0 || rsDrinks.tabAmount)) {
      drinks = { ...(drinks ?? {}), ...rsDrinks };
    }

    // ── Extracted values ─────────────────────────────────────────────────────
    const venueName = venue?.name ?? "Venue";
    const venueAddress = [venue?.addressLine1, venue?.city].filter(Boolean).join(", ");
    const venueLogoUrl = venue?.logoUrl ?? "";
    // White-label the BEO header / accents to the operator's brand colour.
    // Falls back to VenueFlow's default brand blue when none is configured.
    const venuePrimaryColor = (venue as any)?.primaryColor ?? "#6b98e7";
    const clientName = `${booking.firstName}${booking.lastName ? " " + booking.lastName : ""}`;
    const eventDate = fmtDate(booking.eventDate);
    const eventTime = booking.eventDate ? fmt12(new Date(booking.eventDate).toTimeString().slice(0,5)) : "";
    const endTimeRaw = booking.eventEndDate ? new Date(booking.eventEndDate).toTimeString().slice(0,5) : "";
    const endTime = endTimeRaw ? fmt12(endTimeRaw) : "";

    // Prefer runsheet times if set
    const rsStartTime = runsheet ? (runsheet as any).eventStartTime : "";
    const rsEndTime = runsheet ? (runsheet as any).eventEndTime : "";
    const displayStartTime = rsStartTime ? fmt12(rsStartTime) : eventTime;
    const displayEndTime = rsEndTime ? fmt12(rsEndTime) : endTime;
    const timeRange = displayStartTime
      ? (displayEndTime ? `${displayStartTime} – ${displayEndTime}` : displayStartTime)
      : "—";

    const venueArea = runsheet ? ((runsheet as any).venueArea ?? "") : "";
    const venueAreaLabel = VENUE_AREA_LABELS[venueArea] ?? "";
    const spaceName = (runsheet as any)?.spaceName ?? booking.spaceName ?? "";
    const guestCount = booking.guestCount ?? runsheet?.guestCount ?? "";
    const eventType = booking.eventType ?? (runsheet as any)?.eventType ?? "";
    const dietaries: { name: string; count: number; notes?: string }[] = (runsheet as any)?.dietaries ?? [];
    const venueSetup = (runsheet as any)?.venueSetup ?? "";
    // Internal-only fields — never surfaced via the public event-pack link.
    const rsNotes = isPublic ? "" : ((runsheet as any)?.notes ?? "");
    const bookingNotes = isPublic ? "" : ((booking as any).notes ?? "");
    // Footer note — a closing message (payment terms, thank-you, etc.) shown to
    // everyone, including the public event-pack link.
    const footerNote = ((runsheet as any)?.footerText ?? "").toString();
    const fnbCols = (runsheet as any)?.fnbColumns ?? {};
    const showQty = fnbCols.qty !== false;

    const fohItems = fnbList.filter(i => i.section === "foh");
    const kitchenItemsArr = fnbList.filter(i => i.section === "kitchen");

    // ── HTML helpers ─────────────────────────────────────────────────────────
    const logoHtml = venueLogoUrl
      ? `<img src="${venueLogoUrl}" alt="${venueName}" style="height:40px;max-width:120px;object-fit:contain;display:block;">`
      : `<div style="font-family:'Bebas Neue',sans-serif;font-size:22px;color:white;letter-spacing:0.04em;">${venueName}</div>`;

    // Details grid — public event-pack hides financials (DEPOSIT), internal
    // workflow info (STATUS), and contact PII (EMAIL/PHONE) since the link
    // may be forwarded beyond the original recipient.
    const detailCells = [
      { label: "CLIENT", value: clientName },
      { label: "EVENT TYPE", value: eventType || "—" },
      { label: "DATE", value: eventDate || "—" },
      { label: "TIME", value: timeRange },
      { label: "GUESTS", value: guestCount ? String(guestCount) : "—" },
      { label: "SPACE / ROOM", value: [venueAreaLabel, spaceName].filter(Boolean).join(" · ") || "—" },
      ...(isPublic ? [] : [
        { label: "EMAIL", value: leadEmail || "—" },
        { label: "PHONE", value: leadPhone || booking.phone || "—" },
        { label: "DEPOSIT", value: booking.depositNzd ? fmtCurrency(booking.depositNzd) + (booking.depositPaid ? " ✓ Paid" : " — Outstanding") : "—" },
        { label: "STATUS", value: (booking.status ?? "").replace(/_/g, " ").toUpperCase() },
      ]),
    ].filter(c => c.value && c.value !== "—");

    // Venue setup section
    const setupSection = venueSetup ? `
<div class="card">
  <div class="card-header">VENUE SETUP</div>
  <div class="card-body notes-text">${venueSetup}</div>
</div>` : "";

    // Dietary section — high-attention amber treatment so chefs can scan
    // allergies/diets in one glance.
    const dietarySection = dietaries.length > 0 ? `
<div class="card dietary-card">
  <div class="card-header dietary-header">⚠ DIETARY REQUIREMENTS</div>
  <div class="card-body">
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
  </div>
</div>` : "";

    // Timeline section
    const timelineSection = timelineItems.length > 0 ? `
<div class="card">
  <div class="card-header">EVENT TIMELINE</div>
  <div class="tl-head">
    <div class="tl-time">TIME</div>
    <div class="tl-title">ITEM</div>
    <div class="tl-dur">DUR.</div>
    <div class="tl-staff">ASSIGNED TO</div>
  </div>
  ${timelineItems.map((item: any) => `
  <div class="tl-row">
    <div class="tl-time"><strong>${fmt12(item.time)}</strong></div>
    <div class="tl-title">
      <div class="item-title">${item.title || "—"}</div>
      ${item.description ? `<div class="item-desc">${item.description}</div>` : ""}
    </div>
    <div class="tl-dur">${item.duration ? item.duration + "m" : ""}</div>
    <div class="tl-staff">${item.assignedTo || "—"}</div>
  </div>`).join("")}
</div>` : "";

    // F&B section renderer
    const renderFnbSection = (title: string, items: any[], isKitchen = false) => {
      if (!items.length) return "";
      // Public event-pack hides internal kitchen prep/plating + staff
      // assignments — guests don't need (and shouldn't see) operational detail.
      if (isPublic && isKitchen) return "";
      const grouped = groupByCourse(items);
      // Food first, drinks last — always. Custom courses (e.g. "Shared
      // Menu") were sliding in after Drinks because they weren't in
      // COURSE_ORDER. Pin Drinks to the tail no matter what.
      const isDrinks = (c: string) => c.toLowerCase() === 'drinks';
      const food = COURSE_ORDER.filter(c => !isDrinks(c) && grouped[c]);
      const custom = Object.keys(grouped).filter(c => !isDrinks(c) && !COURSE_ORDER.includes(c));
      const drinkKeys = Object.keys(grouped).filter(isDrinks);
      const allCourses = [...food, ...custom, ...drinkKeys];
      const showLastCol = !isPublic;
      const lastColHeader = isKitchen ? "PREP / PLATING" : "STAFF";

      return `
<div class="card">
  <div class="card-header ${isKitchen ? 'card-header-dark' : ''}">${title}</div>
  <div class="fnb-head">
    <div class="fnb-course">COURSE</div>
    <div class="fnb-dish">DISH</div>
    ${showQty ? `<div class="fnb-qty">QTY</div>` : ""}
    <div class="fnb-time">TIME</div>
    <div class="fnb-diet">DIETARY</div>
    ${showLastCol ? `<div class="fnb-last">${lastColHeader}</div>` : ""}
  </div>
  ${allCourses.map(course => {
    const isDrink = course === "Drinks";
    return `
  <div class="course-block">
    <div class="course-group${isDrink ? ' is-drink' : ''}">${course}</div>
    ${(grouped[course] ?? []).map((f: any) => `
    <div class="fnb-row${isDrink ? ' is-drink' : ''}">
      <div class="fnb-course"></div>
      <div class="fnb-dish">
        <div class="dish-name">${f.dishName}</div>
        ${f.description ? `<div class="dish-desc">${f.description}</div>` : ""}
      </div>
      ${showQty ? `<div class="fnb-qty">${course === "Drinks" ? "" : (f.qty ?? 1)}</div>` : ""}
      <div class="fnb-time">${f.serviceTime ? fmt12(f.serviceTime) : ""}</div>
      <div class="fnb-diet">${f.dietary ? `<span class="diet-tag">${f.dietary}</span>` : ""}</div>
      ${showLastCol ? `<div class="fnb-last">
        ${isKitchen
          ? `${f.prepNotes ? `<div class="prep-note">${f.prepNotes}</div>` : ""}${f.platingNotes ? `<div class="plating-note">${f.platingNotes}</div>` : ""}`
          : (f.staffAssigned || "")
        }
      </div>` : ""}
    </div>`).join("")}
  </div>`;
  }).join("")}
</div>`;
    }

    // Bar section — arrangement & notes only. The actual drinks list is
    // rendered inside the Food & Beverage Selection table above, so we
    // intentionally don't duplicate it here.
    const barNotes = (drinks as any)?.barNotes as string | undefined;
    const hasBarInfo = drinks && (drinks.barOption || drinks.tabAmount || barNotes);
    const barSection = hasBarInfo ? `
<div class="card">
  <div class="card-header">BAR ARRANGEMENT</div>
  <div class="card-body">
    ${drinks.barOption ? `<div class="detail-row"><span class="detail-label">Bar Arrangement</span><span class="detail-value">${BAR_LABELS[drinks.barOption] ?? drinks.barOption}</span></div>` : ""}
    ${drinks.tabAmount ? `<div class="detail-row"><span class="detail-label">Bar Tab Amount</span><span class="detail-value">${fmtCurrency(drinks.tabAmount)}</span></div>` : ""}
    ${barNotes ? `
    <div style="margin-top:8px;padding:8px 10px;background:#f5f2eb;border-left:3px solid ${venuePrimaryColor}">
      <div class="detail-label" style="margin-bottom:4px">Bar Notes</div>
      <div style="font-size:9.5px;line-height:1.55;color:#1a1209;white-space:pre-wrap">${(barNotes as string).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>')}</div>
    </div>` : ""}
  </div>
</div>` : "";

    // Financials section — hidden on public event-pack to avoid exposing
    // deposit status / margin breakdown / pricing line items to anyone with
    // the link. The customer already has their proposal for that.
    const financialsSection = !isPublic && (quoteSettingsRow || quoteItemsList.length > 0 || booking.totalNzd) ? `
<div class="card">
  <div class="card-header">FINANCIALS</div>
  <div class="card-body">
    ${quoteSettingsRow?.minimumSpend ? `<div class="detail-row"><span class="detail-label">Minimum Spend</span><span class="detail-value">${fmtCurrency(quoteSettingsRow.minimumSpend)}</span></div>` : ""}
    ${booking.totalNzd ? `<div class="detail-row"><span class="detail-label">Total</span><span class="detail-value">${fmtCurrency(booking.totalNzd)}</span></div>` : ""}
    ${booking.depositNzd ? `<div class="detail-row"><span class="detail-label">Deposit</span><span class="detail-value">${fmtCurrency(booking.depositNzd)} ${booking.depositPaid ? "✓ Paid" : "— Outstanding"}</span></div>` : ""}
    ${quoteItemsList.length > 0 ? `
    <div style="margin-top:8px;border-top:1px solid rgba(201,168,76,0.3);padding-top:8px">
      ${quoteItemsList.map(qi => `<div class="detail-row"><span class="detail-label">${qi.name ?? qi.label}</span><span class="detail-value">${fmtCurrency(qi.unitPrice ?? qi.amount)}</span></div>`).join("")}
    </div>` : ""}
  </div>
</div>` : "";

    // Notes section
    const allNotes = [rsNotes, bookingNotes].filter(Boolean).join("\n\n").trim();
    const notesSection = allNotes ? `
<div class="card">
  <div class="card-header">NOTES</div>
  <div class="card-body notes-text">${allNotes.replace(/\n/g, "<br>")}</div>
</div>` : "";

    // Footer note section — rich HTML from the runsheet footer box.
    const footerNoteSection = footerNote.trim() ? `
<div class="card">
  <div class="card-header">FOOTER NOTE</div>
  <div class="card-body notes-text">${footerNote}</div>
</div>` : "";

    // F&B grid columns — drop trailing STAFF / PREP column on public view.
    const fnbGridCols = isPublic
      ? (showQty ? "65px 1fr 32px 50px 70px" : "65px 1fr 50px 70px")
      : (showQty ? "65px 1fr 32px 50px 70px 1fr" : "65px 1fr 50px 70px 1fr");

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>BEO — ${clientName} — ${eventDate}</title>
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
  /* Page margins are controlled by Puppeteer (12mm all sides) so .page only
     needs minimal internal padding for visual rhythm. */
  .page { padding: 0 4px; max-width: 210mm; margin: 0 auto; }

  /* ── Header ── */
  .doc-header {
    background: ${venuePrimaryColor};
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
    margin-top: 4px;
  }
  .doc-sub {
    font-family: 'DM Sans', sans-serif;
    font-size: 9px;
    color: rgba(255,255,255,0.65);
    margin-top: 3px;
  }
  .doc-header-right { text-align: right; }
  .doc-beo-num {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 8px;
    letter-spacing: 0.1em;
    color: rgba(255,255,255,0.45);
    margin-bottom: 4px;
  }
  .doc-date {
    font-family: 'DM Sans', sans-serif;
    font-size: 14px;
    font-weight: 700;
    color: white;
    line-height: 1.2;
  }
  .doc-time {
    font-family: 'DM Sans', sans-serif;
    font-size: 11px;
    color: rgba(255,255,255,0.8);
    margin-top: 2px;
  }
  .status-badge {
    display: inline-block;
    background: #c9a84c;
    color: #1a1209;
    font-family: 'Bebas Neue', sans-serif;
    font-size: 8px;
    letter-spacing: 0.12em;
    padding: 2px 7px;
    margin-top: 6px;
  }

  /* ── Detail cells ── */
  .details-row {
    display: flex;
    flex-wrap: wrap;
    background: white;
    border: 1px solid rgba(201,168,76,0.35);
    margin-bottom: 10px;
  }
  .detail-cell {
    padding: 7px 12px;
    border-right: 1px solid rgba(201,168,76,0.2);
    min-width: 80px;
    flex: 1;
  }
  .detail-cell:last-child { border-right: none; }
  .cell-label {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 7px;
    letter-spacing: 0.12em;
    color: rgba(26,18,9,0.4);
    margin-bottom: 2px;
  }
  .cell-value {
    font-size: 9.5px;
    font-weight: 600;
    color: #1a1209;
    word-break: break-word;
  }

  /* ── Venue area badge (header chip - prominent) ── */
  .venue-area-chip {
    display: inline-block;
    background: #ffffff;
    color: ${venuePrimaryColor};
    font-family: 'Bebas Neue', sans-serif;
    font-size: 14px;
    letter-spacing: 0.16em;
    padding: 4px 12px;
    margin-left: 10px;
    vertical-align: middle;
    border: 2px solid #ffffff;
    font-weight: 700;
    box-shadow: 0 1px 3px rgba(0,0,0,0.18);
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
    background: ${venuePrimaryColor};
    padding: 5px 12px;
  }
  .card-header-dark { background: #3a3530; }
  .card-body { padding: 9px 12px; }
  .notes-text {
    font-size: 9.5px;
    line-height: 1.65;
    color: #3a2e1e;
  }
  .detail-row {
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 3px 0;
    border-bottom: 1px solid rgba(201,168,76,0.15);
  }
  .detail-row:last-child { border-bottom: none; }
  .detail-label {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 8px;
    letter-spacing: 0.08em;
    color: rgba(26,18,9,0.4);
    flex-shrink: 0;
    width: 120px;
  }
  .detail-value {
    font-size: 9.5px;
    font-weight: 600;
    color: #1a1209;
  }

  /* ── Dietary ── amber alert palette for chef/kitchen visibility */
  .dietary-card { border: 2px solid #f59e0b; }
  .dietary-header { background: #d97706 !important; color: white; }
  .dietary-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .dietary-item {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    background: #fffbeb;
    border: 1px solid #fbbf24;
    border-left: 4px solid #d97706;
    padding: 6px 10px;
    min-width: 120px;
  }
  .dietary-badge {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 16px;
    color: #b45309;
    line-height: 1;
    font-weight: 700;
  }
  .dietary-name { font-size: 9.5px; font-weight: 700; color: #78350f; }
  .dietary-notes { font-size: 8.5px; color: #92400e; margin-top: 2px; font-style: italic; }

  /* ── Timeline ── */
  .tl-head {
    display: grid;
    grid-template-columns: 64px 1fr 36px 90px;
    gap: 6px;
    padding: 4px 12px;
    background: rgba(201,168,76,0.12);
    border-bottom: 1px solid rgba(201,168,76,0.3);
    font-family: 'Bebas Neue', sans-serif;
    font-size: 7.5px;
    letter-spacing: 0.1em;
    color: rgba(26,18,9,0.45);
  }
  .tl-row {
    display: grid;
    grid-template-columns: 64px 1fr 36px 90px;
    gap: 6px;
    padding: 5px 12px;
    border-bottom: 1px solid rgba(201,168,76,0.12);
    align-items: start;
  }
  .tl-row:last-child { border-bottom: none; }
  .tl-time { font-weight: 700; font-size: 9.5px; }
  .tl-dur { font-size: 8px; color: rgba(26,18,9,0.4); }
  .tl-staff { font-size: 8.5px; color: ${venuePrimaryColor}; }
  .item-title { font-weight: 600; font-size: 9.5px; }
  .item-desc { font-size: 8px; color: rgba(26,18,9,0.5); margin-top: 1px; }

  /* ── F&B table ── */
  .fnb-head {
    display: grid;
    grid-template-columns: ${fnbGridCols};
    gap: 6px;
    padding: 4px 12px;
    background: rgba(201,168,76,0.12);
    border-bottom: 1px solid rgba(201,168,76,0.3);
    font-family: 'Bebas Neue', sans-serif;
    font-size: 7.5px;
    letter-spacing: 0.1em;
    color: rgba(26,18,9,0.45);
  }
  .fnb-row {
    display: grid;
    grid-template-columns: ${fnbGridCols};
    gap: 6px;
    padding: 4px 12px;
    border-bottom: 1px solid rgba(201,168,76,0.1);
    align-items: start;
  }
  .fnb-row:last-child { border-bottom: none; }
  .course-group {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 9px;
    letter-spacing: 0.12em;
    color: #8b6914;
    background: rgba(201,168,76,0.14);
    padding: 4px 12px;
    border-bottom: 1px solid rgba(201,168,76,0.28);
    page-break-after: avoid;
  }
  .course-group + .fnb-row { page-break-before: avoid; }
  /* Subtle distinction for drink rows — uses neutral grey so it works with
     any venue primary colour (red, blue, green, etc.) without clashing. */
  .course-group.is-drink {
    color: #5a544a;
    background: rgba(58,53,48,0.08);
    border-bottom-color: rgba(58,53,48,0.18);
  }
  .fnb-row.is-drink { background: rgba(58,53,48,0.03); }
  .dish-name { font-weight: 600; font-size: 9.5px; }
  .dish-desc { font-size: 8px; color: rgba(26,18,9,0.45); margin-top: 1px; }
  /* Dietary tag — amber alert colour so chefs spot allergies/diets instantly.
     Stands out against neutral rows AND against any venue header colour. */
  .diet-tag {
    display: inline-block;
    background: #fef3c7;
    color: #92400e;
    border: 1px solid #f59e0b;
    font-family: 'Bebas Neue', sans-serif;
    font-size: 8px;
    letter-spacing: 0.08em;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 3px;
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
  .footer-l {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 8px;
    letter-spacing: 0.1em;
    color: rgba(26,18,9,0.3);
  }
  .footer-r {
    font-family: 'DM Sans', sans-serif;
    font-size: 7.5px;
    color: rgba(26,18,9,0.3);
  }

  /* A course-block keeps a course header + its first row together; if the
     whole block fits on the remaining page it stays whole, otherwise it
     breaks at a row boundary (rather than orphaning the course header). */
  .course-block { page-break-inside: auto; break-inside: auto; }

  @media print {
    /* Page size only — margins are controlled by Puppeteer's PDF options
       (server/beoPdf.ts ~line 745) so leaving margin out of @page avoids
       conflicting rules between Chromium's CSS engine and Puppeteer. */
    @page { size: A4 portrait; }
    body { background: white; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .card { page-break-inside: avoid; break-inside: avoid; }
    .fnb-row, .tl-row, .dietary-item, .detail-row { page-break-inside: avoid; break-inside: avoid; }
    .course-group { page-break-after: avoid; break-after: avoid; }
    .doc-header { page-break-after: avoid; break-after: avoid; }
    .details-row { page-break-inside: avoid; break-inside: avoid; }
    .card-header { page-break-after: avoid; break-after: avoid; }
    /* Force heavy backgrounds (forest/blue) to actually print on most browsers */
    .doc-header, .card-header, .venue-area-chip, .status-badge { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  }
</style>
</head>
<body>

<div class="doc-header">
  <div class="doc-header-left">
    <div>${logoHtml}</div>
    <div class="doc-type" style="margin-top:8px">BANQUET EVENT ORDER</div>
    <div class="doc-title">${clientName}${venueAreaLabel ? `<span class="venue-area-chip">${venueAreaLabel}</span>` : ""}</div>
    <div class="doc-sub">${eventType ? `${eventType} · ` : ""}${venueName}${venueAddress ? ` · ${venueAddress}` : ""}${spaceName && venueAreaLabel ? ` · ${spaceName}` : ""}</div>
  </div>
  <div class="doc-header-right">
    <div class="doc-beo-num">BEO #${booking.id}</div>
    <div class="doc-date">${eventDate || "—"}</div>
    ${timeRange !== "—" ? `<div class="doc-time">${timeRange}</div>` : ""}
    <div class="status-badge" style="margin-top:8px">${(booking.status ?? "").replace(/_/g, " ").toUpperCase()}</div>
  </div>
</div>

<div class="page">

  <div class="details-row">
    ${detailCells.map(c => `
    <div class="detail-cell">
      <div class="cell-label">${c.label}</div>
      <div class="cell-value">${c.value}</div>
    </div>`).join("")}
  </div>

  ${show('setup', setupSection)}
  ${show('dietary', dietarySection)}
  ${show('timeline', timelineSection)}
  ${show('food', renderFnbSection("FOOD &amp; BEVERAGE SELECTION", fohItems, false))}
  ${show('kitchen', renderFnbSection("KITCHEN — PREP &amp; PRODUCTION", kitchenItemsArr, true))}
  ${show('drinks', barSection)}
  ${financialsSection}
  ${hideSet.has('totals') ? '' : (() => {
    // Running totals from F&B selection (qty × unit price), split food vs
    // drinks. Mirrors what staff see on the runsheet so the BEO matches.
    const food = fnbList.filter(i => (i.course ?? '') !== 'Drinks')
      .reduce((s, i) => s + (Number(i.qty ?? 0) * Number((i as any).unitPrice ?? 0)), 0);
    const drinks = fnbList.filter(i => (i.course ?? '') === 'Drinks')
      .reduce((s, i) => s + (Number(i.qty ?? 0) * Number((i as any).unitPrice ?? 0)), 0);
    const tab = (runsheet as any)?.drinksData?.tabAmount ? Number((runsheet as any).drinksData.tabAmount) : 0;
    const grand = food + drinks + tab;
    if (grand <= 0) return "";
    return `
<div class="card">
  <div class="card-header">RUNNING TOTALS</div>
  <div class="card-body">
    ${food > 0 ? `<div class="detail-row"><span class="detail-label">Food</span><span class="detail-value">${fmtCurrency(food)}</span></div>` : ""}
    ${drinks > 0 ? `<div class="detail-row"><span class="detail-label">Drinks</span><span class="detail-value">${fmtCurrency(drinks)}</span></div>` : ""}
    ${tab > 0 ? `<div class="detail-row"><span class="detail-label">Bar Tab</span><span class="detail-value">${fmtCurrency(tab)}</span></div>` : ""}
    <div class="detail-row" style="border-top:1px solid rgba(201,168,76,0.3);margin-top:6px;padding-top:6px;font-weight:600"><span class="detail-label">Running Total</span><span class="detail-value">${fmtCurrency(grand)}</span></div>
  </div>
</div>`;
  })()}
  ${hideSet.has('payment') ? '' : (() => {
    const pi = (venue as any)?.paymentInstructions as string | null | undefined;
    if (!pi || !pi.trim()) return "";
    const esc = pi.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
    return `
<div class="card">
  <div class="card-header">PAYMENT INSTRUCTIONS</div>
  <div class="card-body notes-text">${esc}</div>
</div>`;
  })()}
  ${show('notes', notesSection)}
  ${footerNoteSection}

  <div class="doc-footer">
    <div class="footer-l">POWERED BY VENUEFLOWHQ · BANQUET EVENT ORDER</div>
    <div class="footer-r">BEO #${booking.id} · Generated ${new Date().toLocaleDateString("en-NZ", { day: "numeric", month: "long", year: "numeric" })}</div>
  </div>

</div>
</body>
</html>`;

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
      // Symmetric 12mm margins so multi-page BEOs have proper breathing
      // room on every page (top/left/right used to be 0mm which made
      // page 2+ feel cramped against the printable edge). Footer template
      // adds page numbers + BEO ref so detached pages stay identifiable.
      const footerTemplate = `
        <div style="font-family:'DM Sans',Helvetica,Arial,sans-serif;font-size:7pt;color:#8a7c66;width:100%;padding:0 12mm;display:flex;justify-content:space-between;">
          <span>BEO #${booking.id} · ${clientName.replace(/[<>&"']/g,'')}</span>
          <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
        </div>`;
      const pdf = await page.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: "12mm", right: "10mm", bottom: "16mm", left: "10mm" },
        displayHeaderFooter: true,
        headerTemplate: `<div></div>`,
        footerTemplate,
      });

      // Append linked menu PDFs (chef-facing) to the end of the internal
      // BEO so kitchens can print one document and know exactly what's
      // being cooked. Skipped on the public event-pack — the menu PDFs
      // are operational/chef collateral and not meant for guests.
      let finalPdf: Uint8Array = pdf;
      if (!isPublic && !hideSet.has('menus')) {
        try {
          finalPdf = await appendLinkedMenuPdfs({
            beoPdfBytes: pdf,
            db,
            userId,
            fnbList,
          });
        } catch (mergeErr) {
          console.warn("[BEO PDF] menu merge failed, sending BEO without menus:", mergeErr);
        }
      }

      res.setHeader("Content-Type", "application/pdf");
      // Public event-pack opens inline in the browser (no forced download)
      // so customers click the link and see it; internal BEO PDF still
      // downloads as a file.
      const disposition = isPublic ? "inline" : "attachment";
      res.setHeader("Content-Disposition",
        `${disposition}; filename="${isPublic ? "Event-Pack" : "BEO"}-${booking.id}-${clientName.replace(/\s+/g, "-")}.pdf"`);
      res.send(Buffer.from(finalPdf));
    } finally {
      await browser.close();
    }
  } catch (err) {
    console.error("[BEO PDF]", err);
    res.status(500).send("Failed to generate BEO");
  }
}
