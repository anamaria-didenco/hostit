/**
 * Where a visitor had got to in the website enquiry form, kept beside the
 * form's draft (same storage, same per-venue key) so a reload doesn't lose it.
 *
 * The venue's own website reloads the form whenever someone picks a date,
 * moves the guest slider or flips seated/standing on the page (it rewrites
 * the iframe's src), and phones reload tabs they've put away. The fields came
 * back from the draft, but the step, the step-1 lead and its token lived in
 * React state only: the visitor landed back on step 1, NEXT saved a second
 * lead, and the first stayed "Partial" for ever.
 *
 * Pure functions over strings and plain values, so they can be tested without
 * a browser; LeadForm.tsx does the localStorage reads and writes.
 */

export type EnquiryProgress = {
  /** The venue slug in the form's URL ("default" for the slug-less form). */
  slug: string;
  /** The venue's ownerId when this was saved: nothing is reused for another venue. */
  ownerId: number;
  /** The wizard step showing: 1 = Your Details, 2 = Your Event. */
  step: 1 | 2;
  /** The lead startCapture saved at step 1, its proof token, the email it was saved with, and when (this device's clock). */
  leadId: number | null;
  leadToken: string | null;
  leadEmail: string | null;
  leadAt: number | null;
  /** The first "form opened at" token this draft had, and when it arrived (this device's clock). */
  formToken: string | null;
  formTokenAt: number | null;
};

export type CapturedLead = { leadId: number | null; leadToken: string | null; leadEmail: string | null; leadAt: number | null };

/** The draft's localStorage key, and this one's beside it. Per venue slug. */
export function enquiryStorageKeys(slug: string | null | undefined) {
  const s = slug || "default";
  return { slug: s, draft: `vf-lead-draft-${s}`, progress: `vf-lead-progress-${s}` };
}

/**
 * How long the first "form opened at" token is reused across reloads. The
 * server only checks that a token is at least 3 s old, but a token kept for
 * days could outlive the server's secret; after this the reloaded page's own
 * token is used, as before.
 */
export const FORM_TOKEN_REUSE_MS = 12 * 3_600_000;

/**
 * How long after step 1 a reload still picks up at step 2 with the same
 * lead. Covers the venue's page reloading the form and a phone reloading a
 * tab someone put away for a while. After this they start at step 1 with
 * their details filled in, as before, and NEXT saves a new lead dated now:
 * finishing an hours-old one in place would show a brand-new enquiry as
 * "Waiting 3d" (the enquiry list counts from when the lead was made).
 */
export const RESUME_LEAD_MS = 60 * 60_000;

/**
 * The page's own token is sent once it is at least this old: the server
 * wants 3 s (MIN_FORM_FILL_MS), and the device's count starts after the
 * server issued it, so this is on the safe side. Before then the first
 * token this draft had is sent instead (see formTokenToSend).
 */
export const FRESH_TOKEN_SAFE_MS = 5000;

export const normaliseEmail = (email: string | null | undefined) => (email ?? "").trim().toLowerCase();

const posInt = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) && v > 0 ? v : null);
const shortString = (v: unknown, max: number): string | null => (typeof v === "string" && v.length > 0 && v.length <= max ? v : null);

/** A saved record for this slug, or null when there's none, it's malformed, or it belongs to another slug. */
export function parseProgress(raw: string | null | undefined, slug: string): EnquiryProgress | null {
  if (!raw) return null;
  let d: any;
  try { d = JSON.parse(raw); } catch { return null; }
  if (!d || typeof d !== "object" || d.slug !== slug) return null;
  const ownerId = posInt(d.ownerId);
  if (!ownerId) return null;
  const leadId = posInt(d.leadId);
  const leadToken = shortString(d.leadToken, 64);
  const formToken = shortString(d.formToken, 80);
  const formTokenAt = typeof d.formTokenAt === "number" && Number.isFinite(d.formTokenAt) ? d.formTokenAt : null;
  const leadAt = typeof d.leadAt === "number" && Number.isFinite(d.leadAt) ? d.leadAt : null;
  const hasLead = !!(leadId && leadToken);
  return {
    slug, ownerId,
    step: d.step === 2 ? 2 : 1,
    leadId: hasLead ? leadId : null,
    leadToken: hasLead ? leadToken : null,
    leadEmail: hasLead ? normaliseEmail(shortString(d.leadEmail, 254)) || null : null,
    leadAt: hasLead ? leadAt : null,
    formToken: formToken && formTokenAt != null ? formToken : null,
    formTokenAt: formToken && formTokenAt != null ? formTokenAt : null,
  };
}

