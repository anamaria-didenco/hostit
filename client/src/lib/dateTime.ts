/**
 * Format an event's time-of-day from a Date / ISO string in the user's local
 * timezone. Returns "" for date-only legacy values (where local hour+min are 0)
 * so callers can conditionally render the time without showing a misleading
 * "12:00 AM" for entries that never had a time set.
 */
export function fmtEventTime(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";
  // Legacy date-only entries are stored as UTC midnight (from new Date("YYYY-MM-DD")).
  // Treat UTC-midnight values as "no time set" so they don't show a misleading time.
  if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0) return "";
  return d.toLocaleTimeString("en-NZ", { hour: "numeric", minute: "2-digit", hour12: true });
}

/**
 * Extract the HH:MM (24h, local) portion of an event date for use in <input type="time">.
 * Returns "" when there is no meaningful time (legacy date-only entries).
 */
export function extractEventTimeHHMM(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";
  // Legacy date-only entries (UTC midnight) → treat as no time set so the
  // edit form shows an empty time input rather than a fake 12:00 PM.
  if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * Extract a "YYYY-MM-DD" local date string for use in <input type="date">.
 * Uses the user's local timezone so a NZ-stored timestamp displays as the
 * matching NZ calendar day rather than the UTC day.
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
 * ("HH:MM") into an ISO UTC string that round-trips correctly through the
 * server's `new Date()` parsing. When time is empty we send the bare date so
 * the server stores it as UTC midnight (matching the legacy behaviour and
 * displaying as the same calendar day in the venue's timezone).
 */
export function combineLocalDateTime(date: string | undefined | null, time: string | undefined | null): string | undefined {
  if (!date) return undefined;
  if (!time) return date;
  return new Date(`${date}T${time}:00`).toISOString();
}
