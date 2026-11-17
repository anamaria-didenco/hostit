/**
 * The venue's enquiry statuses (pipeline stages): the default list, how a saved
 * list is read back, and the rules the Statuses editor needs. Pure, so the
 * server tests can check them; the colours' CSS classes stay in
 * client/src/components/StatusManager.tsx.
 */
export type StatusDef = {
  key: string;
  label: string;
  colorId: string;
};

export const DEFAULT_STATUSES: StatusDef[] = [
  { key: "new",           label: "New Enquiry",   colorId: "blue"    },
  { key: "contacted",     label: "Contacted",     colorId: "sky"     },
  { key: "proposal_sent", label: "Proposal Sent", colorId: "amber"   },
  { key: "negotiating",   label: "Negotiating",   colorId: "orange"  },
  // A date hold (server/holds.ts): the date is kept for the client until an expiry.
  { key: "tentative",     label: "On Hold",       colorId: "purple"  },
  { key: "booked",        label: "Confirmed",     colorId: "forest"  },
  { key: "finished",      label: "Finished",      colorId: "gray"    },
  { key: "lost",          label: "Lost",          colorId: "red"     },
];

export function parseCustomStatuses(raw: string | null | undefined): StatusDef[] {
  if (!raw) return DEFAULT_STATUSES;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) return keepHoldDistinct(parsed);
  } catch {}
  return DEFAULT_STATUSES;
}

/**
 * The list the Statuses editor may start from, or null while the venue's
 * settings are still loading (or failed to load). The editor keeps its own copy
 * and saves the whole list on every change, so starting it from the defaults
 * before the saved list arrives would write the defaults over the venue's real
 * statuses. `null` from the server means the venue has no settings yet, and the
 * defaults are then the right place to start.
 */
export function statusEditorSeed(
  venueSettings: { customStatuses?: string | null } | null | undefined,
): StatusDef[] | null {
  if (venueSettings === undefined) return null;
  return parseCustomStatuses(venueSettings?.customStatuses);
}

// Proposal Sent and On Hold used to share the yellow family, so on the calendar,
// the legend and the lists you couldn't tell a held date from a quote out with
// the client. A venue's saved list that still has them in the same family gets
// On Hold moved to purple (the new default). Any other colour a venue chose for
// On Hold is left alone, and it can be changed again in Settings → Statuses.
const YELLOW_FAMILY = new Set(["yellow", "amber"]);
export const HOLD_FALLBACK_COLOR_ID = "purple";

export function keepHoldDistinct(list: StatusDef[]): StatusDef[] {
  if (!holdColourClash(list)) return list;
  return list.map(s => (s.key === "tentative" ? { ...s, colorId: HOLD_FALLBACK_COLOR_ID } : s));
}

/** True when keepHoldDistinct would recolour On Hold in this list. */
export function holdColourClash(list: StatusDef[]): boolean {
  const proposal = list.find(s => s.key === "proposal_sent");
  const hold = list.find(s => s.key === "tentative");
  if (!proposal || !hold) return false;
  return YELLOW_FAMILY.has(proposal.colorId) && YELLOW_FAMILY.has(hold.colorId);
}

/**
 * What to tell the venue when the colours it picked would make On Hold look like
 * Proposal Sent, so On Hold is shown in purple instead. Null when nothing is
 * overridden. Without this the editor said "Statuses saved" and the colour
 * silently changed back after a reload.
 */
export function holdColourNote(list: StatusDef[]): string | null {
  if (!holdColourClash(list)) return null;
  const hold = list.find(s => s.key === "tentative")!;
  const proposal = list.find(s => s.key === "proposal_sent")!;
  return `${hold.label} will show in Purple so it can't be mistaken for ${proposal.label} (Gold and Yellow look too alike).`;
}
