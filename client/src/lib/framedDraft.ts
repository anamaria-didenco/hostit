/**
 * Where the website enquiry form keeps the visitor's answers when the frame
 * can't use storage (Safari or Firefox set to block all cookies, some managed
 * browsers): the frame's own window.name. It survives the venue page
 * reloading the frame (it rewrites the iframe's src when a date or guest
 * count is picked there), which used to wipe the form back to an empty step 1.
 *
 * Only the answers, the step, the venue and the prefill values seen are kept
 * here, never the lead's token or the "form opened at" token: a page the host
 * navigates into the same frame could read window.name. Used only while
 * localStorage throws; cleared on "Enquiry Received!" and START FRESH. Pure;
 * tested in server/leadFormStorage.test.ts.
 */
import { parsePrefillMap } from "./enquiryProgress";

const PREFIX = "vf-draft:";

/** How long a kept draft is used (window.name lasts as long as the tab). */
export const NAME_DRAFT_KEEP_MS = 12 * 3_600_000;

export type NameDraft = {
  slug: string;
  ownerId: number | null;
  step: 1 | 2;
  fields: Record<string, string>;
  prefill: Record<string, string> | null;
  at: number;
};

function split(name: string | null | undefined): { original: string; draft: unknown } {
  const n = name ?? "";
  if (!n.startsWith(PREFIX)) return { original: n, draft: null };
  try {
    const d = JSON.parse(n.slice(PREFIX.length));
    return { original: typeof d?.original === "string" ? d.original : "", draft: d?.draft ?? null };
  } catch { return { original: "", draft: null }; }
}

function cleanFields(v: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!v || typeof v !== "object" || Array.isArray(v)) return out;
  for (const [k, val] of Object.entries(v as Record<string, unknown>).slice(0, 80)) {
    if (/^[A-Za-z_][A-Za-z0-9_ ]{0,80}$/.test(k) && typeof val === "string" && val.length <= 10_000) out[k] = val;
  }
  return out;
}

/** The draft kept for this venue slug, or null (none, another slug's, broken, or older than NAME_DRAFT_KEEP_MS). */
export function readNameDraft(name: string | null | undefined, slug: string, nowMs: number): NameDraft | null {
  const d = split(name).draft as Record<string, unknown> | null;
  if (!d || typeof d !== "object" || d.slug !== slug) return null;
  const at = typeof d.at === "number" && Number.isFinite(d.at) ? d.at : null;
  if (at == null || nowMs - at > NAME_DRAFT_KEEP_MS || at - nowMs > 60_000) return null;
  const ownerId = typeof d.ownerId === "number" && Number.isInteger(d.ownerId) && d.ownerId > 0 ? d.ownerId : null;
  return { slug, ownerId, step: d.step === 2 ? 2 : 1, fields: cleanFields(d.fields), prefill: parsePrefillMap(d.prefill), at };
}

/** window.name holding this draft (whatever name the frame had is kept, and put back by clearNameDraft). */
export function writeNameDraft(name: string | null | undefined, d: NameDraft): string {
  const draft: NameDraft = { slug: d.slug, ownerId: d.ownerId, step: d.step, fields: cleanFields(d.fields), prefill: d.prefill ? parsePrefillMap(d.prefill) : null, at: d.at };
  return PREFIX + JSON.stringify({ original: split(name).original, draft });
}

/** window.name with no draft: the frame's own name from before, if it had one. */
export function clearNameDraft(name: string | null | undefined): string {
  return split(name).original;
}
