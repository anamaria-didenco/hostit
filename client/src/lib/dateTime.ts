/**
 * The venue's timezone. Every display formatter resolves calendar dates and
 * times-of-day in this zone so a UTC server, an overseas browser and a local
 * one all agree on "what day/time is this for the venue". Kept here as the one
 * place the app's NZ identity is encoded for date/time rendering.
 */
export const VENUE_TZ = "Pacific/Auckland";

type DateInput = Date | string | number | null | undefined;

function toDate(value: DateInput): Date | null {
  if (value == null || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

/** "6:30 pm" from a 24h "HH:MM" clock string. Lowercase am/pm, no padding. */
function clockToAmPm(h24: number, m: number): string {
  const period = h24 < 12 ? "am" : "pm";
  let h12 = h24 % 12;
  if (h12 === 0) h12 = 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

export type DateStyle = "short" | "long" | "weekday" | "dayMonth";

const DATE_OPTS: Record<DateStyle, Intl.DateTimeFormatOptions> = {
  // "15 Oct 2026"
  short: { day: "numeric", month: "short", year: "numeric" },
  // "Thursday, 15 October 2026"
  long: { weekday: "long", day: "numeric", month: "long", year: "numeric" },
  // "Thu, 15 Oct 2026"
  weekday: { weekday: "short", day: "numeric", month: "short", year: "numeric" },
  // "15 Oct"
  dayMonth: { day: "numeric", month: "short" },
};

/**
 * Format a calendar date in the venue's timezone. One function for every date
 * the UI shows, so "15 Oct 2026", "15/10/2026" and friends stop drifting apart.
 * Returns "" for empty/invalid input so callers can render a dash themselves.
 */
export function fmtDate(value: DateInput, style: DateStyle = "short"): string {
  const d = toDate(value);
  if (!d) return "";
  return new Intl.DateTimeFormat("en-NZ", { timeZone: VENUE_TZ, ...DATE_OPTS[style] }).format(d);
}

/**
 * Format a time-of-day as "7:30 pm" (lowercase am/pm). Accepts either a 24h
 * "HH:MM" clock string (formatted as-is, no timezone) or a Date/ISO value
 * (rendered as the time-of-day in the venue's timezone). Returns "" for empty,
 * invalid, or date-only ("time-less") values so a misleading "12:00 am" never
 * shows.
 */
export function fmtTime(value: DateInput): string {
  if (value == null || value === "") return "";
  if (typeof value === "string") {
    const m = value.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (m) return clockToAmPm(Number(m[1]), Number(m[2]));
  }
  const d = toDate(value);
  if (!d || isTimeless(d)) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: VENUE_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const h = Number(parts.find(p => p.type === "hour")?.value ?? "0");
  const min = Number(parts.find(p => p.type === "minute")?.value ?? "0");
  return clockToAmPm(h === 24 ? 0 : h, min);
}

/** "15 Oct 2026 · 7:30 pm" — a date and its time-of-day, when both are set. */
export function fmtDateTime(value: DateInput, style: DateStyle = "short"): string {
  const date = fmtDate(value, style);
  const time = fmtTime(value);
  return time ? `${date} · ${time}` : date;
}

/**
 * Internal: a date is "time-less" when it sits exactly on UTC midnight with
 * zero seconds AND zero milliseconds. Explicit-time entries that would
 * naturally land on UTC midnight (e.g. 12:00 PM in NZ standard time, where
 * UTC+12 turns noon-local into UTC midnight) are stored with a 1 ms offset by
 * `combineLocalDateTime` so they remain distinguishable from legacy
 * date-only entries.
 */
function isTimeless(d: Date): boolean {
  return (
    d.getUTCHours() === 0 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 &&
    d.getUTCMilliseconds() === 0
  );
}

/**
 * Format an event's time-of-day from a Date / ISO string in the user's local
 * timezone. Returns "" for date-only legacy values so callers can conditionally
 * render the time without showing a misleading "12:00 AM".
 */
export function fmtEventTime(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";
  if (isTimeless(d)) return "";
  return d.toLocaleTimeString("en-NZ", { hour: "numeric", minute: "2-digit", hour12: true });
}

/**
 * Extract the HH:MM (24h, local) portion of an event date for use in <input type="time">.
 * Returns "" when there is no meaningful time.
 */
export function extractEventTimeHHMM(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";
  if (isTimeless(d)) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * Extract a "YYYY-MM-DD" local date string for use in <input type="date">.
 */
export function toLocalDateInput(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Combine a local date string ("YYYY-MM-DD") with an optional local time
 * ("HH:MM") into an ISO UTC string. When the resulting ISO would land exactly
 * on UTC midnight (which collides with the "no time set" sentinel for users in
 * UTC+12 / UTC+13 setting a noon-local time), we bump by 1 ms so the explicit
 * time remains distinguishable from legacy date-only entries.
 */
export function combineLocalDateTime(date: string | undefined | null, time: string | undefined | null): string | undefined {
  if (!date) return undefined;
  if (!time) return date;
  const iso = new Date(`${date}T${time}:00`).toISOString();
  if (iso.endsWith("T00:00:00.000Z")) {
    return new Date(`${date}T${time}:00.001`).toISOString();
  }
  return iso;
}
