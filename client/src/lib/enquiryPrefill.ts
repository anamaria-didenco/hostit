/**
 * Prefilled answers on the website enquiry form: from the form's URL
 * (prefillEventType, prefillDate, prefillGuests, prefillFormat and
 * prefill_<fieldId>, set by embed.js or the venue's own page) and from a
 * vf-prefill message the host page posts to the frame instead of reloading it.
 *
 * The venue's page puts its own finder state (guests, seated or standing, a
 * date) into the frame's URL on every reload, so the same "40, seated" came
 * back over what the visitor had typed in the form. One rule now, for reloads
 * and messages alike: a prefill value is applied to a field when the field is
 * empty, or when the value differs from the last one seen for that field (the
 * page's control really changed). A value the page sends again unchanged
 * never overwrites the visitor's answer. With no record of earlier values (a
 * first visit), the URL's named prefills win over an old draft, as before.
 * Any other field the page has never sent before only fills it when empty:
 * it can't be the visitor's latest choice on the page. A load whose URL has
 * no prefill for a field keeps the value remembered for it (rememberPrefill):
 * the venue's page loads the frame once without its finder state and then
 * again with it, and that first load used to make the same "40, seated" look
 * new on the second.
 *
 * Pure functions; LeadForm.tsx keeps the last values seen in the progress
 * record. Tested in server/vfPrefill.test.ts.
 */
import { STEP_ONE_FIELDS, eventFormatFromText, parseGuestCount } from "@shared/enquiryRules";
import { isRealDateKey, isWallTime } from "@shared/enquiryWallTime";

/** Draft key for "No date yet — we're flexible" (a choice, so a prefilled date mustn't undo it). */
export const NO_DATE_KEY = "_noDateYet";

/** The prefills with their own URL parameter: on a first visit these win over an old draft. */
export const NAMED_PREFILL_FIELDS = ["eventType", "eventDate", "guestCount", "eventFormat"] as const;

/** Longest prefilled value for any other field (as prefill_<fieldId> always was). */
export const PREFILL_VALUE_MAX = 500;

/**
 * The only fields a host page's vf-prefill message may set: choices on the
 * page (event type, date, guests, format, budget, space, time, how they
 * heard). Never free text the visitor writes (the message, the occasion,
 * who to invoice), and never the contact fields.
 */
export const HOST_MESSAGE_FIELDS = ["eventType", "eventDate", "guestCount", "eventFormat", "budgetRange", "spaceId", "eventTime", "source"] as const;

const FIELD_ID = /^[A-Za-z][A-Za-z0-9_]{0,60}$/;
const loose = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

/** An event type matched loosely (case, spaces and punctuation don't matter) against the form's options. */
export function matchEventType(raw: unknown, eventTypes: readonly string[]): string | undefined {
  if (typeof raw !== "string" || !raw.trim()) return undefined;
  const target = loose(raw);
  return eventTypes.find(t => loose(t) === target);
}

export type PrefillInput = {
  eventType?: unknown;
  date?: unknown;
  guests?: unknown;
  format?: unknown;
  fields?: unknown;
};

/** One field's prefill as the form stores it, or undefined when the value can't be used. */
function fieldValue(field: string, raw: unknown, eventTypes: readonly string[]): string | undefined {
  if (field === "eventType") return matchEventType(raw, eventTypes);
  if (field === "eventDate") return typeof raw === "string" && isRealDateKey(raw.trim()) ? raw.trim() : undefined;
  if (field === "guestCount") {
    if (typeof raw !== "string" && typeof raw !== "number") return undefined;
    const p = parseGuestCount(raw);
    if (p.kind !== "ok") return undefined;
    return p.exact ? String(p.value) : String(raw).trim().slice(0, 60);
  }
  if (field === "eventFormat") return typeof raw === "string" ? eventFormatFromText(raw) : undefined;
  if (field === "eventTime") return typeof raw === "string" && isWallTime(raw.trim()) ? raw.trim() : undefined;
  if (typeof raw === "number" && Number.isFinite(raw)) return String(raw);
  return typeof raw === "string" && raw ? raw.slice(0, PREFILL_VALUE_MAX) : undefined;
}

/**
 * The usable prefill values, by field id, and the names of those refused
 * (`ignored`): a value that can't be read (an impossible date, a format word
 * the form doesn't know, a guest count with no number), an unknown key, and
 * with `allowContact: false` (a host page's message) any of the step-1
 * contact fields, which only the visitor fills in.
 */
