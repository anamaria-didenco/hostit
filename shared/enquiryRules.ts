/**
 * Input rules the public enquiry form and the server must agree on: what
 * counts as an email address, how a typed guest count is read, how long each
 * free-text answer may be, and which words mean which event format.
 *
 * The form and leads.startCapture / leads.submit both use these, so a value
 * the form lets through at NEXT is never refused at SUBMIT, on a step where
 * the field isn't even on screen. Pure functions, no imports: they run in the
 * browser and on the server alike. Tested in server/enquiryRules.test.ts.
 */

// ─── Email ───────────────────────────────────────────────────────────────────

/** The server's limit: z.string().trim().email().max(254). */
export const ENQUIRY_EMAIL_MAX = 254;

/**
 * zod 4's own email pattern (z.regexes.email), copied so the browser doesn't
 * load zod. The test fails if zod's pattern ever changes, so the two can't
 * drift apart.
 */
export const ENQUIRY_EMAIL_RE = /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-\.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/;

/**
 * Exactly what the server accepts: the address after trim() (spaces and other
 * whitespace at either end are fine), zod's pattern, 254 characters at most.
 */
export function isValidEnquiryEmail(raw: string | null | undefined): boolean {
  const v = (raw ?? "").trim();
  return v.length > 0 && v.length <= ENQUIRY_EMAIL_MAX && ENQUIRY_EMAIL_RE.test(v);
}

// Characters a paste or a phone keyboard can leave in an address that nobody
// meant to type: zero-width spaces and joiners, the byte-order mark, and the
// soft hyphen.
const INVISIBLE = /[­​-‍⁠﻿]/g;

/**
 * A likely fix for an address the server would refuse only because of
 * invisible characters, spaces inside it, angle brackets around it, or stray
 * punctuation at the end ("name@gmail.com," or "name@gmail.com."). Null when
 * the address is already fine or the tidy version still wouldn't pass. Meant
 * for a "Did you mean …?" offer: the server never tidies, it only checks.
 */
