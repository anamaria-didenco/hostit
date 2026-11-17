// The public enquiry form's time list (half-hour slots), made quick to use
// from the keyboard: it opens on the chosen time (or 6:00 pm, the common start
// for an event, rather than midnight), arrow keys move through it, and typing
// a time ("7", "7p", "730", "19:30") jumps to it. Pure, so it can be tested.

/** "00:00", "00:30", … "23:30". */
export function halfHourSlots(): string[] {
  const out: string[] = [];
  for (let h = 0; h < 24; h++) for (let m = 0; m < 60; m += 30) out.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  return out;
}

const toMinutes = (hhmm: string) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
};

/**
 * The slot to put focus on when the list opens: the chosen time, the first
 * slot after it (for an exact time like 7:15), or `fallback`.
 */
export function initialSlotIndex(slots: string[], value: string | null | undefined, fallback = "18:00"): number {
  const target = toMinutes(value || "") >= 0 ? toMinutes(value!) : toMinutes(fallback);
  const i = slots.findIndex(s => toMinutes(s) >= target);
  return i === -1 ? slots.length - 1 : i;
}

const tidy = (s: string) => s.toLowerCase().replace(/[\s:.]/g, "");

/** What a typed query can match for one slot: "18:30" → "630pm", "1830", "630". */
function slotKeys(hhmm: string): string[] {
  const [h, m] = hhmm.split(":").map(Number);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const ap = h >= 12 ? "pm" : "am";
  const mm = String(m).padStart(2, "0");
  const keys = [`${h12}${mm}${ap}`, `${String(h).padStart(2, "0")}${mm}`, `${h}${mm}`, `${h12}${mm}`];
  if (m === 0) keys.push(`${h12}${ap}`);
  return keys;
}

/**
 * The slot a typed query points at, searching forward from `from` (wrapping
 * round), or -1. Starting from the focused slot means "7" from 6:00 pm lands
 * on 7:00 pm, and "7a" on 7:00 am.
 */
export function matchSlot(slots: string[], query: string, from = 0): number {
  const q = tidy(query);
  if (!q) return -1;
  for (let k = 0; k < slots.length; k++) {
    const i = (Math.max(0, from) + k) % slots.length;
    if (slotKeys(slots[i]).some(key => key.startsWith(q))) return i;
  }
  return -1;
}

/** Where a navigation key moves focus in a list of `count` slots, or null for other keys. */
export function moveSlot(index: number, key: string, count: number): number | null {
  const clamp = (n: number) => Math.min(count - 1, Math.max(0, n));
  switch (key) {
    case "ArrowDown": return clamp(index + 1);
    case "ArrowUp": return clamp(index - 1);
    case "PageDown": return clamp(index + 4);
    case "PageUp": return clamp(index - 4);
    case "Home": return 0;
    case "End": return count - 1;
    default: return null;
  }
}
