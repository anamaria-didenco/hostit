/**
 * How the website enquiry form reads and sends some answers: the guest count
 * as people type it, the date and time as the venue's wall clock, and the
 * message with the lines the form adds. Pure functions over the form's
 * strings, so LeadForm.tsx and the tests (server/leadFormFields.test.ts)
 * share them. The rules themselves are in shared/enquiryRules.ts and
 * shared/enquiryWallTime.ts, which the server uses too.
 */
import { ENQUIRY_LIMITS, guestCountAsTypedLine, parseGuestCount } from "@shared/enquiryRules";
import { isRealDateKey, isWallTime } from "@shared/enquiryWallTime";

// ─── Guest count ─────────────────────────────────────────────────────────────

/** The message under Guest Count, or null when the answer is fine. */
export function guestCountError(raw: string | null | undefined, required: boolean): string | null {
  const p = parseGuestCount(raw);
  if (p.kind === "ok") return null;
  if (p.kind === "empty") return required ? "Please tell us how many guests you're expecting." : null;
  if (p.reason === "no_number") return "Please enter one number, e.g. 40.";
  if (p.reason === "too_many") return "That number looks too big. Please check it.";
  return "Enter 1 or more guests.";
}

/** The number sent as guestCount, or null when there isn't a usable one. */
export function guestCountValue(raw: string | null | undefined): number | null {
  const p = parseGuestCount(raw);
  return p.kind === "ok" ? p.value : null;
}

/** "We'll note this as 40 guests." under the box when the answer wasn't one plain number. */
export function guestCountNote(raw: string | null | undefined): string | null {
  const p = parseGuestCount(raw);
  if (p.kind !== "ok" || p.exact) return null;
  return `We'll note this as ${p.value.toLocaleString("en-NZ")} ${p.value === 1 ? "guest" : "guests"}.`;
}

/** The number to check with "Did you mean …?" before sending (a very large one), else null. */
export function guestCountToConfirm(raw: string | null | undefined): number | null {
  const p = parseGuestCount(raw);
  return p.kind === "ok" && p.needsConfirm ? p.value : null;
}

// ─── Date and time ───────────────────────────────────────────────────────────

/** "7:30 pm" from "19:30". */
export function wallTimeLabel(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

/**
 * What goes on the wire for the event's date and time: the picked day as
 * "YYYY-MM-DD" and the time as "HH:MM", the venue's wall clock (the server
 * places them in the venue's time zone, so a phone set to Sydney or London no
 * longer shifts them). A time picked without a date isn't lost: it goes into
 * the message as "Preferred time: 7:30 pm" (`timeLine`).
 */
export function eventDateForWire(a: { eventDate?: string | null; eventTime?: string | null; noDateYet: boolean }): {
  eventDate?: string; eventTime?: string; timeLine: string | null;
} {
  const time = isWallTime(a.eventTime) ? a.eventTime! : null;
  const date = (a.eventDate ?? "").trim();
  if (!a.noDateYet && isRealDateKey(date)) return { eventDate: date, ...(time ? { eventTime: time } : {}), timeLine: null };
  return { timeLine: time ? `Preferred time: ${wallTimeLabel(time)}` : null };
}

// ─── Message ─────────────────────────────────────────────────────────────────

/**
 * The message sent with the enquiry: what the visitor typed, the venue's own
 * questions with their answers, then the lines the form adds (the guest count
 * as typed when it wasn't one plain number, a time picked without a date).
 * Kept under the server's limit for the whole message.
 */
export function buildEnquiryMessage(a: {
  message?: string | null;
  custom?: Array<[string, string]>;
  guestCount?: string | null;
  timeLine?: string | null;
}): string | undefined {
  const parts = [
    (a.message ?? "").trim(),
    ...(a.custom ?? []).filter(([, v]) => v.trim()).map(([k, v]) => `${k}: ${v.trim()}`),
    guestCountAsTypedLine(a.guestCount) ?? "",
    a.timeLine ?? "",
  ].filter(Boolean);
  if (!parts.length) return undefined;
  const all = parts.join("\n\n");
  const max = ENQUIRY_LIMITS.messageTotal;
  return all.length > max ? `${all.slice(0, max - 1)}…` : all;
}

// ─── After SUBMIT ────────────────────────────────────────────────────────────

export type AutoReplyState = "sent" | "sending" | "none";

/**
 * Whether the visitor's copy of the enquiry has gone, from submit's answer:
 * `autoReply`, or for a server from before it, `autoReplySent`.
 */
export function autoReplyState(data: unknown): AutoReplyState {
  const d = (data ?? {}) as { autoReply?: unknown; autoReplySent?: unknown };
  if (d.autoReply === "sent" || d.autoReply === "sending" || d.autoReply === "none") return d.autoReply;
  return d.autoReplySent === true ? "sent" : "none";
}

/** The line on "Enquiry Received!" about the visitor's copy: only ever what's true. */
export function autoReplyNote(state: AutoReplyState): string | null {
  if (state === "sent") return "We've emailed you a copy — check your inbox (and junk folder).";
  if (state === "sending") return "We're emailing you a copy now. If it isn't in your inbox in a few minutes, check your junk folder.";
  return null;
}