export function normalisePrefill(
  input: PrefillInput,
  eventTypes: readonly string[],
  opts: { allowContact: boolean; onlyChoices?: boolean },
): { values: Record<string, string>; ignored: string[] } {
  const values: Record<string, string> = {};
  const ignored: string[] = [];
  const take = (field: string, raw: unknown) => {
    if (raw == null || raw === "") return;
    if (!FIELD_ID.test(field)) { ignored.push(field.slice(0, 60)); return; }
    if (!opts.allowContact && (STEP_ONE_FIELDS as readonly string[]).includes(field)) { ignored.push(field); return; }
    if (opts.onlyChoices && !(HOST_MESSAGE_FIELDS as readonly string[]).includes(field)) { ignored.push(field); return; }
    const v = fieldValue(field, raw, eventTypes);
    if (v === undefined) { ignored.push(field); return; }
    values[field] = v;
  };
  const fields = input.fields;
  if (fields && typeof fields === "object" && !Array.isArray(fields)) {
    for (const [k, v] of Object.entries(fields as Record<string, unknown>).slice(0, 60)) take(k, v);
  } else if (fields != null) ignored.push("fields");
  // The named ones win over a prefill_<id> for the same field.
  take("eventType", input.eventType);
  take("eventDate", input.date);
  take("guestCount", input.guests);
  take("eventFormat", input.format);
  return { values, ignored: Array.from(new Set(ignored)).filter(f => !(f in values)) };
}

/** The prefill values in the form's own URL. */
export function prefillFromUrl(sp: URLSearchParams, eventTypes: readonly string[]): Record<string, string> {
  const fields: Record<string, string> = {};
  sp.forEach((value, key) => {
    if (key.startsWith("prefill_") && value) fields[key.slice("prefill_".length)] = value;
  });
  return normalisePrefill({
    eventType: sp.get("prefillEventType"),
    date: sp.get("prefillDate"),
    guests: sp.get("prefillGuests"),
    format: sp.get("prefillFormat"),
    fields,
  }, eventTypes, { allowContact: true }).values;
}

/**
 * Apply prefill values to the form's answers with the one rule above.
 * `lastSeen` is the values seen last time (null: no record, a first visit).
 * Returns the new answers, the fields now holding the prefill (`applied`)
 * and the fields left as the visitor had them (`kept`). Choosing a different
 * event type clears its follow-up answer, as picking one in the form does.
 */
export function applyPrefill(
  form: Record<string, string>,
  values: Record<string, string>,
  lastSeen: Record<string, string> | null,
): { form: Record<string, string>; applied: string[]; kept: string[] } {
  const next = { ...form };
  const applied: string[] = [];
  const kept: string[] = [];
  for (const [field, value] of Object.entries(values)) {
    const current = next[field] ?? "";
    const empty = !current.trim() && !(field === "eventDate" && next[NO_DATE_KEY] === "1");
    const named = (NAMED_PREFILL_FIELDS as readonly string[]).includes(field);
    const apply = current === value
      || empty
      || (lastSeen === null
        ? named
        // A change on the page; a field it never sent before only for the named ones.
        : field in lastSeen ? lastSeen[field] !== value : named);
    if (!apply) { kept.push(field); continue; }
    if (current !== value) {
      next[field] = value;
      if (field === "eventDate") delete next[NO_DATE_KEY];
      if (field === "eventType") next.eventDetail = "";
    }
    applied.push(field);
  }
  return { form: next, applied, kept };
}

/**
 * The prefill values to remember after a load or a vf-prefill message: the
 * ones remembered before, with this load's (or message's) on top. A field
 * this load's URL didn't carry keeps its remembered value.
 */
export function rememberPrefill(before: Record<string, string> | null | undefined, now: Record<string, string>): Record<string, string> {
  return { ...(before ?? {}), ...now };
}

// ─── vf-prefill messages from the host page ─────────────────────────────────

export type VfPrefillContext = {
  /** Only in embed mode. */
  isEmbed: boolean;
  /** window.parent: the only window allowed to send one. */
  parent: unknown;
  /** The host page's exact origin, when known; then the message must come from it. */
  parentOrigin: string | null;
  /** This frame's id (from embed.js); a message naming another frame is for that one. */
  frameId: string | null;
};

/**
 * The message's prefill when it is a vf-prefill this frame should take: in
 * embed mode, sent by the parent window (from its exact origin when that is
 * known), and for this frame (no frameId, or ours). Null otherwise.
 */
export function vfPrefillFrom(
  ev: { source: unknown; origin: string; data: unknown },
  ctx: VfPrefillContext,
): PrefillInput | null {
  if (!ctx.isEmbed || !ctx.parent || ev.source !== ctx.parent) return null;
  if (ctx.parentOrigin && ev.origin !== ctx.parentOrigin) return null;
  const d = ev.data as Record<string, unknown> | null;
  if (!d || typeof d !== "object" || d.type !== "vf-prefill") return null;
  if (d.frameId != null && d.frameId !== "" && d.frameId !== ctx.frameId) return null;
  return { eventType: d.eventType, date: d.date, guests: d.guests, format: d.format, fields: d.fields };
}
