/**
 * Keyboard and screen-reader helpers for the Calendar's month grid (weeks run
 * Monday to Sunday). Days are local calendar dates as "YYYY-MM-DD", never
 * shifted through UTC.
 *
 * The grid is one Tab stop: the arrow keys move between days, and the day
 * that has focus is the one whose controls (its events, add title, add
 * enquiry) are in the Tab order.
 */

function parts(ymd: string): [number, number, number] {
  const [y, m, d] = ymd.split("-").map(Number);
  return [y, m, d];
}

function fmt(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** The date `n` days after (or before) `ymd`. */
export function addDays(ymd: string, n: number): string {
  const [y, m, d] = parts(ymd);
  const t = new Date(y, m - 1, d + n, 12); // midday: a DST change can't skip the day
  return fmt(t.getFullYear(), t.getMonth() + 1, t.getDate());
}

/** The same day of the month `n` months on, kept inside the month (31 Jan + 1 → 28/29 Feb). */
export function addMonths(ymd: string, n: number): string {
  const [y, m, d] = parts(ymd);
  const first = new Date(y, m - 1 + n, 1, 12);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0, 12).getDate();
  return fmt(first.getFullYear(), first.getMonth() + 1, Math.min(d, last));
}

/**
 * The day a key moves focus to from `ymd`, or null when the key doesn't move
 * it: ← → a day, ↑ ↓ a week, Page Up / Page Down a month. (Home and End stay
 * within the row on screen, so the grid works those out itself.)
 */
export function monthGridTarget(ymd: string, key: string): string | null {
  switch (key) {
    case "ArrowLeft": return addDays(ymd, -1);
    case "ArrowRight": return addDays(ymd, 1);
    case "ArrowUp": return addDays(ymd, -7);
    case "ArrowDown": return addDays(ymd, 7);
    case "PageUp": return addMonths(ymd, -1);
    case "PageDown": return addMonths(ymd, 1);
    default: return null;
  }
}

/**
 * Where the grid's single Tab stop sits before anyone has moved it: today when
 * today is in the month on screen, otherwise the 1st. `month0` is 0-based.
 */
export function monthGridDefaultDay(year: number, month0: number, todayYmd: string): string {
  const [ty, tm] = parts(todayYmd);
  return ty === year && tm === month0 + 1 ? todayYmd : fmt(year, month0 + 1, 1);
}

/** "Monday 2 November" — how a day is named to a screen reader. */
export function friendlyDay(ymd: string): string {
  const [y, m, d] = parts(ymd);
  const t = new Date(y, m - 1, d, 12);
  const weekday = t.toLocaleDateString("en-NZ", { weekday: "long" });
  const month = t.toLocaleDateString("en-NZ", { month: "long" });
  return `${weekday} ${d} ${month}`;
}

/**
 * The name a month-grid day is announced by as focus arrives on it: the date,
 * "today", the day's title, and what's on (name and status of each event).
 */
export function monthCellLabel(opts: {
  ymd: string;
  isToday?: boolean;
  title?: string | null;
  events: { name: string; status: string }[];
}): string {
  const bits = [friendlyDay(opts.ymd)];
  if (opts.isToday) bits.push("today");
  if (opts.title) bits.push(opts.title);
  const n = opts.events.length;
  bits.push(n === 0 ? "no events" : `${n} ${n === 1 ? "event" : "events"}: ${opts.events.map(e => `${e.name} (${e.status})`).join("; ")}`);
  return bits.join(", ");
}

/** "PROPOSAL SENT" / "proposal_sent" → "Proposal sent"; "New Enquiry" stays as it is. */
export function statusWords(label: string): string {
  const s = label.replace(/_/g, " ").trim();
  if (s !== s.toUpperCase() && s !== s.toLowerCase()) return s;
  const lower = s.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}
