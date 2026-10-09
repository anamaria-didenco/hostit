/**
 * Pure logic behind the public enquiry form's conversion features — no
 * database, no network, so it can be unit-tested directly:
 *
 *  - NZ-calendar date maths (the server may run in UTC; Auckland is UTC+12/+13)
 *  - availability aggregation for the date picker (dates + states only)
 *  - walkthrough slot generation (Pacific/Auckland wall-clock, DST-safe)
 *  - a minimal .ics calendar file for the walkthrough confirmation
 *  - spam checks: honeypot + signed "form opened at" token
 *
 * The DB-backed wrappers live in server/enquiryForm.ts.
 */
import { createHmac, timingSafeEqual } from "crypto";

export const VENUE_TZ = "Pacific/Auckland";

// ─── Time-zone maths ─────────────────────────────────────────────────────────

function partsInTz(at: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value);
  return { y: get("year"), m: get("month"), d: get("day"), hh: get("hour"), mm: get("minute"), ss: get("second") };
}

/** Minutes the zone is ahead of UTC at that instant (NZ: 720 or 780). */
export function tzOffsetMinutes(at: Date, tz: string = VENUE_TZ): number {
  const p = partsInTz(at, tz);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss);
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60000);
}

/**
 * The UTC instant of a wall-clock time in `tz`. Returns null for a time that
 * doesn't exist (the hour skipped when daylight saving starts). For a time
 * that happens twice (the hour repeated when it ends) the first is returned.
 */
export function zonedTimeToUtc(y: number, m: number, d: number, hh: number, mm: number, tz: string = VENUE_TZ): Date | null {
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  // Try both offsets either side of the guess; keep any that round-trips.
  const candidates = new Set<number>();
  for (const probe of [wall - 14 * 3600_000, wall, wall + 14 * 3600_000]) {
    candidates.add(wall - tzOffsetMinutes(new Date(probe), tz) * 60_000);
  }
  const valid = [...candidates]
    .filter(t => {
      const p = partsInTz(new Date(t), tz);
      return p.y === y && p.m === m && p.d === d && p.hh === hh && p.mm === mm;
    })
    .sort((a, b) => a - b);
  return valid.length ? new Date(valid[0]) : null;
}

/** "YYYY-MM-DD" of an instant on the venue's calendar (not UTC's). */
export function dateKeyInTz(at: Date, tz: string = VENUE_TZ): string {
  const p = partsInTz(at, tz);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

export function addDaysToKey(key: string, n: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10); // pure calendar maths in UTC — no zone involved
}

