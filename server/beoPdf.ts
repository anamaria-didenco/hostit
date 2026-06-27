/**
 * BEO (Banquet Event Order) PDF Generator
 * VenueFlow branded, comprehensive event order document.
 * Route: GET /api/beo/:bookingId
 *
 * ── Presentation refresh ──────────────────────────────────────────────────
 * The HTML/CSS below is rebuilt to match the approved "BEO #44 — Bar Franco"
 * reference design 1:1 (handoff/BEO-template-reference.html):
 *   • Masthead: eyebrow + Spectral venue name + sub-line; BEO # + status pill
 *     (green pill, light-green dot) over a 2.5px green rule.
 *   • Booking band: rounded bordered strip, green GUESTS cell + light cells.
 *   • Dietary: 3-up card grid, severe cards solid red, mild cards bordered.
 *   • Menu changes: amber callout strip with struck → new rows.
 *   • Menu: 2-col, italic-serif course titles, red em-dash, bold dish + grey
 *     detail, inline "CHANGED · was X" tag.
 *   • Page 2: "Floor & Service" head; left RUN OF NIGHT timeline (time gutter +
 *     dot-and-rail), right boxed stack (Key Notes fill box, Client Contact,
 *     Cost Summary w/ green balance bar, Bar Arrangement); BEVERAGES 3-col grid
 *     below; Room Setup / Payment / Footer note as full-width blocks.
 * ALL data extraction / business logic is unchanged from the previous version.
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
    const venuePrimaryColor = (venue as any)?.primaryColor ?? "#2f5488";
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

    // ═══════════════════════════════════════════════════════════════════════
    // Two-page BEO in the approved "BEO #44 — Bar Franco" reference design.
    // Page 1 = kitchen copy (masthead, booking band, dietary, menu changes,
    // menu, kitchen prep). Page 2 = service copy (run of night, boxed stack:
    // key notes / contact / cost / bar, beverages, room setup, notes).
    // ═══════════════════════════════════════════════════════════════════════

    // ── Running footer text (both pages) ─────────────────────────────────
    const headerBits = [
      `BEO #${booking.id}`,
      escHtml(venueName),
      guestCount ? `${escHtml(String(guestCount))} guests` : "",
      eventDate ? escHtml(eventDate) : "",
    ].filter(Boolean);
    const runningHeaderText = headerBits.join(" · ");
    const isConfirmed = String(booking.status ?? "").toLowerCase() === "confirmed";

    // ── Booking-band room label ──────────────────────────────────────────
    const roomLabel = venueAreaLabel || spaceName || "";

    // ── Booking band cells (Guests cell is always rendered separately) ────
    const bandCells: Array<[string, string]> = [];
    if (eventDate) bandCells.push(["Date", escHtml(eventDate)]);
    if (timeRange && timeRange !== "—") bandCells.push(["Service", escHtml(timeRange)]);
    if (roomLabel) bandCells.push(["Room", escHtml(roomLabel)]);
    if (setupSummary) bandCells.push(["Setup", escHtml(setupSummary)]);
    const bandHtml = `
  <div class="band" style="grid-template-columns:auto repeat(${bandCells.length}, 1fr);">
    <div class="band-cell band-guests">
      <div class="blabel">Guests</div>
      <div class="band-num">${guestCount ? escHtml(String(guestCount)) : "—"}</div>
    </div>
    ${bandCells.map(([k, v]) => `<div class="band-cell"><div class="blabel">${k}</div><div class="band-val">${v}</div></div>`).join("")}
  </div>`;

    // ── Severity detection for allergy/dietary cards ─────────────────────
    // \bnuts?\b matches "nut"/"nuts"/"nut allergy"/"tree nut" but NOT
    // coconut / butternut / nutmeg / nutrition (no leading word boundary there).
    const SEVERE_RE = /allerg|anaphyla|\bnuts?\b|pregnan|coeliac|celiac|epipen|severe/i;
    const isSevere = (d: { name: string; notes?: string }) =>
      SEVERE_RE.test(d.name || "") || SEVERE_RE.test(d.notes || "");
    const dietaryCount = dietaries.reduce((s, d) => s + (Number(d.count) || 0), 0);
    const severeDiet = dietaries.filter(isSevere);
    const mildDiet = dietaries.filter(d => !isSevere(d));
    const orderedDiet = [...severeDiet, ...mildDiet];
    const dietCountLabel = (d: { count: number }) =>
      `${d.count || 0} of ${escHtml(String(guestCount || "—"))} guests`;
    const dietCard = (d: { name: string; count: number; notes?: string }) => {
      const severe = isSevere(d);
      return `
      <div class="diet-card${severe ? " severe" : ""}">
        <div class="dlabel">${severe ? "Allergy · Severe" : "Dietary"}</div>
        <div class="dname">${escHtml(d.name)}</div>
        <div class="dcount">${dietCountLabel(d)}</div>
        ${d.notes ? `<div class="dnote">${escHtml(d.notes)}</div>` : ""}
      </div>`;
    };
    const dietarySection = dietaries.length > 0 ? `
  <div class="section">
    <div class="sec-head">
      <span class="sec-title red">&#9888; Dietary &amp; Allergies</span>
      <span class="sec-line red thick"></span>
      <span class="sec-meta">${dietaryCount} of ${escHtml(String(guestCount || "—"))} guests</span>
    </div>
    <div class="diet-grid">
      ${orderedDiet.map(dietCard).join("")}
    </div>
  </div>` : "";

    // ── Menu-change strip (page 1) — only when a foh dish was changed ─────
    const changedItems = fohItems.filter((i: any) => i.previousDishName && (i.course ?? "") !== "Drinks");
    const menuChangesSection = changedItems.length > 0 ? `
  <div class="changes">
    <div class="changes-head">
      <span class="changes-tag">Menu Changes</span>
      <span class="changes-meta">Applies to all ${escHtml(String(guestCount || "—"))} covers</span>
    </div>
    <div class="changes-grid">
      ${changedItems.map((f: any) => `
      <div class="change-row">
        <span class="change-old">${escHtml(f.previousDishName)}</span>
        <span class="change-arrow">&rarr;</span>
        <span class="change-new">${escHtml(f.dishName)}</span>
      </div>`).join("")}
    </div>
  </div>` : "";

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
    // Shared dish renderer (reference look): red em-dash + bold name + grey
    // detail; changed dishes show the new name with an inline "CHANGED · was X" tag.
    const dishHtml = (f: any, opts?: { prep?: boolean }) => {
      const det = f.description ? `<span class="det"> ${escHtml(f.description)}</span>` : "";
      const tag = f.previousDishName
        ? `<span class="changed">Changed &middot; was ${escHtml(f.previousDishName)}</span>`
        : "";
      const prep = (opts?.prep && (f.prepNotes || f.platingNotes))
        ? `<div class="prep-line">${[f.prepNotes, f.platingNotes].filter(Boolean).map((n: string) => escHtml(n)).join(" · ")}</div>`
        : "";
      return `
        <div class="dish"><span class="em">&mdash;</span><span class="body"><span class="dname">${escHtml(f.dishName)}</span>${det}${tag}${prep}</span></div>`;
    };
    const menuSection = foodItems.length > 0 ? `
  <div class="section">
    <div class="sec-head">
      <span class="sec-title">${escHtml(venueName)} Shared Menu</span>
      <span class="sec-line"></span>
      <span class="sec-meta">${guestCount ? `&times; ${escHtml(String(guestCount))} &middot; served shared to table` : ""}</span>
    </div>
    <div class="menu-grid">
      ${foodCourses.map(course => `
      <div class="course">
        <div class="course-title">${escHtml(course)}</div>
        ${(foodGrouped[course] ?? []).map((f: any) => dishHtml(f, { prep: !isPublic })).join("")}
      </div>`).join("")}
    </div>
  </div>` : "";

    // ── Run of night (page 2) — time gutter + dot-and-rail timeline ───────
    // Flag (red dot) the arrival & dinner moments, matching the reference.
    const TL_FLAG_RE = /arriv|welcome|dinner|service|seat|main/i;
    const timelineSection = timelineItems.length > 0 ? `
      <div class="col-title">Run of Night</div>
      <div class="tl">
        ${timelineItems.map((item: any, i: number) => `
        <div class="tl-item${TL_FLAG_RE.test(String(item.title || "")) ? " flag" : ""}">
          <div class="tl-anchor">
            <div class="tl-time">${fmt12(item.time) || "—"}</div>
            ${item.duration ? `<div class="tl-dur">${escHtml(String(item.duration))} min</div>` : ""}
          </div>
          <div class="tl-rail">
            <div class="tl-dot"></div>
            ${i < timelineItems.length - 1 ? `<div class="tl-line"></div>` : ""}
          </div>
          <div class="tl-body">
            <div class="tl-title">${escHtml(item.title || "—")}</div>
            ${item.description ? `<div class="tl-desc">${escHtml(item.description)}</div>` : ""}
            ${item.assignedTo ? `<div class="tl-desc">${escHtml(item.assignedTo)}</div>` : ""}
          </div>
        </div>`).join("")}
      </div>` : "";

    // ── Key notes (page 2) — fill box with bullet lines ──────────────────
    const allNotes = [rsNotes, bookingNotes].filter(Boolean).join("\n").trim();
    const noteLines = allNotes.split(/\n+/).map(l => l.trim()).filter(Boolean);
    const notesSection = noteLines.length > 0 ? `
      <div class="box fill">
        <div class="box-title">Key Notes</div>
        <ul class="notes-list">
          ${noteLines.map(l => `<li><span class="b">&bull;</span><span>${escHtml(l)}</span></li>`).join("")}
        </ul>
      </div>` : "";

    // ── Client contact (page 2) — bordered box ───────────────────────────
    const contactBits = isPublic
      ? []
      : [
          (leadPhone || booking.phone) ? `${escHtml(leadPhone || booking.phone)}` : "",
          leadEmail ? `${escHtml(leadEmail)}` : "",
        ].filter(Boolean);
    // Public event pack hides client-contact PII entirely.
    const contactSection = isPublic ? "" : `
      <div class="box">
        <div class="box-title">Client Contact</div>
        <div class="contact-name">${escHtml(clientName)}</div>
        ${contactBits.length ? `<div class="contact-lines">${contactBits.join("<br>")}</div>` : ""}
      </div>`;

    // ── Beverages (page 2) — typed chips in a 3-col grid ─────────────────
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
    // Reference colour tags: SPARK→t-spark, WHITE→t-white, RED→t-red, BEER→t-beer.
    const BEV_TAG_CLASS: Record<string, string> = {
      SPARK: "t-spark", WHITE: "t-white", RED: "t-red", BEER: "t-beer",
    };
    const BEV_TAG_LABEL: Record<string, string> = {
      SPARK: "Spark", WHITE: "White", RED: "Red", BEER: "Beer",
    };
    const drinkChip = (name: string, desc?: string) => {
      const t = drinkType(name);
      return `
        <div class="bev-row">
          ${t ? `<span class="bev-tag ${BEV_TAG_CLASS[t] ?? ""}">${BEV_TAG_LABEL[t] ?? t}</span>` : ""}
          <span class="bev-name">${escHtml(name)}${desc ? ` <span class="bev-desc">&mdash; ${escHtml(desc)}</span>` : ""}</span>
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
      <div class="bev">
        <div class="sec-head">
          <span class="sec-title">Beverages</span>
          <span class="sec-line"></span>
        </div>
        <div class="bev-grid">${bevRows.join("")}</div>
      </div>` : "";

    // ── Bar arrangement (page 2) — bordered box w/ green tag + notes ──────
    const barNotesText = ((drinks as any)?.barNotes ?? "").toString();
    const barOpt = (drinks as any)?.barOption as string | undefined;
    const barTabVal = (drinks as any)?.tabAmount;
    const barTagLabel = barOpt ? (BAR_LABELS[barOpt] ?? barOpt) : "";
    const barTabBit = (!isPublic && barTabVal) ? `<span class="bar-tab-amt">Tab ${fmtCurrency(barTabVal)}</span>` : "";
    const barArrangementSection = (barOpt || barTabBit || barNotesText.trim()) ? `
      <div class="box">
        <div class="box-title">Bar Arrangement</div>
        ${barTagLabel ? `<span class="bar-tag">${escHtml(barTagLabel)}</span>` : ""}
        ${barTabBit}
        ${barNotesText.trim() ? `<div class="bar-note">${escHtml(barNotesText).replace(/\n/g, "<br>")}</div>` : ""}
      </div>` : "";

    // ── Kitchen prep & production (page 1, INTERNAL copy only) ───────────
    // Restores the legacy KITCHEN section: F&B rows the operator placed in the
    // 'kitchen' section (prep/production), which the menu (foh only) excludes.
    const kitchenGrouped = groupByCourse(kitchenItemsArr);
    const kitchenCourses = orderFoodCourses(kitchenGrouped);
    const kitchenSection = (!isPublic && kitchenItemsArr.length > 0) ? `
  <div class="section">
    <div class="sec-head">
      <span class="sec-title">Kitchen &mdash; Prep &amp; Production</span>
      <span class="sec-line"></span>
    </div>
    <div class="menu-grid">
      ${kitchenCourses.map(course => `
      <div class="course">
        <div class="course-title">${escHtml(course)}</div>
        ${(kitchenGrouped[course] ?? []).map((f: any) => dishHtml(f, { prep: true })).join("")}
      </div>`).join("")}
    </div>
  </div>` : "";

    // ── Venue setup (rich text: room layout / AV / decor / deliveries) ───
    // Distinct from the one-line setupSummary band cell — this is the full
    // operator-entered setup brief and must not be silently dropped.
    const setupSection = (venueSetup && String(venueSetup).trim()) ? `
      <div class="blk">
        <div class="blk-title">Room Setup</div>
        <div class="kv">${venueSetup}</div>
      </div>` : "";

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
    const balanceOutstanding = !booking.depositPaid && balanceToCollect > 0;
    const financialsSection = showFinancials ? `
      <div class="cost">
        <div class="cost-title">Cost Summary</div>
        ${minSpendAmt > 0 ? `<div class="cost-row"><span class="k">Minimum Spend</span><span class="v">${fmtCurrency(minSpendAmt)}</span></div>` : ""}
        ${eventTotal > 0 ? `<div class="cost-row"><span class="k">Total</span><span class="v">${fmtCurrency(eventTotal)}</span></div>` : ""}
        ${depAmt > 0 ? `<div class="cost-row"><span class="k">Deposit received</span><span class="v small">${fmtCurrency(depAmt)} ${booking.depositPaid ? "&middot; Paid" : "&middot; Outstanding"}</span></div>` : ""}
        <div class="cost-row balance"><span class="k">Balance to collect</span><span class="v">${fmtCurrency(balanceToCollect)}${balanceOutstanding ? ` <span class="out-tag">Outstanding</span>` : ""}</span></div>
      </div>` : "";

    // Footer note (closing message) — shown to everyone, on page 2.
    const footerNoteSection = footerNote.trim() ? `
      <div class="blk">
        <div class="blk-title">Note</div>
        <div class="kv">${footerNote.replace(/\n/g, "<br>")}</div>
      </div>` : "";

    const pageFooter = (label: string) => `
  <div class="foot">
    <span class="biz">${runningHeaderText}</span>
    <span class="copy">${label}</span>
  </div>`;

    // ── Payment instructions (page 2, internal only) — full-width block ──
    const paymentSection = (hideSet.has('payment') || isPublic) ? "" : (() => {
      const pi = (venue as any)?.paymentInstructions as string | null | undefined;
      if (!pi || !pi.trim()) return "";
      const esc = pi.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
      return `
      <div class="blk">
        <div class="blk-title">Payment Instructions</div>
        <div class="kv">${esc}</div>
      </div>`;
    })();

    // ── Page-2 booking sub-line (eyebrow meta) ───────────────────────────
    const p2Meta = [`BEO #${booking.id}`, escHtml(venueName), [eventType, clientName].filter(Boolean).map(escHtml).join(" · ")]
      .filter(Boolean).join(" · ");
    const mastSub = [eventType, clientName].filter(Boolean).map(escHtml).join(" · ");

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>BEO #${booking.id} &middot; ${escHtml(venueName)} &middot; ${escHtml(clientName)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Spectral:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&family=Hanken+Grotesk:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  :root{
    /* Editorial rebrand: the document accent is VenueFlow deep blue.
       (--green is kept as the variable name the layout already references.) */
    --cream:#fffdf9; --ink:#16140f; --ink2:#211d18; --green:#2f5488; --red:#c0392b;
    --gray:#6a6256; --gray2:#8a8073; --faint:#a39684;
    --line:#e3ddd0; --line2:#e6dccb; --hair:#eee6d8; --amber:#b07c25;
    --fill:#f4efe6; --change-fill:#fbf3e8; --change-line:#e6d9bf;
    --paper-edge:#ddd8cf;
    --serif:'Spectral',Georgia,serif; --sans:'Hanken Grotesk',Arial,sans-serif;
  }
  *{box-sizing:border-box;margin:0;padding:0;}
  html,body{background:var(--paper-edge);font-family:var(--sans);color:var(--ink2);-webkit-font-smoothing:antialiased;}
  .sheet{
    width:210mm;min-height:297mm;background:var(--cream);margin:10mm auto;
    padding:16mm 15mm 14mm;position:relative;display:flex;flex-direction:column;
  }
  .muted{color:var(--gray);}

  /* ── Masthead (page 1) ── */
  .mast{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2.5px solid var(--green);padding-bottom:14px;}
  .eyebrow{font-size:10px;letter-spacing:.32em;font-weight:700;color:var(--green);text-transform:uppercase;}
  .venue{font-family:var(--serif);font-size:34px;font-weight:600;line-height:1.05;margin-top:6px;color:var(--ink);}
  .mast-sub{font-size:14px;color:var(--gray);margin-top:3px;}
  .mast-right{text-align:right;flex:none;padding-left:18px;}
  .beo-num{font-family:var(--serif);font-size:30px;font-weight:600;color:var(--ink);line-height:1;}
  .pill{display:inline-flex;align-items:center;gap:6px;margin-top:8px;background:var(--green);color:#fff;font-size:10px;font-weight:700;letter-spacing:.14em;padding:5px 11px;border-radius:3px;text-transform:uppercase;}
  .pill .dot{width:6px;height:6px;border-radius:50%;background:#a9c8f2;}
  .pill.is-muted{background:var(--gray2);}

  /* ── Booking band ── */
  .band{display:grid;margin-top:18px;border:1px solid var(--line);border-radius:6px;overflow:hidden;}
  .band-cell{padding:13px 15px;border-right:1px solid var(--line);}
  .band-cell:last-child{border-right:0;}
  .blabel{font-size:9px;letter-spacing:.16em;font-weight:700;color:var(--gray2);text-transform:uppercase;}
  .band-val{font-size:15px;font-weight:600;margin-top:4px;line-height:1.2;}
  .band-guests{background:var(--green);color:#fff;}
  .band-guests .blabel{color:rgba(255,255,255,.75);}
  .band-num{font-family:var(--serif);font-size:32px;font-weight:600;line-height:1;margin-top:4px;}

  /* ── Section heads ── */
  .section{margin-top:20px;}
  .sec-head{display:flex;align-items:center;gap:9px;margin-bottom:12px;}
  .sec-title{font-size:12px;letter-spacing:.2em;font-weight:800;color:var(--green);text-transform:uppercase;flex:none;}
  .sec-title.red{color:var(--red);}
  .sec-line{flex:1;height:1.5px;background:var(--green);}
  .sec-line.thick{height:2px;}
  .sec-line.red{background:var(--red);}
  .sec-meta{font-size:11px;color:var(--gray2);font-weight:600;flex:none;}

  /* ── Dietary ── */
  .diet-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;}
  .diet-card{background:#fff;border:1.5px solid var(--line2);border-radius:6px;padding:14px 16px;}
  .diet-card .dlabel{font-size:9px;letter-spacing:.16em;font-weight:800;color:var(--amber);text-transform:uppercase;}
  .diet-card .dname{font-family:var(--serif);font-size:22px;font-weight:600;margin-top:5px;color:var(--ink);line-height:1.05;}
  .diet-card .dcount{font-size:12px;color:var(--gray);margin-top:5px;font-weight:500;}
  .diet-card .dnote{font-size:12px;color:var(--gray);margin-top:5px;font-weight:500;line-height:1.4;}
  .diet-card.severe{background:var(--red);border-color:var(--red);color:#fff;}
  .diet-card.severe .dlabel{color:rgba(255,255,255,.85);}
  .diet-card.severe .dname{color:#fff;}
  .diet-card.severe .dcount,.diet-card.severe .dnote{color:#fff;opacity:.92;}

  /* ── Menu changes strip ── */
  .changes{margin-top:18px;background:var(--change-fill);border:1.5px solid var(--change-line);border-radius:6px;padding:13px 16px;}
  .changes-head{display:flex;align-items:center;gap:8px;margin-bottom:8px;}
  .changes-tag{background:var(--red);color:#fff;font-size:9px;font-weight:800;letter-spacing:.12em;padding:3px 7px;border-radius:3px;text-transform:uppercase;}
  .changes-meta{font-size:11px;color:var(--gray2);font-weight:500;}
  .changes-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 24px;}
  .change-row{display:flex;align-items:center;gap:8px;font-size:14px;}
  .change-old{color:var(--faint);text-decoration:line-through;font-weight:500;}
  .change-arrow{color:var(--red);font-weight:700;}
  .change-new{font-weight:700;color:var(--ink);}

  /* ── Menu ── */
  .menu-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 32px;margin-top:2px;}
  .course{break-inside:avoid;margin-bottom:10px;}
  .course-title{font-family:var(--serif);font-style:italic;font-size:16px;font-weight:500;color:var(--green);border-bottom:1px solid var(--line);padding-bottom:4px;margin-bottom:7px;}
  .dish{display:flex;gap:8px;padding:3px 0;align-items:baseline;}
  .dish .em{color:var(--red);font-size:13px;line-height:1.4;flex:none;}
  .dish .body{flex:1;}
  .dish .dname{font-size:13.5px;font-weight:700;color:var(--ink);}
  .dish .det{font-size:13px;color:#736a5d;}
  .changed{background:var(--red);color:#fff;font-size:8.5px;font-weight:800;letter-spacing:.08em;padding:1.5px 5px;border-radius:3px;margin-left:6px;vertical-align:middle;white-space:nowrap;text-transform:uppercase;}
  .prep-line{font-size:11.5px;color:var(--gray2);margin-top:2px;font-style:italic;}

  /* ── Footer ── */
  .foot{margin-top:auto;padding-top:12px;border-top:1px solid var(--line);display:flex;justify-content:space-between;font-size:10px;color:var(--faint);letter-spacing:.04em;}
  .foot .biz{font-weight:700;color:var(--green);}

  /* ── Page 2 head + columns ── */
  .p2-head{display:flex;justify-content:space-between;align-items:baseline;border-bottom:2.5px solid var(--green);padding-bottom:12px;}
  .p2-title{font-family:var(--serif);font-size:22px;font-weight:600;color:var(--ink);}
  .p2-meta{font-size:12px;color:var(--gray);font-weight:600;}
  .p2-cols{display:grid;grid-template-columns:1.25fr 1fr;gap:28px;margin-top:22px;}
  .col-title{font-size:12px;letter-spacing:.2em;font-weight:800;color:var(--green);text-transform:uppercase;margin-bottom:14px;}

  /* ── Timeline ── */
  .tl-item{display:flex;gap:14px;padding-bottom:18px;}
  .tl-item:last-child{padding-bottom:0;}
  .tl-anchor{width:74px;flex:none;text-align:right;}
  .tl-time{font-family:var(--serif);font-size:19px;font-weight:600;color:var(--ink);line-height:1;}
  .tl-dur{font-size:10px;color:var(--faint);font-weight:600;margin-top:3px;}
  .tl-rail{flex:none;display:flex;flex-direction:column;align-items:center;}
  .tl-dot{width:11px;height:11px;border-radius:50%;background:var(--green);border:2px solid var(--cream);box-shadow:0 0 0 1.5px var(--green);margin-top:3px;flex:none;}
  .tl-item.flag .tl-dot{background:var(--red);box-shadow:0 0 0 1.5px var(--red);}
  .tl-line{width:2px;flex:1;background:var(--line);margin-top:3px;min-height:14px;}
  .tl-body{flex:1;padding-bottom:2px;}
  .tl-title{font-size:15px;font-weight:700;color:var(--ink);}
  .tl-desc{font-size:12.5px;color:#736a5d;margin-top:2px;line-height:1.35;}

  /* ── Right-column boxes ── */
  .rcol{display:flex;flex-direction:column;gap:18px;}
  .box{border:1.5px solid var(--line2);border-radius:6px;padding:15px 16px;}
  .box.fill{background:var(--fill);border:0;}
  .box-title{font-size:11px;letter-spacing:.16em;font-weight:800;color:var(--green);text-transform:uppercase;margin-bottom:9px;}
  .notes-list{list-style:none;display:flex;flex-direction:column;gap:8px;}
  .notes-list li{display:flex;gap:8px;font-size:13px;line-height:1.4;color:#332e26;}
  .notes-list li .b{color:var(--red);font-weight:700;flex:none;}
  .contact-name{font-family:var(--serif);font-size:18px;font-weight:600;color:var(--ink);}
  .contact-lines{font-size:13px;color:#736a5d;margin-top:6px;line-height:1.7;}
  .bar-tag{display:inline-block;background:var(--green);color:#fff;font-size:9px;font-weight:800;letter-spacing:.1em;padding:3px 8px;border-radius:3px;text-transform:uppercase;}
  .bar-tab-amt{display:inline-block;margin-left:7px;font-size:11px;font-weight:600;color:var(--gray);}
  .bar-note{font-size:13px;color:#332e26;margin-top:8px;line-height:1.4;}

  /* ── Cost summary ── */
  .cost{border:1.5px solid var(--line2);border-radius:6px;overflow:hidden;}
  .cost-title{font-size:11px;letter-spacing:.16em;font-weight:800;color:var(--green);text-transform:uppercase;padding:15px 16px 9px;}
  .cost-row{display:flex;justify-content:space-between;align-items:center;padding:9px 16px;font-size:13px;border-top:1px solid var(--hair);}
  .cost-row .k{color:var(--gray);font-weight:500;}
  .cost-row .v{font-family:var(--serif);font-size:16px;font-weight:600;color:var(--ink);}
  .cost-row .v.small{font-size:14px;}
  .cost-row.balance{background:var(--green);color:#fff;border-top:0;padding:11px 16px;}
  .cost-row.balance .k{color:#fff;font-size:12px;font-weight:700;}
  .cost-row.balance .v{color:#fff;font-size:17px;}
  .out-tag{background:var(--red);color:#fff;font-size:8px;font-weight:800;letter-spacing:.08em;padding:2px 6px;border-radius:3px;text-transform:uppercase;margin-left:7px;}

  /* ── Beverages ── */
  .bev{margin-top:24px;}
  .bev-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px 22px;}
  .bev-row{display:flex;gap:10px;align-items:baseline;border-bottom:1px solid var(--hair);padding-bottom:7px;}
  .bev-tag{font-size:10px;font-weight:800;letter-spacing:.08em;color:#fff;padding:3px 6px;border-radius:3px;flex:none;text-transform:uppercase;}
  .bev-name{font-size:13.5px;font-weight:600;color:var(--ink);}
  .bev-desc{font-size:12px;color:#736a5d;font-weight:400;}
  .t-spark{background:#b07c25;} .t-white{background:#a98f2a;} .t-red{background:#7a2420;} .t-beer{background:var(--green);}

  /* ── Full-width blocks below the grid (setup / payment / note) ── */
  .blk{margin-top:22px;}
  .blk-title{font-size:12px;letter-spacing:.2em;font-weight:800;color:var(--green);text-transform:uppercase;margin-bottom:8px;}
  .blk .kv{font-size:13.5px;line-height:1.5;color:#332e26;}

  @page{size:A4;margin:0;}
  @media print{
    html,body{background:none;}
    .sheet{margin:0;page-break-after:always;}
    .sheet:last-child{page-break-after:auto;}
    *{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  }
  @media screen{ .sheet{box-shadow:0 8px 40px rgba(0,0,0,.16);} }
</style>
</head>
<body>

<!-- ═══════════════ PAGE 1 — KITCHEN ═══════════════ -->
<section class="sheet">
  <header class="mast">
    <div>
      <div class="eyebrow">Banquet Event Order</div>
      <div class="venue">${escHtml(venueName)}</div>
      ${mastSub ? `<div class="mast-sub">${mastSub}</div>` : ""}
    </div>
    <div class="mast-right">
      <div class="beo-num">BEO #${booking.id}</div>
      ${isConfirmed ? `<div class="pill"><span class="dot"></span>Confirmed</div>` : (booking.status ? `<div class="pill is-muted">${escHtml(String(booking.status).replace(/_/g, " "))}</div>` : "")}
    </div>
  </header>
${bandHtml}
  ${show('dietary', dietarySection)}
  ${menuChangesSection}
  ${show('food', menuSection)}
  ${show('kitchen', kitchenSection)}

  ${pageFooter("Kitchen copy &middot; Page 1 of 2")}
</section>

<!-- ═══════════════ PAGE 2 — SERVICE & BILLING ═══════════════ -->
<section class="sheet">
  <header class="p2-head">
    <div class="p2-title">Floor &amp; Service</div>
    <div class="p2-meta">${p2Meta}</div>
  </header>

  <div class="p2-cols">
    <!-- Left: run of night -->
    <div>
      ${show('timeline', timelineSection)}
    </div>

    <!-- Right: key notes, contact, cost, bar arrangement -->
    <div class="rcol">
      ${show('notes', notesSection)}
      ${contactSection}
      ${show('financials', financialsSection)}
      ${show('drinks', barArrangementSection)}
    </div>
  </div>

  ${show('drinks', beveragesSection)}
  ${show('setup', setupSection)}
  ${paymentSection}
  ${show('footer', footerNoteSection)}

  ${pageFooter("Service copy &middot; Page 2 of 2")}
</section>

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
      // The design owns its own layout: `@page{size:A4;margin:0}` + each
      // `.sheet` is sized to A4 (210×297mm) with its own internal padding and
      // an in-sheet footer. So we zero Puppeteer's margins, honour the page
      // CSS size, and drop the header/footer template — this makes the
      // downloaded PDF match the on-screen `?format=html` preview 1:1.
      const pdf = await page.pdf({
        printBackground: true,
        preferCSSPageSize: true,
        margin: { top: "0", right: "0", bottom: "0", left: "0" },
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
    console.error("[BEO PDF] render failed:", err);
    if (!res.headersSent) res.status(500).send("Failed to generate BEO PDF");
  }
}
