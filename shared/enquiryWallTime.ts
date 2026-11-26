/**
 * The enquiry's date and time as the venue reads them.
 *
 * The form used to turn a picked date and time into an instant in the
 * visitor's own time zone, so 7 pm on 12 Dec picked on a phone set to Sydney
 * reached the venue as 9 pm, and from London as 8 am the next day. The form
 * now sends the wall-clock date and time ("2026-12-12" and "19:00") and the
 * server places them in the venue's zone. Forms loaded before that change
 * still send a full timestamp, which is kept as it is.
 *
 * Storage rules are unchanged (see shared/eventDate.ts): a date with no time
 * is midnight UTC on that day, and a real time that lands on midnight UTC is
 * stored 1 ms later.
 */
import { DEFAULT_VENUE_TZ, eventDayKey, zonedWallTimeToDate } from "./eventDate";

const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;
const WALL_TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T/;

/** "YYYY-MM-DD" for a day that exists: not "2026-13-01", and not "2026-02-30" (which new Date() quietly turns into 2 March). */
export function isRealDateKey(s: string | null | undefined): boolean {
  const m = DATE_KEY.exec(s ?? "");
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

/** "HH:MM" on a 24-hour clock, 00:00 to 23:59. */
export function isWallTime(s: string | null | undefined): boolean {
  return WALL_TIME.test(s ?? "");
}

/**
 * What the server accepts as an enquiry's eventDate: empty, a real
 * "YYYY-MM-DD", or a full timestamp that parses (from a form loaded before
 * wall times were sent).
 */
export function isValidEnquiryDateInput(s: string | null | undefined): boolean {
  if (s == null || s === "") return true;
  if (DATE_KEY.test(s)) return isRealDateKey(s);
  return TIMESTAMP.test(s) && !Number.isNaN(new Date(s).getTime());
}

/** "YYYY-MM-DD" of an instant on the calendar of `tz` (e.g. today at the venue, for the date picker). */
export function wallDateKeyInTz(at: Date, tz: string = DEFAULT_VENUE_TZ): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(at);
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * The instant to store for an enquiry's eventDate (and eventTime):
 *  - no date: null (a time on its own is ignored here);
 *  - "YYYY-MM-DD" alone: midnight UTC that day, the date-only value;
 *  - "YYYY-MM-DD" with "HH:MM": that time on that day in the venue's zone;
 *  - a full timestamp (an older form): as given, and eventTime is ignored.
 * Null for anything isValidEnquiryDateInput refuses.
 */
export function enquiryEventInstant(
  eventDate: string | null | undefined,
  eventTime: string | null | undefined,
  tz: string | null | undefined = DEFAULT_VENUE_TZ,
): Date | null {
  if (!eventDate) return null;
  const m = DATE_KEY.exec(eventDate);
  if (m) {
    if (!isRealDateKey(eventDate)) return null;
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const t = WALL_TIME.exec(eventTime ?? "");
    if (!t) return new Date(Date.UTC(y, mo - 1, d));
    return zonedWallTimeToDate(y, mo, d, Number(t[1]), Number(t[2]), tz || DEFAULT_VENUE_TZ);
  }
  if (!TIMESTAMP.test(eventDate)) return null;
  const at = new Date(eventDate);
  return Number.isNaN(at.getTime()) ? null : at;
}

/** Minutes `tz` is ahead of UTC at an instant. */
function offsetMinutes(at: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value);
  const wall = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return Math.round((wall - Math.floor(at.getTime() / 60_000) * 60_000) / 60_000);
}

/** The instant a calendar day starts (00:00) in `tz`, right on the days daylight saving changes too. */
function dayStartUtc(dayKey: string, tz: string): Date {
  const [y, m, d] = dayKey.split("-").map(Number);
  const wall = Date.UTC(y, m - 1, d);
  let guess = wall;
  // Twice: the offset at the first guess can be the other side of a change.
  for (let i = 0; i < 2; i++) guess = wall - offsetMinutes(new Date(guess), tz) * 60_000;
  return new Date(guess);
}

/**
 * The venue's whole calendar day that an event date falls on, as UTC
 * instants: `start` is 00:00 venue time (included) and `end` is 00:00 the
 * next day (not included), so a query is `>= start and < end`. A date-only
 * value (midnight UTC) counts as its own calendar day. For "what else is on
 * that day", where the server's own day (UTC) is the wrong one.
 * (zonedDayBoundUtc in shared/tz.ts is an hour out on the two days a year
 * the clocks change, and its "end" can land a second into the next day.)
 */
export function venueDayWindow(eventDate: Date | string, tz: string | null | undefined = DEFAULT_VENUE_TZ): { dayKey: string; start: Date; end: Date } | null {
  const zone = tz || DEFAULT_VENUE_TZ;
  const dayKey = eventDayKey(eventDate, zone);
  if (!dayKey) return null;
  const [y, m, d] = dayKey.split("-").map(Number);
  const nextKey = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  return { dayKey, start: dayStartUtc(dayKey, zone), end: dayStartUtc(nextKey, zone) };
}
