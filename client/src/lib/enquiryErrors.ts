/**
 * What the website enquiry form says when NEXT's save or SUBMIT fails. The
 * browser's own words ("Failed to fetch", "Load failed", a JSON parse error
 * from a gateway's HTML page) meant nothing to visitors, and an error about a
 * step-1 field showed on step 2, where that field isn't. Pure; tested in
 * server/leadFormErrors.test.ts.
 */
import { ENQUIRY_FIELD_LABELS, isStepOneField } from "@shared/enquiryRules";

/** The form gave up waiting (its own timeout, ENQUIRY_REQUEST_TIMEOUT_MS). */
export const CONNECTION_DROPPED = "Your connection dropped. Tap SUBMIT to try again.";
/** No answer from the server that the form could read (offline, a gateway page). */
export const COULD_NOT_REACH = "We couldn't reach the venue just now. Check your connection and tap SUBMIT again. If it already went through, you'll get an email from us.";
/** The server's own catch-all. */
export const OUR_SIDE = "Something went wrong on our side. Please tap SUBMIT again.";

export type EnquiryErrorView = {
  /** The sentence to show. */
  text: string;
  /** The form field it is about, when the server said (or the sentence names one). */
  field: string | null;
  /** The field is on step 1 (Your Details). */
  stepOne: boolean;
  /** No answer from the server: the request may or may not have arrived. */
  network: boolean;
};

const camelToTitle = (k: string) => k.replace(/([A-Z])/g, " $1").replace(/^./, c => c.toUpperCase());

/**
 * The field a server sentence starts with ("Email: Invalid email address.",
 * "Event Detail is too long …"), for a server that doesn't send data.field.
 * Both the on-screen names and the older generated ones are recognised.
 */
export function fieldFromMessage(message: string | null | undefined): string | null {
  const text = (message ?? "").trim();
  if (!text) return null;
  const names: Array<[string, string]> = [];
  for (const [field, label] of Object.entries(ENQUIRY_FIELD_LABELS)) {
    names.push([label, field], [camelToTitle(field), field]);
  }
  names.sort((a, b) => b[0].length - a[0].length);
  const lower = text.toLowerCase();
  for (const [label, field] of names) {
    const l = label.toLowerCase();
    if (lower.startsWith(`${l}:`) || lower.startsWith(`${l} is `) || lower.startsWith(`${l} must `)) return field;
  }
  return null;
}

/**
 * Turn a failed leads.startCapture / leads.submit into what the visitor
 * sees. A tRPC error has `data.code`; anything without it never got a
 * readable answer from the server. `timedOut`: the form's own timeout ended
 * the request.
 */
export function describeEnquiryError(err: unknown, timedOut: boolean): EnquiryErrorView {
  const e = (err ?? {}) as { message?: unknown; data?: unknown };
  const data = e.data && typeof e.data === "object" ? (e.data as { code?: unknown; field?: unknown }) : null;
  const message = typeof e.message === "string" ? e.message.trim() : "";
  if (timedOut || !data || typeof data.code !== "string") {
    return { text: timedOut ? CONNECTION_DROPPED : COULD_NOT_REACH, field: null, stepOne: false, network: true };
  }
  if (data.code === "BAD_REQUEST") {
    const field = typeof data.field === "string" && data.field ? data.field : fieldFromMessage(message);
    return { text: message || "Please check your answers and try again.", field, stepOne: isStepOneField(field), network: false };
  }
  if (!message || message === "Internal server error") return { text: OUR_SIDE, field: null, stepOne: false, network: false };
  return { text: message, field: null, stepOne: false, network: false };
}
