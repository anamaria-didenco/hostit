/**
 * Rules for the Win back view: who to list and when a lead may be emailed
 * again. Shared by the server queries and their unit tests.
 */
import { zonedDayBoundUtc } from "./tz";

/** Never send the same lead a win-back email more than once in this many days. */
export const WIN_BACK_COOLDOWN_DAYS = 90;
/** An open enquiry with no activity for this long counts as "gone quiet". */
export const QUIET_DAYS = 30;
/** Event types that recur yearly, until the venue picks its own. */
export const DEFAULT_ANNUAL_TYPES = ["Birthday", "Christmas", "End of year"];

const norm = (s: string) => s.toLowerCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();

/** Parse the venue's saved list (JSON array). Null/invalid = the defaults. */
export function parseAnnualTypes(raw: string | null | undefined): string[] {
  if (!raw) return [...DEFAULT_ANNUAL_TYPES];
  try {
    const v = JSON.parse(raw);
    if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map(x => x.trim());
  } catch { /* fall through */ }
  return [...DEFAULT_ANNUAL_TYPES];
}

/** "Christmas Party" counts for "Christmas"; "End-of-year function" for "End of year". */
export function isAnnualEventType(eventType: string | null | undefined, annualTypes: string[]): boolean {
  if (!eventType) return false;
  const t = norm(eventType);
  return annualTypes.some(a => { const n = norm(a); return n.length > 0 && t.includes(n); });
}

/** Whether a lead may get a win-back email now, and if not, from when. */
export function winBackEligibility(lastWinBackAt: Date | string | number | null | undefined, nowMs: number = Date.now()): { eligible: boolean; nextAt: Date | null } {
  if (lastWinBackAt == null) return { eligible: true, nextAt: null };
  const last = new Date(lastWinBackAt).getTime();
  if (!Number.isFinite(last)) return { eligible: true, nextAt: null };
  const next = last + WIN_BACK_COOLDOWN_DAYS * 86_400_000;
  return next <= nowMs ? { eligible: true, nextAt: null } : { eligible: false, nextAt: new Date(next) };
}

function ymdInTz(ms: number, tz: string): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
  const [y, m, d] = parts.split("-").map(Number);
  return { y, m, d };
}

function monthsBack({ y, m, d }: { y: number; m: number; d: number }, n: number, plusDays = 0): string {
  let mm = m - n, yy = y;
  while (mm < 1) { mm += 12; yy -= 1; }
  const last = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  const dt = new Date(Date.UTC(yy, mm - 1, Math.min(d, last) + plusDays));
  return dt.toISOString().slice(0, 10);
}

/**
 * "Same time next year": events held between 11 and 10 months ago, counted in
 * the venue's calendar days — so this October lists last November's events,
 * a month or two before they'd be planning again. `to` is exclusive (the
 * start of the day after), so compare with `<`.
 */
export function sameTimeNextYearWindow(nowMs: number = Date.now(), tz = "Pacific/Auckland"): { from: Date; to: Date } {
  const today = ymdInTz(nowMs, tz);
  return {
    from: zonedDayBoundUtc(monthsBack(today, 11), tz, "start"),
    to: zonedDayBoundUtc(monthsBack(today, 10, 1), tz, "start"),
  };
}
