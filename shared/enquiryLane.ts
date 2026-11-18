/**
 * Colour coding for the Enquiries list and Board: "the colour says what to do
 * next". Every enquiry sits in one lane, and only the lane is loud:
 *
 *   red    late or wrong: a follow-up a day or more overdue, a hold that has
 *          expired, a date clash, an open enquiry whose event date has passed.
 *          Red is kept for this and nothing else.
 *   amber  waiting on you: the client wrote back, follow up today, gone quiet,
 *          a hold about to end.
 *   blue   new: no first reply yet.
 *   green  booked: confirmed with the event still ahead.
 *   grey   gone: lost, cancelled, finished, or a booking whose day is over.
 *   calm   open with nothing due (in progress, a form never finished): no colour.
 *
 * The lane colours are fixed, the same in every venue and theme, so their
 * meaning can't change with the colours a venue picks for its statuses. A row
 * shows its lane as a band down its left edge and a dot + words in its first
 * column; the status keeps the venue's own colour as a quieter pill
 * (shared/statusPalette.ts).
 *
 * Pure: shared by the list rows, the Board cards and the tests
 * (server/enquiryLane.test.ts checks every colour here in every theme).
 */
import { daysBetweenKeys, isOpenStatus, rowDatePassed, rowNeeds, todayKey, type ListCtx, type ListRow } from "./enquiryFilters";

export type Lane = "red" | "amber" | "blue" | "green" | "grey" | "calm";

/**
 * The lane's mark: dot, left band, heading rule. At least 3:1 on the card,
 * the page, the Board's cream, a selected row, a hovered row and the heading
 * wash, in every theme.
 */
export const LANE_MARK: Record<Lane, string> = {
  red: "#c0392b",
  amber: "#a46200",
  blue: "#2f6db3",
  green: "#2d7a47",
  grey: "#7a7268",
  calm: "transparent",
};

/** The lane's words. At least 4.5:1 on the same surfaces. */
export const LANE_INK: Record<Lane, string> = {
  red: "#9e2e23",
  amber: "#7a5414",
  blue: "#2a5592",
  green: "#2b6339",
  grey: "#625a50",
  calm: "var(--muted-foreground)",
};

/** A light wash of the lane, for group and month headings. */
export const LANE_TINT: Record<Lane, string> = {
  red: "#c0392b17",
  amber: "#a462001c",
  blue: "#2f6db317",
  green: "#2d7a4717",
  grey: "#7a726814",
  calm: "transparent",
};

/** What each lane means, in words. */
export const LANE_LABEL: Record<Lane, string> = {
  red: "Late",
  amber: "Waiting on you",
  blue: "New",
  green: "Booked",
  grey: "Closed",
  calm: "Nothing due",
};

export interface RowLane {
  lane: Lane;
  /** What the dot says: "Waiting 3d 4h", "Date clash", "Event in 12d". */
  text: string;
  /** A second, quieter line when the lane's reason isn't the Needs line ("Waiting 9d 22h" under "Date clash"). */
  sub?: string;
}

/** The lane an enquiry sits in, and the words its dot carries. First match wins. */
export function rowLane(row: ListRow, ctx: ListCtx): RowLane {
  const needs = rowNeeds(row, ctx);
  const { signal, lead } = row;
  const open = isOpenStatus(lead.status);
  const status = String(lead.status ?? "").toLowerCase();

  if (signal.group === "closed") return { lane: "grey", text: needs.text };
  if (status === "booked" || status === "confirmed") {
    // A booking with a clash stays green: its date turns red instead.
    if (row.eventDay && daysBetweenKeys(todayKey(ctx), row.eventDay) < 0) return { lane: "grey", text: needs.text };
    return { lane: "green", text: needs.text };
  }

  // Red: something is late or wrong. A clash or a passed date outranks the
  // Needs line, which then moves under it.
  const clash = open && (!!row.clash || signal.kind === "clash");
  if (clash) return { lane: "red", text: "Date clash", sub: signal.kind === "clash" ? undefined : needs.text };
  if (open && rowDatePassed(row, ctx)) {
    return { lane: "red", text: "Date passed", sub: signal.kind === "date_passed" ? undefined : needs.text };
  }
  switch (signal.kind) {
    // Red from the day after the follow-up date; amber on the day itself.
    case "followup_overdue": return { lane: signal.tone === "red" ? "red" : "amber", text: needs.text };
    case "hold_expired": return { lane: "red", text: needs.text };
    case "waiting": return { lane: "blue", text: needs.text };
    case "client_replied": case "gone_quiet": case "hold": return { lane: "amber", text: needs.text };
    default: return { lane: "calm", text: needs.text };
  }
}

/**
 * The lane a view tab or a search pile's heading carries, only where every
 * row in it shares one. "calm" = none: Needs reply and Follow-up due mix red,
 * amber and blue rows, so a blue or amber dot there would misname the rest.
 */
export function groupLane(id: string): Lane {
  switch (id) {
    case "confirmed": return "green";
    case "closed": return "grey";
    default: return "calm";
  }
}
