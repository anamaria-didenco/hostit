/**
 * Business-hours arithmetic for speed-to-lead ("reply within 2 business
 * hours"). Pure, timezone-aware, no holidays.
 *
 * The default week is Mon–Sat 9:00–18:00 in Pacific/Auckland. An enquiry that
 * lands at 2am is due at 9am + N; one that lands at 5:30pm with N = 2 uses the
 * last half hour today and is due at 10:30am on the next open day.
 */

export type BusinessHours = {
  timeZone: string;
  /** Open days, 0 = Sunday … 6 = Saturday. */
  days: number[];
  /** Opening and closing time, minutes after midnight (local). */
  openMin: number;
  closeMin: number;
};

export const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  timeZone: "Pacific/Auckland",
  days: [1, 2, 3, 4, 5, 6],
  openMin: 9 * 60,
  closeMin: 18 * 60,
};

const DAY_MS = 86_400_000;
const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

type ZonedParts = { year: number; month: number; day: number; weekday: number };

const dtfCache = new Map<string, Intl.DateTimeFormat>();
function dtf(timeZone: string): Intl.DateTimeFormat {
  let f = dtfCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone, hour12: false, weekday: "short",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    dtfCache.set(timeZone, f);
  }
  return f;
}

function partsOf(instantMs: number, timeZone: string) {
  const map: Record<string, string> = {};
  for (const p of dtf(timeZone).formatToParts(new Date(instantMs))) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  return {
    year: Number(map.year), month: Number(map.month), day: Number(map.day),
    hour: Number(map.hour) % 24, minute: Number(map.minute), second: Number(map.second),
    weekday: WEEKDAYS[map.weekday] ?? 0,
  };
}

/** Offset (ms) of `timeZone`'s wall clock from UTC at the given instant. */
function offsetMs(instantMs: number, timeZone: string): number {
  const p = partsOf(instantMs, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instantMs / 1000) * 1000;
}

/** The UTC instant of a wall-clock time (date + minutes after midnight) in `timeZone`. */
export function zonedTimeToUtcMs(year: number, month: number, day: number, minutes: number, timeZone: string): number {
  const naive = Date.UTC(year, month - 1, day, 0, minutes);
  // Two passes so an offset change (DST) between the guess and the answer is
  // picked up.
  const first = naive - offsetMs(naive, timeZone);
  return naive - offsetMs(first, timeZone);
}

function zonedDay(instantMs: number, timeZone: string): ZonedParts {
  const p = partsOf(instantMs, timeZone);
  return { year: p.year, month: p.month, day: p.day, weekday: p.weekday };
}

/** The calendar day after (year, month, day). */
function nextDay(d: ZonedParts): ZonedParts {
  const n = new Date(Date.UTC(d.year, d.month - 1, d.day) + DAY_MS);
  return { year: n.getUTCFullYear(), month: n.getUTCMonth() + 1, day: n.getUTCDate(), weekday: n.getUTCDay() };
}

function openWindow(d: ZonedParts, bh: BusinessHours): [number, number] | null {
  if (!bh.days.includes(d.weekday) || bh.closeMin <= bh.openMin) return null;
  return [
    zonedTimeToUtcMs(d.year, d.month, d.day, bh.openMin, bh.timeZone),
    zonedTimeToUtcMs(d.year, d.month, d.day, bh.closeMin, bh.timeZone),
  ];
}

/**
 * The instant `hours` business hours after `start`. With hours = 0 this is the
 * next moment the venue is open (or `start` itself if it already is).
 */
export function addBusinessHours(start: Date | number, hours: number, bh: BusinessHours = DEFAULT_BUSINESS_HOURS): Date {
  const startMs = typeof start === "number" ? start : start.getTime();
  let remaining = Math.max(0, hours) * 3_600_000;
  if (bh.days.length === 0 || bh.closeMin <= bh.openMin) return new Date(startMs + remaining);
  let d = zonedDay(startMs, bh.timeZone);
  // 400 days is plenty for any sane N; the cap only guards a bad config.
  for (let i = 0; i < 400; i++) {
    const win = openWindow(d, bh);
    if (win && startMs < win[1]) {
      const from = Math.max(startMs, win[0]);
      const available = win[1] - from;
      if (remaining <= available) return new Date(from + remaining);
      remaining -= available;
    }
    d = nextDay(d);
  }
  return new Date(startMs + remaining);
}

/** Business time (ms) between two instants; 0 if `to` is not after `from`. */
export function businessMsBetween(from: Date | number, to: Date | number, bh: BusinessHours = DEFAULT_BUSINESS_HOURS): number {
  const a = typeof from === "number" ? from : from.getTime();
  const b = typeof to === "number" ? to : to.getTime();
  if (b <= a) return 0;
  let total = 0;
  let d = zonedDay(a, bh.timeZone);
  for (let i = 0; i < 4000; i++) {
    const dayStart = zonedTimeToUtcMs(d.year, d.month, d.day, 0, bh.timeZone);
    if (dayStart >= b) break;
    const win = openWindow(d, bh);
    if (win) {
      const lo = Math.max(a, win[0]);
      const hi = Math.min(b, win[1]);
      if (hi > lo) total += hi - lo;
    }
    d = nextDay(d);
  }
  return total;
}

/** Whether the venue is open at `at`. */
export function isWithinBusinessHours(at: Date | number, bh: BusinessHours = DEFAULT_BUSINESS_HOURS): boolean {
  const ms = typeof at === "number" ? at : at.getTime();
  const win = openWindow(zonedDay(ms, bh.timeZone), bh);
  return !!win && ms >= win[0] && ms < win[1];
}
