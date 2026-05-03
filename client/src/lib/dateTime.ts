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
