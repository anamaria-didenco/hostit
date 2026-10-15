/** Small date helpers for the Overview panels. They read the venue's own day
 *  ("2026-10-24") and start time ("18:30") the server worked out, so nothing
 *  here depends on the device's time zone. */

/** "Sat 24 Oct" for a venue day key. */
export function dayLabel(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  if (!y || !m || !d) return "";
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-NZ", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

/** "6:30 pm" for "18:30"; "" when there is no time. */
export function hhmmLabel(hhmm: string | null | undefined): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm ?? "");
  if (!m) return "";
  const h = Number(m[1]), min = m[2];
  return `${h % 12 === 0 ? 12 : h % 12}${min === "00" ? "" : `:${min}`} ${h < 12 ? "am" : "pm"}`;
}
