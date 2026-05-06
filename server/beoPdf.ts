/**
 * BEO (Banquet Event Order) PDF Generator
 * VenueFlow branded, comprehensive event order document.
 * Route: GET /api/beo/:bookingId
 */
import type { Request, Response } from "express";
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
} from "../drizzle/schema";
import { eq, and } from "drizzle-orm";

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

    // Dietary section
    const dietarySection = dietaries.length > 0 ? `
<div class="card">
  <div class="card-header">DIETARY REQUIREMENTS</div>
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
    function renderFnbSection(title: string, items: any[], isKitchen = false) {
      if (!items.length) return "";
      // Public event-pack hides internal kitchen prep/plating + staff
      // assignments — guests don't need (and shouldn't see) operational detail.
      if (isPublic && isKitchen) return "";
      const grouped = groupByCourse(items);
      const ordered = COURSE_ORDER.filter(c => grouped[c]);
      const remaining = Object.keys(grouped).filter(c => !COURSE_ORDER.includes(c));
      const allCourses = [...ordered, ...remaining];
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
  ${allCourses.map(course => `
  <div class="course-block">
    <div class="course-group">${course}</div>
    ${(grouped[course] ?? []).map((f: any) => `
    <div class="fnb-row">
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
  </div>`).join("")}
</div>`;
    }

    // Bar section
    const barNotes = (drinks as any)?.barNotes as string | undefined;
    const barSection = drinks ? `
<div class="card">
  <div class="card-header">BAR &amp; DRINKS</div>
  <div class="card-body">
    <div class="detail-row"><span class="detail-label">Bar Arrangement</span><span class="detail-value">${BAR_LABELS[drinks.barOption] ?? drinks.barOption}</span></div>
    ${drinks.tabAmount ? `<div class="detail-row"><span class="detail-label">Bar Tab Amount</span><span class="detail-value">${fmtCurrency(drinks.tabAmount)}</span></div>` : ""}
    ${barNotes ? `
    <div style="margin-top:8px;padding:8px 10px;background:#eef3fb;border-left:3px solid #6b98e7">
      <div class="detail-label" style="margin-bottom:4px;color:#3a5ab0">Bar Notes</div>
      <div style="font-size:9.5px;line-height:1.55;color:#1a1209;white-space:pre-wrap">${(barNotes as string).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>')}</div>
    </div>` : ""}
    ${(drinks.selectedDrinks ?? []).length > 0 || (drinks.customDrinks ?? []).length > 0 ? `
    <div style="margin-top:8px">
      <div class="detail-label" style="margin-bottom:4px">Selected Drinks</div>
      <ul style="margin:0;padding-left:14px">
        ${(drinks.selectedDrinks as string[]).map((key: string) => `<li style="font-size:9px;margin-bottom:2px">${key.replace(/_/g, ' ')}</li>`).join("")}
        ${(drinks.customDrinks ?? []).map((d: any) => `<li style="font-size:9px;margin-bottom:2px"><strong>${d.name}</strong>${d.description ? ` — ${d.description}` : ""}</li>`).join("")}
      </ul>
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
    background: #6b98e7;
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
    color: #6b98e7;
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
    background: #6b98e7;
    padding: 5px 12px;
  }
  .card-header-dark { background: #4a73c9; }
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

  /* ── Dietary ── */
  .dietary-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
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
    font-size: 14px;
    color: #6b98e7;
    line-height: 1;
  }
  .dietary-name { font-size: 9px; font-weight: 600; }
  .dietary-notes { font-size: 8px; color: rgba(26,18,9,0.5); margin-top: 1px; }

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
  .tl-staff { font-size: 8.5px; color: #6b98e7; }
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
  .dish-name { font-weight: 600; font-size: 9.5px; }
  .dish-desc { font-size: 8px; color: rgba(26,18,9,0.45); margin-top: 1px; }
  .diet-tag {
    display: inline-block;
    background: #dde7f7;
    color: #3a5ab0;
    font-family: 'Bebas Neue', sans-serif;
    font-size: 7px;
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

  ${setupSection}
  ${dietarySection}
  ${timelineSection}
  ${renderFnbSection("FRONT OF HOUSE — F&amp;B SERVICE", fohItems, false)}
  ${renderFnbSection("KITCHEN — PREP &amp; PRODUCTION", kitchenItemsArr, true)}
  ${barSection}
  ${financialsSection}
  ${notesSection}

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
      res.setHeader("Content-Type", "application/pdf");
      // Public event-pack opens inline in the browser (no forced download)
      // so customers click the link and see it; internal BEO PDF still
      // downloads as a file.
      const disposition = isPublic ? "inline" : "attachment";
      res.setHeader("Content-Disposition",
        `${disposition}; filename="${isPublic ? "Event-Pack" : "BEO"}-${booking.id}-${clientName.replace(/\s+/g, "-")}.pdf"`);
      res.send(Buffer.from(pdf));
    } finally {
      await browser.close();
    }
  } catch (err) {
    console.error("[BEO PDF]", err);
    res.status(500).send("Failed to generate BEO");
  }
}