export function serializeProgress(p: EnquiryProgress): string {
  return JSON.stringify(p);
}

/**
 * Whether the step-1 lead can be used for this email: by NEXT (no second
 * startCapture) and by SUBMIT (complete that lead rather than insert one).
 * A different email is taken as a different person, so their details never
 * land on someone else's lead; that one is left as it was.
 */
export function canReuseLead(lead: CapturedLead | null | undefined, email: string | null | undefined): boolean {
  if (!lead || !posInt(lead.leadId) || !lead.leadToken) return false;
  const e = normaliseEmail(email);
  return !!e && normaliseEmail(lead.leadEmail) === e;
}

const NO_LEAD: CapturedLead = { leadId: null, leadToken: null, leadEmail: null, leadAt: null };

/** Whether a lead saved at `leadAt` is recent enough to pick up again (a clock set back a little is allowed). */
export function leadStillResumable(leadAt: number | null | undefined, nowMs: number): boolean {
  if (leadAt == null) return false;
  const age = nowMs - leadAt;
  return age >= -60_000 && age <= RESUME_LEAD_MS;
}

/**
 * Where to pick up after a reload: the saved step and lead, for this venue
 * only. Back to step 1 when the details on step 1 aren't all there any more
 * (the venue made another field required), or when the lead is more than
 * RESUME_LEAD_MS old (it isn't reused then: NEXT saves a new one); no lead
 * when the draft's email isn't the one it was saved with.
 */
export function resumeFrom(
  stored: EnquiryProgress | null,
  now: { ownerId: number; detailsValid: boolean; email: string | null | undefined; nowMs: number },
): CapturedLead & { step: 1 | 2 } {
  if (!stored || stored.ownerId !== now.ownerId) return { step: 1, ...NO_LEAD };
  const hadLead = !!(stored.leadId && stored.leadToken);
  if (hadLead && !leadStillResumable(stored.leadAt, now.nowMs)) return { step: 1, ...NO_LEAD };
  const lead = canReuseLead(stored, now.email)
    ? { leadId: stored.leadId, leadToken: stored.leadToken, leadEmail: stored.leadEmail, leadAt: stored.leadAt }
    : NO_LEAD;
  return { step: stored.step === 2 && now.detailsValid ? 2 : 1, ...lead };
}

/**
 * The first "form opened at" token this draft had, kept with it across
 * reloads: the one stored, else the page's own. Null until there is one.
 */
export function pickFormToken(
  stored: EnquiryProgress | null,
  ownerId: number,
  fresh: string | null | undefined,
  nowMs: number,
): { token: string; at: number } | null {
  if (stored && stored.ownerId === ownerId && stored.formToken && stored.formTokenAt != null) {
    const age = nowMs - stored.formTokenAt;
    if (age >= 0 && age < FORM_TOKEN_REUSE_MS) return { token: stored.formToken, at: stored.formTokenAt };
  }
  return fresh ? { token: fresh, at: nowMs } : null;
}

/**
 * The token to send with NEXT or SUBMIT: the page's own once it's old enough
 * to pass (FRESH_TOKEN_SAFE_MS), else the draft's first one, so a reload's
 * brand-new token can't make someone who has been on the form for minutes
 * look like a too-fast bot. Preferring the page's own whenever it will pass
 * means a kept token that has since gone bad (the server's secret changed)
 * only matters in the seconds just after a reload.
 */
export function formTokenToSend(
  first: { token: string; at: number } | null | undefined,
  fresh: { token: string; at: number } | null | undefined,
  nowMs: number,
): string | undefined {
  if (fresh && nowMs - fresh.at >= FRESH_TOKEN_SAFE_MS) return fresh.token;
  return first?.token ?? fresh?.token;
}
