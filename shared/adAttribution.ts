/**
 * Ad-click attribution for embedded enquiry forms, and the Google Ads offline
 * conversion export that tells Google which clicks became confirmed bookings.
 */
import { DEFAULT_VENUE_TZ, zonedWallTimeToDate } from "./eventDate";

/** The origin of a URL ("https://www.barfranco.nz"), or null when it isn't one. */
export function originOf(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" || u.protocol === "http:" ? u.origin : null;
  } catch { return null; }
}

/**
 * Whether a page origin is the venue's own website (its domain, the www.
 * version, or a subdomain), over https. Only then does the form tell the page
 * who enquired (email/phone, for Google's enhanced conversions).
 */
export function isVenueSiteOrigin(origin: string | null | undefined, website: string | null | undefined): boolean {
  if (!origin || !website) return false;
  let o: URL, site: URL;
  try {
    o = new URL(origin);
    site = new URL(/^https?:\/\//i.test(website.trim()) ? website.trim() : `https://${website.trim()}`);
  } catch { return false; }
  if (o.protocol !== "https:") return false;
  const base = site.hostname.toLowerCase().replace(/^www\./, "");
  const host = o.hostname.toLowerCase();
  return host === base || host.endsWith(`.${base}`);
}

/** The landing page as origin + path only (query strings can carry personal data). Max 500 chars. */
export function cleanLandingPage(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return undefined;
    return `${u.origin}${u.pathname}`.slice(0, 500);
  } catch { return undefined; }
}

/** When the ad click landed: ms or ISO, not in the future and within 120 days, else undefined. */
export function parseAdClickAt(raw: string | number | null | undefined, now = Date.now()): Date | undefined {
  if (raw === null || raw === undefined || raw === "") return undefined;
  const n = typeof raw === "number" ? raw : /^\d{10,13}$/.test(String(raw)) ? Number(raw) : Date.parse(String(raw));
  if (!Number.isFinite(n)) return undefined;
  const ms = n < 1e12 ? n * 1000 : n; // seconds or milliseconds
  if (ms > now + 5 * 60_000 || ms < now - 120 * 86_400_000) return undefined;
  return new Date(ms);
}

// ── Google Ads offline conversion CSV ──────────────────────────────────────

export const BOOKING_CONVERSION_NAME = "Booking confirmed (VenueFlow)";

export type ConfirmedBookingRow = {
  gclid?: string | null;
  gbraid?: string | null;
  wbraid?: string | null;
  confirmedAt: Date | string;
  value?: number | string | null;
  adClickAt?: Date | string | null;
  /** When the enquiry arrived. The click was on or before this, so it's a
   *  safe stand-in for the 90-day check when the click time wasn't passed. */
  enquiredAt?: Date | string | null;
};

function offsetFor(d: Date, tz: string): string {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(d);
  const get = (t: string) => Number(p.find(x => x.type === t)?.value);
  const wall = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  const mins = Math.round((wall - Math.floor(d.getTime() / 1000) * 1000) / 60_000);
  const sign = mins >= 0 ? "+" : "-";
  const a = Math.abs(mins);
  return `${sign}${String(Math.floor(a / 60)).padStart(2, "0")}:${String(a % 60).padStart(2, "0")}`;
}

/**
 * "2026-10-24 18:30:00+13:00": the moment in the venue's local time with that
 * day's real UTC offset (+13:00 in NZ daylight time, +12:00 in winter), the
 * format Google Ads accepts for Conversion Time.
 */
export function googleAdsTime(v: Date | string, tz: string = DEFAULT_VENUE_TZ): string {
  const d = v instanceof Date ? v : new Date(v);
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(d);
  const get = (t: string) => p.find(x => x.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}${offsetFor(d, tz)}`;
}

const csvCell = (v: unknown) => {
  const s = String(v ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * The upload file. One click ID per row (gclid preferred, then gbraid, then
 * wbraid). Rows are skipped, with a reason, when there's no click ID, the
 * booking was confirmed before the click, or the click is over 90 days older
 * than the booking (Google rejects those).
 */
export function buildGoogleAdsConversionCsv(rows: ConfirmedBookingRow[], tz: string = DEFAULT_VENUE_TZ): {
  csv: string; included: number; skipped: Array<{ reason: string }>;
} {
  const header = ["Google Click ID", "GBRAID", "WBRAID", "Conversion Name", "Conversion Time", "Conversion Value", "Conversion Currency"];
  const out: string[] = [header.join(",")];
  const skipped: Array<{ reason: string }> = [];
  for (const r of rows) {
    const gclid = (r.gclid ?? "").trim();
    const gbraid = gclid ? "" : (r.gbraid ?? "").trim();
    const wbraid = gclid || gbraid ? "" : (r.wbraid ?? "").trim();
    if (!gclid && !gbraid && !wbraid) { skipped.push({ reason: "no click ID" }); continue; }
    const confirmed = r.confirmedAt instanceof Date ? r.confirmedAt : new Date(r.confirmedAt);
    if (isNaN(confirmed.getTime())) { skipped.push({ reason: "no confirmation time" }); continue; }
    const click = r.adClickAt ? new Date(r.adClickAt).getTime() : NaN;
    if (!isNaN(click) && confirmed.getTime() < click) { skipped.push({ reason: "confirmed before the click" }); continue; }
    const latestClick = !isNaN(click) ? click : (r.enquiredAt ? new Date(r.enquiredAt).getTime() : NaN);
    if (!isNaN(latestClick) && confirmed.getTime() - latestClick > 90 * 86_400_000) { skipped.push({ reason: "click over 90 days before the booking" }); continue; }
    const value = Number(r.value ?? 0);
    out.push([
      gclid, gbraid, wbraid, BOOKING_CONVERSION_NAME, googleAdsTime(confirmed, tz),
      value > 0 ? value.toFixed(2) : "", "NZD",
    ].map(csvCell).join(","));
  }
  return { csv: out.join("\n") + "\n", included: out.length - 1, skipped };
}

// Re-exported for callers that build test data in venue time.
export { zonedWallTimeToDate };