/** 0 = Sunday … 6 = Saturday, for a "YYYY-MM-DD" calendar date. */
export function weekdayOfKey(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** "Tue 14 Oct, 10:30am" in the venue's zone. */
// Fixed names rather than Intl's: ICU versions disagree ("Sep" vs "Sept"),
// and this label is stored on the lead.
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function formatSlotLabel(at: Date, tz: string = VENUE_TZ): string {
  const p = partsInTz(at, tz);
  const key = `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
  return `${WEEKDAYS[weekdayOfKey(key)]} ${p.d} ${MONTHS[p.m - 1]}, ${formatTimeLabel(p.hh, p.mm)}`;
}
/** "Tue 14 Oct" for a "YYYY-MM-DD" key. */
export function formatDayLabel(key: string): string {
  const [, m, d] = key.split("-").map(Number);
  return `${WEEKDAYS[weekdayOfKey(key)]} ${d} ${MONTHS[m - 1]}`;
}
export function formatTimeLabel(hh: number, mm: number): string {
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${String(mm).padStart(2, "0")}${hh < 12 ? "am" : "pm"}`;
}

// ─── Availability for the date picker ────────────────────────────────────────

export type FormSpace = { id: number; name: string };
/** Something that takes a space for a day: a confirmed booking or an active hold. */
export type Occupancy = { at: Date; spaceName: string | null };
export type AvailabilityResult = { booked: string[]; limited: string[] };

const WHOLE_VENUE = /\b(whole|entire|full|exclusive)\b/i;
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Which configured spaces a booking's free-text spaceName covers. A name can
 * list several ("Bar + Restaurant") or mean the lot ("Whole venue"). A name
 * that matches nothing is `unknown`: we can't tell which space it holds, so
 * it never marks a date fully booked on its own.
 */
export function spacesCovered(spaceName: string | null | undefined, spaces: FormSpace[]): { all: boolean; ids: number[]; unknown: boolean } {
  const raw = (spaceName ?? "").trim();
  if (!raw) return { all: false, ids: [], unknown: true };
  const exact = spaces.find(s => norm(s.name) === norm(raw));
  if (exact) return { all: false, ids: [exact.id], unknown: false };
  if (WHOLE_VENUE.test(raw)) return { all: true, ids: spaces.map(s => s.id), unknown: false };
  const tokens = raw.split(/\s*(?:,|\+|&|\/|\band\b)\s*/i).map(norm).filter(Boolean);
  const ids = spaces.filter(s => tokens.includes(norm(s.name))).map(s => s.id);
  return { all: false, ids, unknown: ids.length === 0 };
}

/**
 * Collapse a month of occupancies into date states. Returns dates only —
 * never who booked.
 *  - No spaces configured: the venue is one room, so any booking fills it.
 *  - Asking about one space: booked when that space (or the whole venue) is
 *    taken; "limited" when something else is on that day.
 *  - Asking about the venue: booked when every space is taken; "limited"
 *    when some are.
 */
export function aggregateAvailability(opts: {
  monthKey: string; // "YYYY-MM"
  spaces: FormSpace[];
  occupancies: Occupancy[];
  spaceId?: number | null;
  tz?: string;
}): AvailabilityResult {
  const tz = opts.tz ?? VENUE_TZ;
  const byDay = new Map<string, { ids: Set<number>; all: boolean; unknown: boolean; any: boolean }>();
  for (const o of opts.occupancies) {
    const key = dateKeyInTz(o.at, tz);
    if (!key.startsWith(opts.monthKey + "-")) continue;
    const day = byDay.get(key) ?? { ids: new Set<number>(), all: false, unknown: false, any: false };
    const c = spacesCovered(o.spaceName, opts.spaces);
    c.ids.forEach(id => day.ids.add(id));
    day.all ||= c.all;
    day.unknown ||= c.unknown;
    day.any = true;
    byDay.set(key, day);
  }
  const booked: string[] = [];
  const limited: string[] = [];
  const target = opts.spaceId != null ? opts.spaces.find(s => s.id === opts.spaceId) : undefined;
  for (const [key, day] of [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    let full: boolean;
    if (opts.spaces.length === 0) full = day.any;
    else if (target) full = day.all || day.ids.has(target.id);
    else full = day.all || opts.spaces.every(s => day.ids.has(s.id));
    if (full) booked.push(key);
    else if (day.any) limited.push(key);
  }
  return { booked, limited };
}

// ─── Walkthrough slots ───────────────────────────────────────────────────────

export type WalkthroughSettings = {
  enabled: boolean;
  days: number[];       // JS weekdays, 0 = Sun
  start: string;        // "HH:MM"
  end: string;          // "HH:MM"
  slotMinutes: number;
  daysAhead: number;
};

export const DEFAULT_WALKTHROUGH: WalkthroughSettings = {
  enabled: true, days: [2, 3, 4, 5, 6], start: "10:00", end: "16:00", slotMinutes: 30, daysAhead: 14,
};

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Venue-settings row → validated settings, falling back to defaults field by field. */
export function parseWalkthroughSettings(vs: Record<string, any> | null | undefined): WalkthroughSettings {
  const d = DEFAULT_WALKTHROUGH;
  const days = String(vs?.walkthroughDays ?? d.days.join(","))
    .split(",").map(s => parseInt(s, 10)).filter(n => n >= 0 && n <= 6);
  const start = HHMM.test(vs?.walkthroughStart ?? "") ? vs!.walkthroughStart : d.start;
  const end = HHMM.test(vs?.walkthroughEnd ?? "") ? vs!.walkthroughEnd : d.end;
  const slot = Number(vs?.walkthroughSlotMinutes);
  const ahead = Number(vs?.walkthroughDaysAhead);
  return {
    enabled: (vs?.walkthroughEnabled ?? 1) !== 0,
    days: [...new Set(days)].sort(),
    start, end,
    slotMinutes: Number.isFinite(slot) && slot >= 10 && slot <= 240 ? Math.round(slot) : d.slotMinutes,
    daysAhead: Number.isFinite(ahead) && ahead >= 1 && ahead <= 90 ? Math.round(ahead) : d.daysAhead,
  };
}

// ─── Walkthrough requests ────────────────────────────────────────────────────
// Clients ask for a walkthrough and say which days and times suit them; the
// venue confirms a real time later (staff aren't always on site, so the form
// never books one by itself).

export const WALKTHROUGH_TIMES = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
  any: "Any time",
} as const;
export type WalkthroughTimeOfDay = keyof typeof WALKTHROUGH_TIMES;

/** The days a client can suggest: from tomorrow (NZ), on the venue's walkthrough weekdays. */
export function walkthroughRequestDays(now: Date, settings: WalkthroughSettings): Array<{ key: string; label: string }> {
  if (!settings.enabled || settings.days.length === 0) return [];
  const today = dateKeyInTz(now);
  const out: Array<{ key: string; label: string }> = [];
  for (let i = 1; i <= settings.daysAhead; i++) {
    const key = addDaysToKey(today, i);
    if (settings.days.includes(weekdayOfKey(key))) out.push({ key, label: formatDayLabel(key) });
  }
  return out;
}

/** "Tue 14 Oct or Thu 16 Oct · Morning — note", stored on the lead and shown to staff. */
export function describeWalkthroughRequest(req: { dates: string[]; timeOfDay: WalkthroughTimeOfDay; note?: string | null }): string {
  const days = req.dates.length === 0 ? "Any day"
    : req.dates.map(formatDayLabel).join(req.dates.length === 2 ? " or " : ", ").replace(/, ([^,]*)$/, req.dates.length > 2 ? " or $1" : ", $1");
  const note = req.note?.trim();
  return `${days} · ${WALKTHROUGH_TIMES[req.timeOfDay]}${note ? ` — "${note}"` : ""}`;
}

export type Interval = { start: Date; end: Date };
export type WalkthroughSlot = { start: Date; end: Date; dayKey: string; label: string; timeLabel: string };

/**
 * Bookable walkthrough slots from tomorrow (venue time) for `daysAhead` days,
 * on the chosen weekdays between start and end, skipping any slot that
 * overlaps a busy interval (another walkthrough, or an event in progress).
 */
export function generateWalkthroughSlots(opts: {
  now: Date;
  settings: WalkthroughSettings;
  busy: Interval[];
  tz?: string;
}): WalkthroughSlot[] {
  const tz = opts.tz ?? VENUE_TZ;
  const s = opts.settings;
  if (!s.enabled || s.days.length === 0) return [];
  const [sh, sm] = s.start.split(":").map(Number);
  const [eh, em] = s.end.split(":").map(Number);
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;
  const slotMs = s.slotMinutes * 60_000;
  const today = dateKeyInTz(opts.now, tz);
  const out: WalkthroughSlot[] = [];
  for (let i = 1; i <= s.daysAhead; i++) {
    const key = addDaysToKey(today, i);
    if (!s.days.includes(weekdayOfKey(key))) continue;
    const [y, m, d] = key.split("-").map(Number);
    for (let t = startMin; t + s.slotMinutes <= endMin; t += s.slotMinutes) {
      const start = zonedTimeToUtc(y, m, d, Math.floor(t / 60), t % 60, tz);
      if (!start || start.getTime() <= opts.now.getTime()) continue;
      const end = new Date(start.getTime() + slotMs);
      if (opts.busy.some(b => b.start < end && b.end > start)) continue;
      out.push({ start, end, dayKey: key, label: formatSlotLabel(start, tz), timeLabel: formatTimeLabel(Math.floor(t / 60), t % 60) });
    }
  }
  return out;
}

// ─── .ics calendar file ──────────────────────────────────────────────────────

const icsDate = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const icsText = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Fold a content line at 75 octets, per RFC 5545 §3.1. */
function foldLine(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let cur = "";
  let curLen = 0;
  for (const ch of line) {
    const n = Buffer.byteLength(ch, "utf8");
    const limit = out.length === 0 ? 75 : 74; // continuation lines start with a space
    if (curLen + n > limit) { out.push(cur); cur = ""; curLen = 0; }
    cur += ch; curLen += n;
  }
  out.push(cur);
  return out.join("\r\n ");
}

export function buildIcs(ev: {
  uid: string; start: Date; end: Date; summary: string;
  description?: string; location?: string; organizerName?: string; organizerEmail?: string; now?: Date;
}): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//VenueFlowHQ//Walkthrough//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${ev.uid}`,
    `DTSTAMP:${icsDate(ev.now ?? new Date())}`,
    `DTSTART:${icsDate(ev.start)}`,
    `DTEND:${icsDate(ev.end)}`,
    `SUMMARY:${icsText(ev.summary)}`,
    ev.description ? `DESCRIPTION:${icsText(ev.description)}` : "",
    ev.location ? `LOCATION:${icsText(ev.location)}` : "",
    ev.organizerEmail ? `ORGANIZER;CN=${icsText(ev.organizerName ?? ev.organizerEmail).replace(/[:;]/g, "")}:mailto:${ev.organizerEmail}` : "",
    "STATUS:CONFIRMED",
    "TRANSP:OPAQUE",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

// ─── Spam checks ─────────────────────────────────────────────────────────────

/** A person can't open the form and send it in under this. */
export const MIN_FORM_FILL_MS = 3000;

function sign(ownerId: number, issuedAt: number, secret: string) {
  return createHmac("sha256", secret).update(`form-start:${ownerId}:${issuedAt}`).digest("base64url").slice(0, 22);
}

/** Issued when the form loads; proves when that was without trusting the browser's clock. */
export function formStartToken(ownerId: number, issuedAt: number, secret: string): string {
  return `${issuedAt.toString(36)}.${sign(ownerId, issuedAt, secret)}`;
}

export type FormTokenCheck = "ok" | "missing" | "invalid" | "too_fast";
export function checkFormStartToken(token: string | null | undefined, ownerId: number, now: number, secret: string): FormTokenCheck {
  if (!token) return "missing";
  const [ts, sig] = token.split(".");
  const issuedAt = parseInt(ts ?? "", 36);
  if (!Number.isFinite(issuedAt) || !sig) return "invalid";
  const expected = Buffer.from(sign(ownerId, issuedAt, secret));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return "invalid";
  if (now - issuedAt < MIN_FORM_FILL_MS) return "too_fast";
  return "ok";
}

/**
 * True when a public form write looks automated: the hidden honeypot field
 * was filled in, or the form was sent back faster than a person could, or its
 * timing token was forged. A missing token is let through so a page loaded
 * before this shipped (cached, or a long-open tab) can still submit.
 */
export function looksLikeBot(opts: { honeypot?: string | null; formToken?: string | null; ownerId: number; now: number; secret: string }): { bot: boolean; reason?: string } {
  if ((opts.honeypot ?? "").trim()) return { bot: true, reason: "honeypot" };
  const t = checkFormStartToken(opts.formToken, opts.ownerId, opts.now, opts.secret);
  if (t === "too_fast" || t === "invalid") return { bot: true, reason: t };
  return { bot: false };
}