export function tidyEnquiryEmail(raw: string | null | undefined): string | null {
  const original = (raw ?? "").trim();
  if (!original || isValidEnquiryEmail(original)) return null;
  const tidy = original
    .replace(INVISIBLE, "")
    .replace(/\s+/g, "")
    .replace(/^mailto:/i, "")
    .replace(/^<+|>+$/g, "")
    .replace(/[.,;:'"]+$/, "");
  return tidy !== original && isValidEnquiryEmail(tidy) ? tidy : null;
}

// ─── Guest count ─────────────────────────────────────────────────────────────

/** The server's limit: z.number().int().max(100000). */
export const GUEST_COUNT_MAX = 100_000;

/** Above this the form asks "Did you mean …?" before sending. */
export const GUEST_COUNT_CONFIRM_ABOVE = 2000;

export type GuestCountParse =
  | { kind: "empty" }
  | { kind: "invalid"; reason: "no_number" | "zero" | "negative" | "too_many" }
  | {
      kind: "ok";
      /** The whole number to send as guestCount. */
      value: number;
      /** True when the text was just that number ("40", "1,200"). */
      exact: boolean;
      /** True above GUEST_COUNT_CONFIRM_ABOVE: worth a "Did you mean …?". */
      needsConfirm: boolean;
    };

/**
 * Read a guest count the way people type one. A range or an estimate gives
 * its top number: "30-40", "30 to 40" and "30–40" give 40, "50+" gives 50,
 * "approx 40", "~40", "40ish" and "40 people" give 40. Thousands commas are
 * fine ("1,200"). Several numbers that aren't a range ("40 adults 10 kids")
 * also give the largest. Nothing to read, zero, a negative number or more
 * than the server takes is "invalid", with the reason.
 */
export function parseGuestCount(raw: string | number | null | undefined): GuestCountParse {
  const text = String(raw ?? "").trim();
  if (!text) return { kind: "empty" };
  if (/^[-−]\s*\d/.test(text)) return { kind: "invalid", reason: "negative" };
  // "1,200" is one number, not 1 and 200.
  const joined = text.replace(/(\d),(?=\d{3}(?!\d))/g, "$1");
  const numbers = (joined.match(/\d+(?:\.\d+)?/g) ?? []).map(Number).filter(Number.isFinite);
  if (numbers.length === 0) return { kind: "invalid", reason: "no_number" };
  const value = Math.round(Math.max(...numbers));
  if (value < 1) return { kind: "invalid", reason: "zero" };
  if (value > GUEST_COUNT_MAX) return { kind: "invalid", reason: "too_many" };
  const exact = /^\d+$/.test(joined);
  return { kind: "ok", value, exact, needsConfirm: value > GUEST_COUNT_CONFIRM_ABOVE };
}

/**
 * The line kept in the enquiry's message when the typed guest count wasn't
 * one plain number, so the venue sees what the visitor actually wrote
 * ("Guests (as typed): 30-40") beside the number sent. Null otherwise.
 */
export function guestCountAsTypedLine(raw: string | number | null | undefined): string | null {
  const parsed = parseGuestCount(raw);
  if (parsed.kind !== "ok" || parsed.exact) return null;
  return `Guests (as typed): ${String(raw).trim().slice(0, 60)}`;
}

// ─── Text lengths ────────────────────────────────────────────────────────────

/**
 * The longest value each enquiry field may hold. The form sets these as
 * maxLength, so a long answer stops at the box instead of failing on SUBMIT;
 * the server's zod limits are the same numbers. eventDetail and invoicingNote
 * are varchar(255) columns. `message` is what the visitor may type in the
 * message box; `messageTotal` is the server's limit for the whole message it
 * stores, which also carries the venue's custom questions and lines the form
 * adds (the guest count as typed, a time picked without a date).
 */
export const ENQUIRY_LIMITS = {
  firstName: 100,
  lastName: 100,
  email: ENQUIRY_EMAIL_MAX,
  phone: 40,
  company: 200,
  eventType: 100,
  eventDetail: 255,
  invoicingNote: 255,
  message: 5000,
  messageTotal: 10_000,
  customField: 500,
  source: 100,
} as const;

/**
 * The name each step-2 field has on screen, for messages about it. A server
 * error that names "Event Detail" sent people looking for a box that doesn't
 * exist: on screen it is "What's the occasion?".
 */
export const ENQUIRY_FIELD_LABELS: Record<string, string> = {
  firstName: "First name",
  lastName: "Last name",
  email: "Email",
  phone: "Phone",
  company: "Company",
  eventType: "Event type",
  eventDate: "Event date",
  eventTime: "Preferred time",
  guestCount: "Guest count",
  eventDetail: "What's the occasion?",
  invoicingNote: "Invoice to",
  message: "Message",
};

/** The fields on step 1 (Your Details). An error about one of these belongs on step 1. */
export const STEP_ONE_FIELDS = ["firstName", "lastName", "email", "phone", "company"] as const;

export function isStepOneField(field: string | null | undefined): boolean {
  return (STEP_ONE_FIELDS as readonly string[]).includes(field ?? "");
}

// ─── Event format ────────────────────────────────────────────────────────────

export type EventFormatValue = "seated" | "cocktail" | "both";

const FORMAT_WORDS: Record<string, EventFormatValue> = {
  seated: "seated", seat: "seated", sitdown: "seated", sitdowndinner: "seated", seateddinner: "seated",
  cocktail: "cocktail", cocktailstanding: "cocktail", standing: "cocktail", stand: "cocktail",
  standup: "cocktail", canapes: "cocktail", canape: "cocktail", standingcanapes: "cocktail",
  both: "both", mixed: "both", abitofboth: "both", bitofboth: "both",
};

/**
 * The event format a prefill or a host page means. The venue's page sends
 * "standing", which matched none of the form's options ("Cocktail / standing"
 * is 'cocktail'), so a standing request was dropped. Case, accents, spaces
 * and punctuation don't matter. Unknown words give undefined, never a guess.
 */
export function eventFormatFromText(raw: string | null | undefined): EventFormatValue | undefined {
  const key = (raw ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  return key ? FORMAT_WORDS[key] : undefined;
}
