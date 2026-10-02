/**
 * Timezone helpers for turning a wall-clock calendar day in a venue's timezone
 * into the UTC instants that bound it. Used so a date range the operator picks
 * (e.g. a month of received payments) means that range of *venue* days, not
 * server-local days — the server runs UTC, so `new Date("2026-10-02T00:00:00")`
 * was a UTC midnight, shifting the boundary by the venue's offset (12–13h for
 * NZ) and mis-including payments near midnight.
 */

/** Offset in ms between the given instant's wall-clock time in `tz` and UTC. */
function tzOffsetMs(instant: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const map: Record<string, number> = {};
  for (const p of dtf.formatToParts(instant)) {
    if (p.type !== "literal") map[p.type] = Number(p.value);
  }
  const asUtc = Date.UTC(map.year, map.month - 1, map.day, map.hour % 24, map.minute, map.second);
  return asUtc - instant.getTime();
}

/**
 * The UTC instant for the start (00:00:00.000) or end (23:59:59.999) of the
 * calendar day `dateStr` (YYYY-MM-DD) as it falls in `tz`. Falls back to a plain
 * UTC interpretation if `tz` is invalid.
 */
export function zonedDayBoundUtc(dateStr: string, tz: string, which: "start" | "end"): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  const naiveMs = which === "start"
    ? Date.UTC(y, m - 1, d, 0, 0, 0, 0)
    : Date.UTC(y, m - 1, d, 23, 59, 59, 999);
  try {
    const offsetMs = tzOffsetMs(new Date(naiveMs), tz);
    return new Date(naiveMs - offsetMs);
  } catch {
    return new Date(naiveMs);
  }
}
