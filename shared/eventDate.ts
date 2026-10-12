/**
 * One rule for showing an event's date, everywhere (screens, PDFs, emails).
 *
 * An event date is stored one of two ways:
 *  - date only: exactly midnight UTC on the calendar day (no time chosen);
 *  - date and time: the exact moment, so it must be shown in the venue's time
 *    zone. The server runs on UTC, so formatting it there printed a 9 am
 *    Auckland event on the day before.
 * (A time that lands exactly on UTC midnight is saved 1 ms later by
 * combineLocalDateTime so it isn't mistaken for "date only".)
 */
export const DEFAULT_VENUE_TZ = "Pacific/Auckland";

const asDate = (v: Date | string | null | undefined): Date | null => {
  if (v === null || v === undefined || v === "") return null;
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime()) ? null : d;
};

export function isDateOnly(v: Date | string | null | undefined): boolean {
  const d = asDate(v);
  return !!d && d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0;
}

/** The zone to read a value in: UTC for date-only values, otherwise the venue's (or the device's when tz is omitted). */
const zoneFor = (d: Date, tz?: string | null) => (isDateOnly(d) ? "UTC" : (tz || undefined));

/** Format an event date, e.g. formatEventDate(d, { weekday: "long", day: "numeric", month: "long" }). "" when empty. */
export function formatEventDate(v: Date | string | null | undefined, opts: Intl.DateTimeFormatOptions, tz?: string | null): string {
  const d = asDate(v);
  if (!d) return "";
  return d.toLocaleDateString("en-NZ", { ...opts, timeZone: zoneFor(d, tz) });
}

/** "6:30 pm" in the venue's zone, or "" for a date-only value. */
export function formatEventTime(v: Date | string | null | undefined, tz?: string | null): string {
  const d = asDate(v);
  if (!d || isDateOnly(d)) return "";
  return d.toLocaleTimeString("en-NZ", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: tz || undefined });
}

function partsIn(d: Date, tz: string | undefined) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(d);
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value);
  return { y: get("year"), m: get("month"), d: get("day"), h: get("hour"), mi: get("minute"), s: get("second") };
}

/** "2026-10-24": the event's calendar day, by the same rule as formatEventDate. */
export function eventDayKey(v: Date | string | null | undefined, tz?: string | null): string {
  const d = asDate(v);
  if (!d) return "";
  const p = partsIn(d, zoneFor(d, tz));
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

/** The instant for a wall-clock time on a calendar day in a zone (handles daylight saving). */
export function zonedWallTimeToDate(y: number, m: number, d: number, h: number, mi: number, tz: string): Date {
  let guess = Date.UTC(y, m - 1, d, h, mi);
  for (let i = 0; i < 2; i++) {
    const p = partsIn(new Date(guess), tz);
    const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s);
    guess += Date.UTC(y, m - 1, d, h, mi) - asUtc;
  }
  const out = new Date(guess);
  // Keep a real time distinguishable from "date only".
  return isDateOnly(out) ? new Date(guess + 1) : out;
}

/**
 * The booking date when a client accepts: the proposal's day, at the start
 * time the enquiry had. Proposals store the day only, so taking the proposal
 * date alone dropped the time ("7 pm" became "no time").
 */
export function dayWithTimeFrom(
  day: Date | string | null | undefined,
  timed: Date | string | null | undefined,
  tz: string = DEFAULT_VENUE_TZ,
): Date | null {
  const dayD = asDate(day);
  const timedD = asDate(timed);
  if (!dayD) return timedD;
  if (!isDateOnly(dayD) || !timedD || isDateOnly(timedD)) return dayD;
  const t = partsIn(timedD, tz);
  const [y, m, d] = eventDayKey(dayD, tz).split("-").map(Number);
  return zonedWallTimeToDate(y, m, d, t.h, t.mi, tz);
}
