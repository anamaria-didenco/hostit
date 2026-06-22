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

    const fnbListRaw = runsheet
      ? await db.select().from(fnbItems)
          .where(and(eq(fnbItems.runsheetId, runsheet.id), eq(fnbItems.ownerId, userId)))
      : [];
    fnbListRaw.sort((a, b) => a.sortOrder - b.sortOrder);
    // Legacy runsheets sometimes saved service/bar TIMINGS ("Welcome drinks",
    // "Last drinks") as Drinks-course F&B items. Those are timeline moments, not
    // menu items — the F&B sheet UI already hides the legacy Drinks course, but
    // this orphaned data still prints on the BEO with no way to delete it. Drop
    // these timing labels from the BEO drinks list (real wines/beers stay).
    const SERVICE_TIMING_DRINK_NAMES = new Set([
      "welcome drinks", "welcome drink", "arrival drinks", "drinks on arrival",
      "last drinks", "last drink", "last call", "bar opens", "bar open",
      "bar closes", "bar close",
    ]);
    const fnbList = fnbListRaw.filter(
      i => !(((i.course ?? "") === "Drinks") &&
             SERVICE_TIMING_DRINK_NAMES.has(String((i as any).dishName ?? "").trim().toLowerCase()))
    );

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
    // Concise one-line setup summary for the booking band (e.g. "Seated · 2 × tables of 8").
    const setupSummary = ((runsheet as any)?.setupSummary ?? "").toString().trim();
    // Drink type tags (SPARK/WHITE/RED/BEER) keyed by drink name, if the operator set them.
    const drinkTypesMap: Record<string, string> = (rsDrinks as any)?.drinkTypes ?? {};
    // Internal-only fields — never surfaced via the public event-pack link.
    const rsNotes = isPublic ? "" : ((runsheet as any)?.notes ?? "");
    const bookingNotes = isPublic ? "" : ((booking as any).notes ?? "");
    // Footer note — a closing message (payment terms, thank-you, etc.) shown to
    // everyone, including the public event-pack link.
    const footerNote = ((runsheet as any)?.footerText ?? "").toString();
    const fnbCols = (runsheet as any)?.fnbColumns ?? {};
    const showQty = fnbCols.qty !== false;

    const escHtml = (s: any) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    // Drinks source of truth: if the operator built a drinks list on the
    // dedicated DRINKS tab (selectedDrinks / customDrinks), render THOSE and
    // suppress any legacy "Drinks"-course F&B rows. Older runsheets pulled the
    // whole bar list into the F&B sheet, so the BEO printed every drink instead
    // of the chosen ones. With no DRINKS-tab selection we fall back to the
    // legacy F&B Drinks rows, so older events are unchanged.
    const parseDrinkArr = (v: any): any[] => {
      if (Array.isArray(v)) return v;
      if (typeof v === "string") { try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; } }
      return [];
    };
    // Source the selection from the RUNSHEET's Drinks tab (rsDrinks), NOT the
    // merged `drinks` object. The runsheet stores human-readable drink names,
    // whereas a linked proposal stores internal codes (e.g. "house_wine") that
    // would print raw and would also wrongly suppress the legacy fnb Drinks
    // rows. Proposal-only events therefore keep their existing fnb fallback.
    const selectedDrinkNames: string[] = parseDrinkArr((rsDrinks as any)?.selectedDrinks)
      .map((d: any) => (typeof d === "string" ? d : d?.name ?? "")).filter(Boolean);
    const customDrinkList = parseDrinkArr((rsDrinks as any)?.customDrinks)
      .map((d: any) => (typeof d === "string" ? { name: d, description: "" } : d))
      .filter((d: any) => d && d.name);
    const hasDrinkSelection = selectedDrinkNames.length > 0 || customDrinkList.length > 0;

    const fohItems = fnbList.filter(i => i.section === "foh" && !(hasDrinkSelection && (i.course ?? "") === "Drinks"));
    const kitchenItemsArr = fnbList.filter(i => i.section === "kitchen");

    // ── HTML helpers ─────────────────────────────────────────────────────────
    const logoHtml = venueLogoUrl
      ? `<img src="${venueLogoUrl}" alt="${venueName}" style="height:40px;max-width:120px;object-fit:contain;display:block;">`
      : `<div style="font-family:'Bebas Neue',sans-serif;font-size:22px;color:white;letter-spacing:0.04em;">${venueName}</div>`;

    // ═══════════════════════════════════════════════════════════════════════
    // Two-page "kitchen + service" BEO. Page 1 is the kitchen copy (booking
    // band, allergies, menu changes, menu); page 2 is the service copy (run of
    // night, notes, contact, beverages, cost). RED (#c0202a) is reserved
    // strictly for attention items — allergies, CHANGED tags, CONFIRMED.
    // ═══════════════════════════════════════════════════════════════════════
    const RED = "#c0202a";

    // ── Running header (both pages) ──────────────────────────────────────
    const headerBits = [
      `BEO #${booking.id}`,
      escHtml(venueName),
      guestCount ? `${escHtml(String(guestCount))} guests` : "",
      eventDate ? escHtml(eventDate) : "",
    ].filter(Boolean);
    const runningHeaderText = headerBits.join(" · ");
    const runningHeader = `<div class="run-head">${runningHeaderText}</div>`;
    const isConfirmed = String(booking.status ?? "").toLowerCase() === "confirmed";

    // ── Page-1 booking-summary band cells ────────────────────────────────
    const roomLabel = venueAreaLabel || spaceName || "";
    const bandCells: { label: string; value: string; big?: boolean }[] = [
      { label: "GUESTS", value: guestCount ? String(guestCount) : "—", big: true },
      ...(eventDate ? [{ label: "DATE", value: escHtml(eventDate) }] : []),
      ...(timeRange && timeRange !== "—" ? [{ label: "SERVICE", value: escHtml(timeRange) }] : []),
      ...(roomLabel ? [{ label: "ROOM", value: escHtml(roomLabel) }] : []),
      ...(setupSummary ? [{ label: "SETUP", value: escHtml(setupSummary) }] : []),
    ];

    // ── Severity detection for allergy/dietary cards ─────────────────────
    // \bnuts?\b matches "nut"/"nuts"/"nut allergy"/"tree nut" but NOT
    // coconut / butternut / nutmeg / nutrition (no leading word boundary there).
    const SEVERE_RE = /allerg|anaphyla|\bnuts?\b|pregnan|coeliac|celiac|epipen|severe/i;
    const isSevere = (d: { name: string; notes?: string }) =>
      SEVERE_RE.test(d.name || "") || SEVERE_RE.test(d.notes || "");
    const dietarySection = dietaries.length > 0 ? `
<section class="block">
  <div class="block-label red"><span class="warn">⚠</span> Dietary &amp; Allergies</div>
  <div class="diet-grid">
    ${dietaries.map(d => {
      const sev = isSevere(d);
      return `
    <div class="diet-card${sev ? " severe" : ""}">
      <div class="diet-top">
        <span class="diet-name">${escHtml(d.name)}</span>
        ${d.count > 1 ? `<span class="diet-count">×${d.count}</span>` : ""}
      </div>
      ${d.notes ? `<div class="diet-notes">${escHtml(d.notes)}</div>` : ""}
    </div>`;
    }).join("")}
  </div>
</section>` : "";

    // ── Menu-change strip (page 1) — only when a foh dish was changed ─────
    const changedItems = fohItems.filter((i: any) => i.previousDishName && (i.course ?? "") !== "Drinks");
    const menuChangesSection = changedItems.length > 0 ? `
<section class="block">
  <div class="block-label red">Menu Changes</div>
  <div class="changes-card">
    <div class="changes-sub">Applies to all ${escHtml(String(guestCount || "—"))} covers</div>
    ${changedItems.map((f: any) => `
    <div class="change-row">
      <span class="change-old">${escHtml(f.previousDishName)}</span>
      <span class="change-arrow">→</span>
      <span class="change-new">${escHtml(f.dishName)}</span>
    </div>`).join("")}
  </div>
</section>` : "";

    // ── Menu courses (page 1) — food courses only, EXCLUDE Drinks ────────
    // Reuse the existing course time-ordering logic: order by earliest
    // service TIME only when EVERY food course is timed, else COURSE_ORDER.
    const orderFoodCourses = (grouped: Record<string, any[]>) => {
      const toMins = (t: any) => { const m = /^(\d{1,2}):(\d{2})/.exec(String(t ?? "")); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
      const courseTime = (c: string) => {
        const mins = (grouped[c] ?? []).map((i: any) => toMins(i.serviceTime)).filter((n): n is number => n != null);
        return mins.length ? Math.min(...mins) : null;
      };
      const orderIdx = (c: string) => { const i = COURSE_ORDER.indexOf(c); return i === -1 ? 999 : i; };
      const courses = Object.keys(grouped);
      const allTimed = courses.length > 0 && courses.every(c => courseTime(c) != null);
      if (allTimed) courses.sort((a, b) => (courseTime(a)! - courseTime(b)!) || (orderIdx(a) - orderIdx(b)));
      else courses.sort((a, b) => orderIdx(a) - orderIdx(b));
      return courses;
    };
    const foodItems = fohItems.filter((i: any) => (i.course ?? "") !== "Drinks");
    const foodGrouped = groupByCourse(foodItems);
    const foodCourses = orderFoodCourses(foodGrouped);
    const menuSection = foodItems.length > 0 ? `
<section class="block">
  <div class="block-label">Menu</div>
  <div class="menu-cols">
    ${foodCourses.map(course => `
    <div class="course">
      <div class="course-name">${escHtml(course)}</div>
      ${(foodGrouped[course] ?? []).map((f: any) => `
      <div class="dish">
        <div class="dish-line">
          <span class="dish-name">${escHtml(f.dishName)}</span>
          ${f.serviceTime ? `<span class="dish-time">${fmt12(f.serviceTime)}</span>` : ""}
          ${showQty && f.qty ? `<span class="dish-qty">×${escHtml(String(f.qty))}</span>` : ""}
        </div>
        ${f.description ? `<div class="dish-desc">${escHtml(f.description)}</div>` : ""}
        ${f.dietary ? `<span class="dish-diet">${escHtml(f.dietary)}</span>` : ""}
        ${f.previousDishName ? `<span class="changed-tag">CHANGED · was ${escHtml(f.previousDishName)}</span>` : ""}
        ${(!isPublic && (f.prepNotes || f.platingNotes)) ? `<div class="prep-line">${[f.prepNotes, f.platingNotes].filter(Boolean).map((n: string) => escHtml(n)).join(" · ")}</div>` : ""}
      </div>`).join("")}
    </div>`).join("")}
  </div>
</section>` : "";

    // ── Run of night (page 2) — vertical timeline ────────────────────────
    const timelineSection = timelineItems.length > 0 ? `
<section class="block">
  <div class="block-label">Run of Night</div>
  <div class="timeline">
    ${timelineItems.map((item: any) => `
    <div class="tl-item">
      <div class="tl-anchor">
        <div class="tl-time">${fmt12(item.time) || "—"}</div>
        ${item.duration ? `<div class="tl-dur">${escHtml(String(item.duration))} min</div>` : ""}
      </div>
      <div class="tl-body">
        <div class="tl-title">${escHtml(item.title || "—")}</div>
        ${item.description ? `<div class="tl-desc">${escHtml(item.description)}</div>` : ""}
        ${item.assignedTo ? `<div class="tl-staff">${escHtml(item.assignedTo)}</div>` : ""}
      </div>
    </div>`).join("")}
  </div>
</section>` : "";

    // ── Key notes (page 2) — bullet lines from rs/booking notes ──────────
    const allNotes = [rsNotes, bookingNotes].filter(Boolean).join("\n").trim();
    const noteLines = allNotes.split(/\n+/).map(l => l.trim()).filter(Boolean);
    const notesSection = noteLines.length > 0 ? `
<section class="block">
  <div class="block-label">Key Notes</div>
  <div class="notes-box">
    ${noteLines.map(l => `<div class="note-line">${escHtml(l)}</div>`).join("")}
  </div>
</section>` : "";

    // ── Client contact (page 2) ──────────────────────────────────────────
    const contactBits = isPublic
      ? []
      : [
          leadEmail ? `<div class="contact-line">${escHtml(leadEmail)}</div>` : "",
          (leadPhone || booking.phone) ? `<div class="contact-line">${escHtml(leadPhone || booking.phone)}</div>` : "",
        ].filter(Boolean);
    const contactSection = `
<section class="block">
  <div class="block-label">Client Contact</div>
  <div class="contact-card">
    <div class="contact-name">${escHtml(clientName)}</div>
    ${contactBits.join("")}
  </div>
</section>`;

    // ── Beverages (page 2) — typed chips ─────────────────────────────────
    // Type derivation: explicit drinkTypes map wins, else infer from name.
    const drinkType = (name: string): string => {
      const explicit = drinkTypesMap[name];
      // "other" is a real selection but has no colour in the palette — render
      // it as no-tag (like an untyped drink) instead of an unstyled chip.
      if (explicit) { const e = String(explicit).toLowerCase(); return e === "other" ? "" : e.toUpperCase(); }
      const n = name.toLowerCase();
      if (/prosecco|champagne|cava|cliquot|spumante|sparkling/.test(n)) return "SPARK";
      if (/sauvignon|pinot grigio|chardonnay|riesling|blanc|pinot gris|gewurz/.test(n)) return "WHITE";
      if (/nero|shiraz|cabernet|merlot|pinot noir|malbec|rosso|rosato|tempranillo|sangiovese/.test(n)) return "RED";
      if (/beer|pilsner|lager|ale|ipa|peroni|stout/.test(n)) return "BEER";
      return "";
    };
    const drinkChip = (name: string, desc?: string) => {
      const t = drinkType(name);
      return `
    <div class="bev-row">
      ${t ? `<span class="bev-tag bev-${t.toLowerCase()}">${t}</span>` : `<span class="bev-tag bev-none"></span>`}
      <span class="bev-name">${escHtml(name)}${desc ? ` <span class="bev-desc">— ${escHtml(desc)}</span>` : ""}</span>
    </div>`;
    };
    // Drinks source: DRINKS-tab selection if present, else legacy fnb Drinks course.
    const legacyDrinkRows = fohItems.filter((i: any) => (i.course ?? "") === "Drinks");
    const bevRows = hasDrinkSelection
      ? [
          ...selectedDrinkNames.map(n => drinkChip(n)),
          ...customDrinkList.map((d: any) => drinkChip(d.name, d.description)),
        ]
      : legacyDrinkRows.map((f: any) => drinkChip(f.dishName, f.description));
    const beveragesSection = bevRows.length > 0 ? `
<section class="block">
  <div class="block-label">Beverages</div>
  <div class="bev-list">
    ${bevRows.join("")}
  </div>
</section>` : "";

    // ── Kitchen prep & production (page 1, INTERNAL copy only) ───────────
    // Restores the legacy KITCHEN section: F&B rows the operator placed in the
    // 'kitchen' section (prep/production), which the menu (foh only) excludes.
    const kitchenGrouped = groupByCourse(kitchenItemsArr);
    const kitchenCourses = orderFoodCourses(kitchenGrouped);
    const kitchenSection = (!isPublic && kitchenItemsArr.length > 0) ? `
<section class="block">
  <div class="block-label">Kitchen — Prep &amp; Production</div>
  <div class="menu-cols">
    ${kitchenCourses.map(course => `
    <div class="course">
      <div class="course-name">${escHtml(course)}</div>
      ${(kitchenGrouped[course] ?? []).map((f: any) => `
      <div class="dish">
        <div class="dish-line">
          <span class="dish-name">${escHtml(f.dishName)}</span>
          ${f.serviceTime ? `<span class="dish-time">${fmt12(f.serviceTime)}</span>` : ""}
          ${showQty && f.qty ? `<span class="dish-qty">×${escHtml(String(f.qty))}</span>` : ""}
        </div>
        ${f.description ? `<div class="dish-desc">${escHtml(f.description)}</div>` : ""}
        ${(f.prepNotes || f.platingNotes) ? `<div class="prep-line">${[f.prepNotes, f.platingNotes].filter(Boolean).map((n: string) => escHtml(n)).join(" · ")}</div>` : ""}
      </div>`).join("")}
    </div>`).join("")}
  </div>
</section>` : "";

    // ── Venue setup (rich text: room layout / AV / decor / deliveries) ───
    // Distinct from the one-line setupSummary band cell — this is the full
    // operator-entered setup brief and must not be silently dropped.
    const setupSection = (venueSetup && String(venueSetup).trim()) ? `
<section class="block">
  <div class="block-label">Setup</div>
  <div class="notes-box">${venueSetup}</div>
</section>` : "";

    // ── Bar arrangement + notes (page 2) ────────────────────────────────
    // Restores bar option / tab / free-text bar notes (service instructions).
    const barNotesText = ((drinks as any)?.barNotes ?? "").toString();
    const barOpt = (drinks as any)?.barOption as string | undefined;
    const barTabVal = (drinks as any)?.tabAmount;
    const barSection = (barOpt || (!isPublic && barTabVal) || barNotesText.trim()) ? `
<section class="block">
  <div class="block-label">Bar Arrangement</div>
  <div class="notes-box">
    ${barOpt ? `<div class="note-line"><strong>${escHtml(BAR_LABELS[barOpt] ?? barOpt)}</strong></div>` : ""}
    ${(!isPublic && barTabVal) ? `<div class="note-line">Bar tab: ${fmtCurrency(barTabVal)}</div>` : ""}
    ${barNotesText.trim() ? `<div class="note-line">${escHtml(barNotesText).replace(/\n/g, "<br>")}</div>` : ""}
  </div>
</section>` : "";

    // ── Cost summary (page 2) — internal only, never public ──────────────
    const costList: any[] = Array.isArray((runsheet as any)?.costItems) ? (runsheet as any).costItems : [];
    const fnbFoodTotal = fnbList
      .filter(i => (i.course ?? "") !== "Drinks")
      .reduce((s, i) => s + Number(i.qty ?? 0) * Number((i as any).unitPrice ?? 0), 0);
    const costFbTotal = costList
      .filter(ci => /food|beverage/i.test(String(ci.category ?? "")))
      .reduce((s, ci) => s + Number(ci.qty ?? 0) * Number(ci.unitPrice ?? 0), 0);
    const barTabAmt = Number((drinks as any)?.tabAmount ?? 0);
    const minSpendAmt = Number((booking as any).minimumSpend ?? quoteSettingsRow?.minimumSpend ?? 0);
    // Balance is based on the ACTUAL total (minimum spend vs itemised F&B +
    // costs, whichever is higher), with the deposit subtracted only once paid.
    const eventTotal = Math.max(
      Number(booking.totalNzd ?? 0),
      minSpendAmt,
      fnbFoodTotal + costFbTotal + barTabAmt,
    );
    const depAmt = Number(booking.depositNzd ?? 0);
    const balanceToCollect = eventTotal > 0 ? Math.max(0, eventTotal - (booking.depositPaid ? depAmt : 0)) : 0;
    const showFinancials = !isPublic && (minSpendAmt > 0 || eventTotal > 0 || depAmt > 0);
    const financialsSection = showFinancials ? `
<section class="block cost-block">
  <div class="block-label">Cost Summary</div>
  <div class="cost-card">
    ${minSpendAmt > 0 ? `<div class="cost-row"><span class="cost-k">Minimum Spend</span><span class="cost-v">${fmtCurrency(minSpendAmt)}</span></div>` : ""}
    ${eventTotal > 0 ? `<div class="cost-row"><span class="cost-k">Total</span><span class="cost-v">${fmtCurrency(eventTotal)}</span></div>` : ""}
    ${depAmt > 0 ? `<div class="cost-row"><span class="cost-k">Deposit</span><span class="cost-v">${fmtCurrency(depAmt)} ${booking.depositPaid ? "✓ Paid" : "— Outstanding"}</span></div>` : ""}
    ${balanceToCollect > 0 ? `<div class="cost-row cost-total"><span class="cost-k">Balance to Collect</span><span class="cost-v">${fmtCurrency(balanceToCollect)}</span></div>` : ""}
  </div>
</section>` : "";

    // Footer note (closing message) — shown to everyone, on page 2.
    const footerNoteSection = footerNote.trim() ? `
<section class="block">
  <div class="block-label">Note</div>
  <div class="notes-box"><div class="note-line">${footerNote.replace(/\n/g, "<br>")}</div></div>
</section>` : "";

    const pageFooter = (label: string) => `
  <div class="page-foot">
    <span class="foot-l">${runningHeaderText}</span>
    <span class="foot-r">${label}</span>
  </div>`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>BEO — ${clientName} — ${eventDate}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  /* ── Palette ──
     RED (#c0202a) is reserved STRICTLY for attention items (allergies,
     CHANGED tags, CONFIRMED). Everything else is neutral ink on cream.
     ${venuePrimaryColor} (venue brand) is used for quiet branding chrome only. */
  :root {
    --ink: #1f1a14;
    --ink-soft: #5c554a;
    --ink-faint: #8b8478;
    --line: #e3ddd1;
    --cream: #faf7f1;
    --card: #ffffff;
    --red: ${RED};
    --brand: ${venuePrimaryColor};
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'DM Sans', 'Helvetica Neue', Arial, sans-serif;
    font-size: 11.5px;
    line-height: 1.5;
    color: var(--ink);
    background: var(--cream);
  }
  .label {
    font-family: 'Bebas Neue', sans-serif;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  /* ── Sheet / page ── */
  .sheet { max-width: 210mm; margin: 0 auto; padding: 0; }
  .page-break { page-break-before: always; break-before: page; }

  /* ── Running header (both pages) ── */
  .run-head {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 9px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--ink-faint);
    padding: 0 0 8px 0;
    border-bottom: 1px solid var(--line);
    margin-bottom: 18px;
  }

  /* ── Top header ── */
  .top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
    margin-bottom: 20px;
  }
  .top-service { border-bottom: 2px solid var(--ink); padding-bottom: 12px; }
  .brand { margin-bottom: 8px; }
  /* On the cream page the logoHtml fallback renders white text — recolour it. */
  .brand div { color: var(--brand) !important; }
  .doc-type {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 11px;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--ink-faint);
  }
  .venue-name {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 34px;
    line-height: 1.02;
    letter-spacing: 0.02em;
    color: var(--ink);
    margin-top: 2px;
  }
  .service-title { font-size: 30px; }
  .sub-line { font-size: 12px; color: var(--ink-soft); margin-top: 4px; }
  .top-right { text-align: right; flex-shrink: 0; }
  .beo-num {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 22px;
    letter-spacing: 0.04em;
    color: var(--ink);
  }
  .status {
    display: inline-block;
    margin-top: 6px;
    font-family: 'Bebas Neue', sans-serif;
    font-size: 11px;
    letter-spacing: 0.12em;
    color: var(--ink-soft);
    border: 1px solid var(--line);
    padding: 2px 8px;
  }
  .status.confirmed {
    color: #fff;
    background: var(--red);
    border-color: var(--red);
  }

  /* ── Booking summary band ── */
  .band {
    display: flex;
    flex-wrap: wrap;
    align-items: stretch;
    background: var(--card);
    border: 1px solid var(--line);
    margin-bottom: 22px;
  }
  .band-cell {
    flex: 1;
    min-width: 90px;
    padding: 10px 14px;
    border-right: 1px solid var(--line);
    display: flex;
    flex-direction: column;
    justify-content: center;
  }
  .band-cell:last-child { border-right: none; }
  .band-label {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 9px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--ink-faint);
    margin-bottom: 3px;
  }
  .band-val { font-size: 13px; font-weight: 600; color: var(--ink); }
  .band-big {
    flex: 0 0 auto;
    background: var(--ink);
    color: #fff;
    align-items: center;
    text-align: center;
    min-width: 96px;
  }
  .band-big .band-label { color: rgba(255,255,255,0.6); }
  .band-num {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 46px;
    line-height: 0.9;
    color: #fff;
  }

  /* ── Generic block ── */
  .block { margin-bottom: 22px; page-break-inside: avoid; break-inside: avoid; }
  .block-label {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 13px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--ink);
    padding-bottom: 5px;
    border-bottom: 1px solid var(--ink);
    margin-bottom: 12px;
  }
  .block-label.red { color: var(--red); border-bottom-color: var(--red); }
  .block-label .warn { font-family: 'DM Sans', sans-serif; }

  /* ── Dietary & allergies ── */
  .diet-grid { display: flex; flex-wrap: wrap; gap: 8px; }
  .diet-card {
    flex: 1 1 160px;
    min-width: 150px;
    background: var(--card);
    border: 1px solid var(--line);
    border-left: 3px solid var(--ink-faint);
    padding: 9px 12px;
  }
  .diet-card.severe {
    background: var(--red);
    border-color: var(--red);
    color: #fff;
  }
  .diet-top { display: flex; align-items: baseline; gap: 8px; }
  .diet-name { font-size: 13px; font-weight: 700; }
  .diet-count {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 15px;
    margin-left: auto;
  }
  .diet-notes { font-size: 11px; margin-top: 4px; line-height: 1.45; opacity: 0.85; }
  .diet-card:not(.severe) .diet-notes { color: var(--ink-soft); }

  /* ── Menu changes strip ── */
  .changes-card {
    background: var(--card);
    border: 1px solid var(--red);
    border-left: 4px solid var(--red);
    padding: 10px 14px;
  }
  .changes-sub {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 10px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--red);
    margin-bottom: 8px;
  }
  .change-row { font-size: 12.5px; padding: 3px 0; line-height: 1.5; }
  .change-old { color: var(--ink-faint); text-decoration: line-through; }
  .change-arrow { color: var(--red); margin: 0 6px; font-weight: 700; }
  .change-new { font-weight: 700; color: var(--ink); }

  /* ── Menu ── two-column course blocks ── */
  .menu-cols { columns: 2; column-gap: 26px; }
  .course { break-inside: avoid; page-break-inside: avoid; margin-bottom: 16px; }
  .course-name {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 13px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--brand);
    padding-bottom: 4px;
    border-bottom: 1px solid var(--line);
    margin-bottom: 7px;
  }
  .dish { margin-bottom: 9px; break-inside: avoid; }
  .dish-line { display: flex; align-items: baseline; gap: 8px; }
  .dish-name { font-size: 13px; font-weight: 700; color: var(--ink); }
  .dish-time {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 11px;
    letter-spacing: 0.06em;
    color: var(--ink-faint);
    margin-left: auto;
  }
  .dish-qty {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 12px;
    color: var(--ink-soft);
  }
  .dish-desc { font-size: 11px; color: var(--ink-soft); margin-top: 2px; line-height: 1.45; white-space: pre-wrap; }
  .dish-diet {
    display: inline-block;
    font-family: 'Bebas Neue', sans-serif;
    font-size: 10px;
    letter-spacing: 0.08em;
    color: var(--ink-soft);
    border: 1px solid var(--line);
    padding: 1px 6px;
    margin-top: 4px;
  }
  .changed-tag {
    display: inline-block;
    font-family: 'Bebas Neue', sans-serif;
    font-size: 10px;
    letter-spacing: 0.08em;
    color: #fff;
    background: var(--red);
    padding: 1px 7px;
    margin-top: 4px;
    margin-left: 4px;
  }
  .prep-line { font-size: 10px; color: var(--ink-faint); font-style: italic; margin-top: 3px; }

  /* ── Run of night (timeline) ── */
  .timeline { border-left: 2px solid var(--line); }
  .tl-item {
    display: flex;
    gap: 16px;
    padding: 0 0 16px 18px;
    position: relative;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .tl-item:before {
    content: "";
    position: absolute;
    left: -6px;
    top: 4px;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--brand);
  }
  .tl-anchor { flex: 0 0 70px; text-align: left; }
  .tl-time {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 19px;
    line-height: 1;
    color: var(--ink);
  }
  .tl-dur { font-size: 10px; color: var(--ink-faint); margin-top: 2px; }
  .tl-body { flex: 1; }
  .tl-title { font-size: 13px; font-weight: 700; color: var(--ink); }
  .tl-desc { font-size: 11.5px; color: var(--ink-soft); margin-top: 2px; line-height: 1.45; white-space: pre-wrap; }
  .tl-staff { font-size: 11px; color: var(--brand); margin-top: 3px; font-weight: 600; }

  /* ── Key notes ── */
  .notes-box {
    background: var(--card);
    border: 1px solid var(--line);
    padding: 11px 14px;
  }
  .note-line { font-size: 12px; line-height: 1.55; color: var(--ink); padding: 2px 0; }
  .note-line + .note-line { border-top: 1px solid var(--line); }

  /* ── Client contact ── */
  .contact-card {
    background: var(--card);
    border: 1px solid var(--line);
    padding: 11px 14px;
  }
  .contact-name { font-size: 14px; font-weight: 700; color: var(--ink); margin-bottom: 3px; }
  .contact-line { font-size: 12px; color: var(--ink-soft); line-height: 1.5; }

  /* ── Beverages ── */
  .bev-list { display: flex; flex-direction: column; gap: 6px; }
  .bev-row { display: flex; align-items: center; gap: 10px; }
  .bev-tag {
    flex: 0 0 auto;
    font-family: 'Bebas Neue', sans-serif;
    font-size: 10px;
    letter-spacing: 0.1em;
    min-width: 48px;
    text-align: center;
    padding: 2px 6px;
    border-radius: 2px;
  }
  .bev-spark { background: #e8c766; color: #4a3a06; }
  .bev-white { background: #f2ecdc; color: #6b5f3a; }
  .bev-red   { background: var(--red); color: #fff; }
  .bev-beer  { background: #3a2f24; color: #f5e9d6; }
  .bev-none  { background: transparent; min-width: 48px; }
  .bev-name { font-size: 12.5px; font-weight: 600; color: var(--ink); }
  .bev-desc { font-weight: 400; color: var(--ink-soft); }

  /* ── Cost summary (small card, internal only) ── */
  .cost-block { margin-top: auto; }
  .cost-card {
    background: var(--card);
    border: 1px solid var(--line);
    padding: 10px 14px;
    max-width: 320px;
  }
  .cost-row {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    font-size: 12px;
    padding: 3px 0;
  }
  .cost-k { color: var(--ink-soft); }
  .cost-v { font-weight: 600; color: var(--ink); }
  .cost-total {
    border-top: 1px solid var(--ink);
    margin-top: 5px;
    padding-top: 6px;
    font-weight: 700;
  }
  .cost-total .cost-k { color: var(--ink); font-weight: 700; }

  /* ── Page footer ── */
  .page-foot {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 24px;
    padding-top: 8px;
    border-top: 1px solid var(--line);
  }
  .foot-l, .foot-r {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 9px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--ink-faint);
  }

  @media print {
    /* Page size only — margins are controlled by Puppeteer's PDF options. */
    @page { size: A4 portrait; }
    body { background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .band-big, .status.confirmed, .diet-card.severe, .changed-tag,
    .bev-spark, .bev-white, .bev-red, .bev-beer, .tl-item:before {
      -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;
    }
    .block, .course, .tl-item, .diet-card { page-break-inside: avoid; break-inside: avoid; }
    .block-label, .course-name { page-break-after: avoid; break-after: avoid; }
  }
</style>
</head>
<body>

<!-- ══════════════════ PAGE 1 — KITCHEN COPY ══════════════════ -->
<div class="sheet">
  ${runningHeader}

  <header class="top">
    <div class="top-left">
      <div class="brand">${logoHtml}</div>
      <div class="doc-type">Banquet Event Order</div>
      <div class="venue-name">${escHtml(venueName)}</div>
      <div class="sub-line">${[eventType, clientName].filter(Boolean).map(escHtml).join(" · ")}</div>
    </div>
    <div class="top-right">
      <div class="beo-num">BEO #${booking.id}</div>
      ${isConfirmed ? `<div class="status confirmed">● CONFIRMED</div>` : (booking.status ? `<div class="status">${escHtml(String(booking.status).replace(/_/g, " ").toUpperCase())}</div>` : "")}
    </div>
  </header>

  <div class="band">
    ${bandCells.map(c => `
    <div class="band-cell${c.big ? " band-big" : ""}">
      <div class="band-label">${c.label}</div>
      ${c.big ? `<div class="band-num">${c.value}</div>` : `<div class="band-val">${c.value}</div>`}
    </div>`).join("")}
  </div>

  ${show('dietary', dietarySection)}
  ${menuChangesSection}
  ${show('food', menuSection)}
  ${show('kitchen', kitchenSection)}

  ${pageFooter("Kitchen copy · Page 1 of 2")}
</div>

<!-- ══════════════════ PAGE 2 — SERVICE COPY ══════════════════ -->
<div class="sheet page-break">
  ${runningHeader}

  <header class="top top-service">
    <div class="top-left">
      <div class="doc-type">Service</div>
      <div class="venue-name service-title">Floor &amp; Service</div>
    </div>
    <div class="top-right">
      <div class="beo-num">BEO #${booking.id} · ${escHtml(venueName)}</div>
    </div>
  </header>

  ${show('timeline', timelineSection)}
  ${show('setup', setupSection)}
  ${show('notes', notesSection)}
  ${contactSection}
  ${show('drinks', beveragesSection)}
  ${barSection}
  ${hideSet.has('payment') ? '' : (() => {
    if (isPublic) return "";
    const pi = (venue as any)?.paymentInstructions as string | null | undefined;
    if (!pi || !pi.trim()) return "";
    const esc = pi.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
    return `
<section class="block">
  <div class="block-label">Payment Instructions</div>
  <div class="notes-box"><div class="note-line">${esc}</div></div>
</section>`;
  })()}
  ${show('footer', footerNoteSection)}
  ${show('financials', financialsSection)}

  ${pageFooter("Service copy · Page 2 of 2")}
</div>

</body>
</html>`;

    // ── Live in-app preview ──────────────────────────────────────────
    // The "Preview & Print BEO" modal loads this exact HTML in an iframe
    // (?format=html) so what the operator sees on screen is what prints.
    // Auth route only — the public event-pack always renders the PDF.
    if (mode === "auth" && String((req.query.format as string) || "").toLowerCase() === "html") {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      return res.send(html);
    }

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
