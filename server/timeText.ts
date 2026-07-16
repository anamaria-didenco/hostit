/**
 * Deterministic time-prefix extraction for timeline titles.
 *
 * Operators (and pasted briefs) often write the time INTO the item text —
 * "5.15pm - Final checks", "6.00pm — Canapes served", "11.45pm-Guests depart"
 * (NZ convention uses a dot, not a colon). When the importer misses these the
 * item is saved with a default sequential time and the real time stays stuck
 * in the title. This helper pulls a leading time out of a title so both the
 * import pipeline and the BEO renderer can prefer the operator's written time.
 */
export function extractLeadingTime(raw: string): { time24: string; rest: string } | null {
  const m = /^\s*(\d{1,2})(?:[.:](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?\s*(?:[-–—:·]+\s*|\s+)(.+)$/i.exec(String(raw ?? ""));
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const ap = m[3]?.toLowerCase().replace(/\./g, "");
  if (Number.isNaN(h) || h > 23 || min > 59) return null;
  // A bare number with no minutes AND no am/pm ("3 large tables") is not a time.
  if (!m[2] && !ap) return null;
  if (ap === "pm" && h < 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  const rest = m[4].trim();
  if (!rest) return null;
  return { time24: `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`, rest };
}

/** Apply extractLeadingTime across parsed timeline items: the time written in
 *  the title wins over whatever the parser guessed, and is stripped from it. */
export function healTimelineTitles<T extends { time?: string | null; title?: string | null }>(items: T[]): T[] {
  return items.map(it => {
    const ex = extractLeadingTime(String(it?.title ?? ""));
    return ex ? { ...it, time: ex.time24, title: ex.rest } : it;
  });
}
