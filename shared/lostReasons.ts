/**
 * Why an enquiry was lost. Stored on leads.lostReason as the key; the label is
 * what the venue sees. Kept short so the quick-pick dialog fits on a phone.
 */
export const LOST_REASONS = [
  { key: "price", label: "Price / budget" },
  { key: "date_unavailable", label: "Date unavailable" },
  { key: "other_venue", label: "Went with another venue" },
  { key: "event_cancelled", label: "Event cancelled" },
  { key: "no_response", label: "No response" },
  { key: "size_mismatch", label: "Too small / too large" },
  { key: "other", label: "Other" },
] as const;

export type LostReasonKey = (typeof LOST_REASONS)[number]["key"];

export const LOST_REASON_KEYS = LOST_REASONS.map(r => r.key) as [LostReasonKey, ...LostReasonKey[]];

export function lostReasonLabel(key: string | null | undefined): string | null {
  if (!key) return null;
  return LOST_REASONS.find(r => r.key === key)?.label ?? key;
}

export function isLostReason(key: unknown): key is LostReasonKey {
  return typeof key === "string" && LOST_REASONS.some(r => r.key === key);
}
