// Who an unsent email draft in the composer belongs to.
//
// Closing the composer without sending keeps the typed text, and it comes
// back the next time the composer opens for the same conversation. That has
// to be the same enquiry, not the same email address: one client often has
// several enquiries (two events) under one address, and a draft about one
// event must not reappear in a reply about the other. A reply also belongs to
// its email thread, since it is sent in that thread (In-Reply-To). The thread
// is named by its first message (the first References entry), so a draft
// started on one of the client's messages comes back on their next message
// in the same thread too.

export type ComposeDraftKey = { leadId: number | null; thread: string | null };

/** The key for the composer as opened now: the enquiry's id, and the thread being replied in (null for a new email). */
export function composeDraftKey(
  leadId: unknown,
  reply?: { inReplyTo?: string | null; references?: readonly string[] | null } | null,
): ComposeDraftKey {
  const root = reply?.references?.find(r => !!r) || reply?.inReplyTo || null;
  return {
    leadId: typeof leadId === "number" && Number.isFinite(leadId) ? leadId : null,
    thread: root,
  };
}

/** Where a draft for this key is kept (one per enquiry and thread), or null when it can't be kept. */
export function composeDraftSlot(key: ComposeDraftKey): string | null {
  return key.leadId == null ? null : `${key.leadId}|${key.thread ?? ""}`;
}
