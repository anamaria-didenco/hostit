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
import { cleanRichHtml } from "./sanitizeHtml";
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

// ─── Brand Pack font pairings ────────────────────────────────────────────────
// A curated set of serif + sans Google Font pairings a venue can pick in the
// Brand Pack settings panel. `key` is stored on venueSettings.brandFontKey; the
// same keys/labels are mirrored in the client picker (Dashboard.tsx). Each pair
// ships its own <link> so we request exactly the weights/italics the BEO uses
// (italic serif for course titles + venue name). "editorial" is the historic
// default and its link/vars reproduce the previous hard-coded fonts 1:1.
export const BRAND_FONT_PAIRS: Record<string, { label: string; serif: string; sans: string; link: string }> = {
  editorial: {
    label: "Editorial (Spectral · Hanken Grotesk)",
    serif: "'Spectral',Georgia,serif",
    sans: "'Hanken Grotesk',Arial,sans-serif",
    link: "https://fonts.googleapis.com/css2?family=Spectral:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&family=Hanken+Grotesk:wght@400;500;600;700;800&display=swap",
  },
  classic: {
    label: "Classic (Playfair Display · Source Sans)",
    serif: "'Playfair Display',Georgia,serif",
    sans: "'Source Sans 3',Arial,sans-serif",
    link: "https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400;1,500&family=Source+Sans+3:wght@400;500;600;700&display=swap",
  },
  modern: {
    label: "Modern (Fraunces · Inter)",
    serif: "'Fraunces',Georgia,serif",
    sans: "'Inter',Arial,sans-serif",
    link: "https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;1,9..144,400;1,9..144,500&family=Inter:wght@400;500;600;700&display=swap",
  },
  elegant: {
    label: "Elegant (Cormorant Garamond · Montserrat)",
    serif: "'Cormorant Garamond',Georgia,serif",
    sans: "'Montserrat',Arial,sans-serif",
    link: "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500;1,600&family=Montserrat:wght@400;500;600;700&display=swap",
  },
  clean: {
    label: "Clean (DM Serif Display · DM Sans)",
    serif: "'DM Serif Display',Georgia,serif",
    sans: "'DM Sans',Arial,sans-serif",
    link: "https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap",
  },
};

// Pick a readable ink/white for text sitting on a solid brand-accent surface
// (status pill, guests cell, balance bar, bar tag). A pale accent needs dark
// text; a dark accent needs white. Uses perceived luminance; falls back to
// white for anything we can't parse so we never regress the dark-navy default.
function readableOnAccent(hex: string): string {
  const h = String(hex || "").trim().replace(/^#/, "");
  const full = h.length === 3 ? h.split("").map(c => c + c).join("") : h;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return "#fff";
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.62 ? "#16140f" : "#fff";
}

// Accept only a valid CSS hex colour for the accent; ignore anything else so a
// bad/garbage value can't break the document CSS.
function safeHex(hex: any, fallback: string): string {
  const h = String(hex ?? "").trim();
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(h) ? h : fallback;
}

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

// Notes arrive as rich-text HTML from the runsheet/event notes editor. Turn
// block boundaries into line breaks, strip tags + inline styles, and decode
// common entities so Key Notes shows clean bullet lines, not raw markup.
function htmlNotesToLines(raw: string): string[] {
  if (!raw) return [];
  const t = String(raw)
    .replace(/<\s*(br|hr)\s*\/?>/gi, "\n")
    .replace(/<\s*(div|p|li|h[1-6]|tr|ul|ol)(\s[^>]*)?>/gi, "\n")
    .replace(/<\/\s*(div|p|li|h[1-6]|tr|ul|ol)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
  return t.split(/\n+/).map(l => l.replace(/\s+/g, " ").trim()).filter(Boolean);
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

// ── Embedded "shared menu" parser ──────────────────────────────────────────
// Some bookings store a whole multi-course menu inside ONE F&B item (e.g. a
// "Franco Shared Menu" whose description holds ANTIPASTO … SECONDI … CONTORNO
// … DOLCE …). Rendered verbatim that reads as one run-on blob. When we detect
// course headings inside the text we split it into proper course columns +
// individual dishes so the BEO menu matches the rest of the document.
const MENU_COURSE_MAP: { kw: string; label: string }[] = [
  { kw: "canap[eé]s?|antipasti?|antipasto|to start|nibbles?", label: "Canapés" },
  { kw: "entr[eé]es?|primi|primo|first courses?|starters?", label: "Entrée" },
  { kw: "mains?|main courses?|secondi|secondo", label: "Main" },
  { kw: "sides?|contorni?|contorno", label: "Sides" },
  { kw: "desserts?|dolci?|dolce|sweets?|puddings?", label: "Dessert" },
  { kw: "cheeses?", label: "Cheese" },
];
const MENU_HEADING_WORDS = MENU_COURSE_MAP.map(c => c.kw).join("|");
const menuStartRe = (kw: string) => new RegExp("^(?:" + kw + ")\\b", "i");
const menuAnywhereRe = (kw: string) => new RegExp("(?:^|[\\s\\n])(?:" + kw + ")\\b", "i");
const CONNECTOR_RE = /^(to share|to start|shared|for the table|served shared)\b[\s—\-:·,]*/i;

function menuCourseFor(line: string): { label: string } | null {
  const t = line.trim();
  for (const c of MENU_COURSE_MAP) if (menuStartRe(c.kw).test(t)) return { label: c.label };
  return null;
}
function countMenuHeadings(text: string): number {
  return MENU_COURSE_MAP.reduce((n, c) => n + (menuAnywhereRe(c.kw).test(text) ? 1 : 0), 0);
}
type ParsedCourse = { label: string; note: string; dishes: { name: string; det: string }[] };
function parseMenuBlob(raw: string): ParsedCourse[] {
  let text = String(raw || "").trim();
  if (!text) return [];
  // Single-line blob: insert breaks before each heading keyword and connector.
  if (!/\n/.test(text)) {
    text = text
      .replace(new RegExp("\\s+(?=(?:" + MENU_HEADING_WORDS + ")\\b)", "gi"), "\n")
      .replace(/\s+(to share|to start)\b/gi, "\n$1");
  }
  const lines = text.split(/\n+/).map(l => l.trim()).filter(Boolean);
  const courses: ParsedCourse[] = [];
  let cur: ParsedCourse | null = null;
  for (let line of lines) {
    const c = menuCourseFor(line);
    if (c) {
      cur = { label: c.label, note: "", dishes: [] };
      courses.push(cur);
      let rest = line.replace(menuStartRe(MENU_COURSE_MAP.find(m => m.label === c.label)!.kw), "").trim().replace(/^[—\-:·,]+/, "").trim();
      const m = rest.match(CONNECTOR_RE);
      if (m) { cur.note = "To share"; rest = rest.slice(m[0].length).trim(); }
      if (rest) cur.dishes.push({ name: rest, det: "" });
      continue;
    }
    if (/^(to share|to start|shared|for the table|served shared)$/i.test(line)) { if (cur) cur.note = "To share"; continue; }
    if (!cur) { cur = { label: "Menu", note: "", dishes: [] }; courses.push(cur); }
    const dm = line.match(CONNECTOR_RE);
    if (dm) { cur.note = "To share"; line = line.slice(dm[0].length).trim(); }
    if (line) cur.dishes.push({ name: line, det: "" });
  }
  // Bold the lead, grey a trailing " with …" detail (matches the menu look).
  for (const c of courses) {
    c.dishes = c.dishes.map(d => {
      const i = d.name.search(/\swith\s/i);
      return i > 2 ? { name: d.name.slice(0, i), det: d.name.slice(i + 1) } : { name: d.name, det: "" };
    });
  }
  return courses.filter(c => c.dishes.length > 0);
}
// Returns parsed courses when the food list is essentially one pasted menu
// (≤3 items whose text carries ≥2 course headings); else null → normal path.
function detectEmbeddedMenu(foodItems: any[]): ParsedCourse[] | null {
  if (foodItems.length === 0 || foodItems.length > 3) return null;
  const descText = foodItems.map(i => i.description || "").filter(Boolean).join("\n");
  let parsed: ParsedCourse[] = [];
  if (countMenuHeadings(descText) >= 2) parsed = parseMenuBlob(descText);
  else {
    const allText = foodItems.map(i => [i.dishName, i.description].filter(Boolean).join("\n")).join("\n");
    if (countMenuHeadings(allText) >= 2) parsed = parseMenuBlob(allText);
  }
  return parsed.length >= 2 ? parsed : null;
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
    // ── Brand Pack: document accent + font pairing ───────────────────────────
    // brandAccentColor is opt-in — NULL keeps the editorial navy so existing
    // documents are unchanged. The accent recolours every navy surface; text
    // sitting on the accent gets a readable ink/white via luminance.
    const brandAccent = safeHex((venue as any)?.brandAccentColor, "#2f5488");
    const onAccent = readableOnAccent(brandAccent);
    const brandFontKey = String((venue as any)?.brandFontKey ?? "editorial");
    const fontPair = BRAND_FONT_PAIRS[brandFontKey] ?? BRAND_FONT_PAIRS.editorial;
    // Resolve the venue logo to an inline data URI so it renders identically in
    // the on-screen preview AND the Puppeteer PDF. Puppeteer prints via
    // setContent() with no base URL, so a relative "/uploads/…" src would 404
    // in the PDF — embedding the bytes sidesteps that (and the network round
    // trip). Read straight from disk with the same path-traversal guard used
    // for linked menu PDFs; fall back to remote/data URLs verbatim.
    let venueLogoSrc = "";
    if (venueLogoUrl) {
      if (/^(https?:|data:)/i.test(venueLogoUrl)) {
        venueLogoSrc = venueLogoUrl;
      } else if (venueLogoUrl.startsWith("/uploads/")) {
        try {
          const uploadsDir = path.join(process.cwd(), "public", "uploads");
          const filePath = path.resolve(uploadsDir, venueLogoUrl.replace(/^\/uploads\//, ""));
          if (filePath.startsWith(uploadsDir + path.sep) && fs.existsSync(filePath)) {
            const ext = path.extname(filePath).slice(1).toLowerCase();
            const mime = ext === "svg" ? "image/svg+xml" : ext === "jpg" ? "image/jpeg" : `image/${ext || "png"}`;
            venueLogoSrc = `data:${mime};base64,${fs.readFileSync(filePath).toString("base64")}`;
          }
        } catch (e) {
          console.warn("[BEO PDF] could not inline venue logo:", venueLogoUrl, e);
        }
      }
    }
    // Honour the operator's saved logo scale (%), clamped to a sane print range.
    const logoScalePct = Math.max(40, Math.min(160, Number((venue as any)?.logoScale ?? 100) || 100));
    const logoMaxH = Math.round(46 * logoScalePct / 100);
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
    // venueSetup / footerNote are rich HTML injected verbatim into the PDF
    // (which renders in --no-sandbox Puppeteer) and, for the event-pack, into
    // the browser. Sanitise so operator/guest input can't run script / SSRF.
    const venueSetup = cleanRichHtml((runsheet as any)?.venueSetup ?? "");
    // Concise one-line setup summary for the booking band (e.g. "Seated · 2 × tables of 8").
    const setupSummary = ((runsheet as any)?.setupSummary ?? "").toString().trim();
    // Drink type tags (SPARK/WHITE/RED/BEER) keyed by drink name, if the operator set them.
    const drinkTypesMap: Record<string, string> = (rsDrinks as any)?.drinkTypes ?? {};
    // Per-drink price (single-serve / till amount), keyed by drink name.
    const drinkPricesMap: Record<string, any> = (rsDrinks as any)?.drinkPrices ?? {};
    // Internal-only fields — never surfaced via the public event-pack link.
    const rsNotes = isPublic ? "" : ((runsheet as any)?.notes ?? "");
    const bookingNotes = isPublic ? "" : ((booking as any).notes ?? "");
    // Footer note — a closing message (payment terms, thank-you, etc.) shown to
    // everyone, including the public event-pack link.
    const footerNote = cleanRichHtml((runsheet as any)?.footerText ?? "");
    const fnbCols = (runsheet as any)?.fnbColumns ?? {};
    const showQty = fnbCols.qty !== false;
    // Per-item pricing on the menu — opt-in (default off) so prices only appear
    // when the operator ticks "PRICE" on the F&B sheet. Shown to everyone,
    // including the customer Event Pack, and doubles as a till reference (the
    // per-item unit price is what staff ring up).
    const showItemPrice = fnbCols.price === true;

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
    const dishHtml = (f: any, opts?: { prep?: boolean; hideQty?: boolean }) => {
      const det = f.description ? `<span class="det"> ${escHtml(f.description)}</span>` : "";
      const tag = f.previousDishName
        ? `<span class="changed">Changed &middot; was ${escHtml(f.previousDishName)}</span>`
        : "";
      // Real entered quantity (e.g. "× 40" canapés) — shown per dish unless
      // the menu header already states a uniform count for every item.
      const qtyNum = Number(f.qty ?? 1);
      const qty = (!opts?.hideQty && qtyNum > 1)
        ? `<span class="dqty">&times; ${escHtml(String(qtyNum))}</span>`
        : "";
      const prep = (opts?.prep && (f.prepNotes || f.platingNotes))
        ? `<div class="prep-line">${[f.prepNotes, f.platingNotes].filter(Boolean).map((n: string) => escHtml(n)).join(" · ")}</div>`
        : "";
      // Per-item price (opt-in). Show the line total (qty × unit) as the main
      // figure, with the "N × $unit" breakdown so staff can see the till price
      // of a single item. Only for items that actually carry a price.
      const unit = (f.unitPrice === null || f.unitPrice === undefined || f.unitPrice === "") ? null : Number(f.unitPrice);
      const price = (showItemPrice && unit !== null && !isNaN(unit) && unit > 0)
        ? `<span class="dprice">${fmtCurrency(unit * qtyNum)}${qtyNum > 1 ? `<span class="dprice-ea"> &middot; ${escHtml(String(qtyNum))} &times; ${fmtCurrency(unit)}</span>` : ""}</span>`
        : "";
      return `
        <div class="dish"><span class="em">&mdash;</span><span class="body"><span class="dname">${escHtml(f.dishName)}</span>${qty}${det}${tag}${prep}</span>${price}</div>`;
    };
    // When the food is one pasted multi-course menu, split it into columns.
    const embeddedMenu = detectEmbeddedMenu(foodItems);
    // Menu title + service-style meta adapt to what's actually on the menu —
    // the old header hardcoded "Shared Menu · served shared to table" (from
    // the shared-dinner reference design), which mislabels canapé/standing
    // events. "Shared" only appears when the menu itself says so.
    const menuCourseLabels = embeddedMenu ? embeddedMenu.map(c => c.label) : foodCourses;
    const onlyCanapes = menuCourseLabels.length > 0 && menuCourseLabels.every(c => /canap/i.test(c));
    const sharedDetected = (embeddedMenu ?? []).some(c => c.note === "To share")
      || foodItems.some((i: any) => /\bto share\b|\bshared\b/i.test(`${i.dishName ?? ""} ${i.description ?? ""}`));
    const menuTitleSuffix = onlyCanapes ? "Canap&eacute; Menu" : sharedDetected ? "Shared Menu" : "Menu";
    // "× N" is driven by the QUANTITIES the operator entered on the F&B
    // sheet, not the guest count — "40 of each canapé" for 35 guests must
    // read × 40, not × 35. Uniform qty > 1 → stated once in the header;
    // mixed qtys → each dish carries its own × N; all-1 qtys → fall back
    // to the guest count (per-guest plated/shared service).
    const foodQtys = foodItems.map((i: any) => Number(i.qty ?? 1));
    const uniformQty = foodQtys.length > 0 && foodQtys.every(q => q === foodQtys[0]) ? foodQtys[0] : null;
    const qtysVary = uniformQty === null;
    const serviceStyleMeta = sharedDetected ? " &middot; served shared to table" : onlyCanapes ? " &middot; canap&eacute; service" : "";
    const menuMeta = (uniformQty !== null && uniformQty > 1)
      ? `&times; ${escHtml(String(uniformQty))} of each${serviceStyleMeta}`
      : qtysVary
        ? serviceStyleMeta.replace(/^ &middot; /, "")
        : guestCount
          ? `&times; ${escHtml(String(guestCount))}${serviceStyleMeta}`
          : "";
    const menuHead = `
    <div class="sec-head">
      <span class="sec-title">${escHtml(venueName)} ${menuTitleSuffix}</span>
      <span class="sec-line"></span>
      <span class="sec-meta">${menuMeta}</span>
    </div>`;
    const menuSection = embeddedMenu ? `
  <div class="section">${menuHead}
    <div class="menu-grid">
      ${embeddedMenu.map(c => `
      <div class="course">
        <div class="course-title">${escHtml(c.label)}${c.note ? ` <span class="course-note">&middot; ${escHtml(c.note)}</span>` : ""}</div>
        ${c.dishes.map(d => `
        <div class="dish"><span class="em">&mdash;</span><span class="body"><span class="dname">${escHtml(d.name)}</span>${d.det ? `<span class="det"> ${escHtml(d.det)}</span>` : ""}</span></div>`).join("")}
      </div>`).join("")}
    </div>
  </div>` : (foodItems.length > 0 ? `
  <div class="section">${menuHead}
    <div class="menu-grid">
      ${foodCourses.map(course => `
      <div class="course">
        <div class="course-title">${escHtml(course)}</div>
        ${(foodGrouped[course] ?? []).map((f: any) => dishHtml(f, { prep: !isPublic, hideQty: !qtysVary })).join("")}
      </div>`).join("")}
    </div>
  </div>` : "");

    // ── Run of night (page 2) — time gutter + dot-and-rail timeline ───────
    // Flag (red dot) the arrival & dinner moments, matching the reference.
    // A time written into the title ("5.15pm - Final checks") overrides the
    // stored time — imports used to miss NZ dot-format times, leaving rows on
    // default sequential times with the real time trapped in the title. This
    // heals those already-saved rows at render.
    const { extractLeadingTime } = await import('./timeText');
    const healedTimeline = timelineItems.map((item: any) => {
      const ex = extractLeadingTime(String(item.title ?? ""));
      return ex ? { ...item, time: ex.time24, title: ex.rest } : item;
    });
    const TL_FLAG_RE = /arriv|welcome|dinner|service|seat|main/i;
    const timelineSection = healedTimeline.length > 0 ? `
      <div class="col-title">Run of Night</div>
      <div class="tl">
        ${healedTimeline.map((item: any, i: number) => `
        <div class="tl-item${TL_FLAG_RE.test(String(item.title || "")) ? " flag" : ""}">
          <div class="tl-anchor">
            <div class="tl-time">${fmt12(item.time) || "—"}</div>
            ${item.duration ? `<div class="tl-dur">${escHtml(String(item.duration))} min</div>` : ""}
          </div>
          <div class="tl-rail">
            <div class="tl-dot"></div>
            ${i < healedTimeline.length - 1 ? `<div class="tl-line"></div>` : ""}
          </div>
          <div class="tl-body">
            <div class="tl-title">${escHtml(item.title || "—")}</div>
            ${item.description ? `<div class="tl-desc">${escHtml(item.description)}</div>` : ""}
            ${item.assignedTo ? `<div class="tl-desc">${escHtml(item.assignedTo)}</div>` : ""}
          </div>
        </div>`).join("")}
      </div>` : "";

    // ── Key notes (page 2) — fill box with bullet lines ──────────────────
    const noteLines = [rsNotes, bookingNotes].filter(Boolean).flatMap(htmlNotesToLines);
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
    const drinkChip = (name: string, desc?: string, priceVal?: any) => {
      const t = drinkType(name);
      // Per-drink price — opt-in via the same F&B "PRICE" toggle as food. Bar
      // drinks are shown at their single-serve (till) price; no qty maths.
      const unit = (priceVal === null || priceVal === undefined || priceVal === "") ? null : Number(priceVal);
      const priceHtml = (showItemPrice && unit !== null && !isNaN(unit) && unit > 0)
        ? `<span class="bev-price">${fmtCurrency(unit)}</span>` : "";
      return `
        <div class="bev-row">
          ${t ? `<span class="bev-tag ${BEV_TAG_CLASS[t] ?? ""}">${BEV_TAG_LABEL[t] ?? t}</span>` : ""}
          <span class="bev-name">${escHtml(name)}${desc ? ` <span class="bev-desc">&mdash; ${escHtml(desc)}</span>` : ""}</span>
          ${priceHtml}
        </div>`;
    };
    // Drinks source: DRINKS-tab selection if present, else legacy fnb Drinks course.
    const legacyDrinkRows = fohItems.filter((i: any) => (i.course ?? "") === "Drinks");
    const bevRows = hasDrinkSelection
      ? [
          ...selectedDrinkNames.map(n => drinkChip(n, undefined, drinkPricesMap[n])),
          ...customDrinkList.map((d: any) => drinkChip(d.name, d.description, drinkPricesMap[d.name] ?? d.price)),
        ]
      : legacyDrinkRows.map((f: any) => drinkChip(f.dishName, f.description, drinkPricesMap[f.dishName] ?? f.unitPrice));
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
    const lineAmt = (ci: any) => Number(ci.qty ?? 0) * Number(ci.unitPrice ?? 0);
    // Priced FOOD lines entered on the F&B sheet (qty × unitPrice). The operator
    // often prices food here (e.g. a $1,500 grazing table) rather than adding a
    // separate Costs-tab line, so the BEO total must pick these up too — this is
    // exactly what the runsheet's Running Total does. Drinks are excluded (billed
    // on consumption / bar tab). Matched to the on-screen "FOOD" subtotal.
    const fnbFoodLines: any[] = (Array.isArray(fnbList) ? fnbList : [])
      .filter((i: any) => i.section === "foh" && (i.course ?? "") !== "Drinks" && Number(i.unitPrice ?? 0) > 0);
    const fnbFoodTotal = fnbFoodLines.reduce((s, i: any) => s + Number(i.qty ?? 0) * Number(i.unitPrice ?? 0), 0);
    // Accumulate EVERY itemised cost line (AV, hire, styling, F&B — all of it),
    // not just food/beverage. This is the same figure the runsheet Costs tab
    // sums, so the BEO total matches what the operator sees on screen.
    const costItemsTotal = costList.reduce((s, ci) => s + lineAmt(ci), 0);
    const minSpendAmt = Number((booking as any).minimumSpend ?? quoteSettingsRow?.minimumSpend ?? 0);
    // The entered total is priced food (from the F&B sheet) PLUS every itemised
    // cost line. When nothing has been priced anywhere, fall back to the booking
    // total / minimum spend so the summary still shows the deal value.
    const itemisedTotal = fnbFoodTotal + costItemsTotal;
    const enteredTotal = itemisedTotal > 0
      ? itemisedTotal
      : Math.max(Number(booking.totalNzd ?? 0), minSpendAmt);
    const depAmt = Number(booking.depositNzd ?? 0);
    // GST breakdown — mirrors the runsheet Costs tab. The gstInclusive toggle
    // declares whether the entered amounts already carry 15% GST; either way
    // the BEO shows the full picture (subtotal, GST, total incl. GST) and the
    // balance to collect is the INCLUSIVE amount.
    const gstInclusiveFlag = Boolean((runsheet as any)?.gstInclusive);
    const subtotalExGst = gstInclusiveFlag ? enteredTotal / 1.15 : enteredTotal;
    const gstAmt = gstInclusiveFlag ? enteredTotal - subtotalExGst : enteredTotal * 0.15;
    const totalInclGst = subtotalExGst + gstAmt;
    const balanceToCollect = totalInclGst > 0 ? Math.max(0, totalInclGst - (booking.depositPaid ? depAmt : 0)) : 0;
    const showFinancials = !isPublic && (enteredTotal > 0 || minSpendAmt > 0 || depAmt > 0);
    const balanceOutstanding = !booking.depositPaid && balanceToCollect > 0;
    // Itemised breakdown — one row per priced line (food from the F&B sheet
    // first, then the Costs-tab lines), so the totals below are justified
    // rather than dropping out of nowhere.
    const fnbLineHtml = (label: string, qty: number, amt: number) => {
      const qtyBit = qty > 1 ? `<span class="qy"> × ${escHtml(String(qty))}</span>` : "";
      return `<div class="cost-row line"><span class="k">${escHtml(label)}${qtyBit}</span><span class="v small">${fmtCurrency(amt)}</span></div>`;
    };
    const fnbLinesHtml = fnbFoodLines
      .map((i: any) => fnbLineHtml(i.dishName ?? "Item", Number(i.qty ?? 0), Number(i.qty ?? 0) * Number(i.unitPrice ?? 0)))
      .join("");
    const costLinesHtml = costList
      .filter(ci => (ci.label ?? "").toString().trim() || lineAmt(ci) > 0)
      .map(ci => fnbLineHtml(ci.label ?? "Item", Number(ci.qty ?? 0), lineAmt(ci)))
      .join("");
    const financialsSection = showFinancials ? `
      <div class="cost">
        <div class="cost-title">Cost Summary${gstInclusiveFlag ? " &middot; incl. GST" : " &middot; excl. GST"}</div>
        ${fnbLinesHtml}
        ${costLinesHtml}
        ${minSpendAmt > 0 ? `<div class="cost-row"><span class="k">Minimum Spend</span><span class="v small">${fmtCurrency(minSpendAmt)}</span></div>` : ""}
        ${enteredTotal > 0 ? `<div class="cost-row sub"><span class="k">Subtotal (excl. GST)</span><span class="v small">${fmtCurrency(subtotalExGst)}</span></div>` : ""}
        ${enteredTotal > 0 ? `<div class="cost-row"><span class="k">GST (15%)</span><span class="v small">${fmtCurrency(gstAmt)}</span></div>` : ""}
        ${enteredTotal > 0 ? `<div class="cost-row"><span class="k">Total (incl. GST)</span><span class="v">${fmtCurrency(totalInclGst)}</span></div>` : ""}
        ${depAmt > 0 ? `<div class="cost-row"><span class="k">Deposit received</span><span class="v small">${fmtCurrency(depAmt)} ${booking.depositPaid ? "&middot; Paid" : "&middot; Outstanding"}</span></div>` : ""}
        <div class="cost-row balance"><span class="k">Balance to collect <span class="k-sub">incl. GST</span></span><span class="v">${fmtCurrency(balanceToCollect)}${balanceOutstanding ? ` <span class="out-tag">Outstanding</span>` : ""}</span></div>
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
    // Branded masthead logo (page 1). Empty string when no logo is configured,
    // so the header gracefully falls back to the text venue name as before.
    const logoImg = venueLogoSrc
      ? `<img class="mast-logo" src="${venueLogoSrc}" alt="${escHtml(venueName)} logo" style="max-height:${logoMaxH}px;" />`
      : "";

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>BEO #${booking.id} &middot; ${escHtml(venueName)} &middot; ${escHtml(clientName)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${fontPair.link}" rel="stylesheet">
<style>
  :root{
    /* The document accent (--green, kept as the name the layout references) is
       the venue's Brand Pack colour, defaulting to VenueFlow deep blue.
       --on-green is the readable text colour for surfaces filled with it. */
    --cream:#fffdf9; --ink:#16140f; --ink2:#211d18; --green:${brandAccent}; --on-green:${onAccent}; --red:#c0392b;
    --gray:#6a6256; --gray2:#8a8073; --faint:#a39684;
    --line:#e3ddd0; --line2:#e6dccb; --hair:#eee6d8; --amber:#b07c25;
    --fill:#f4efe6; --change-fill:#fbf3e8; --change-line:#e6d9bf;
    --paper-edge:#ddd8cf;
    --serif:${fontPair.serif}; --sans:${fontPair.sans};
  }
  *{box-sizing:border-box;margin:0;padding:0;}
  html,body{background:var(--paper-edge);font-family:var(--sans);color:var(--ink2);-webkit-font-smoothing:antialiased;}
  .sheet{
    width:210mm;min-height:auto;background:var(--cream);margin:10mm auto;
    padding:5mm 8mm 5mm;position:relative;display:flex;flex-direction:column;
  }
  .muted{color:var(--gray);}

  /* ── Masthead (page 1) ── */
  .mast{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2.5px solid var(--green);padding-bottom:7px;}
  .mast-logo{display:block;max-width:190px;object-fit:contain;margin-bottom:8px;}
  .eyebrow{font-size:10px;letter-spacing:.32em;font-weight:700;color:var(--green);text-transform:uppercase;}
  .venue{font-family:var(--serif);font-size:24px;font-weight:600;line-height:1.05;margin-top:4px;color:var(--ink);}
  .mast-sub{font-size:13px;color:var(--gray);margin-top:2px;}
  .mast-right{text-align:right;flex:none;padding-left:18px;}
  .beo-num{font-family:var(--serif);font-size:22px;font-weight:600;color:var(--ink);line-height:1;}
  .pill{display:inline-flex;align-items:center;gap:6px;margin-top:6px;background:var(--green);color:var(--on-green);font-size:10px;font-weight:700;letter-spacing:.14em;padding:4px 10px;border-radius:3px;text-transform:uppercase;}
  .pill .dot{width:6px;height:6px;border-radius:50%;background:var(--on-green);opacity:.55;}
  .pill.is-muted{background:var(--gray2);color:#fff;}

  /* ── Booking band ── */
  .band{display:grid;margin-top:5px;border:1px solid var(--line);border-radius:6px;overflow:hidden;break-inside:avoid;page-break-inside:avoid;}
  .band-cell{padding:5px 10px;border-right:1px solid var(--line);}
  .band-cell:last-child{border-right:0;}
  .blabel{font-size:9px;letter-spacing:.16em;font-weight:700;color:var(--gray2);text-transform:uppercase;}
  .band-val{font-size:14px;font-weight:600;margin-top:3px;line-height:1.2;}
  .band-guests{background:var(--green);color:var(--on-green);}
  .band-guests .blabel{color:var(--on-green);opacity:.75;}
  .band-num{font-family:var(--serif);font-size:22px;font-weight:600;line-height:1;margin-top:3px;}

  /* ── Section heads ── */
  .section{margin-top:5px;break-inside:avoid;page-break-inside:avoid;}
  .sec-head{display:flex;align-items:center;gap:8px;margin-bottom:4px;}
  .sec-title{font-size:12px;letter-spacing:.2em;font-weight:800;color:var(--green);text-transform:uppercase;flex:none;}
  .sec-title.red{color:var(--red);}
  .sec-line{flex:1;height:1.5px;background:var(--green);}
  .sec-line.thick{height:2px;}
  .sec-line.red{background:var(--red);}
  .sec-meta{font-size:11px;color:var(--gray2);font-weight:600;flex:none;}

  /* ── Dietary ── */
  .diet-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;}
  .diet-card{background:#fff;border:1.5px solid var(--line2);border-radius:6px;padding:8px 12px;break-inside:avoid;page-break-inside:avoid;}
  .diet-card .dlabel{font-size:9px;letter-spacing:.16em;font-weight:800;color:var(--amber);text-transform:uppercase;}
  .diet-card .dname{font-family:var(--serif);font-size:16px;font-weight:600;margin-top:4px;color:var(--ink);line-height:1.05;}
  .diet-card .dcount{font-size:11.5px;color:var(--gray);margin-top:3px;font-weight:500;}
  .diet-card .dnote{font-size:11.5px;color:var(--gray);margin-top:3px;font-weight:500;line-height:1.35;}
  .diet-card.severe{background:var(--red);border-color:var(--red);color:#fff;}
  .diet-card.severe .dlabel{color:rgba(255,255,255,.85);}
  .diet-card.severe .dname{color:#fff;}
  .diet-card.severe .dcount,.diet-card.severe .dnote{color:#fff;opacity:.92;}

  /* ── Menu changes strip ── */
  .changes{margin-top:8px;background:var(--change-fill);border:1.5px solid var(--change-line);border-radius:6px;padding:8px 12px;break-inside:avoid;page-break-inside:avoid;}
  .changes-head{display:flex;align-items:center;gap:8px;margin-bottom:6px;}
  .changes-tag{background:var(--red);color:#fff;font-size:9px;font-weight:800;letter-spacing:.12em;padding:3px 7px;border-radius:3px;text-transform:uppercase;}
  .changes-meta{font-size:11px;color:var(--gray2);font-weight:500;}
  .changes-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 18px;}
  .change-row{display:flex;align-items:center;gap:8px;font-size:13px;}
  .change-old{color:var(--faint);text-decoration:line-through;font-weight:500;}
  .change-arrow{color:var(--red);font-weight:700;}
  .change-new{font-weight:700;color:var(--ink);}

  /* ── Menu ── */
  .menu-grid{display:grid;grid-template-columns:1fr 1fr;gap:1px 18px;margin-top:1px;}
  .course{break-inside:avoid;page-break-inside:avoid;margin-bottom:4px;}
  .course-title{font-family:var(--serif);font-style:italic;font-size:14.5px;font-weight:500;color:var(--green);border-bottom:1px solid var(--line);padding-bottom:2px;margin-bottom:4px;}
  .course-note{font-family:var(--sans);font-style:normal;font-size:10px;font-weight:700;letter-spacing:.08em;color:var(--gray2);text-transform:uppercase;}
  .dish{display:flex;gap:8px;padding:0.5px 0;align-items:baseline;}
  .dish .em{color:var(--red);font-size:12.5px;line-height:1.35;flex:none;}
  .dish .body{flex:1;}
  .dish .dname{font-size:12.5px;font-weight:700;color:var(--ink);}
  .dish .det{font-size:12px;color:#736a5d;}
  .changed{background:var(--red);color:#fff;font-size:8.5px;font-weight:800;letter-spacing:.08em;padding:1.5px 5px;border-radius:3px;margin-left:6px;vertical-align:middle;white-space:nowrap;text-transform:uppercase;}
  .dish .dqty{font-size:11px;font-weight:700;color:var(--gray2);margin-left:6px;white-space:nowrap;}
  .dish .dprice{flex:none;margin-left:10px;font-size:12px;font-weight:700;color:var(--ink);white-space:nowrap;text-align:right;}
  .dish .dprice-ea{font-size:10.5px;font-weight:600;color:var(--gray2);}
  .prep-line{font-size:11px;color:var(--gray2);margin-top:1px;font-style:italic;}

  /* ── Footer ── */
  .foot{margin-top:8px;padding-top:6px;border-top:1px solid var(--line);display:flex;justify-content:space-between;font-size:9.5px;color:var(--faint);letter-spacing:.04em;}
  .foot .biz{font-weight:700;color:var(--green);}

  /* ── Page 2 head + columns ── */
  .p2-head{display:flex;justify-content:space-between;align-items:baseline;border-bottom:2.5px solid var(--green);padding-bottom:7px;}
  .p2-title{font-family:var(--serif);font-size:17px;font-weight:600;color:var(--ink);}
  .p2-meta{font-size:11.5px;color:var(--gray);font-weight:600;}
  .p2-cols{display:grid;grid-template-columns:1.25fr 1fr;gap:14px;margin-top:6px;}
  .col-title{font-size:12px;letter-spacing:.2em;font-weight:800;color:var(--green);text-transform:uppercase;margin-bottom:6px;}

  /* ── Timeline ── */
  .tl-item{display:flex;gap:10px;padding-bottom:4px;break-inside:avoid;page-break-inside:avoid;}
  .tl-item:last-child{padding-bottom:0;}
  .tl-anchor{width:66px;flex:none;text-align:right;}
  .tl-time{font-family:var(--serif);font-size:14.5px;font-weight:600;color:var(--ink);line-height:1;white-space:nowrap;}
  .tl-dur{font-size:9.5px;color:var(--faint);font-weight:600;margin-top:2px;}
  .tl-rail{flex:none;display:flex;flex-direction:column;align-items:center;}
  .tl-dot{width:9px;height:9px;border-radius:50%;background:var(--green);border:2px solid var(--cream);box-shadow:0 0 0 1.5px var(--green);margin-top:2px;flex:none;}
  .tl-item.flag .tl-dot{background:var(--red);box-shadow:0 0 0 1.5px var(--red);}
  .tl-line{width:2px;flex:1;background:var(--line);margin-top:2px;min-height:6px;}
  .tl-body{flex:1;padding-bottom:1px;}
  .tl-title{font-size:13px;font-weight:700;color:var(--ink);}
  .tl-desc{font-size:11.5px;color:#736a5d;margin-top:1px;line-height:1.3;}

  /* ── Right-column boxes ── */
  .rcol{display:flex;flex-direction:column;gap:6px;}
  .box{border:1.5px solid var(--line2);border-radius:6px;padding:6px 10px;break-inside:avoid;page-break-inside:avoid;}
  .box.fill{background:var(--fill);border:0;}
  .box-title{font-size:11px;letter-spacing:.16em;font-weight:800;color:var(--green);text-transform:uppercase;margin-bottom:5px;}
  .notes-list{list-style:none;display:flex;flex-direction:column;gap:5px;}
  .notes-list li{display:flex;gap:8px;font-size:12px;line-height:1.35;color:#332e26;}
  .notes-list li .b{color:var(--red);font-weight:700;flex:none;}
  .contact-name{font-family:var(--serif);font-size:15px;font-weight:600;color:var(--ink);}
  .contact-lines{font-size:12px;color:#736a5d;margin-top:4px;line-height:1.55;}
  .bar-tag{display:inline-block;background:var(--green);color:var(--on-green);font-size:9px;font-weight:800;letter-spacing:.1em;padding:3px 8px;border-radius:3px;text-transform:uppercase;}
  .bar-tab-amt{display:inline-block;margin-left:7px;font-size:11px;font-weight:600;color:var(--gray);}
  .bar-note{font-size:12px;color:#332e26;margin-top:6px;line-height:1.35;}

  /* ── Cost summary ── */
  .cost{border:1.5px solid var(--line2);border-radius:6px;overflow:hidden;break-inside:avoid;page-break-inside:avoid;}
  .cost-title{font-size:11px;letter-spacing:.16em;font-weight:800;color:var(--green);text-transform:uppercase;padding:6px 12px 3px;}
  .cost-row{display:flex;justify-content:space-between;align-items:center;padding:3.5px 12px;font-size:12.5px;border-top:1px solid var(--hair);}
  .cost-row .k{color:var(--gray);font-weight:500;}
  .cost-row .v{font-family:var(--serif);font-size:14.5px;font-weight:600;color:var(--ink);}
  .cost-row .v.small{font-size:13px;}
  /* Itemised breakdown lines — lighter than the summary rows. */
  .cost-row.line{padding:4px 12px;font-size:12px;}
  .cost-row.line .k{color:var(--ink2);font-weight:500;}
  .cost-row.line .k .qy{color:var(--gray2);font-weight:600;}
  .cost-row.line .v.small{font-family:var(--sans);font-size:12px;font-weight:600;color:var(--ink2);}
  /* First summary row after the itemised lines gets a heavier divider. */
  .cost-row.sub{border-top:1.5px solid var(--line2);}
  .cost-row.balance{background:var(--green);color:var(--on-green);border-top:0;padding:7px 12px;}
  .cost-row.balance .k{color:var(--on-green);font-size:12px;font-weight:700;}
  .cost-row.balance .k-sub{display:block;font-size:9px;font-weight:600;color:var(--on-green);opacity:.65;letter-spacing:.04em;margin-top:1px;}
  .cost-row.balance .v{color:var(--on-green);font-size:15.5px;}
  .out-tag{background:var(--red);color:#fff;font-size:8px;font-weight:800;letter-spacing:.08em;padding:2px 6px;border-radius:3px;text-transform:uppercase;margin-left:7px;}

  /* ── Beverages ── */
  .bev{margin-top:6px;break-inside:avoid;page-break-inside:avoid;}
  .bev-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:3px 14px;}
  .bev-row{display:flex;gap:10px;align-items:baseline;border-bottom:1px solid var(--hair);padding-bottom:3px;}
  .bev-tag{font-size:10px;font-weight:800;letter-spacing:.08em;color:#fff;padding:3px 6px;border-radius:3px;flex:none;text-transform:uppercase;}
  .bev-name{font-size:12.5px;font-weight:600;color:var(--ink);}
  .bev-desc{font-size:11.5px;color:#736a5d;font-weight:400;}
  .bev-price{margin-left:auto;padding-left:8px;font-size:11.5px;font-weight:700;color:var(--ink);white-space:nowrap;}
  .t-spark{background:#b07c25;} .t-white{background:#a98f2a;} .t-red{background:#7a2420;} .t-beer{background:var(--green);color:var(--on-green);}

  /* ── Full-width blocks below the grid (setup / payment / note) ── */
  .blk{margin-top:6px;break-inside:avoid;page-break-inside:avoid;}
  .blk-title{font-size:12px;letter-spacing:.2em;font-weight:800;color:var(--green);text-transform:uppercase;margin-bottom:6px;}
  .blk .kv{font-size:12.5px;line-height:1.45;color:#332e26;}

  @page{size:A4;margin:0;}
  /* Two-page A4 contract: page 2 ("Floor & Service") always begins on a fresh
     physical page, so the document prints as a clean two-pager no matter how
     tall page 1's content runs. */
  .sheet + .sheet{break-before:page;page-break-before:always;}
  @media print{
    html,body{background:none;}
    /* Fill the page height (kept just under 297mm to avoid rounding a blank
       3rd page) and drop the footer to the bottom of each sheet. */
    .sheet{margin:0;min-height:295mm;}
    .foot{margin-top:auto;}
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
      ${logoImg}
      <div class="eyebrow">${isPublic ? "Event Pack" : "Banquet Event Order"}</div>
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

  ${pageFooter(isPublic ? "Event Pack &middot; Page 1 of 2" : "Kitchen copy &middot; Page 1 of 2")}
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

  ${pageFooter(isPublic ? "Event Pack &middot; Page 2 of 2" : "Service copy &middot; Page 2 of 2")}
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

    let browser: any;
    try {
      const puppeteer = await import("puppeteer");
      browser = await puppeteer.default.launch({
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
        headless: true,
      });
    } catch (err) {
      // No usable Chromium (module missing, or its bundled browser failed to
      // launch) — degrade to HTML rather than a hard 500 so the operator can
      // still view/print the document via the browser's own print dialog.
      console.error("BEO PDF: failed to launch Chromium", err);
      res.setHeader("Content-Type", "text/html");
      return res.send(html);
    }

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
